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
}) {
  return prisma.order.create({ data });
}

export async function deleteOrder(id: string) {
  return prisma.order.delete({ where: { id } });
}

export async function getOrderById(id: string) {
  return prisma.order.findUnique({ where: { id } });
}

export async function getOrdersByDateRange(start: Date, end: Date) {
  return prisma.order.findMany({
    where: { createdAt: { gte: start, lt: end } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getOrders(start?: Date, end?: Date) {
  const where = start && end ? { createdAt: { gte: start, lt: end } } : {};
  return prisma.order.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });
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
  const rows =
    start && end
      ? await prisma.$queryRaw<AggregateRow[]>`
          SELECT
            SUM(actual_price * quantity) AS total_revenue,
            SUM(actual_cost * quantity) AS total_cost,
            SUM(profit) AS total_profit,
            COUNT(*) AS order_count
          FROM orders
          WHERE created_at >= ${start} AND created_at < ${end}
        `
      : await prisma.$queryRaw<AggregateRow[]>`
          SELECT
            SUM(actual_price * quantity) AS total_revenue,
            SUM(actual_cost * quantity) AS total_cost,
            SUM(profit) AS total_profit,
            COUNT(*) AS order_count
          FROM orders
        `;

  const row = rows[0];
  return {
    totalRevenue: Number(row?.total_revenue ?? 0),
    totalCost: Number(row?.total_cost ?? 0),
    totalProfit: Number(row?.total_profit ?? 0),
    orderCount: Number(row?.order_count ?? 0),
  };
}

export async function getDistinctYears(): Promise<number[]> {
  const results = await prisma.$queryRaw<{ year: bigint }[]>`
    SELECT DISTINCT EXTRACT(YEAR FROM created_at)::int AS year
    FROM orders ORDER BY year DESC
  `;
  return results.map((r) => Number(r.year));
}

export async function getDistinctMonths(year: number): Promise<number[]> {
  const results = await prisma.$queryRaw<{ month: bigint }[]>`
    SELECT DISTINCT EXTRACT(MONTH FROM created_at)::int AS month
    FROM orders
    WHERE EXTRACT(YEAR FROM created_at) = ${year}
    ORDER BY month ASC
  `;
  return results.map((r) => Number(r.month));
}

export async function getDistinctDays(
  year: number,
  month: number,
): Promise<number[]> {
  const results = await prisma.$queryRaw<{ day: bigint }[]>`
    SELECT DISTINCT EXTRACT(DAY FROM created_at)::int AS day
    FROM orders
    WHERE EXTRACT(YEAR FROM created_at) = ${year}
      AND EXTRACT(MONTH FROM created_at) = ${month}
    ORDER BY day ASC
  `;
  return results.map((r) => Number(r.day));
}
