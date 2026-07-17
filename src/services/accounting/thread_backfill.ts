import {
  ChannelType,
  type Client,
  type TextChannel,
} from "discord.js";
import { prisma } from "../../core/db.js";
import {
  buildOrderLogEmbed,
  formatOrderThreadDate,
  getOrCreateOrderThread,
  findExistingOrderThread,
  hasRecentlyLoggedOrder,
  type OrderThreadLogOrder,
} from "./thread_logger.js";

const RATE_LIMIT_DELAY_MS = 1200;
const ORDER_ID_PATTERN = /#([0-9A-Z]{6})\b/;

export type AccountingThreadBackfillOptions = {
  start?: Date;
  end?: Date;
  orderId?: string;
  guildId?: string;
  channelId?: string;
  dryRun: boolean;
};

export type AccountingThreadBackfillTargetSummary = {
  guildId: string;
  channelId: string;
  sent: number;
  skipped: number;
  missing: number;
  dates: number;
};

export type AccountingThreadBackfillSummary = {
  candidateOrders: number;
  dryRun: boolean;
  targets: AccountingThreadBackfillTargetSummary[];
};

type TargetChannel = {
  guildId: string;
  channelId: string;
};

type Reporter = (message: string) => void | Promise<void>;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveTargets(options: AccountingThreadBackfillOptions): Promise<TargetChannel[]> {
  if (options.channelId) {
    const botConfig = await prisma.botConfig.findUnique({ where: { id: 1 } });
    return [{
      guildId: options.guildId ?? botConfig?.primaryGuildId ?? "channel-override",
      channelId: options.channelId,
    }];
  }

  const botConfig = await prisma.botConfig.findUnique({ where: { id: 1 } });
  if (options.guildId) {
    const config = await prisma.accountingConfig.findUnique({ where: { guildId: options.guildId } });
    return config ? [{ guildId: config.guildId, channelId: config.channelId }] : [];
  }

  if (botConfig) {
    const config = await prisma.accountingConfig.findUnique({ where: { guildId: botConfig.primaryGuildId } });
    return config ? [{ guildId: config.guildId, channelId: config.channelId }] : [];
  }

  return prisma.accountingConfig.findMany({
    select: { guildId: true, channelId: true },
    orderBy: { createdAt: "asc" },
  });
}

// 舊版曾以 UTC 曆日幫討論串命名/分桶，台北 00:00–08:00 建立的訂單訊息可能因此被歸檔在
// （UTC 曆日認定的）前一天討論串內。formatOrderThreadDate 現已改回傳台北曆日字串
// "YYYY-MM-DD"，這裡單純用字串操作往前推一天，取得需要一併掃描的舊討論串名稱。
function previousDateString(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const prev = new Date(Date.UTC(y, m - 1, d - 1));
  const py = prev.getUTCFullYear();
  const pm = String(prev.getUTCMonth() + 1).padStart(2, "0");
  const pd = String(prev.getUTCDate()).padStart(2, "0");
  return `${py}-${pm}-${pd}`;
}

async function fetchExistingOrderIds(thread: Awaited<ReturnType<typeof getOrCreateOrderThread>>) {
  const ids = new Set<string>();
  let before: string | undefined;

  for (;;) {
    const messages = await thread.messages.fetch({ limit: 100, before });
    if (messages.size === 0) break;

    for (const message of messages.values()) {
      for (const embed of message.embeds) {
        const match = embed.title?.match(ORDER_ID_PATTERN);
        if (match) ids.add(match[1]);
      }
    }

    before = messages.last()?.id;
    if (!before || messages.size < 100) break;
  }

  return ids;
}

async function fetchOrders(options: AccountingThreadBackfillOptions): Promise<OrderThreadLogOrder[]> {
  // 已作廢（deletedAt 不為 null）的訂單不應被補發到討論串：作廢單本來就不該出現在帳目紀錄裡，
  // 若指名以 orderId 查詢單一筆單（人工除錯用途），刻意不過濾，讓操作者能查到已作廢單的原始資料。
  const where = options.orderId
    ? { id: options.orderId }
    : {
        createdAt: {
          ...(options.start ? { gte: options.start } : {}),
          ...(options.end ? { lt: options.end } : {}),
        },
        deletedAt: null,
      };

  return prisma.order.findMany({
    where,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}

async function sendOrderWithRetry(thread: Awaited<ReturnType<typeof getOrCreateOrderThread>>, order: OrderThreadLogOrder) {
  const embed = buildOrderLogEmbed(order);

  try {
    await thread.send({ embeds: [embed] });
    return;
  } catch (err: any) {
    if (err?.status !== 429) throw err;

    const retryAfterMs = Math.ceil(Number(err.retryAfter ?? 5) * 1000);
    await sleep(retryAfterMs);
    await thread.send({ embeds: [embed] });
  }
}

export async function backfillAccountingThreads(
  client: Client,
  options: AccountingThreadBackfillOptions,
  reporter?: Reporter,
): Promise<AccountingThreadBackfillSummary> {
  const orders = await fetchOrders(options);
  const targets = await resolveTargets(options);

  const summary: AccountingThreadBackfillSummary = {
    candidateOrders: orders.length,
    dryRun: options.dryRun,
    targets: [],
  };

  for (const target of targets) {
    const targetSummary: AccountingThreadBackfillTargetSummary = {
      guildId: target.guildId,
      channelId: target.channelId,
      sent: 0,
      skipped: 0,
      missing: 0,
      dates: 0,
    };
    summary.targets.push(targetSummary);

    await reporter?.(`處理頻道 ${target.channelId}`);
    const channel = await client.channels.fetch(target.channelId);
    if (!channel || channel.type !== ChannelType.GuildText) {
      await reporter?.("頻道不存在或不是文字頻道，略過。");
      continue;
    }

    const textChannel = channel as TextChannel;
    const ordersByDate = new Map<string, OrderThreadLogOrder[]>();
    for (const order of orders) {
      // formatOrderThreadDate 已改為台北曆日（taipeiDateString），故此處分桶與
      // thread_logger.ts 即時寫入時使用的討論串名稱一致。
      const date = formatOrderThreadDate(order.createdAt);
      ordersByDate.set(date, [...(ordersByDate.get(date) ?? []), order]);
    }

    targetSummary.dates = ordersByDate.size;

    for (const [date, dateOrders] of [...ordersByDate.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const thread = await getOrCreateOrderThread(textChannel, date);
      const existingIds = await fetchExistingOrderIds(thread);

      // 舊版曾以 UTC 曆日分桶，同一筆訂單的訊息可能落在「前一天」命名的討論串。
      // 只查找既有討論串（不建立），將兩邊 id 聯集後再判斷缺漏，避免把已存在別串的訂單誤判為缺漏而重複發送。
      const prevDateName = previousDateString(date);
      const prevThread = await findExistingOrderThread(textChannel, prevDateName);
      const prevExistingIds = prevThread ? await fetchExistingOrderIds(prevThread) : new Set<string>();
      const combinedExistingIds = new Set([...existingIds, ...prevExistingIds]);

      const missingOrders = dateOrders.filter((order) => !combinedExistingIds.has(order.id));

      targetSummary.missing += missingOrders.length;
      targetSummary.skipped += dateOrders.length - missingOrders.length;
      await reporter?.(`${date}: DB ${dateOrders.length} 筆，Discord 已有 ${combinedExistingIds.size} 筆（含前一天討論串 ${prevExistingIds.size} 筆），待補 ${missingOrders.length} 筆`);

      for (const order of missingOrders) {
        // 發送前再次檢查：backfill 掃描完成到實際發送之間，訂單可能剛好被即時下單流程
        // （logOrderToThread）也記錄了一次，這裡關閉這個競態視窗，避免重複張貼。
        if (hasRecentlyLoggedOrder(order.id)) {
          targetSummary.skipped++;
          await reporter?.(`跳過 #${order.id}（偵測到已由即時記帳流程剛發送，避免重複）`);
          continue;
        }

        if (options.dryRun) {
          await reporter?.(`dry-run #${order.id} ${order.productName}`);
          continue;
        }

        await sendOrderWithRetry(thread, order);
        targetSummary.sent++;
        await reporter?.(`已補發 #${order.id} ${order.productName}`);
        await sleep(RATE_LIMIT_DELAY_MS);
      }
    }
  }

  return summary;
}
