export const PRICE_MENU_ID = "price_menu";
export const MAX_CHILDREN_PER_NODE = 24;

export interface EmbedSettings {
  color?: string;          // hex color like "#5865f2"
  authorName?: string;
  authorIconUrl?: string;
  thumbnailUrl?: string;
  showTimestamp?: boolean;
  footerText?: string;
  footerIconUrl?: string;
}

export interface PriceNodeFlat {
  id: string;
  name: string;
  content: string | null;
  imageUrl: string | null;
  parentId: string | null;
  order: number;
}

export interface PriceItemData {
  id: string;
  label: string;
  price: string;
  nodeId: string;
  order: number;
}

export interface PriceNodeWithRelations extends PriceNodeFlat {
  children: PriceNodeFlat[];
  items: PriceItemData[];
}

export interface PriceTreeNode extends PriceNodeFlat {
  children: PriceTreeNode[];
  items: PriceItemData[];
}
