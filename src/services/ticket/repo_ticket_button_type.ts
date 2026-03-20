import { prisma } from "../../core/db.js";
import { logger } from "../logger/logger.js";

export async function getButtonTypes(configId: string) {
  return prisma.ticketButtonType.findMany({
    where: { configId },
    orderBy: { order: "asc" },
  });
}

export async function getButtonTypeById(id: string) {
  return prisma.ticketButtonType.findUnique({ where: { id } });
}

export async function createButtonType(data: {
  configId: string;
  label: string;
  emoji?: string;
  style?: string;
  categoryOpenId?: string;
  categoryCloseId?: string;
  welcomeMessage?: string;
  embedSettings?: string;
  notifyRoleIds?: string;
  autoRemindHours?: number;
  autoCloseHours?: number;
}) {
  const maxOrder = await prisma.ticketButtonType.aggregate({
    where: { configId: data.configId },
    _max: { order: true },
  });
  const btn = await prisma.ticketButtonType.create({
    data: { ...data, order: (maxOrder._max.order ?? -1) + 1 },
  });
  logger.info({ id: btn.id, label: btn.label }, "Button type created");
  return btn;
}

export async function updateButtonType(
  id: string,
  data: {
    label?: string;
    emoji?: string | null;
    style?: string;
    categoryOpenId?: string | null;
    categoryCloseId?: string | null;
    welcomeMessage?: string | null;
    embedSettings?: string | null;
    notifyRoleIds?: string | null;
    autoRemindHours?: number | null;
    autoCloseHours?: number | null;
  },
) {
  const btn = await prisma.ticketButtonType.update({ where: { id }, data });
  logger.info({ id: btn.id }, "Button type updated");
  return btn;
}

export async function deleteButtonType(id: string) {
  await prisma.ticketButtonType.delete({ where: { id } });
  logger.info({ id }, "Button type deleted");
}

export async function reorderButtonTypes(ids: string[]) {
  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.ticketButtonType.update({ where: { id }, data: { order: index } }),
    ),
  );
}
