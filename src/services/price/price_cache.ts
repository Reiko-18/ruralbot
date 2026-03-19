import { prisma } from "../../core/db.js";
import { logger } from "../logger/logger.js";
import type { PriceNodeWithRelations } from "../../types/price.type.js";

// Add config cache type
type PriceListConfigCache = {
  title: string;
  description: string | null;
  imageUrl: string | null;
} | null;

let cache = new Map<string, PriceNodeWithRelations>();
let configCache: PriceListConfigCache = null;
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

  const config = await prisma.priceListConfig.findUnique({ where: { id: 1 } });
  configCache = config ? { title: config.title, description: config.description, imageUrl: config.imageUrl } : null;

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

export function getCachedConfig(): PriceListConfigCache {
  return configCache;
}

export function getCachedRoots(): PriceNodeWithRelations[] {
  return Array.from(cache.values())
    .filter((n) => n.parentId === null)
    .sort((a, b) => a.order - b.order);
}
