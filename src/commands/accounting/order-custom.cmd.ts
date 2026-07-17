import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import { createOrder } from "../../services/accounting/repo_order.js";
import { generateOrderId } from "../../services/accounting/order_id.js";
import { calculateCustomProfit } from "../../services/accounting/profit_engine.js";
import { logOrderToThread } from "../../services/accounting/thread_logger.js";
import { logger } from "../../services/logger/logger.js";

export const data = new SlashCommandBuilder()
  .setName("order-custom")
  .setDescription("Create a fully manual order")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption((o) =>
    o.setName("name").setDescription("Product/item name").setRequired(true).setMaxLength(80),
  )
  .addNumberOption((o) =>
    o.setName("price").setDescription("Selling price").setRequired(true).setMinValue(0),
  )
  .addNumberOption((o) =>
    o.setName("cost").setDescription("Cost price").setRequired(true).setMinValue(0),
  )
  .addIntegerOption((o) =>
    o.setName("quantity").setDescription("Quantity (default: 1)").setMinValue(1),
  )
  .addStringOption((o) =>
    o.setName("date").setDescription("Order date (YYYY-MM-DD, default: today)"),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const name = interaction.options.getString("name", true);
  const price = interaction.options.getNumber("price", true);
  const cost = interaction.options.getNumber("cost", true);
  const quantity = interaction.options.getInteger("quantity") ?? 1;
  const dateStr = interaction.options.getString("date");

  try {
    const result = calculateCustomProfit(price, cost, quantity);
    const orderId = await generateOrderId();
    const normalizedDate = dateStr?.replace(/\//g, "-");
    const createdAt = normalizedDate ? new Date(`${normalizedDate}T12:00:00+08:00`) : new Date();
    if (isNaN(createdAt.getTime())) {
      await interaction.editReply("日期格式無效，請使用 YYYY-MM-DD 格式。");
      return;
    }

    const order = await createOrder({
      id: orderId,
      productName: name,
      quantity,
      actualPrice: result.actualPrice,
      actualCost: result.actualCost,
      profit: result.profit,
      isCustom: true,
      createdAt,
      createdBy: interaction.user.id,
    });

    logger.info(
      { orderId, productName: name, profit: result.profit },
      "Custom order created",
    );

    await logOrderToThread(interaction.client, interaction.guildId!, order);

    await interaction.editReply(
      `自訂訂單已建立 **#${orderId}**\n品名: ${name}\n數量: ${quantity}\n售價: $${result.actualPrice.toFixed(2)}\n成本: $${result.actualCost.toFixed(2)}\n利潤: $${result.profit.toFixed(2)}`,
    );
  } catch (err) {
    logger.error({ err }, "Failed to create custom order");
    await interaction.editReply("建立自訂訂單失敗。");
  }
}
