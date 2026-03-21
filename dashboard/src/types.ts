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

export interface DiscordGuild {
  id: string;
  name: string;
  icon: string | null;
  memberCount: number;
}

export interface DiscordChannel {
  id: string;
  name: string;
  type: "text" | "category";
  parentId: string | null;
}

export interface TicketConfig {
  id: string;
  guildId: string;
  panelChannelId: string | null;
  panelMessageId: string | null;
  logChannelId: string | null;
  panelEmbed: string | null;
  defaultMessage: string | null;
  lastTicketNum: number;
  autoRemindHours: number | null;
  autoCloseHours: number | null;
  blacklistMode: string;
  blacklistMessage: string | null;
  transcriptTarget: string;
  transcriptLogMessage: string | null;
  transcriptDmMessage: string | null;
}

export interface TicketButtonType {
  id: string;
  configId: string;
  label: string;
  emoji: string | null;
  style: string;
  categoryOpenId: string | null;
  categoryCloseId: string | null;
  welcomeMessage: string | null;
  embedSettings: string | null;
  notifyRoleIds: string | null;
  autoRemindHours: number | null;
  autoCloseHours: number | null;
  order: number;
}

export interface TicketBlacklistEntry {
  id: string;
  configId: string;
  userId: string;
  reason: string | null;
  addedBy: string;
  createdAt: string;
}

export interface TicketInstance {
  id: string;
  configId: string;
  buttonTypeId: string | null;
  channelId: string;
  creatorId: string;
  ticketNum: number;
  status: string;
  orderId: string | null;
  lastActivityAt: string;
  reminded: boolean;
  createdAt: string;
  closedAt: string | null;
  buttonType: TicketButtonType | null;
  order: AccountingOrder | null;
}

export interface TicketStats {
  openCount: number;
  closedCount: number;
  archivedCount: number;
  avgResolutionHours: number;
  byType: { label: string; count: number }[];
  dailyTrend: { date: string; count: number }[];
}

// === Payment ===

export interface PaymentConfig {
  id: string;
  guildId: string;
  dcvc: string | null;
  rvg2c: string | null;
  verifyKey: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentTransaction {
  id: string;
  guildId: string;
  orderId: string;
  amount: number;
  status: "PENDING" | "COMPLETED" | "FAILED" | "EXPIRED";
  payerName: string | null;
  payerEmail: string | null;
  payerPhone: string | null;
  remark: string | null;
  smilePayNo: string | null;
  paymentCode: string | null;
  paymentDeadline: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentCallbackLog {
  id: string;
  transactionId: string;
  rawData: string;
  sourceIp: string | null;
  createdAt: string;
}

export interface PaymentTransactionDetail extends PaymentTransaction {
  callbackLogs: PaymentCallbackLog[];
}

export interface PaymentTransactionList {
  transactions: PaymentTransaction[];
  total: number;
  page: number;
  limit: number;
}

export interface PaymentStats {
  totalAmount: number;
  totalCount: number;
  completedCount: number;
  pendingCount: number;
  failedCount: number;
  expiredCount: number;
}
