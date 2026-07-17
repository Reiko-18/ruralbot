import { prisma } from "../../core/db.js";
import type { SalesAggregation } from "../../types/accounting.type.js";

export async function createOrder(data: {
  id: string;
  productId?: string;
  productName: string;
  quantity: number;
  actualPrice: number;
  actualCost: number;
  profit: number;
  isCustom?: boolean;
  createdAt?: Date;
  createdBy?: string;
}) {
  return prisma.order.create({ data });
}

/**
 * 軟刪除（作廢）訂單：只對目前未作廢（deletedAt 為 null）的單生效。
 * 回傳值語意：
 *   - null  → 訂單不存在
 *   - false → 訂單存在但已是作廢狀態（呼叫端應提示「已作廢」而非誤報成功）
 *   - Order → 作廢成功，回傳作廢後的訂單
 * updateMany 的 where 條件在資料庫端原子性判定，避免確認鈕連點造成重複作廢/覆寫 deletedBy。
 */
export async function deleteOrder(id: string, deletedBy: string) {
  const result = await prisma.order.updateMany({
    where: { id, deletedAt: null },
    data: { deletedAt: new Date(), deletedBy },
  });

  if (result.count === 0) {
    const existing = await prisma.order.findUnique({ where: { id } });
    return existing ? (false as const) : null;
  }

  return prisma.order.findUnique({ where: { id } });
}

/**
 * 復原已作廢的訂單：只對目前已作廢（deletedAt 不為 null）的單生效。
 * 回傳值語意與 deleteOrder 對稱：
 *   - null  → 訂單不存在
 *   - false → 訂單存在但目前並未作廢（無需復原）
 *   - Order → 復原成功，回傳復原後的訂單
 */
export async function restoreOrder(id: string) {
  const result = await prisma.order.updateMany({
    where: { id, deletedAt: { not: null } },
    data: { deletedAt: null, deletedBy: null },
  });

  if (result.count === 0) {
    const existing = await prisma.order.findUnique({ where: { id } });
    return existing ? (false as const) : null;
  }

  return prisma.order.findUnique({ where: { id } });
}

// getOrderById 刻意「不」過濾 deletedAt：/order-lookup 需要查到已作廢單以顯示作廢狀態，
// /order-restore 也需要先查到已作廢單才能復原。呼叫端自行依 deletedAt 決定顯示方式。
export async function getOrderById(id: string) {
  return prisma.order.findUnique({ where: { id } });
}

export async function getOrdersByDateRange(start: Date, end: Date) {
  return prisma.order.findMany({
    where: { createdAt: { gte: start, lt: end }, deletedAt: null },
    orderBy: { createdAt: "desc" },
  });
}

// limit/skip 皆為選填：
// - limit 由資料庫端 take 截斷（dashboard API、/sales-export 匯出上限皆用此參數，避免整段期間全撈回應用層才裁切）。
// - skip 供分頁查詢使用（/sales-overview 訂單列表已改為資料庫層分頁，見下方 countOrders），
//   不傳時維持舊行為（從頭開始、不限筆數），既有呼叫端不受影響。
export async function getOrders(start?: Date, end?: Date, limit?: number, skip?: number) {
  const where =
    start && end
      ? { createdAt: { gte: start, lt: end }, deletedAt: null }
      : { deletedAt: null };
  return prisma.order.findMany({
    where,
    orderBy: { createdAt: "desc" },
    ...(limit ? { take: limit } : {}),
    ...(skip ? { skip } : {}),
  });
}

// countOrders：回傳指定期間（或全部，start/end 皆不傳時）未作廢訂單筆數。
// 供 /sales-overview 資料庫層分頁計算總頁數，以及 /sales-export 判斷是否超過匯出上限並提示截斷，
// where 條件比照 getOrders/aggregateSales：僅在 start 與 end 同時提供時套用日期區間過濾。
export async function countOrders(start?: Date, end?: Date): Promise<number> {
  const where =
    start && end
      ? { createdAt: { gte: start, lt: end }, deletedAt: null }
      : { deletedAt: null };
  return prisma.order.count({ where });
}

type AggregateRow = {
  total_revenue: number | null;
  total_cost: number | null;
  total_profit: number | null;
  order_count: bigint;
};

export async function aggregateSales(
  start?: Date,
  end?: Date,
): Promise<SalesAggregation> {
  // actual_price / actual_cost 為單價/單位成本，需乘上 quantity 才是營收/成本；
  // profit 於寫入時已乘入 quantity，故直接加總即可。Prisma _sum 無法做欄位相乘，改用 $queryRaw。
  // WHERE 條件比照原本 Prisma where：僅在 start 與 end 同時提供時套用日期區間過濾，其餘情況不過濾。
  // start/end 須為呼叫端用 tz_date.ts 換算好的台北曆日 UTC 起訖，本函式僅比較瞬間先後，
  // 不需再對 created_at 做時區位移。
  const rows =
    start && end
      ? await prisma.$queryRaw<AggregateRow[]>`
          SELECT
            SUM(actual_price * quantity) AS total_revenue,
            SUM(actual_cost * quantity) AS total_cost,
            SUM(profit) AS total_profit,
            COUNT(*) AS order_count
          FROM orders
          WHERE created_at >= ${start} AND created_at < ${end} AND deleted_at IS NULL
        `
      : await prisma.$queryRaw<AggregateRow[]>`
          SELECT
            SUM(actual_price * quantity) AS total_revenue,
            SUM(actual_cost * quantity) AS total_cost,
            SUM(profit) AS total_profit,
            COUNT(*) AS order_count
          FROM orders
          WHERE deleted_at IS NULL
        `;

  const row = rows[0];
  return {
    totalRevenue: Number(row?.total_revenue ?? 0),
    totalCost: Number(row?.total_cost ?? 0),
    totalProfit: Number(row?.total_profit ?? 0),
    orderCount: Number(row?.order_count ?? 0),
  };
}

// created_at 為 timestamp without time zone，實際存的是 UTC 瞬間對應的裸時間數字
// （已於 src/prisma/migrations/20260419000000_init/migration.sql 確認欄位型別為 TIMESTAMP(3)，
// 非 timestamptz）。台灣全年固定 UTC+8、無日光節約時間，故直接以 `+ INTERVAL '8 hours'`
// 位移成台北裸時間再 EXTRACT，即可得到正確的台北曆年/月/日分桶，不需依賴 tz database。

export async function getDistinctYears(): Promise<number[]> {
  const results = await prisma.$queryRaw<{ year: bigint }[]>`
    SELECT DISTINCT EXTRACT(YEAR FROM (created_at + INTERVAL '8 hours'))::int AS year
    FROM orders WHERE deleted_at IS NULL ORDER BY year DESC
  `;
  return results.map((r) => Number(r.year));
}

export async function getDistinctMonths(year: number): Promise<number[]> {
  const results = await prisma.$queryRaw<{ month: bigint }[]>`
    SELECT DISTINCT EXTRACT(MONTH FROM (created_at + INTERVAL '8 hours'))::int AS month
    FROM orders
    WHERE EXTRACT(YEAR FROM (created_at + INTERVAL '8 hours')) = ${year}
      AND deleted_at IS NULL
    ORDER BY month ASC
  `;
  return results.map((r) => Number(r.month));
}

export async function getDistinctDays(
  year: number,
  month: number,
): Promise<number[]> {
  const results = await prisma.$queryRaw<{ day: bigint }[]>`
    SELECT DISTINCT EXTRACT(DAY FROM (created_at + INTERVAL '8 hours'))::int AS day
    FROM orders
    WHERE EXTRACT(YEAR FROM (created_at + INTERVAL '8 hours')) = ${year}
      AND EXTRACT(MONTH FROM (created_at + INTERVAL '8 hours')) = ${month}
      AND deleted_at IS NULL
    ORDER BY day ASC
  `;
  return results.map((r) => Number(r.day));
}
