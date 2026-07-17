import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import { getOrderById, restoreOrder } from "../../services/accounting/repo_order.js";
import { logOrderRestoreToThread } from "../../services/accounting/thread_logger.js";
import { logger } from "../../services/logger/logger.js";

export const data = new SlashCommandBuilder()
  .setName("order-restore")
  .setDescription("Restore a voided order by its 6-character ID")
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

    if (!order.deletedAt) {
      await interaction.editReply(`訂單 **#${orderId}** 目前並未作廢，無需復原。`);
      return;
    }

    const result = await restoreOrder(orderId);
    if (result === null) {
      await interaction.editReply(`找不到訂單 **#${orderId}**`);
      return;
    }
    if (result === false) {
      await interaction.editReply(`訂單 **#${orderId}** 目前並未作廢，無需復原。`);
      return;
    }

    logger.info(
      { orderId, productName: order.productName, restoredBy: interaction.user.id },
      "Order restored",
    );

    if (interaction.guildId) {
      // logOrderRestoreToThread 內部已 fail-soft（Discord 錯誤只記 log 不拋出），直接 await 即可。
      await logOrderRestoreToThread(interaction.client, interaction.guildId, result, interaction.user.id);
    }

    await interaction.editReply(
      `訂單 **#${orderId}** 已復原\n商品: ${order.productName}\n利潤: $${order.profit.toFixed(2)}`,
    );
  } catch (err) {
    logger.error({ err }, "Failed to restore order");
    await interaction.editReply("復原訂單失敗。");
  }
}
