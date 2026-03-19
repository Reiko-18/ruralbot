export interface PriceItem {
  id: string;
  label: string;
  price: string;
  nodeId: string;
  order: number;
}

export interface EmbedSettings {
  color?: string;
  authorName?: string;
  authorIconUrl?: string;
  thumbnailUrl?: string;
  showTimestamp?: boolean;
  footerText?: string;
  footerIconUrl?: string;
}

export interface PriceNode {
  id: string;
  name: string;
  content: string | null;
  imageUrl: string | null;
  parentId: string | null;
  order: number;
  children: PriceNode[];
  items: PriceItem[];
  embedSettings: string | null;
}

export interface PresenceText {
  id: string;
  text: string;
  order: number;
}

export interface AccountingCategory {
  id: string;
  name: string;
}

export interface AccountingProduct {
  id: string;
  name: string;
  cost: number;
  price: number;
  source: string | null;
  categoryId: string;
  faceValue: number | null;
  costDiscount: number | null;
  priceDiscount: number | null;
  category: AccountingCategory;
}

export interface AccountingOrder {
  id: string;
  productId: string | null;
  productName: string;
  quantity: number;
  actualPrice: number;
  actualCost: number;
  profit: number;
  isCustom: boolean;
  createdAt: string;
}

export interface SalesAggregation {
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  orderCount: number;
}

export interface PriceListConfig {
  id: number;
  title: string;
  description: string | null;
  imageUrl: string | null;
  embedSettings: string | null;
}
