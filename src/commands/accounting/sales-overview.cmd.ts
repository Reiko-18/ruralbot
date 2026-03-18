import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  type ChatInputCommandInteraction,
} from "discord.js";
import {
  aggregateSales,
  getOrders,
  getDistinctYears,
  getDistinctMonths,
  getDistinctDays,
} from "../../services/accounting/repo_order.js";
import type { OverviewState, SalesAggregation } from "../../types/accounting.type.js";
import { logger } from "../../services/logger/logger.js";

const PAGE_SIZE = 15;

export const data = new SlashCommandBuilder()
  .setName("sales-overview")
  .setDescription("View sales summary with order list and date filtering");

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

function buildEmbed(
  stats: SalesAggregation,
  orders: OrderRow[],
  label: string,
  page: number,
) {
  const totalPages = Math.max(1, Math.ceil(orders.length / PAGE_SIZE));
  const start = page * PAGE_SIZE;
  const pageOrders = orders.slice(start, start + PAGE_SIZE);
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
    .setFooter({ text: `第 ${page + 1}/${totalPages} 頁 ・ 共 ${orders.length} 筆訂單` })
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
  if (state.level === "all") return { label: "全部時間" };
  if (state.level === "year") {
    return {
      start: new Date(state.year, 0, 1),
      end: new Date(state.year + 1, 0, 1),
      label: `${state.year} 年`,
    };
  }
  if (state.level === "month") {
    return {
      start: new Date(state.year, state.month - 1, 1),
      end: new Date(state.year, state.month, 1),
      label: `${state.year} 年 ${state.month} 月`,
    };
  }
  return {
    start: new Date(state.year, state.month - 1, state.day),
    end: new Date(state.year, state.month - 1, state.day + 1),
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
  totalOrders: number,
) {
  const totalPages = Math.max(1, Math.ceil(totalOrders / PAGE_SIZE));
  const rows: ActionRowBuilder<any>[] = [dateMenu];
  if (totalPages > 1) {
    rows.push(buildPageButtons(page, totalPages));
  }
  return rows;
}

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  try {
    let currentState: OverviewState = { level: "all" };
    let currentStats = await aggregateSales();
    let currentOrders = await getOrders();
    let currentLabel = "全部時間";
    let currentPage = 0;

    const years = await getDistinctYears();
    if (years.length === 0) {
      const embed = buildEmbed(currentStats, currentOrders, currentLabel, 0);
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const dateMenu = buildYearMenu(years);
    const embed = buildEmbed(currentStats, currentOrders, currentLabel, 0);
    const components = buildComponents(dateMenu, 0, currentOrders.length);
    const response = await interaction.editReply({ embeds: [embed], components });

    const collector = response.createMessageComponentCollector({
      filter: (i) => i.user.id === interaction.user.id,
      time: 300_000,
    });

    collector.on("collect", async (i) => {
      if (i.isStringSelectMenu()) {
        // Date filter changed — reset page
        currentState = parseSelection(i.values[0]);
        const range = parseDateRange(currentState);
        currentLabel = range.label;
        currentStats = await aggregateSales(range.start, range.end);
        currentOrders = await getOrders(range.start, range.end);
        currentPage = 0;
      } else if (i.isButton()) {
        if (i.customId === "sales_prev") currentPage = Math.max(0, currentPage - 1);
        if (i.customId === "sales_next") currentPage++;
      }

      const newEmbed = buildEmbed(currentStats, currentOrders, currentLabel, currentPage);
      const newDateMenu = await buildDateMenu(currentState);
      const newComponents = buildComponents(newDateMenu, currentPage, currentOrders.length);

      await i.update({ embeds: [newEmbed], components: newComponents });
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
