import "dotenv/config";
import {
  Client,
  GatewayIntentBits,
  ChannelType,
  type TextChannel,
} from "discord.js";
import { prisma } from "../core/db.js";
import {
  buildOrderLogEmbed,
  formatOrderThreadDate,
  getOrCreateOrderThread,
  type OrderThreadLogOrder,
} from "../services/accounting/thread_logger.js";

const RATE_LIMIT_DELAY_MS = 1200;
const ORDER_ID_PATTERN = /#([0-9A-Z]{6})\b/;

type CliOptions = {
  start?: Date;
  end?: Date;
  orderId?: string;
  guildId?: string;
  channelId?: string;
  yes: boolean;
};

type TargetChannel = {
  guildId: string;
  channelId: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function takeOption(args: string[], name: string) {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);

  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1];

  return undefined;
}

function parseTaipeiDate(value: string) {
  const normalized = value.replace(/\//g, "-");
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return new Date(`${normalized}T00:00:00+08:00`);
  }
  return new Date(value);
}

function parseOptions(): CliOptions {
  const args = process.argv.slice(2);
  const startValue = takeOption(args, "--start");
  const endValue = takeOption(args, "--end");
  const orderId = takeOption(args, "--order-id")?.toUpperCase();
  const guildId = takeOption(args, "--guild-id");
  const channelId = takeOption(args, "--channel-id") ?? process.env.ACCOUNTING_CHANNEL_ID?.trim();

  const options = {
    start: startValue ? parseTaipeiDate(startValue) : undefined,
    end: endValue ? parseTaipeiDate(endValue) : undefined,
    orderId,
    guildId,
    channelId,
    yes: args.includes("--yes"),
  };

  for (const [key, date] of [["start", options.start], ["end", options.end]] as const) {
    if (date && Number.isNaN(date.getTime())) {
      throw new Error(`Invalid --${key} date`);
    }
  }

  if (!options.orderId && !options.start && !options.end) {
    throw new Error("請提供 --start/--end 或 --order-id，避免不小心補發全部訂單。");
  }

  return options;
}

async function resolveTargets(options: CliOptions): Promise<TargetChannel[]> {
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

async function fetchOrders(options: CliOptions): Promise<OrderThreadLogOrder[]> {
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
    console.log(`    速率限制，等待 ${retryAfterMs}ms 後重試 #${order.id}`);
    await sleep(retryAfterMs);
    await thread.send({ embeds: [embed] });
  }
}

async function main() {
  const options = parseOptions();
  const orders = await fetchOrders(options);
  const targets = await resolveTargets(options);

  if (targets.length === 0) {
    console.log("找不到 accounting 目標頻道，請先執行 /accounting-setup 或提供 --channel-id。");
    return;
  }

  console.log(`找到 ${orders.length} 筆候選訂單。模式：${options.yes ? "實際補發" : "dry-run"}`);
  if (orders.length === 0) return;

  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });
  await client.login(process.env.TOKEN);
  console.log(`已登入 Discord：${client.user?.tag}`);

  for (const target of targets) {
    console.log(`\n處理頻道 ${target.channelId}（guild: ${target.guildId}）`);
    const channel = await client.channels.fetch(target.channelId);
    if (!channel || channel.type !== ChannelType.GuildText) {
      console.log("  頻道不存在或不是文字頻道，略過。");
      continue;
    }

    const textChannel = channel as TextChannel;
    const ordersByDate = new Map<string, OrderThreadLogOrder[]>();
    for (const order of orders) {
      const date = formatOrderThreadDate(order.createdAt);
      ordersByDate.set(date, [...(ordersByDate.get(date) ?? []), order]);
    }

    let sent = 0;
    let skipped = 0;

    for (const [date, dateOrders] of [...ordersByDate.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const thread = await getOrCreateOrderThread(textChannel, date);
      const existingIds = await fetchExistingOrderIds(thread);
      const missingOrders = dateOrders.filter((order) => !existingIds.has(order.id));

      console.log(`  ${date}: DB ${dateOrders.length} 筆，Discord 已有 ${existingIds.size} 筆，待補 ${missingOrders.length} 筆`);

      for (const order of missingOrders) {
        if (!options.yes) {
          console.log(`    dry-run #${order.id} ${order.productName}`);
          continue;
        }

        await sendOrderWithRetry(thread, order);
        sent++;
        console.log(`    已補發 #${order.id} ${order.productName}`);
        await sleep(RATE_LIMIT_DELAY_MS);
      }

      skipped += dateOrders.length - missingOrders.length;
    }

    console.log(`  完成：補發 ${sent} 筆，略過既有 ${skipped} 筆。`);
  }

  client.destroy();
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
