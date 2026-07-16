import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import { getOrderById, deleteOrder } from "../../services/accounting/repo_order.js";
import { logger } from "../../services/logger/logger.js";

export const data = new SlashCommandBuilder()
  .setName("order-delete")
  .setDescription("Delete an order by its 6-character ID")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption((o) =>
    o
      .setName("order_id")
      .setDescription("6-character order ID")
      .setRequired(true),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const orderId = interaction.options.getString("order_id", true).toUpperCase();

  try {
    const order = await getOrderById(orderId);
    if (!order) {
      await interaction.editReply(`找不到訂單 **#${orderId}**`);
      return;
    }

    await deleteOrder(orderId);
    logger.info({ orderId, productName: order.productName }, "Order deleted");

    await interaction.editReply(
      `訂單 **#${orderId}** 已刪除\n商品: ${order.productName}\n利潤: $${order.profit.toFixed(2)}`,
    );
  } catch (err) {
    logger.error({ err }, "Failed to delete order");
    await interaction.editReply("刪除訂單失敗。");
  }
}
