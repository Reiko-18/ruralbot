import { prisma } from "../../core/db.js";
import { logger } from "../logger/logger.js";
import type { TicketStats } from "../../types/ticket.type.js";

export async function createInstance(data: {
  configId: string;
  buttonTypeId?: string;
  channelId: string;
  creatorId: string;
  ticketNum: number;
}) {
  const instance = await prisma.ticketInstance.create({ data });
  logger.info({ id: instance.id, ticketNum: data.ticketNum }, "Ticket instance created");
  return instance;
}

export async function getInstanceByChannelId(channelId: string) {
  return prisma.ticketInstance.findUnique({
    where: { channelId },
    include: { config: true, buttonType: true, order: true },
  });
}

export async function getInstanceById(id: string) {
  return prisma.ticketInstance.findUnique({
    where: { id },
    include: { config: true, buttonType: true, order: true },
  });
}

export async function getInstances(params: {
  configId?: string;
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const where: any = {};
  if (params.configId) where.configId = params.configId;
  if (params.status) where.status = params.status;
  if (params.search) {
    const conditions: any[] = [
      { channelId: { contains: params.search } },
      { creatorId: { contains: params.search } },
    ];
    if (!isNaN(Number(params.search))) {
      conditions.push({ ticketNum: Number(params.search) });
    }
    where.OR = conditions;
  }

  return prisma.ticketInstance.findMany({
    where,
    include: { buttonType: true, order: true },
    orderBy: { createdAt: "desc" },
    take: params.limit ?? 50,
    skip: params.offset ?? 0,
  });
}

export async function updateInstanceStatus(
  channelId: string,
  status: string,
  closedAt?: Date,
) {
  return prisma.ticketInstance.update({
    where: { channelId },
    data: { status, closedAt: closedAt ?? null },
  });
}

export async function updateInstanceActivity(channelId: string) {
  return prisma.ticketInstance.update({
    where: { channelId },
    data: { lastActivityAt: new Date(), reminded: false },
  });
}

export async function linkOrder(channelId: string, orderId: string) {
  return prisma.ticketInstance.update({
    where: { channelId },
    data: { orderId },
  });
}

export async function markReminded(id: string) {
  return prisma.ticketInstance.update({
    where: { id },
    data: { reminded: true },
  });
}

export async function getOpenInstances() {
  return prisma.ticketInstance.findMany({
    where: { status: "OPEN" },
    include: { config: true, buttonType: true },
  });
}

export async function getTicketStats(configId: string): Promise<TicketStats> {
  const [openCount, closedCount, archivedCount] = await Promise.all([
    prisma.ticketInstance.count({ where: { configId, status: "OPEN" } }),
    prisma.ticketInstance.count({ where: { configId, status: "CLOSED" } }),
    prisma.ticketInstance.count({ where: { configId, status: "ARCHIVED" } }),
  ]);

  // Average resolution time for closed/archived tickets
  const closed = await prisma.ticketInstance.findMany({
    where: { configId, status: { in: ["CLOSED", "ARCHIVED"] }, closedAt: { not: null } },
    select: { createdAt: true, closedAt: true },
  });
  const totalHours = closed.reduce((sum, t) => {
    const diff = (t.closedAt!.getTime() - t.createdAt.getTime()) / (1000 * 60 * 60);
    return sum + diff;
  }, 0);
  const avgResolutionHours = closed.length > 0 ? Math.round((totalHours / closed.length) * 10) / 10 : 0;

  // By type
  const byTypeRaw = await prisma.ticketInstance.groupBy({
    by: ["buttonTypeId"],
    where: { configId },
    _count: true,
  });
  const buttonTypes = await prisma.ticketButtonType.findMany({
    where: { configId },
    select: { id: true, label: true },
  });
  const labelMap = new Map(buttonTypes.map((b) => [b.id, b.label]));
  const byType = byTypeRaw.map((r) => ({
    label: r.buttonTypeId ? labelMap.get(r.buttonTypeId) ?? "未知" : "未分類",
    count: r._count,
  }));

  // Daily trend (last 14 days)
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  const dailyRaw = await prisma.$queryRaw<{ date: string; count: bigint }[]>`
    SELECT TO_CHAR(created_at, 'YYYY-MM-DD') AS date, COUNT(*)::int AS count
    FROM ticket_instances
    WHERE config_id = ${configId} AND created_at >= ${fourteenDaysAgo}
    GROUP BY date ORDER BY date ASC
  `;
  const dailyTrend = dailyRaw.map((r) => ({ date: r.date, count: Number(r.count) }));

  return { openCount, closedCount, archivedCount, avgResolutionHours, byType, dailyTrend };
}
