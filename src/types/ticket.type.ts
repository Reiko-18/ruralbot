// Custom IDs for button interactions
export const TICKET_BUTTON_PREFIX = "ticket_create_";
export const TICKET_SELECT_ID = "ticket_create_select";
export const TICKET_CLOSE_ID = "ticket_close";
export const TICKET_REOPEN_ID = "ticket_reopen";
export const TICKET_DELETE_ID = "ticket_delete";
export const TICKET_TRANSCRIPT_ID = "ticket_transcript";
export const TICKET_DELETE_CONFIRM_ID = "ticket_delete_confirm";
export const TICKET_CLOSE_CONFIRM_ID = "ticket_close_confirm";
export const TICKET_CLOSE_CANCEL_ID = "ticket_close_cancel";

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
