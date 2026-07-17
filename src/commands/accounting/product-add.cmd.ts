import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
} from "discord.js";
import { createProduct } from "../../services/accounting/repo_product.js";
import { getAllCategories } from "../../services/accounting/repo_category.js";
import { logger } from "../../services/logger/logger.js";

export const data = new SlashCommandBuilder()
  .setName("product-add")
  .setDescription("Register a new product")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption((o) =>
    o.setName("name").setDescription("Product name").setRequired(true).setMaxLength(80),
  )
  .addNumberOption((o) =>
    o.setName("price").setDescription("Selling price").setRequired(true).setMinValue(0),
  )
  .addNumberOption((o) =>
    o.setName("cost").setDescription("Cost price").setRequired(true).setMinValue(0),
  )
  .addStringOption((o) =>
    o
      .setName("category")
      .setDescription("Category name")
      .setRequired(true)
      .setAutocomplete(true),
  )
  .addStringOption((o) =>
    o.setName("source").setDescription("Supplier / source"),
  )
  .addNumberOption((o) =>
    o.setName("face_value").setDescription("Face value (for discount-type products)"),
  )
  .addNumberOption((o) =>
    o.setName("cost_discount").setDescription("Cost discount rate (e.g. 0.8)"),
  )
  .addNumberOption((o) =>
    o.setName("price_discount").setDescription("Price discount rate (e.g. 0.9)"),
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

  const name = interaction.options.getString("name", true);
  const price = interaction.options.getNumber("price", true);
  const cost = interaction.options.getNumber("cost", true);
  const categoryId = interaction.options.getString("category", true);
  const source = interaction.options.getString("source");
  const faceValue = interaction.options.getNumber("face_value");
  const costDiscount = interaction.options.getNumber("cost_discount");
  const priceDiscount = interaction.options.getNumber("price_discount");

  try {
    const product = await createProduct({
      name,
      price,
      cost,
      categoryId,
      source: source ?? undefined,
      faceValue: faceValue ?? undefined,
      costDiscount: costDiscount ?? undefined,
      priceDiscount: priceDiscount ?? undefined,
    });

    logger.info({ productId: product.id, name }, "Product registered");

    const fields = [
      `名稱: **${name}**`,
      `分類: ${product.category.name}`,
      `售價: $${price}`,
      `成本: $${cost}`,
    ];
    if (source) fields.push(`貨源: ${source}`);
    if (faceValue != null) fields.push(`面額: $${faceValue}`);
    if (costDiscount != null) fields.push(`成本折數: ${costDiscount}`);
    if (priceDiscount != null) fields.push(`售價折數: ${priceDiscount}`);

    await interaction.editReply(`商品已登記\n${fields.join("\n")}`);
  } catch (err: any) {
    if (err?.code === "P2002") {
      await interaction.editReply(`商品 **${name}** 已存在`);
      return;
    }
    if (err?.code === "P2003") {
      await interaction.editReply("指定的分類不存在，請先建立分類。");
      return;
    }
    logger.error({ err }, "Failed to register product");
    await interaction.editReply("登記商品失敗。");
  }
}
