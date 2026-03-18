import { prisma } from "../../core/db.js";

export async function createProduct(data: {
  name: string;
  cost: number;
  price: number;
  categoryId: string;
  source?: string;
  faceValue?: number;
  costDiscount?: number;
  priceDiscount?: number;
}) {
  return prisma.product.create({ data, include: { category: true } });
}

export async function getAllProducts() {
  return prisma.product.findMany({
    include: { category: true },
    orderBy: { name: "asc" },
  });
}

export async function getProductById(id: string) {
  return prisma.product.findUnique({
    where: { id },
    include: { category: true },
  });
}

export async function getProductByName(name: string) {
  return prisma.product.findUnique({
    where: { name },
    include: { category: true },
  });
}
