import {
  type Client,
  type TextChannel,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  ThreadAutoArchiveDuration,
} from "discord.js";
import { getAccountingConfig } from "./repo_accounting_config.js";
import { logger } from "../logger/logger.js";
import { getCachedBotConfig } from "../config/repo_bot_config.js";

function getDiscordErrorCode(err: unknown): number | string | undefined {
  if (err && typeof err === "object" && "code" in err) {
    return (err as { code?: number | string }).code;
  }
  return undefined;
}

// Discord 錯誤碼：50001 Missing Access、10003 Unknown Channel、50013 Missing Permissions
const CHANNEL_ACCESS_ERROR_CODES = new Set<number | string>([50001, 10003, 50013]);

export type OrderThreadLogOrder = {
  id: string;
  productName: string;
  quantity: number;
  actualPrice: number;
  actualCost: number;
  profit: number;
  isCustom: boolean;
  createdAt: Date;
};

export function formatOrderThreadDate(date: Date): string {
  return date.toISOString().split("T")[0]; // YYYY-MM-DD
}

export async function getOrCreateOrderThread(channel: TextChannel, name: string) {
  // Check active threads
  const active = await channel.threads.fetchActive();
  let thread = active.threads.find((t) => t.name === name);
  if (thread) return thread;

  // Check archived threads
  const archived = await channel.threads.fetchArchived({ type: "public" });
  thread = archived.threads.find((t) => t.name === name);
  if (thread) {
    await thread.setArchived(false);
    return thread;
  }

  // Create new thread
  return channel.threads.create({
    name,
    autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
    type: ChannelType.PublicThread,
    reason: `會計日誌 - ${name}`,
  });
}

export function buildOrderLogEmbed(order: OrderThreadLogOrder) {
  const profitColor = order.profit >= 0 ? 0x00c853 : 0xff1744;
  return new EmbedBuilder()
    .setTitle(`📦 訂單 #${order.id}`)
    .setColor(profitColor)
    .addFields(
      { name: "商品", value: order.productName, inline: true },
      { name: "數量", value: `${order.quantity}`, inline: true },
      { name: "類型", value: order.isCustom ? "自訂" : "商品", inline: true },
      { name: "售價", value: `$${order.actualPrice.toFixed(2)}`, inline: true },
      { name: "成本", value: `$${order.actualCost.toFixed(2)}`, inline: true },
      { name: "利潤", value: `$${order.profit.toFixed(2)}`, inline: true },
    )
    .setTimestamp(order.createdAt);
}

function getAccountingChannelId(configChannelId?: string | null) {
  return process.env.ACCOUNTING_CHANNEL_ID?.trim() || configChannelId;
}

function assertAccountingPermissions(channel: TextChannel) {
  const botMember = channel.guild.members.me;
  if (!botMember) return;

  const permissions = channel.permissionsFor(botMember);
  const missing = permissions?.missing([
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.CreatePublicThreads,
    PermissionFlagsBits.SendMessagesInThreads,
  ]) ?? [];

  if (missing.length > 0) {
    logger.warn(
      { channelId: channel.id, missingPermissions: missing },
      "Accounting channel is missing Discord permissions",
    );
  }
}

export async function logOrderToThread(
  client: Client,
  guildId: string,
  order: OrderThreadLogOrder,
): Promise<void> {
  // Redirect to primary guild if configured
  const botConfig = getCachedBotConfig();
  const targetGuildId = botConfig?.primaryGuildId ?? guildId;
  let channelId: string | null | undefined;

  try {
    const config = await getAccountingConfig(targetGuildId);
    channelId = getAccountingChannelId(config?.channelId);
    if (!channelId) {
      logger.warn({ guildId: targetGuildId, orderId: order.id }, "No accounting channel configured, skipping thread log");
      return;
    }

    const channel = await client.channels.fetch(channelId);
    if (!channel || channel.type !== ChannelType.GuildText) {
      logger.warn(
        { channelId, orderId: order.id },
        "Accounting channel not found or not text",
      );
      return;
    }

    assertAccountingPermissions(channel as TextChannel);
    const threadName = formatOrderThreadDate(order.createdAt);
    const thread = await getOrCreateOrderThread(channel as TextChannel, threadName);
    const embed = buildOrderLogEmbed(order);

    await thread.send({ embeds: [embed] });
    logger.info({ orderId: order.id, channelId, threadName }, "Order logged to thread");
  } catch (err) {
    if (CHANNEL_ACCESS_ERROR_CODES.has(getDiscordErrorCode(err) ?? -1)) {
      logger.warn(
        {
          code: getDiscordErrorCode(err),
          source: process.env.ACCOUNTING_CHANNEL_ID?.trim() ? "env" : "config",
          targetGuildId,
          channelId,
          orderId: order.id,
        },
        "記帳頻道無法存取（Missing Access）；請確認 bot 仍在主群且對記帳頻道有 View/Send/建立討論串權限，或重跑 /accounting-setup 指向可存取頻道（若使用 ACCOUNTING_CHANNEL_ID env 則檢查該值）。",
      );
      return;
    }
    logger.error({ err, guildId, orderId: order.id }, "Failed to log order to thread");
  }
}
