import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
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
import type { OverviewState } from "../../types/accounting.type.js";
import { logger } from "../../services/logger/logger.js";

export const data = new SlashCommandBuilder()
  .setName("sales-overview")
  .setDescription("View sales summary with order list and date filtering");

function formatOrderLine(o: {
  id: string;
  productName: string;
  quantity: number;
  actualPrice: number;
  profit: number;
  createdAt: Date;
}) {
  const date = o.createdAt.toISOString().split("T")[0];
  const qty = o.quantity > 1 ? ` x${o.quantity}` : "";
  return `\`${o.id}\` | ${date} | ${o.productName}${qty} | $${o.actualPrice}${qty ? ` (總$${(o.actualPrice * o.quantity).toFixed(0)})` : ""} | 利潤 $${o.profit.toFixed(0)}`;
}

function buildEmbeds(
  stats: {
    totalRevenue: number;
    totalCost: number;
    totalProfit: number;
    orderCount: number;
  },
  orders: {
    id: string;
    productName: string;
    quantity: number;
    actualPrice: number;
    profit: number;
    createdAt: Date;
  }[],
  label: string,
): EmbedBuilder[] {
  const profitColor = stats.totalProfit >= 0 ? 0x00c853 : 0xff1744;
  const embeds: EmbedBuilder[] = [];

  // Build order lines
  const lines = orders.map(formatOrderLine);

  // Discord embed description limit is 4096 chars
  // Split into chunks if needed
  const chunks: string[][] = [[]];
  let currentLen = 0;

  for (const line of lines) {
    // Reserve space for header on first chunk
    const overhead = chunks.length === 1 ? 200 : 50;
    if (currentLen + line.length + 1 > 4096 - overhead && chunks[chunks.length - 1].length > 0) {
      chunks.push([]);
      currentLen = 0;
    }
    chunks[chunks.length - 1].push(line);
    currentLen += line.length + 1;
  }

  // First embed: summary + first chunk of orders
  const firstEmbed = new EmbedBuilder()
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
    .setTimestamp();

  if (orders.length === 0) {
    firstEmbed.setDescription("*此期間沒有訂單*");
    return [firstEmbed];
  }

  firstEmbed.setDescription(chunks[0].join("\n"));
  embeds.push(firstEmbed);

  // Additional embeds for overflow
  for (let i = 1; i < chunks.length; i++) {
    embeds.push(
      new EmbedBuilder()
        .setColor(profitColor)
        .setDescription(chunks[i].join("\n"))
        .setFooter(i === chunks.length - 1 ? { text: `共 ${orders.length} 筆訂單` } : null),
    );
  }

  if (chunks.length === 1) {
    firstEmbed.setFooter({ text: `共 ${orders.length} 筆訂單` });
  }

  return embeds;
}

function buildYearMenu(years: number[]) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId("sales_select")
    .setPlaceholder("選擇年份")
    .addOptions(
      { label: "全部時間", value: "all", description: "顯示所有時間的總計" },
      ...years.map((y) => ({ label: `${y} 年`, value: `year:${y}` })),
    );
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

function buildMonthMenu(year: number, months: number[]) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId("sales_select")
    .setPlaceholder("選擇月份")
    .addOptions(
      { label: "← 返回年份選擇", value: "all" },
      ...months.map((m) => ({
        label: `${year} 年 ${m} 月`,
        value: `month:${year}:${m}`,
      })),
    );
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

function buildDayMenu(year: number, month: number, days: number[]) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId("sales_select")
    .setPlaceholder("選擇日期")
    .addOptions(
      { label: `← 返回 ${year} 年 ${month} 月`, value: `year:${year}` },
      ...days.map((d) => ({
        label: `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
        value: `day:${year}:${month}:${d}`,
      })),
    );
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

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  try {
    const stats = await aggregateSales();
    const orders = await getOrders();
    const years = await getDistinctYears();
    const embeds = buildEmbeds(stats, orders, "全部時間");

    if (years.length === 0) {
      await interaction.editReply({ embeds });
      return;
    }

    const row = buildYearMenu(years);
    const response = await interaction.editReply({
      embeds,
      components: [row],
    });

    const collector = response.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      filter: (i) => i.user.id === interaction.user.id,
      time: 300_000,
    });

    collector.on("collect", async (i) => {
      const state = parseSelection(i.values[0]);
      const range = parseDateRange(state);
      const newStats = await aggregateSales(range.start, range.end);
      const newOrders = await getOrders(range.start, range.end);
      const newEmbeds = buildEmbeds(newStats, newOrders, range.label);

      let newRow: ActionRowBuilder<StringSelectMenuBuilder>;
      if (state.level === "all") {
        newRow = buildYearMenu(await getDistinctYears());
      } else if (state.level === "year") {
        const months = await getDistinctMonths(state.year);
        newRow =
          months.length > 0
            ? buildMonthMenu(state.year, months)
            : buildYearMenu(await getDistinctYears());
      } else if (state.level === "month") {
        const days = await getDistinctDays(state.year, state.month);
        newRow =
          days.length > 0
            ? buildDayMenu(state.year, state.month, days)
            : buildMonthMenu(
                state.year,
                await getDistinctMonths(state.year),
              );
      } else {
        const days = await getDistinctDays(state.year, state.month);
        newRow = buildDayMenu(state.year, state.month, days);
      }

      await i.update({ embeds: newEmbeds, components: [newRow] });
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
