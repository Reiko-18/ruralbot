import {
  SlashCommandBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
} from "discord.js";
import {
  getAllCategories,
  deleteCategory,
  getCategoryProductCount,
} from "../../services/accounting/repo_category.js";
import { logger } from "../../services/logger/logger.js";

export const data = new SlashCommandBuilder()
  .setName("category-delete")
  .setDescription("Delete an existing product category")
  .addStringOption((o) =>
    o
      .setName("category")
      .setDescription("Category to delete")
      .setRequired(true)
      .setAutocomplete(true),
  );

export async function autocomplete(interaction: AutocompleteInteraction) {
  const focused = interaction.options.getFocused(true);
  if (focused.name === "category") {
    const categories = await getAllCategories();
    const filtered = categories
      .filter((c) =>
        c.name.toLowerCase().includes(focused.value.toLowerCase()),
      )
      .slice(0, 25);
    await interaction.respond(
      filtered.map((c) => ({ name: c.name, value: c.id })),
    );
  }
}

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const categoryId = interaction.options.getString("category", true);

  try {
    const productCount = await getCategoryProductCount(categoryId);
    if (productCount > 0) {
      await interaction.editReply(
        `無法刪除：該分類下仍有 **${productCount}** 個商品，請先移除或重新分類。`,
      );
      return;
    }

    await deleteCategory(categoryId);
    logger.info({ categoryId }, "Category deleted");
    await interaction.editReply("分類已刪除");
  } catch (err: any) {
    if (err?.code === "P2025") {
      await interaction.editReply("找不到該分類。");
      return;
    }
    logger.error({ err }, "Failed to delete category");
    await interaction.editReply("刪除分類失敗。");
  }
}
