import {
  SlashCommandBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
} from "discord.js";
import {
  getAllProducts,
  getProductById,
  deleteProduct,
  getProductOrderCount,
} from "../../services/accounting/repo_product.js";
import { logger } from "../../services/logger/logger.js";

export const data = new SlashCommandBuilder()
  .setName("product-delete")
  .setDescription("Delete a registered product")
  .addStringOption((o) =>
    o
      .setName("product")
      .setDescription("Product to delete")
      .setRequired(true)
      .setAutocomplete(true),
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
      filtered.map((p) => ({
        name: `${p.name} (${p.category.name})`,
        value: p.id,
      })),
    );
  }
}

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const productId = interaction.options.getString("product", true);

  try {
    const product = await getProductById(productId);
    if (!product) {
      await interaction.editReply("找不到該商品。");
      return;
    }

    const orderCount = await getProductOrderCount(productId);
    if (orderCount > 0) {
      await interaction.editReply(
        `無法刪除：商品 **${product.name}** 仍有 **${orderCount}** 筆關聯訂單，請先刪除相關訂單。`,
      );
      return;
    }

    await deleteProduct(productId);
    logger.info({ productId, productName: product.name }, "Product deleted");
    await interaction.editReply(`商品 **${product.name}** 已刪除`);
  } catch (err: any) {
    if (err?.code === "P2025") {
      await interaction.editReply("找不到該商品。");
      return;
    }
    logger.error({ err }, "Failed to delete product");
    await interaction.editReply("刪除商品失敗。");
  }
}
