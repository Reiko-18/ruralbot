import { prisma } from "../../core/db.js";
import { logger } from "../logger/logger.js";

export async function getTicketConfig(guildId: string) {
  return prisma.ticketConfig.findUnique({ where: { guildId } });
}

export async function upsertTicketConfig(
  guildId: string,
  data: {
    panelChannelId?: string | null;
    panelMessageId?: string | null;
    logChannelId?: string | null;
    categoryOpenId?: string | null;
    categoryCloseId?: string | null;
    panelComponentType?: string;
    panelEmbed?: string | null;
    defaultMessage?: string | null;
    autoRemindHours?: number | null;
    autoCloseHours?: number | null;
    blacklistMode?: string;
    blacklistMessage?: string | null;
    transcriptTarget?: string;
    transcriptLogMessage?: string | null;
    transcriptDmMessage?: string | null;
  },
) {
  const config = await prisma.ticketConfig.upsert({
    where: { guildId },
    create: { guildId, ...data },
    update: data,
  });
  logger.info({ guildId }, "Ticket config upserted");
  return config;
}

export async function incrementTicketNum(guildId: string): Promise<number> {
  const config = await prisma.ticketConfig.update({
    where: { guildId },
    data: { lastTicketNum: { increment: 1 } },
  });
  return config.lastTicketNum;
}

export async function updatePanelMessageId(guildId: string, panelMessageId: string) {
  return prisma.ticketConfig.update({
    where: { guildId },
    data: { panelMessageId },
  });
}
