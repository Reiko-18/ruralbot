import type { ProfitResult } from "../../types/accounting.type.js";

interface ProductData {
  price: number;
  cost: number;
  faceValue?: number | null;
  costDiscount?: number | null;
  priceDiscount?: number | null;
}

export function calculateProfit(
  product: ProductData,
  quantity: number,
  customPrice?: number,
): ProfitResult {
  const hasDiscount =
    product.faceValue != null &&
    product.costDiscount != null &&
    product.priceDiscount != null;

  let actualPrice: number;
  let actualCost: number;

  if (hasDiscount) {
    actualCost = product.faceValue! * product.costDiscount!;
    actualPrice = customPrice ?? product.faceValue! * product.priceDiscount!;
  } else {
    actualCost = product.cost;
    actualPrice = customPrice ?? product.price;
  }

  const profit = (actualPrice - actualCost) * quantity;

  return { actualPrice, actualCost, profit };
}

export function calculateCustomProfit(
  price: number,
  cost: number,
  quantity: number,
): ProfitResult {
  return {
    actualPrice: price,
    actualCost: cost,
    profit: (price - cost) * quantity,
  };
}
