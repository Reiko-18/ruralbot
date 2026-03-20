import type {
  PriceNode,
  PriceItem,
  PriceListConfig,
  PresenceText,
  AccountingCategory,
  AccountingProduct,
  AccountingOrder,
  SalesAggregation,
  TicketConfig,
  TicketButtonType,
  TicketBlacklistEntry,
  TicketInstance,
  TicketStats,
  DiscordGuild,
  DiscordChannel,
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

// Ticket
export const fetchTicketConfig = (guildId: string) =>
  request<TicketConfig>(`/ticket/config/${guildId}`);

export const updateTicketConfig = (guildId: string, data: Partial<TicketConfig>) =>
  request<TicketConfig>(`/ticket/config/${guildId}`, { method: "PUT", body: JSON.stringify(data) });

export const fetchButtonTypes = (configId: string) =>
  request<TicketButtonType[]>(`/ticket/button-types?configId=${configId}`);

export const createButtonTypeApi = (data: Partial<TicketButtonType> & { configId: string; label: string }) =>
  request<TicketButtonType>("/ticket/button-types", { method: "POST", body: JSON.stringify(data) });

export const updateButtonTypeApi = (id: string, data: Partial<TicketButtonType>) =>
  request<TicketButtonType>(`/ticket/button-types/${id}`, { method: "PUT", body: JSON.stringify(data) });

export const deleteButtonTypeApi = (id: string) =>
  request<void>(`/ticket/button-types/${id}`, { method: "DELETE" });

export const reorderButtonTypesApi = (ids: string[]) =>
  request<{ success: boolean }>("/ticket/reorder-button-types", { method: "PUT", body: JSON.stringify({ ids }) });

export const fetchBlacklist = (configId: string) =>
  request<TicketBlacklistEntry[]>(`/ticket/blacklist?configId=${configId}`);

export const addToBlacklistApi = (data: { configId: string; userId: string; reason?: string; addedBy: string }) =>
  request<TicketBlacklistEntry>("/ticket/blacklist", { method: "POST", body: JSON.stringify(data) });

export const removeFromBlacklistApi = (id: string) =>
  request<void>(`/ticket/blacklist/${id}`, { method: "DELETE" });

export const fetchTicketInstances = (params: { configId?: string; status?: string; search?: string; limit?: number; offset?: number }) => {
  const qs = new URLSearchParams();
  if (params.configId) qs.set("configId", params.configId);
  if (params.status) qs.set("status", params.status);
  if (params.search) qs.set("search", params.search);
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.offset) qs.set("offset", String(params.offset));
  const q = qs.toString();
  return request<TicketInstance[]>(`/ticket/instances${q ? `?${q}` : ""}`);
};

export const closeTicketApi = (id: string) =>
  request<{ success: boolean }>(`/ticket/instances/${id}/close`, { method: "POST" });

export const reopenTicketApi = (id: string) =>
  request<{ success: boolean }>(`/ticket/instances/${id}/reopen`, { method: "POST" });

export const deleteTicketApi = (id: string) =>
  request<void>(`/ticket/instances/${id}`, { method: "DELETE" });

export const fetchTicketStats = (configId: string) =>
  request<TicketStats>(`/ticket/stats/${configId}`);

// Discord guilds & channels
export const fetchGuilds = () => request<DiscordGuild[]>("/guilds");

export const fetchGuildChannels = (guildId: string) =>
  request<DiscordChannel[]>(`/guilds/${guildId}/channels`);

export const deployTicketPanel = (guildId: string) =>
  request<{ success: boolean; action: string }>(`/ticket/deploy-panel/${guildId}`, { method: "POST" });
