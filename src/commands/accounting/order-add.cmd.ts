import {
  SlashCommandBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
} from "discord.js";
import { getAllProducts, getProductById } from "../../services/accounting/repo_product.js";
import { createOrder } from "../../services/accounting/repo_order.js";
import { generateOrderId } from "../../services/accounting/order_id.js";
import { calculateProfit } from "../../services/accounting/profit_engine.js";
import { logOrderToThread } from "../../services/accounting/thread_logger.js";
import { logger } from "../../services/logger/logger.js";

export const data = new SlashCommandBuilder()
  .setName("order-add")
  .setDescription("Create an order from an existing product")
  .addStringOption((o) =>
    o
      .setName("product")
      .setDescription("Product name")
      .setRequired(true)
      .setAutocomplete(true),
  )
  .addIntegerOption((o) =>
    o.setName("quantity").setDescription("Quantity (default: 1)"),
  )
  .addNumberOption((o) =>
    o.setName("custom_price").setDescription("Override selling price"),
  )
  .addStringOption((o) =>
    o.setName("date").setDescription("Order date (YYYY-MM-DD, default: today)"),
  );

export async function autocomplete(interaction: AutocompleteInteraction) {
  const focused = interaction.options.getFocused(true);
  if (focused.name === "product") {
    const products = await getAllProducts();
    const filtered = products
      .filter((p) =>
        p.name.toLowerCase().includes(focused.value.toLowerCase()),
      )
      .slice(0, 25);
    await interaction.respond(
      filtered.map((p) => ({ name: `${p.name} ($${p.price})`, value: p.id })),
    );
  }
}

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const productId = interaction.options.getString("product", true);
  const quantity = interaction.options.getInteger("quantity") ?? 1;
  const customPrice = interaction.options.getNumber("custom_price") ?? undefined;
  const dateStr = interaction.options.getString("date");

  try {
    const product = await getProductById(productId);
    if (!product) {
      await interaction.editReply("找不到該商品。");
      return;
    }

    const result = calculateProfit(product, quantity, customPrice);
    const orderId = await generateOrderId();
    const createdAt = dateStr ? new Date(`${dateStr}T00:00:00`) : new Date();
    if (isNaN(createdAt.getTime())) {
      await interaction.editReply("日期格式無效，請使用 YYYY-MM-DD 格式。");
      return;
    }

    const order = await createOrder({
      id: orderId,
      productId: product.id,
      productName: product.name,
      quantity,
      actualPrice: result.actualPrice,
      actualCost: result.actualCost,
      profit: result.profit,
      createdAt,
    });

    logger.info(
      { orderId, productName: product.name, profit: result.profit },
      "Order created",
    );

    await logOrderToThread(interaction.client, interaction.guildId!, order);

    await interaction.editReply(
      `訂單已建立 **#${orderId}**\n商品: ${product.name}\n數量: ${quantity}\n售價: $${result.actualPrice.toFixed(2)}\n成本: $${result.actualCost.toFixed(2)}\n利潤: $${result.profit.toFixed(2)}`,
    );
  } catch (err) {
    logger.error({ err }, "Failed to create order");
    await interaction.editReply("建立訂單失敗。");
  }
}
