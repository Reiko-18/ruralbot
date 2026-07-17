import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  PermissionFlagsBits,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import {
  aggregateSales,
  getOrders,
  countOrders,
  getDistinctYears,
  getDistinctMonths,
  getDistinctDays,
} from "../../services/accounting/repo_order.js";
import {
  taipeiYearRangeUtc,
  taipeiMonthRangeUtc,
  taipeiDayRangeUtc,
} from "../../services/accounting/tz_date.js";
import type { OverviewState, SalesAggregation } from "../../types/accounting.type.js";
import { logger } from "../../services/logger/logger.js";

const PAGE_SIZE = 15;

export const data = new SlashCommandBuilder()
  .setName("sales-overview")
  .setDescription("View sales summary with order list and date filtering")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

type OrderRow = {
  id: string;
  productName: string;
  quantity: number;
  actualPrice: number;
  profit: number;
  createdAt: Date;
};

function formatOrderLine(o: OrderRow) {
  const date = o.createdAt.toISOString().split("T")[0];
  const qty = o.quantity > 1 ? ` x${o.quantity}` : "";
  return `\`${o.id}\` ${date} | ${o.productName}${qty} | $${o.actualPrice} | 利潤 $${o.profit.toFixed(0)}`;
}

// pageOrders 為資料庫層已依 page 做 skip/take 截斷後的單頁資料（非整段期間全表拉回再前端切片），
// totalCount 另由 countOrders 取得整段期間筆數，只用來計算總頁數與頁尾顯示。
// 訂單量大時避免像舊版一樣把整段期間全撈進記憶體，見 execute() 內的 fetchPage()。
function buildEmbed(
  stats: SalesAggregation,
  pageOrders: OrderRow[],
  totalCount: number,
  label: string,
  page: number,
) {
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const profitColor = stats.totalProfit >= 0 ? 0x00c853 : 0xff1744;

  const embed = new EmbedBuilder()
    .setTitle("📊 營業總覽")
    .setColor(profitColor)
    .addFields(
      { name: "期間", value: label, inline: true },
      { name: "訂單數", value: `${stats.orderCount}`, inline: true },
      { name: "\u200b", value: "\u200b", inline: true },
      { name: "總營收", value: `$${stats.totalRevenue.toFixed(2)}`, inline: true },
      { name: "總成本", value: `$${stats.totalCost.toFixed(2)}`, inline: true },
      { name: "總利潤", value: `$${stats.totalProfit.toFixed(2)}`, inline: true },
    )
    .setFooter({ text: `第 ${page + 1}/${totalPages} 頁 ・ 共 ${totalCount} 筆訂單` })
    .setTimestamp();

  if (pageOrders.length === 0) {
    embed.setDescription("*此期間沒有訂單*");
  } else {
    embed.setDescription(pageOrders.map(formatOrderLine).join("\n"));
  }

  return embed;
}

function buildPageButtons(page: number, totalPages: number) {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("sales_prev")
      .setLabel("◀ 上一頁")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 0),
    new ButtonBuilder()
      .setCustomId("sales_next")
      .setLabel("下一頁 ▶")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages - 1),
  );
  return row;
}

function buildYearMenu(years: number[]) {
  const options = [
    { label: "全部時間", value: "all", description: "顯示所有時間的總計" },
    ...years.slice(0, 24).map((y) => ({
      label: String(y) + " 年",
      value: "year:" + String(y),
    })),
  ];
  const menu = new StringSelectMenuBuilder()
    .setCustomId("sales_select")
    .setPlaceholder("選擇年份")
    .addOptions(options);
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

function buildMonthMenu(year: number, months: number[]) {
  const y = String(year);
  const options = [
    { label: "← 返回年份選擇", value: "all" },
    ...months.slice(0, 24).map((m) => ({
      label: y + " 年 " + String(m) + " 月",
      value: "month:" + y + ":" + String(m),
    })),
  ];
  const menu = new StringSelectMenuBuilder()
    .setCustomId("sales_select")
    .setPlaceholder("選擇月份")
    .addOptions(options);
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

function buildDayMenu(year: number, month: number, days: number[]) {
  const y = String(year);
  const m = String(month);
  const mPad = m.padStart(2, "0");
  const options = [
    { label: "← 返回 " + y + " 年 " + m + " 月", value: "year:" + y },
    ...days.slice(0, 24).map((d) => {
      const dStr = String(d);
      const dPad = dStr.padStart(2, "0");
      return {
        label: y + "-" + mPad + "-" + dPad,
        value: "day:" + y + ":" + m + ":" + dStr,
      };
    }),
  ];
  const menu = new StringSelectMenuBuilder()
    .setCustomId("sales_select")
    .setPlaceholder("選擇日期")
    .addOptions(options);
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

function parseDateRange(state: OverviewState): {
  start?: Date;
  end?: Date;
  label: string;
} {
  // 日 = 台北曆日，改用 tz_date.ts 換算 UTC 起訖，對齊 repo_order.ts 的 EXTRACT 分桶
  // （已位移 +8 小時）與 order-lookup 的日期查詢，避免「同一天」的定義在各處錯開。
  if (state.level === "all") return { label: "全部時間" };
  if (state.level === "year") {
    const { start, end } = taipeiYearRangeUtc(state.year);
    return { start, end, label: `${state.year} 年` };
  }
  if (state.level === "month") {
    const { start, end } = taipeiMonthRangeUtc(state.year, state.month);
    return { start, end, label: `${state.year} 年 ${state.month} 月` };
  }
  const { start, end } = taipeiDayRangeUtc(state.year, state.month, state.day);
  return {
    start,
    end,
    label: `${state.year}-${String(state.month).padStart(2, "0")}-${String(state.day).padStart(2, "0")}`,
  };
}

function parseSelection(value: string): OverviewState {
  if (value === "all") return { level: "all" };
  const parts = value.split(":");
  if (parts[0] === "year")
    return { level: "year", year: Number(parts[1]) };
  if (parts[0] === "month")
    return { level: "month", year: Number(parts[1]), month: Number(parts[2]) };
  if (parts[0] === "day")
    return {
      level: "day",
      year: Number(parts[1]),
      month: Number(parts[2]),
      day: Number(parts[3]),
    };
  return { level: "all" };
}

async function buildDateMenu(state: OverviewState) {
  if (state.level === "all") {
    return buildYearMenu(await getDistinctYears());
  }
  if (state.level === "year") {
    const months = await getDistinctMonths(state.year);
    return months.length > 0
      ? buildMonthMenu(state.year, months)
      : buildYearMenu(await getDistinctYears());
  }
  if (state.level === "month") {
    const days = await getDistinctDays(state.year, state.month);
    return days.length > 0
      ? buildDayMenu(state.year, state.month, days)
      : buildMonthMenu(state.year, await getDistinctMonths(state.year));
  }
  // day
  const days = await getDistinctDays(state.year, state.month);
  return buildDayMenu(state.year, state.month, days);
}

function buildComponents(
  dateMenu: ActionRowBuilder<StringSelectMenuBuilder>,
  page: number,
  totalCount: number,
) {
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const rows: ActionRowBuilder<any>[] = [dateMenu];
  if (totalPages > 1) {
    rows.push(buildPageButtons(page, totalPages));
  }
  return rows;
}

// 依目前篩選範圍（range.start/range.end 皆為 undefined 代表「全部時間」）與頁碼，
// 向資料庫查詢單頁訂單（getOrders 的 skip/take）並取得該範圍總筆數（countOrders），
// 取代舊版「整段期間全撈進記憶體再前端 slice」的作法。
async function fetchPage(
  range: { start?: Date; end?: Date },
  page: number,
): Promise<{ orders: OrderRow[]; totalCount: number }> {
  const [orders, totalCount] = await Promise.all([
    getOrders(range.start, range.end, PAGE_SIZE, page * PAGE_SIZE),
    countOrders(range.start, range.end),
  ]);
  return { orders, totalCount };
}

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  try {
    let currentState: OverviewState = { level: "all" };
    let currentRange: { start?: Date; end?: Date } = {};
    let currentStats = await aggregateSales();
    let currentLabel = "全部時間";
    let currentPage = 0;
    let { orders: currentPageOrders, totalCount: currentTotalCount } = await fetchPage(
      currentRange,
      currentPage,
    );

    const years = await getDistinctYears();
    if (years.length === 0) {
      const embed = buildEmbed(currentStats, currentPageOrders, currentTotalCount, currentLabel, 0);
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const dateMenu = buildYearMenu(years);
    const embed = buildEmbed(currentStats, currentPageOrders, currentTotalCount, currentLabel, 0);
    const components = buildComponents(dateMenu, 0, currentTotalCount);
    const response = await interaction.editReply({ embeds: [embed], components });

    const collector = response.createMessageComponentCollector({
      filter: (i) => i.user.id === interaction.user.id,
      time: 300_000,
    });

    // 處理中旗標：避免同一則訊息的多次互動（例如連點按鈕）併發改寫共享狀態造成競態覆寫。
    let isProcessing = false;

    collector.on("collect", async (i) => {
      if (isProcessing) {
        // 上一次互動仍在處理中，忽略本次事件並僅單純 ack，避免顯示「互動失敗」
        try {
          await i.deferUpdate();
        } catch {
          // 互動可能已過期，忽略 ack 失敗
        }
        return;
      }

      isProcessing = true;
      try {
        if (i.isStringSelectMenu()) {
          // Date filter changed — reset page
          currentState = parseSelection(i.values[0]);
          const range = parseDateRange(currentState);
          currentRange = { start: range.start, end: range.end };
          currentLabel = range.label;
          currentStats = await aggregateSales(range.start, range.end);
          currentPage = 0;
        } else if (i.isButton()) {
          if (i.customId === "sales_prev") currentPage = Math.max(0, currentPage - 1);
          if (i.customId === "sales_next") currentPage++;
        }

        const fetched = await fetchPage(currentRange, currentPage);
        currentPageOrders = fetched.orders;
        currentTotalCount = fetched.totalCount;
        // 併發作廢可能使總筆數在互動之間下降；以本次 fetchPage 取回的最新 totalCount 夾住頁碼，
        // 避免 sales_next 連點導致 currentPage 超出實際頁數上限（頁尾顯示「第 X/Y 頁」出現 X > Y）。
        const totalPages = Math.max(1, Math.ceil(currentTotalCount / PAGE_SIZE));
        currentPage = Math.min(currentPage, totalPages - 1);

        const newEmbed = buildEmbed(currentStats, currentPageOrders, currentTotalCount, currentLabel, currentPage);
        const newDateMenu = await buildDateMenu(currentState);
        const newComponents = buildComponents(newDateMenu, currentPage, currentTotalCount);

        await i.update({ embeds: [newEmbed], components: newComponents });
      } catch (err) {
        logger.error({ err }, "Failed to update sales overview on interaction");
        try {
          await i.reply({
            content: "更新營業總覽時發生錯誤，請稍後再試。",
            flags: MessageFlags.Ephemeral,
          });
        } catch {
          try {
            await i.followUp({
              content: "更新營業總覽時發生錯誤，請稍後再試。",
              flags: MessageFlags.Ephemeral,
            });
          } catch {
            // 回報錯誤本身失敗（互動可能已過期），僅忽略避免二次拋錯
          }
        }
      } finally {
        isProcessing = false;
      }
    });

    collector.on("end", async () => {
      try {
        await interaction.editReply({ components: [] });
      } catch {
        // Message may have been deleted
      }
    });

    logger.info("Sales overview displayed");
  } catch (err) {
    logger.error({ err }, "Failed to display sales overview");
    await interaction.editReply("無法載入營業總覽。");
  }
}
