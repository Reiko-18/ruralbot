import {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} from "discord.js";
import { getCachedNode, getCachedRoots, getCachedConfig } from "./price_cache.js";
import {
  PRICE_MENU_ID,
  MAX_CHILDREN_PER_NODE,
  type EmbedSettings,
} from "../../types/price.type.js";

interface PriceView {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<StringSelectMenuBuilder>[];
}

function parseEmbedSettings(raw: string | null | undefined): EmbedSettings {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function applyEmbedSettings(embed: EmbedBuilder, settings: EmbedSettings): void {
  const color = settings.color ? parseInt(settings.color.replace("#", ""), 16) : 0x5865f2;
  embed.setColor(color);

  if (settings.authorName) {
    embed.setAuthor({
      name: settings.authorName,
      iconURL: settings.authorIconUrl || undefined,
    });
  }

  if (settings.thumbnailUrl) {
    embed.setThumbnail(settings.thumbnailUrl);
  }

  if (settings.showTimestamp) {
    embed.setTimestamp();
  }

  if (settings.footerText) {
    embed.setFooter({
      text: settings.footerText,
      iconURL: settings.footerIconUrl || undefined,
    });
  }
}

export function buildPriceView(nodeId: string | null): PriceView {
  if (nodeId === null) {
    return buildRootView();
  }
  const node = getCachedNode(nodeId);
  if (!node) {
    return buildErrorView("找不到此節點。");
  }
  if (node.children.length > 0) {
    return buildCategoryView(node);
  }
  return buildLeafView(node);
}

function buildRootView(): PriceView {
  const roots = getCachedRoots();
  const config = getCachedConfig();
  const settings = parseEmbedSettings(config?.embedSettings);

  const embed = new EmbedBuilder()
    .setTitle(config?.title || "📋 價目表");

  applyEmbedSettings(embed, settings);

  if (config?.imageUrl) embed.setImage(config.imageUrl);

  if (roots.length === 0) {
    embed.setDescription(config?.description || "目前沒有任何價目表，請至管理面板新增。");
    return { embeds: [embed], components: [] };
  }

  embed.setDescription(config?.description || "請從下方選單選擇分類：");

  const options = roots.slice(0, MAX_CHILDREN_PER_NODE).map((r) => ({
    label: r.name,
    value: r.id,
  }));

  const menu = new StringSelectMenuBuilder()
    .setCustomId(PRICE_MENU_ID)
    .setPlaceholder("選擇分類...")
    .addOptions(options);

  if (roots.length > MAX_CHILDREN_PER_NODE) {
    // Append warning to footer if footer already set
    const existing = settings.footerText || "";
    const warn = `⚠️ 僅顯示前 ${MAX_CHILDREN_PER_NODE} 個分類`;
    embed.setFooter({ text: existing ? `${existing} | ${warn}` : warn, iconURL: settings.footerIconUrl || undefined });
  }

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
  return { embeds: [embed], components: [row] };
}

function buildCategoryView(node: any): PriceView {
  const settings = parseEmbedSettings(node.embedSettings);

  const embed = new EmbedBuilder()
    .setTitle(node.name);

  applyEmbedSettings(embed, settings);

  if (node.content) embed.setDescription(node.content);
  if (node.imageUrl) embed.setImage(node.imageUrl);

  const backValue = node.parentId ? `back:${node.parentId}` : "back:root";

  const options = node.children.slice(0, MAX_CHILDREN_PER_NODE).map((c: any) => ({
    label: c.name,
    value: c.id,
  }));
  options.push({ label: "⬅ 返回", value: backValue });

  if (node.children.length > MAX_CHILDREN_PER_NODE) {
    const existing = settings.footerText || "";
    const warn = `⚠️ 僅顯示前 ${MAX_CHILDREN_PER_NODE} 個子項目`;
    embed.setFooter({ text: existing ? `${existing} | ${warn}` : warn, iconURL: settings.footerIconUrl || undefined });
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId(PRICE_MENU_ID)
    .setPlaceholder("選擇項目...")
    .addOptions(options);

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
  return { embeds: [embed], components: [row] };
}

function buildLeafView(node: any): PriceView {
  const settings = parseEmbedSettings(node.embedSettings);

  const embed = new EmbedBuilder()
    .setTitle(node.name);

  applyEmbedSettings(embed, settings);

  if (node.content) embed.setDescription(node.content);
  if (node.imageUrl) embed.setImage(node.imageUrl);

  for (const item of node.items) {
    embed.addFields({ name: item.label, value: item.price, inline: true });
  }

  const backValue = node.parentId ? `back:${node.parentId}` : "back:root";

  const menu = new StringSelectMenuBuilder()
    .setCustomId(PRICE_MENU_ID)
    .setPlaceholder("操作...")
    .addOptions([{ label: "⬅ 返回", value: backValue }]);

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
  return { embeds: [embed], components: [row] };
}

function buildErrorView(message: string): PriceView {
  const embed = new EmbedBuilder()
    .setTitle("❌ 錯誤")
    .setDescription(message)
    .setColor(0xff0000);
  return { embeds: [embed], components: [] };
}
