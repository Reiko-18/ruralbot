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
  const where = options.orderId
    ? { id: options.orderId }
    : {
        createdAt: {
          ...(options.start ? { gte: options.start } : {}),
          ...(options.end ? { lt: options.end } : {}),
        },
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
      const date = formatOrderThreadDate(order.createdAt);
      ordersByDate.set(date, [...(ordersByDate.get(date) ?? []), order]);
    }

    targetSummary.dates = ordersByDate.size;

    for (const [date, dateOrders] of [...ordersByDate.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const thread = await getOrCreateOrderThread(textChannel, date);
      const existingIds = await fetchExistingOrderIds(thread);
      const missingOrders = dateOrders.filter((order) => !existingIds.has(order.id));

      targetSummary.missing += missingOrders.length;
      targetSummary.skipped += dateOrders.length - missingOrders.length;
      await reporter?.(`${date}: DB ${dateOrders.length} 筆，Discord 已有 ${existingIds.size} 筆，待補 ${missingOrders.length} 筆`);

      for (const order of missingOrders) {
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
