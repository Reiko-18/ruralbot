import {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} from "discord.js";
import { getCachedNode, getCachedRoots, getCachedConfig } from "./price_cache.js";
import {
  PRICE_MENU_ID,
  MAX_CHILDREN_PER_NODE,
} from "../../types/price.type.js";

interface PriceView {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<StringSelectMenuBuilder>[];
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

  const embed = new EmbedBuilder()
    .setTitle(config?.title || "📋 價目表")
    .setColor(0x5865f2);

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
    embed.setFooter({ text: `⚠️ 僅顯示前 ${MAX_CHILDREN_PER_NODE} 個分類` });
  }

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
  return { embeds: [embed], components: [row] };
}

function buildCategoryView(node: {
  id: string;
  name: string;
  content: string | null;
  imageUrl: string | null;
  parentId: string | null;
  children: { id: string; name: string }[];
}): PriceView {
  const embed = new EmbedBuilder()
    .setTitle(node.name)
    .setColor(0x5865f2);

  if (node.content) embed.setDescription(node.content);
  if (node.imageUrl) embed.setImage(node.imageUrl);

  const backValue = node.parentId ? `back:${node.parentId}` : "back:root";

  const options = node.children.slice(0, MAX_CHILDREN_PER_NODE).map((c) => ({
    label: c.name,
    value: c.id,
  }));
  options.push({ label: "⬅ 返回", value: backValue });

  if (node.children.length > MAX_CHILDREN_PER_NODE) {
    embed.setFooter({ text: `⚠️ 僅顯示前 ${MAX_CHILDREN_PER_NODE} 個子項目` });
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId(PRICE_MENU_ID)
    .setPlaceholder("選擇項目...")
    .addOptions(options);

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
  return { embeds: [embed], components: [row] };
}

function buildLeafView(node: {
  id: string;
  name: string;
  content: string | null;
  imageUrl: string | null;
  parentId: string | null;
  items: { label: string; price: string }[];
}): PriceView {
  const embed = new EmbedBuilder()
    .setTitle(node.name)
    .setColor(0x5865f2);

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
