import { prisma } from "../../core/db.js";
import type { TransactionFilters, TransactionStats } from "../../types/payment.type.js";

/**
 * 原子化將 PENDING 交易轉為 COMPLETED（取代 read-then-write）。
 * 用 updateMany 帶 status: 'PENDING' 條件，確保並發回呼只有一次呼叫能成功轉態，
 * 回傳 count === 1 供呼叫端判斷「這次呼叫是否真的完成了轉態」，藉此避免重複發送成功通知。
 */
export async function completePendingTransaction(
  orderId: string,
  data: {
    smilePayNo?: string;
    paymentCode?: string;
    paymentDeadline?: Date;
    completedAt?: Date;
  } = {},
): Promise<boolean> {
  const result = await prisma.paymentTransaction.updateMany({
    where: { orderId, status: "PENDING" },
    data: {
      status: "COMPLETED",
      ...data,
      completedAt: data.completedAt ?? new Date(),
    },
  });
  return result.count === 1;
}

/**
 * 原子化將 PENDING 交易轉為 FAILED（同樣以 updateMany 帶 status 條件避免並發重複處理）。
 */
export async function failPendingTransaction(
  orderId: string,
  data: {
    smilePayNo?: string;
  } = {},
): Promise<boolean> {
  const result = await prisma.paymentTransaction.updateMany({
    where: { orderId, status: "PENDING" },
    data: {
      status: "FAILED",
      ...data,
    },
  });
  return result.count === 1;
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

  const [aggregate, statusCounts, completedTransactions] = await Promise.all([
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
    prisma.paymentTransaction.findMany({
      where: { ...where, status: "COMPLETED" },
      select: { amount: true, originalAmount: true, feeAmount: true },
    }),
  ]);

  const countByStatus = Object.fromEntries(
    statusCounts.map((s) => [s.status, s._count]),
  );

  const totalPaymentAmount = aggregate._sum.amount ?? 0;
  const totalSalesAmount = completedTransactions.reduce(
    (sum, t) => sum + (t.originalAmount ?? t.amount),
    0,
  );
  const totalFeeAmount = completedTransactions.reduce(
    (sum, t) => sum + (t.feeAmount ?? 0),
    0,
  );

  return {
    totalAmount: totalSalesAmount,
    totalSalesAmount,
    totalPaymentAmount,
    totalFeeAmount,
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
