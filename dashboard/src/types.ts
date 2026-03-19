export interface PriceItem {
  id: string;
  label: string;
  price: string;
  nodeId: string;
  order: number;
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
}

export interface PriceListConfig {
  id: number;
  title: string;
  description: string | null;
  imageUrl: string | null;
}
