import type {
  PriceNode,
  PriceItem,
  PriceListConfig,
  PresenceText,
  AccountingCategory,
  AccountingProduct,
  AccountingOrder,
  SalesAggregation,
} from "../types";

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
  embedSettings?: string;
}) => request<PriceNode>("/price-nodes", { method: "POST", body: JSON.stringify(data) });

export const updateNode = (id: string, data: {
  name?: string;
  content?: string | null;
  imageUrl?: string | null;
  embedSettings?: string | null;
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

// Config
export const fetchConfig = () => request<PriceListConfig>("/price-config");

export const updateConfig = (data: {
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  embedSettings?: string | null;
}) => request<PriceListConfig>("/price-config", { method: "PUT", body: JSON.stringify(data) });

// Presence
export const fetchPresenceTexts = () => request<PresenceText[]>("/presence-texts");

export const createPresenceTextApi = (text: string) =>
  request<PresenceText>("/presence-texts", { method: "POST", body: JSON.stringify({ text }) });

export const deletePresenceTextApi = (id: string) =>
  request<void>(`/presence-texts/${id}`, { method: "DELETE" });

export const refreshPresence = () =>
  request<{ success: boolean }>("/presence-refresh", { method: "POST" });

// Accounting
export const fetchCategories = () => request<AccountingCategory[]>("/accounting/categories");

export const fetchProducts = () => request<AccountingProduct[]>("/accounting/products");

export const fetchOrders = (start?: string, end?: string) => {
  const params = new URLSearchParams();
  if (start) params.set("start", start);
  if (end) params.set("end", end);
  const qs = params.toString();
  return request<AccountingOrder[]>(`/accounting/orders${qs ? `?${qs}` : ""}`);
};

export const fetchSales = (start?: string, end?: string) => {
  const params = new URLSearchParams();
  if (start) params.set("start", start);
  if (end) params.set("end", end);
  const qs = params.toString();
  return request<SalesAggregation>(`/accounting/sales${qs ? `?${qs}` : ""}`);
};

export const fetchDistinctYears = () => request<number[]>("/accounting/years");

export const fetchDistinctMonths = (year: number) => request<number[]>(`/accounting/months/${year}`);

export const fetchDistinctDays = (year: number, month: number) =>
  request<number[]>(`/accounting/days/${year}/${month}`);
