import {
  type AnyThreadChannel,
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
import { taipeiDateString } from "./tz_date.js";

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
  createdBy?: string | null;
};

export function formatOrderThreadDate(date: Date): string {
  // 用台北曆日命名/分桶討論串，避免台北 00:00–08:00 建立的訂單因 toISOString()（UTC 曆日）
  // 被歸到前一天，導致跨月/跨年時討論串名稱錯月或錯年。
  return taipeiDateString(date);
}

// 同一頻道 + 同一討論串名稱的並發建立請求，共用同一個「建立中」Promise，避免競態下重複建立討論串。
// 鍵：`${channel.id}:${name}`；Promise settle（成功或失敗）後從 Map 移除。
const pendingThreadCreations = new Map<string, Promise<AnyThreadChannel>>();

// fetchArchived 一次只回傳一頁（預設 100 筆），討論串數量多時目標可能落在較舊的頁次。
// 用 before 游標（傳入本頁最舊的討論串物件，讓 discord.js 直接取其 archivedAt）依 hasMore 逐頁翻頁，
// 直到找到目標或翻完所有頁，避免把「還沒翻到」誤判為「不存在」而重複建立討論串。
async function findArchivedThreadByName(
  channel: TextChannel,
  name: string,
): Promise<AnyThreadChannel | undefined> {
  let before: AnyThreadChannel | undefined;
  for (;;) {
    const page = await channel.threads.fetchArchived({ type: "public", before });
    const found = page.threads.find((t) => t.name === name);
    if (found) return found;
    if (!page.hasMore || page.threads.size === 0) return undefined;
    before = [...page.threads.values()].at(-1);
    if (!before) return undefined;
  }
}

// 尋找既有討論串（active + archived 全頁翻查），不建立新討論串。
// 供 getOrCreateOrderThread 內部使用，也供 thread_backfill.ts 查找「前一天」討論串時使用
// （不應該為了確認舊訊息而創建一個空的討論串）。
export async function findExistingOrderThread(
  channel: TextChannel,
  name: string,
): Promise<AnyThreadChannel | undefined> {
  const active = await channel.threads.fetchActive();
  const activeMatch = active.threads.find((t) => t.name === name);
  if (activeMatch) return activeMatch;

  return findArchivedThreadByName(channel, name);
}

export async function getOrCreateOrderThread(channel: TextChannel, name: string) {
  const key = `${channel.id}:${name}`;
  const existing = pendingThreadCreations.get(key);
  if (existing) return existing;

  const creation = (async (): Promise<AnyThreadChannel> => {
    const thread = await findExistingOrderThread(channel, name);
    if (thread) {
      if (thread.archived) {
        await thread.setArchived(false);
      }
      return thread;
    }

    // Create new thread
    return channel.threads.create({
      name,
      autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
      type: ChannelType.PublicThread,
      reason: `會計日誌 - ${name}`,
    });
  })().finally(() => {
    pendingThreadCreations.delete(key);
  });

  pendingThreadCreations.set(key, creation);
  return creation;
}

/**
 * 訂單作廢/復原的討論串通知一律 fail-soft：找不到頻道、權限不足等問題只記 warn/error，
 * 不能讓通知失敗連帶讓 /order-delete、/order-restore 指令本身回報失敗。
 */
async function logOrderStatusChangeToThread(
  client: Client,
  guildId: string,
  order: OrderThreadLogOrder,
  message: string,
): Promise<void> {
  const botConfig = getCachedBotConfig();
  const targetGuildId = botConfig?.primaryGuildId ?? guildId;
  let channelId: string | null | undefined;

  try {
    const config = await getAccountingConfig(targetGuildId);
    channelId = getAccountingChannelId(config?.channelId);
    if (!channelId) {
      logger.warn(
        { guildId: targetGuildId, orderId: order.id },
        "No accounting channel configured, skipping order status change thread log",
      );
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

    await thread.send({ content: message });
    logger.info({ orderId: order.id, channelId, threadName }, "Order status change logged to thread");
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
        "記帳頻道無法存取（Missing Access），略過訂單作廢/復原通知。",
      );
      return;
    }
    logger.error({ err, guildId, orderId: order.id }, "Failed to log order status change to thread");
  }
}

/** 訂單作廢通知：fail-soft，發送失敗只記錄 log，不影響 /order-delete 指令結果。 */
export async function logOrderVoidToThread(
  client: Client,
  guildId: string,
  order: OrderThreadLogOrder,
  voidedBy: string,
): Promise<void> {
  await logOrderStatusChangeToThread(
    client,
    guildId,
    order,
    `❌ 訂單 #${order.id} 已作廢，操作人 <@${voidedBy}>`,
  );
}

/** 訂單復原通知：fail-soft，發送失敗只記錄 log，不影響 /order-restore 指令結果。 */
export async function logOrderRestoreToThread(
  client: Client,
  guildId: string,
  order: OrderThreadLogOrder,
  restoredBy: string,
): Promise<void> {
  await logOrderStatusChangeToThread(
    client,
    guildId,
    order,
    `✅ 訂單 #${order.id} 已復原，操作人 <@${restoredBy}>`,
  );
}

export function buildOrderLogEmbed(order: OrderThreadLogOrder) {
  const profitColor = order.profit >= 0 ? 0x00c853 : 0xff1744;
  const embed = new EmbedBuilder()
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

  // 舊資料 createdBy 為 null（批次 2 之前建立的訂單），不顯示此欄位
  if (order.createdBy) {
    embed.addFields({ name: "記帳人", value: `<@${order.createdBy}>`, inline: true });
  }

  return embed;
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

// 記錄「最近成功發送到討論串」的訂單 id，供 thread_backfill.ts 在補發前再檢查一次，
// 關閉「backfill 掃描完畢後、實際發送前，剛好被即時下單流程也記錄一次」的競態視窗。
// 上限防止長時間執行下無界增長洩漏記憶體：超過上限直接整批清空（而非逐一淘汰最舊的），
// 因為這裡只是盡力而為的競態防護，不是唯一去重依據（backfill 本身仍會用 Discord 上的既有訊息去重）。
const MAX_RECENTLY_LOGGED_ORDER_IDS = 500;
const recentlyLoggedOrderIds = new Set<string>();

function rememberRecentlyLoggedOrderId(orderId: string): void {
  if (recentlyLoggedOrderIds.size >= MAX_RECENTLY_LOGGED_ORDER_IDS) {
    recentlyLoggedOrderIds.clear();
  }
  recentlyLoggedOrderIds.add(orderId);
}

/** 供 thread_backfill.ts 查詢：這筆訂單是否剛被即時記帳流程發送過。 */
export function hasRecentlyLoggedOrder(orderId: string): boolean {
  return recentlyLoggedOrderIds.has(orderId);
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
    rememberRecentlyLoggedOrderId(order.id);
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
