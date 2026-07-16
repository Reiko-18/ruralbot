import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
} from "discord.js";
import { getAllProducts } from "../../services/accounting/repo_product.js";
import { prisma } from "../../core/db.js";
import { logger } from "../../services/logger/logger.js";

export const data = new SlashCommandBuilder()
  .setName("product-delete")
  .setDescription("Delete a registered product")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
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
    // 查詢關聯數量與刪除包在同一個互動式交易中，避免「查通過但刪除前又新增關聯訂單」的競態
    const result = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: productId },
        include: { category: true },
      });
      if (!product) {
        return { status: "not_found" as const };
      }

      const orderCount = await tx.order.count({ where: { productId } });
      if (orderCount > 0) {
        return { status: "has_orders" as const, product, orderCount };
      }

      await tx.product.delete({ where: { id: productId } });
      return { status: "deleted" as const, product };
    });

    if (result.status === "not_found") {
      await interaction.editReply("找不到該商品。");
      return;
    }

    if (result.status === "has_orders") {
      await interaction.editReply(
        `無法刪除：商品 **${result.product.name}** 仍有 **${result.orderCount}** 筆關聯訂單，請先刪除相關訂單。`,
      );
      return;
    }

    logger.info({ productId, productName: result.product.name }, "Product deleted");
    await interaction.editReply(`商品 **${result.product.name}** 已刪除`);
  } catch (err: any) {
    if (err?.code === "P2025") {
      await interaction.editReply("找不到該商品。");
      return;
    }
    logger.error({ err }, "Failed to delete product");
    await interaction.editReply("刪除商品失敗。");
  }
}
