import { prisma } from "../../core/db.js";
import { logger } from "../logger/logger.js";
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
  try {
    return await prisma.paymentTransaction.create({ data });
  } catch (err: any) {
    if (err?.code === "P2002") {
      // #24：orderId 唯一鍵碰撞。
      // 注意：這裡刻意不在內部靜默重新產生 orderId 並自行重試 create()。
      // 原因：所有呼叫端（payment.cmd.ts、rp-interact.event.ts、
      // dashboard/routes/payment.ts）都是先呼叫 generatePaymentOrderId() 拿到 orderId，
      // 再把「同一個 orderId 字串」同時用於 buildPaymentPageUrl() / createBackgroundPayment()
      // ——也就是向 SmilePay 註冊、顯示給付款人的訂單編號——以及這裡的 createTransaction()。
      // 若在此處偷偷把 orderId 換成新產生的值，DB 存的 orderId 會跟已送往 SmilePay、
      // 付款人實際會用來繳費的 orderId 兜不起來；日後 SmilePay callback 帶著「舊」orderId
      // 回來時，會比對到 orderId 唯一鍵衝突當下已存在、剛好持有該 orderId 的另一筆交易，
      // 造成付款結果被誤配到別人的訂單——比原本直接失敗更危險，屬於資料完整性風險。
      // 因此這裡只記錄清楚可辨識的碰撞事件並原樣拋出（保留 err.code 供上層判斷），
      // 真正安全的重試（重新產生 orderId 並「連同 SmilePay 註冊」一起重做整個下單流程）
      // 必須由呼叫端在同一次重試邏輯內完成，超出本檔案可以安全處理的範圍。
      logger.warn(
        { orderId: data.orderId, guildId: data.guildId },
        "createTransaction 遇到 orderId 唯一鍵衝突（P2002）——需由呼叫端重新產生 orderId 並重試整個下單流程",
      );
    }
    throw err;
  }
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
