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

export interface PriceListConfig {
  id: number;
  title: string;
  description: string | null;
  imageUrl: string | null;
  embedSettings: string | null;
}
