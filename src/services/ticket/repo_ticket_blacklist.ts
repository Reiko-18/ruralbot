import { prisma } from "../../core/db.js";
import { logger } from "../logger/logger.js";

export async function getBlacklist(configId: string) {
  return prisma.ticketBlacklist.findMany({
    where: { configId },
    orderBy: { createdAt: "desc" },
  });
}

export async function isBlacklisted(configId: string, userId: string): Promise<boolean> {
  const entry = await prisma.ticketBlacklist.findUnique({
    where: { configId_userId: { configId, userId } },
  });
  return !!entry;
}

export async function addToBlacklist(data: {
  configId: string;
  userId: string;
  reason?: string;
  addedBy: string;
}) {
  const entry = await prisma.ticketBlacklist.create({ data });
  logger.info({ userId: data.userId, configId: data.configId }, "User added to ticket blacklist");
  return entry;
}

export async function removeFromBlacklist(id: string) {
  await prisma.ticketBlacklist.delete({ where: { id } });
  logger.info({ id }, "User removed from ticket blacklist");
}
