import { prisma } from "../../core/db.js";
import { logger } from "../logger/logger.js";
import type { PriceNodeWithRelations } from "../../types/price.type.js";

let cache = new Map<string, PriceNodeWithRelations>();
let refreshing = false;

export async function loadPriceCache(): Promise<void> {
  const nodes = await prisma.priceNode.findMany({
    include: {
      children: { orderBy: { order: "asc" } },
      items: { orderBy: { order: "asc" } },
    },
    orderBy: { order: "asc" },
  });

  const newCache = new Map<string, PriceNodeWithRelations>();
  for (const node of nodes) {
    newCache.set(node.id, node);
  }
  cache = newCache;
  logger.info({ nodeCount: nodes.length }, "Price cache loaded");
}

export async function refreshPriceCache(): Promise<void> {
  if (refreshing) return;
  refreshing = true;
  try {
    await loadPriceCache();
  } finally {
    refreshing = false;
  }
}

export function getCachedNode(
  id: string,
): PriceNodeWithRelations | undefined {
  return cache.get(id);
}

export function getCachedRoots(): PriceNodeWithRelations[] {
  return Array.from(cache.values())
    .filter((n) => n.parentId === null)
    .sort((a, b) => a.order - b.order);
}
