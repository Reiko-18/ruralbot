import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ComponentType,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import { getAllCategories } from "../../services/accounting/repo_category.js";
import { getProductsByCategoryId } from "../../services/accounting/repo_product.js";
import { logger } from "../../services/logger/logger.js";

// Discord select menu 最多 25 個選項，扣除固定的「全部分類總覽」保留 1 格
const CATEGORY_MENU_LIMIT = 24;

export const data = new SlashCommandBuilder()
  .setName("product-list")
  .setDescription("Browse registered products by category")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

function buildOverviewEmbed(
  categories: { id: string; name: string; _count: number }[],
) {
  const lines = categories.map(
    (c) => `**${c.name}** — ${c._count} 項商品`,
  );
  const footerText =
    categories.length > CATEGORY_MENU_LIMIT
      ? `請從下拉選單選擇分類查看詳細商品（下拉選單僅顯示前 ${CATEGORY_MENU_LIMIT} 個分類）`
      : "請從下拉選單選擇分類查看詳細商品";
  return new EmbedBuilder()
    .setTitle("📦 商品清單")
    .setDescription(
      lines.length > 0
        ? `共 ${categories.reduce((s, c) => s + c._count, 0)} 項商品\n\n${lines.join("\n")}`
        : "目前沒有登記任何商品。",
    )
    .setColor(0x2196f3)
    .setFooter({ text: footerText });
}

function buildCategoryEmbed(
  categoryName: string,
  products: {
    name: string;
    cost: number;
    price: number;
    source: string | null;
    faceValue: number | null;
    costDiscount: number | null;
    priceDiscount: number | null;
  }[],
) {
  const embed = new EmbedBuilder()
    .setTitle(`📦 ${categoryName}`)
    .setColor(0x4caf50)
    .setFooter({ text: `共 ${products.length} 項商品` });

  if (products.length === 0) {
    embed.setDescription("此分類目前沒有商品。");
    return embed;
  }

  // Check if any product in this category is discount-type
  const hasDiscount = products.some((p) => p.costDiscount != null);

  if (hasDiscount) {
    const lines = products.map((p) => {
      if (p.costDiscount != null && p.priceDiscount != null) {
        return `**${p.name}** — 成本折數 ${p.costDiscount} / 售價折數 ${p.priceDiscount}`;
      }
      return `**${p.name}** — 成本 $${p.cost} / 售價 $${p.price} / 利潤 $${p.price - p.cost}`;
    });
    embed.setDescription(lines.join("\n"));
  } else {
    const lines = products.map(
      (p) =>
        `**${p.name}** — 成本 $${p.cost} / 售價 $${p.price} / 利潤 $${p.price - p.cost}`,
    );
    embed.setDescription(lines.join("\n"));
  }

  return embed;
}

function buildCategoryMenu(
  categories: { id: string; name: string; _count: number }[],
) {
  // 比照 ticket_panel_builder.ts 的做法：裁切至上限，避免超過 Discord 25 選項限制
  const visibleCategories = categories.slice(0, CATEGORY_MENU_LIMIT);
  const menu = new StringSelectMenuBuilder()
    .setCustomId("product_list_select")
    .setPlaceholder("選擇分類查看商品")
    .addOptions(
      { label: "全部分類總覽", value: "overview", description: "返回分類總覽" },
      ...visibleCategories.map((c) => ({
        label: c.name,
        value: c.id,
        description: `${c._count} 項商品`,
      })),
    );
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  try {
    const rawCategories = await getAllCategories();

    // Get product counts per category
    const { prisma } = await import("../../core/db.js");
    const counts = await prisma.product.groupBy({
      by: ["categoryId"],
      _count: true,
    });
    const countMap = new Map(counts.map((c) => [c.categoryId, c._count]));

    const categories = rawCategories.map((c) => ({
      ...c,
      _count: countMap.get(c.id) ?? 0,
    }));

    const embed = buildOverviewEmbed(categories);

    if (categories.length === 0) {
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const row = buildCategoryMenu(categories);
    const response = await interaction.editReply({
      embeds: [embed],
      components: [row],
    });

    const collector = response.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      filter: (i) => i.user.id === interaction.user.id,
      time: 300_000,
    });

    // 處理中旗標：避免同一則訊息的多次互動（例如快速切換分類）併發處理造成競態。
    let isProcessing = false;

    collector.on("collect", async (i) => {
      if (isProcessing) {
        // 上一次互動仍在處理中，忽略本次事件並僅單純 ack，避免顯示「互動失敗」
        try {
          await i.deferUpdate();
        } catch {
          // 互動可能已過期，忽略 ack 失敗
        }
        return;
      }

      isProcessing = true;
      try {
        const value = i.values[0];

        if (value === "overview") {
          await i.update({
            embeds: [buildOverviewEmbed(categories)],
            components: [buildCategoryMenu(categories)],
          });
          return;
        }

        const products = await getProductsByCategoryId(value);
        const cat = categories.find((c) => c.id === value);
        const catEmbed = buildCategoryEmbed(
          cat?.name ?? "未知分類",
          products,
        );

        await i.update({
          embeds: [catEmbed],
          components: [buildCategoryMenu(categories)],
        });
      } catch (err) {
        logger.error({ err }, "Failed to update product list on interaction");
        try {
          await i.reply({
            content: "更新商品清單時發生錯誤，請稍後再試。",
            flags: MessageFlags.Ephemeral,
          });
        } catch {
          try {
            await i.followUp({
              content: "更新商品清單時發生錯誤，請稍後再試。",
              flags: MessageFlags.Ephemeral,
            });
          } catch {
            // 回報錯誤本身失敗（互動可能已過期），僅忽略避免二次拋錯
          }
        }
      } finally {
        isProcessing = false;
      }
    });

    collector.on("end", async () => {
      try {
        await interaction.editReply({ components: [] });
      } catch {
        // Message may have been deleted
      }
    });

    logger.info("Product list displayed");
  } catch (err) {
    logger.error({ err }, "Failed to display product list");
    await interaction.editReply("無法載入商品清單。");
  }
}
