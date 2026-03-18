import { prisma } from "../../core/db.js";

export async function upsertAccountingConfig(
  guildId: string,
  channelId: string,
) {
  return prisma.accountingConfig.upsert({
    where: { guildId },
    update: { channelId },
    create: { guildId, channelId },
  });
}

export async function getAccountingConfig(guildId: string) {
  return prisma.accountingConfig.findUnique({ where: { guildId } });
}
