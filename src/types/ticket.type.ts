// Custom IDs for button interactions
export const TICKET_BUTTON_PREFIX = "ticket_create_";
export const TICKET_CLOSE_ID = "ticket_close";
export const TICKET_REOPEN_ID = "ticket_reopen";
export const TICKET_DELETE_ID = "ticket_delete";
export const TICKET_TRANSCRIPT_ID = "ticket_transcript";
export const TICKET_LINK_ORDER_ID = "ticket_link_order";
export const TICKET_CREATE_ORDER_ID = "ticket_create_order";
export const TICKET_LINK_ORDER_MODAL_ID = "ticket_link_order_modal";
export const TICKET_CREATE_ORDER_MODAL_ID = "ticket_create_order_modal";
export const TICKET_DELETE_CONFIRM_ID = "ticket_delete_confirm";

export interface TicketEmbedSettings {
  color?: string;
  authorName?: string;
  authorIconUrl?: string;
  thumbnailUrl?: string;
  showTimestamp?: boolean;
  footerText?: string;
  footerIconUrl?: string;
}

export interface TicketStats {
  openCount: number;
  closedCount: number;
  archivedCount: number;
  avgResolutionHours: number;
  byType: { label: string; count: number }[];
  dailyTrend: { date: string; count: number }[];
}
