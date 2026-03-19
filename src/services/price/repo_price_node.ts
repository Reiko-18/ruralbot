import { prisma } from "../../core/db.js";
import type { PriceTreeNode } from "../../types/price.type.js";

// ── Node queries ──

export async function getRootNodes() {
  return prisma.priceNode.findMany({
    where: { parentId: null },
    orderBy: { order: "asc" },
    include: {
      children: { orderBy: { order: "asc" } },
      items: { orderBy: { order: "asc" } },
    },
  });
}

export async function getNodeById(id: string) {
  return prisma.priceNode.findUnique({
    where: { id },
    include: {
      children: { orderBy: { order: "asc" } },
      items: { orderBy: { order: "asc" } },
    },
  });
}

export async function getFullTree(): Promise<PriceTreeNode[]> {
  const allNodes = await prisma.priceNode.findMany({
    orderBy: { order: "asc" },
    include: { items: { orderBy: { order: "asc" } } },
  });

  const nodeMap = new Map<string, PriceTreeNode>();
  for (const node of allNodes) {
    nodeMap.set(node.id, { ...node, children: [] });
  }

  const roots: PriceTreeNode[] = [];
  for (const node of nodeMap.values()) {
    if (node.parentId) {
      const parent = nodeMap.get(node.parentId);
      if (parent) parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

export async function getChildrenCount(parentId: string | null) {
  return prisma.priceNode.count({
    where: { parentId },
  });
}

// ── Node mutations ──

export async function createNode(data: {
  name: string;
  content?: string;
  imageUrl?: string;
  parentId?: string;
}) {
  const maxOrder = await prisma.priceNode.aggregate({
    where: { parentId: data.parentId ?? null },
    _max: { order: true },
  });
  return prisma.priceNode.create({
    data: {
      name: data.name,
      content: data.content,
      imageUrl: data.imageUrl,
      parentId: data.parentId ?? null,
      order: (maxOrder._max.order ?? -1) + 1,
    },
    include: {
      children: { orderBy: { order: "asc" } },
      items: { orderBy: { order: "asc" } },
    },
  });
}

export async function updateNode(
  id: string,
  data: { name?: string; content?: string | null; imageUrl?: string | null },
) {
  return prisma.priceNode.update({
    where: { id },
    data,
    include: {
      children: { orderBy: { order: "asc" } },
      items: { orderBy: { order: "asc" } },
    },
  });
}

export async function deleteNode(id: string) {
  return prisma.priceNode.delete({ where: { id } });
}

// ── Item mutations ──

export async function createItem(data: {
  label: string;
  price: string;
  nodeId: string;
}) {
  const maxOrder = await prisma.priceItem.aggregate({
    where: { nodeId: data.nodeId },
    _max: { order: true },
  });
  return prisma.priceItem.create({
    data: {
      label: data.label,
      price: data.price,
      nodeId: data.nodeId,
      order: (maxOrder._max.order ?? -1) + 1,
    },
  });
}

export async function updateItem(
  id: string,
  data: { label?: string; price?: string },
) {
  return prisma.priceItem.update({ where: { id }, data });
}

export async function deleteItem(id: string) {
  return prisma.priceItem.delete({ where: { id } });
}

// ── Reorder ──

export async function reorderNodes(parentId: string | null, ids: string[]) {
  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.priceNode.update({
        where: { id },
        data: { order: index },
      }),
    ),
  );
}

export async function reorderItems(nodeId: string, ids: string[]) {
  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.priceItem.update({
        where: { id },
        data: { order: index },
      }),
    ),
  );
}
