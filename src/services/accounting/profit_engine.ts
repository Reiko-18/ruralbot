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
  inputFaceValue?: number,
): ProfitResult {
  const faceValue = inputFaceValue ?? product.faceValue;
  const hasDiscount =
    faceValue != null &&
    product.costDiscount != null &&
    product.priceDiscount != null;

  let actualPrice: number;
  let actualCost: number;

  if (hasDiscount) {
    actualCost = faceValue! * product.costDiscount!;
    actualPrice = customPrice ?? faceValue! * product.priceDiscount!;
  } else {
    actualCost = product.cost;
    actualPrice = customPrice ?? product.price;
  }

  const profit = (actualPrice - actualCost) * quantity;

  return { actualPrice, actualCost, profit };
}

export function isDiscountProduct(product: ProductData): boolean {
  return product.costDiscount != null && product.priceDiscount != null;
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
