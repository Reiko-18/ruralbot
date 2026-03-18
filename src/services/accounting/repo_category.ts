import { prisma } from "../../core/db.js";

export async function createCategory(name: string) {
  return prisma.category.create({ data: { name } });
}

export async function getAllCategories() {
  return prisma.category.findMany({ orderBy: { name: "asc" } });
}

export async function getCategoryById(id: string) {
  return prisma.category.findUnique({ where: { id } });
}
