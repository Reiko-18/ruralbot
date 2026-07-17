import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import {
  getOrderById,
  getOrdersByDateRange,
} from "../../services/accounting/repo_order.js";
import { taipeiDayRangeUtc } from "../../services/accounting/tz_date.js";
import { logger } from "../../services/logger/logger.js";

// regex 只驗證「4 位數字-2 位數字-2 位數字」格式，不保證是合法曆日（例如月份 13、2 月 30 日）。
// Date.UTC 對超出範圍的月/日會自動進位而非報錯（例如 2026-02-30 會被算成 2026-03-02），
// 因此換算區間前需先用曆法規則驗證，非法時回覆明確錯誤，而不是被 Date.UTC 悄悄「修正」成別的日期。
function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

export const data = new SlashCommandBuilder()
  .setName("order-lookup")
  .setDescription("Look up orders by ID or date")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption((o) =>
    o
      .setName("query")
      .setDescription("Order ID (6-char) or date (YYYY-MM-DD)")
      .setRequired(true),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const query = interaction.options.getString("query", true).trim();

  try {
    const dateMatch = query.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (dateMatch) {
      const year = Number(dateMatch[1]);
      const month = Number(dateMatch[2]);
      const day = Number(dateMatch[3]);

      if (!isValidCalendarDate(year, month, day)) {
        await interaction.editReply("日期格式無效，請使用 YYYY-MM-DD 格式。");
        return;
      }

      // 統一改用 tz_date.ts 的台北曆日區間工具（語義與原本 T00:00+08:00 相同），
      // 與 sales-overview / repo_order 對齊「同一天」的定義出口。
      const { start, end } = taipeiDayRangeUtc(year, month, day);

      const orders = await getOrdersByDateRange(start, end);
      if (orders.length === 0) {
        await interaction.editReply(`${query} 沒有訂單記錄。`);
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(`📋 ${query} 的訂單`)
        .setColor(0x2196f3)
        .setDescription(
          orders
            .map(
              (o) =>
                `**#${o.id}** | ${o.productName} x${o.quantity} | 利潤 $${o.profit.toFixed(2)}${o.isCustom ? " (自訂)" : ""}`,
            )
            .join("\n"),
        )
        .setFooter({ text: `共 ${orders.length} 筆訂單` });

      await interaction.editReply({ embeds: [embed] });
    } else {
      const order = await getOrderById(query.toUpperCase());
      if (!order) {
        await interaction.editReply(`找不到訂單 **#${query.toUpperCase()}**`);
        return;
      }

      // getOrderById 刻意不過濾 deletedAt（見 repo_order.ts 註解），這裡需自行顯著標示作廢狀態，
      // 讓管理員能查到已作廢單並知道可用 /order-restore 復原。
      const isVoided = order.deletedAt != null;

      const embed = new EmbedBuilder()
        .setTitle(`${isVoided ? "⚠️ [已作廢] " : "📦 "}訂單 #${order.id}`)
        .setColor(isVoided ? 0x9e9e9e : order.profit >= 0 ? 0x00c853 : 0xff1744)
        .addFields(
          { name: "商品", value: order.productName, inline: true },
          { name: "數量", value: `${order.quantity}`, inline: true },
          { name: "類型", value: order.isCustom ? "自訂" : "商品", inline: true },
          { name: "售價", value: `$${order.actualPrice.toFixed(2)}`, inline: true },
          { name: "成本", value: `$${order.actualCost.toFixed(2)}`, inline: true },
          { name: "利潤", value: `$${order.profit.toFixed(2)}`, inline: true },
          {
            name: "日期",
            value: order.createdAt.toISOString().split("T")[0],
            inline: true,
          },
        );

      if (order.createdBy) {
        embed.addFields({ name: "記帳人", value: `<@${order.createdBy}>`, inline: true });
      }

      if (isVoided) {
        embed.addFields({
          name: "⚠️ 作廢資訊",
          value: `作廢人: ${order.deletedBy ? `<@${order.deletedBy}>` : "未知"}\n作廢時間: ${order.deletedAt!.toISOString().split("T")[0]}\n可使用 /order-restore 復原此訂單。`,
        });
      }

      await interaction.editReply({ embeds: [embed] });
    }

    logger.info({ query }, "Order lookup executed");
  } catch (err) {
    logger.error({ err }, "Failed to look up order");
    await interaction.editReply("查詢訂單失敗。");
  }
}
