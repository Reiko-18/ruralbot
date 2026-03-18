import { prisma } from "../../core/db.js";
import type { LogConfigCache } from "../../types/logger.type.js";

export async function getAllEnabledConfigs(): Promise<LogConfigCache[]> {
  const configs = await prisma.logConfig.findMany({
    where: { isEnabled: true },
  });
  return configs.map((c) => ({
    channelId: c.channelId,
    webhookUrl: c.webhookUrl,
    minLevel: c.minLevel,
    label: c.label,
  }));
}

export async function getAllConfigs() {
  return prisma.logConfig.findMany({ orderBy: { createdAt: "asc" } });
}

export async function upsertConfig(
  channelId: string,
  webhookUrl: string,
  minLevel: number,
  label: string | null,
) {
  return prisma.logConfig.upsert({
    where: { channelId },
    update: { webhookUrl, minLevel, label, isEnabled: true },
    create: { channelId, webhookUrl, minLevel, label },
  });
}

export async function removeConfig(channelId: string) {
  return prisma.logConfig.delete({ where: { channelId } });
}
