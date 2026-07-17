import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import { getOrderById, deleteOrder } from "../../services/accounting/repo_order.js";
import { logOrderVoidToThread } from "../../services/accounting/thread_logger.js";
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

    if (order.deletedAt) {
      await interaction.editReply(`訂單 **#${orderId}** 此訂單已是作廢狀態。`);
      return;
    }

    const result = await deleteOrder(orderId, interaction.user.id);
    if (result === null) {
      await interaction.editReply(`找不到訂單 **#${orderId}**`);
      return;
    }
    if (result === false) {
      await interaction.editReply(`訂單 **#${orderId}** 此訂單已是作廢狀態。`);
      return;
    }

    logger.info(
      { orderId, productName: order.productName, voidedBy: interaction.user.id },
      "Order voided",
    );

    if (interaction.guildId) {
      // logOrderVoidToThread 內部已 fail-soft（Discord 錯誤只記 log 不拋出），直接 await 即可。
      await logOrderVoidToThread(interaction.client, interaction.guildId, result, interaction.user.id);
    }

    await interaction.editReply(
      `訂單 **#${orderId}** 已作廢\n商品: ${order.productName}\n利潤: $${order.profit.toFixed(2)}\n可使用 /order-restore 復原此訂單。`,
    );
  } catch (err) {
    logger.error({ err }, "Failed to void order");
    await interaction.editReply("作廢訂單失敗。");
  }
}
