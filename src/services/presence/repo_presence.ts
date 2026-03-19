import { prisma } from "../../core/db.js";

export async function getAllPresenceTexts() {
  return prisma.presenceText.findMany({ orderBy: { order: "asc" } });
}

export async function createPresenceText(text: string) {
  const maxOrder = await prisma.presenceText.aggregate({ _max: { order: true } });
  const order = (maxOrder._max.order ?? -1) + 1;
  return prisma.presenceText.create({ data: { text, order } });
}

export async function deletePresenceText(id: string) {
  return prisma.presenceText.delete({ where: { id } });
}
