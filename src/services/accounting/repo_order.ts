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

export async function aggregateSales(
  start?: Date,
  end?: Date,
): Promise<SalesAggregation> {
  const where = start && end ? { createdAt: { gte: start, lt: end } } : {};
  const result = await prisma.order.aggregate({
    where,
    _sum: { actualPrice: true, actualCost: true, profit: true },
    _count: true,
  });
  return {
    totalRevenue: result._sum.actualPrice ?? 0,
    totalCost: result._sum.actualCost ?? 0,
    totalProfit: result._sum.profit ?? 0,
    orderCount: result._count,
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
