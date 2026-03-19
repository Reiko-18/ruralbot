import type { PriceNode, PriceItem } from "../types";

const BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// Nodes
export const fetchTree = () => request<PriceNode[]>("/price-nodes");

export const fetchNode = (id: string) => request<PriceNode>(`/price-nodes/${id}`);

export const createNode = (data: {
  name: string;
  content?: string;
  imageUrl?: string;
  parentId?: string;
}) => request<PriceNode>("/price-nodes", { method: "POST", body: JSON.stringify(data) });

export const updateNode = (id: string, data: {
  name?: string;
  content?: string | null;
  imageUrl?: string | null;
}) => request<PriceNode>(`/price-nodes/${id}`, { method: "PUT", body: JSON.stringify(data) });

export const deleteNode = (id: string) =>
  request<void>(`/price-nodes/${id}`, { method: "DELETE" });

// Items
export const createItem = (data: { label: string; price: string; nodeId: string }) =>
  request<PriceItem>("/price-items", { method: "POST", body: JSON.stringify(data) });

export const updateItem = (id: string, data: { label?: string; price?: string }) =>
  request<PriceItem>(`/price-items/${id}`, { method: "PUT", body: JSON.stringify(data) });

export const deleteItem = (id: string) =>
  request<void>(`/price-items/${id}`, { method: "DELETE" });

// Reorder
export const reorderNodes = (parentId: string | null, ids: string[]) =>
  request<{ success: boolean }>("/reorder/nodes", {
    method: "PUT",
    body: JSON.stringify({ parentId, ids }),
  });

export const reorderItems = (nodeId: string, ids: string[]) =>
  request<{ success: boolean }>("/reorder/items", {
    method: "PUT",
    body: JSON.stringify({ nodeId, ids }),
  });
