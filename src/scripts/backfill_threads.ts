import "dotenv/config";
import {
  Client,
  GatewayIntentBits,
  ChannelType,
  EmbedBuilder,
  ThreadAutoArchiveDuration,
  type TextChannel,
} from "discord.js";
import { prisma } from "../core/db.js";

const RATE_LIMIT_DELAY = 1200; // ms between messages to avoid rate limits

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

async function getOrCreateThread(channel: TextChannel, name: string) {
  const active = await channel.threads.fetchActive();
  let thread = active.threads.find((t) => t.name === name);
  if (thread) return thread;

  const archived = await channel.threads.fetchArchived({ type: "public" });
  thread = archived.threads.find((t) => t.name === name);
  if (thread) {
    await thread.setArchived(false);
    return thread;
  }

  return channel.threads.create({
    name,
    autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
    type: ChannelType.PublicThread,
    reason: `會計日誌 - ${name}`,
  });
}

async function main() {
  // Get all accounting configs
  const configs = await prisma.accountingConfig.findMany();
  if (configs.length === 0) {
    console.log("No accounting configs found. Run /accounting-setup first.");
    await prisma.$disconnect();
    process.exit(0);
  }

  // Get all orders sorted by date ascending (oldest first)
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: "asc" },
  });
  console.log(`Found ${orders.length} orders to backfill.\n`);

  if (orders.length === 0) {
    await prisma.$disconnect();
    process.exit(0);
  }

  // Login Discord client
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  await client.login(process.env.TOKEN);
  console.log(`Logged in as ${client.user?.tag}\n`);

  // Process each config (guild)
  for (const config of configs) {
    console.log(`Processing guild ${config.guildId}, channel ${config.channelId}`);

    const channel = await client.channels.fetch(config.channelId);
    if (!channel || channel.type !== ChannelType.GuildText) {
      console.log(`  ✗ Channel not found or not text channel, skipping.`);
      continue;
    }

    const textChannel = channel as TextChannel;

    // Group orders by date
    const ordersByDate = new Map<string, typeof orders>();
    for (const order of orders) {
      const date = formatDate(order.createdAt);
      if (!ordersByDate.has(date)) ordersByDate.set(date, []);
      ordersByDate.get(date)!.push(order);
    }

    const dates = Array.from(ordersByDate.keys()).sort();
    console.log(`  ${dates.length} dates, ${orders.length} orders total\n`);

    let sent = 0;

    for (const date of dates) {
      const dateOrders = ordersByDate.get(date)!;
      const thread = await getOrCreateThread(textChannel, date);
      console.log(`  Thread: ${date} (${dateOrders.length} orders)`);

      for (const order of dateOrders) {
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

        try {
          await thread.send({ embeds: [embed] });
          sent++;
          console.log(`    ✓ #${order.id} ${order.productName}`);
        } catch (err: any) {
          if (err?.status === 429) {
            const retryAfter = err.retryAfter ?? 5;
            console.log(`    ⏳ Rate limited, waiting ${retryAfter}s...`);
            await sleep(retryAfter * 1000);
            await thread.send({ embeds: [embed] });
            sent++;
            console.log(`    ✓ #${order.id} ${order.productName} (retried)`);
          } else {
            console.log(`    ✗ #${order.id}: ${err.message}`);
          }
        }

        await sleep(RATE_LIMIT_DELAY);
      }
    }

    console.log(`\n  Done! Sent ${sent}/${orders.length} orders.`);
  }

  client.destroy();
  await prisma.$disconnect();
  console.log("\nBackfill complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
