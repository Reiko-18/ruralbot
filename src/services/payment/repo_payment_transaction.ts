import { prisma } from "../../core/db.js";
import type { PaymentStatus, TransactionFilters, TransactionStats } from "../../types/payment.type.js";

export async function createTransaction(data: {
  guildId: string;
  orderId: string;
  amount: number;
  payerName?: string;
  payerEmail?: string;
  payerPhone?: string;
  remark?: string;
  originalAmount?: number;
  feeAmount?: number;
  paymentStore?: string;
  channelId?: string;
  messageId?: string;
  userId?: string;
}) {
  return prisma.paymentTransaction.create({ data });
}

const TERMINAL_STATUSES: PaymentStatus[] = ["COMPLETED", "FAILED", "EXPIRED"];

export async function updateTransactionStatus(
  id: string,
  status: PaymentStatus,
  smilePayData?: {
    smilePayNo?: string;
    paymentCode?: string;
    paymentDeadline?: Date;
    completedAt?: Date;
  },
) {
  const existing = await prisma.paymentTransaction.findUnique({ where: { id } });
  if (!existing) throw new Error(`Transaction ${id} not found`);
  if (TERMINAL_STATUSES.includes(existing.status as PaymentStatus)) {
    throw new Error(`Transaction ${id} is already in terminal status: ${existing.status}`);
  }

  return prisma.paymentTransaction.update({
    where: { id },
    data: {
      status,
      ...smilePayData,
      ...(status === "COMPLETED" && !smilePayData?.completedAt ? { completedAt: new Date() } : {}),
    },
  });
}

export async function getTransaction(id: string) {
  return prisma.paymentTransaction.findUnique({
    where: { id },
    include: { callbackLogs: { orderBy: { createdAt: "desc" } } },
  });
}

export async function getTransactionByOrderId(orderId: string) {
  return prisma.paymentTransaction.findUnique({
    where: { orderId },
    include: { callbackLogs: { orderBy: { createdAt: "desc" } } },
  });
}

export async function listTransactions(guildId: string, filters: TransactionFilters = {}) {
  const { status, startDate, endDate, page = 1, limit = 20 } = filters;

  const where: any = { guildId };
  if (status) where.status = status;
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = startDate;
    if (endDate) where.createdAt.lt = endDate;
  }

  const [transactions, total] = await Promise.all([
    prisma.paymentTransaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.paymentTransaction.count({ where }),
  ]);

  // Lazy expiration: mark overdue PENDING transactions as EXPIRED
  const now = new Date();
  const expired = transactions.filter(
    (t) => t.status === "PENDING" && t.paymentDeadline && t.paymentDeadline < now,
  );
  if (expired.length > 0) {
    await prisma.paymentTransaction.updateMany({
      where: { id: { in: expired.map((t) => t.id) } },
      data: { status: "EXPIRED" },
    });
    for (const t of expired) t.status = "EXPIRED";
  }

  return { transactions, total, page, limit };
}

export async function getTransactionStats(
  guildId: string,
  startDate?: Date,
  endDate?: Date,
): Promise<TransactionStats> {
  const where: any = { guildId };
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = startDate;
    if (endDate) where.createdAt.lt = endDate;
  }

  const [aggregate, statusCounts] = await Promise.all([
    prisma.paymentTransaction.aggregate({
      where: { ...where, status: "COMPLETED" },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.paymentTransaction.groupBy({
      by: ["status"],
      where,
      _count: true,
    }),
  ]);

  const countByStatus = Object.fromEntries(
    statusCounts.map((s) => [s.status, s._count]),
  );

  return {
    totalAmount: aggregate._sum.amount ?? 0,
    totalCount: statusCounts.reduce((sum, s) => sum + s._count, 0),
    completedCount: countByStatus["COMPLETED"] ?? 0,
    pendingCount: countByStatus["PENDING"] ?? 0,
    failedCount: countByStatus["FAILED"] ?? 0,
    expiredCount: countByStatus["EXPIRED"] ?? 0,
  };
}

export async function createCallbackLog(data: {
  transactionId: string;
  rawData: string;
  sourceIp?: string;
}) {
  return prisma.paymentCallbackLog.create({ data });
}
