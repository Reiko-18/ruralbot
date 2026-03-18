export interface ProfitResult {
  actualPrice: number;
  actualCost: number;
  profit: number;
}

export interface SalesAggregation {
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  orderCount: number;
}

export type OverviewState =
  | { level: "all" }
  | { level: "year"; year: number }
  | { level: "month"; year: number; month: number }
  | { level: "day"; year: number; month: number; day: number };
