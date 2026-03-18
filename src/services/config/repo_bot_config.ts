import { prisma } from "../../core/db.js";
import { logger } from "../logger/logger.js";

type BotConfigCache = {
  primaryGuildId: string;
  syncChannelId: string;
} | null;

let cache: BotConfigCache = null;

export async function loadBotConfig(): Promise<void> {
  const config = await prisma.botConfig.findUnique({ where: { id: 1 } });
  cache = config
    ? { primaryGuildId: config.primaryGuildId, syncChannelId: config.syncChannelId }
    : null;
  logger.info({ config: cache }, "BotConfig loaded");
}

export function getCachedBotConfig(): BotConfigCache {
  return cache;
}

export async function upsertBotConfig(
  primaryGuildId: string,
  syncChannelId: string,
) {
  const result = await prisma.botConfig.upsert({
    where: { id: 1 },
    update: { primaryGuildId, syncChannelId },
    create: { primaryGuildId, syncChannelId },
  });
  cache = { primaryGuildId, syncChannelId };
  return result;
}
