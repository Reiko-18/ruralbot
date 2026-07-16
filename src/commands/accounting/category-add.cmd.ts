import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import { createCategory } from "../../services/accounting/repo_category.js";
import { logger } from "../../services/logger/logger.js";

export const data = new SlashCommandBuilder()
  .setName("category-add")
  .setDescription("Create a new product category")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption((o) =>
    o.setName("name").setDescription("Category name").setRequired(true),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const name = interaction.options.getString("name", true);

  try {
    const category = await createCategory(name);
    logger.info({ categoryId: category.id, name }, "Category created");
    await interaction.editReply(`分類 **${name}** 已建立`);
  } catch (err: any) {
    if (err?.code === "P2002") {
      await interaction.editReply(`分類 **${name}** 已存在`);
      return;
    }
    logger.error({ err }, "Failed to create category");
    await interaction.editReply("建立分類失敗。");
  }
}
