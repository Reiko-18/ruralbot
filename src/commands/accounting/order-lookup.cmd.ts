import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import {
  getOrderById,
  getOrdersByDateRange,
} from "../../services/accounting/repo_order.js";
import { logger } from "../../services/logger/logger.js";

export const data = new SlashCommandBuilder()
  .setName("order-lookup")
  .setDescription("Look up orders by ID or date")
  .addStringOption((o) =>
    o
      .setName("query")
      .setDescription("Order ID (6-char) or date (YYYY-MM-DD)")
      .setRequired(true),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });
  const query = interaction.options.getString("query", true).trim();

  try {
    const dateMatch = query.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (dateMatch) {
      const start = new Date(`${query}T00:00:00`);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);

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

      const embed = new EmbedBuilder()
        .setTitle(`📦 訂單 #${order.id}`)
        .setColor(order.profit >= 0 ? 0x00c853 : 0xff1744)
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

      await interaction.editReply({ embeds: [embed] });
    }

    logger.info({ query }, "Order lookup executed");
  } catch (err) {
    logger.error({ err }, "Failed to look up order");
    await interaction.editReply("查詢訂單失敗。");
  }
}
