import {
  type Client,
  type TextChannel,
  ChannelType,
  EmbedBuilder,
  ThreadAutoArchiveDuration,
} from "discord.js";
import { getAccountingConfig } from "./repo_accounting_config.js";
import { logger } from "../logger/logger.js";

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0]; // YYYY-MM-DD
}

async function getOrCreateThread(channel: TextChannel, name: string) {
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

export async function logOrderToThread(
  client: Client,
  guildId: string,
  order: {
    id: string;
    productName: string;
    quantity: number;
    actualPrice: number;
    actualCost: number;
    profit: number;
    isCustom: boolean;
    createdAt: Date;
  },
): Promise<void> {
  try {
    const config = await getAccountingConfig(guildId);
    if (!config) {
      logger.warn({ guildId }, "No accounting config found, skipping thread log");
      return;
    }

    const channel = await client.channels.fetch(config.channelId);
    if (!channel || channel.type !== ChannelType.GuildText) {
      logger.warn(
        { channelId: config.channelId },
        "Accounting channel not found or not text",
      );
      return;
    }

    const threadName = formatDate(order.createdAt);
    const thread = await getOrCreateThread(channel as TextChannel, threadName);

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

    await thread.send({ embeds: [embed] });
    logger.info({ orderId: order.id, threadName }, "Order logged to thread");
  } catch (err) {
    logger.error({ err, guildId }, "Failed to log order to thread");
  }
}
