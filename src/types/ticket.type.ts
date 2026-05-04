// Custom IDs for button interactions
export const TICKET_BUTTON_PREFIX = "ticket_create_";
export const TICKET_SELECT_ID = "ticket_create_select";
export const TICKET_CLOSE_ID = "ticket_close";
export const TICKET_REOPEN_ID = "ticket_reopen";
export const TICKET_DELETE_ID = "ticket_delete";
export const TICKET_TRANSCRIPT_ID = "ticket_transcript";
export const TICKET_CLAIM_ID = "ticket_claim";
export const TICKET_LOCK_ID = "ticket_lock";
export const TICKET_ADD_USER_ID = "ticket_add_user";
export const TICKET_REMOVE_USER_ID = "ticket_remove_user";
export const TICKET_RENAME_ID = "ticket_rename";
export const TICKET_DELETE_CONFIRM_ID = "ticket_delete_confirm";
export const TICKET_CLOSE_CONFIRM_ID = "ticket_close_confirm";
export const TICKET_CLOSE_CANCEL_ID = "ticket_close_cancel";
export const TICKET_CLOSE_MODAL_ID = "ticket_close_modal";
export const TICKET_CLOSE_REASON_INPUT_ID = "ticket_close_reason";
export const TICKET_ADD_USER_MODAL_ID = "ticket_add_user_modal";
export const TICKET_REMOVE_USER_MODAL_ID = "ticket_remove_user_modal";
export const TICKET_USER_INPUT_ID = "ticket_user_id";
export const TICKET_RENAME_MODAL_ID = "ticket_rename_modal";
export const TICKET_RENAME_INPUT_ID = "ticket_rename_value";
export const TICKET_CREATE_MODAL_PREFIX = "ticket_create_modal_";
export const TICKET_CREATE_QUESTION_PREFIX = "ticket_create_question_";

export interface TicketQuestion {
  label: string;
  placeholder?: string;
  required?: boolean;
  style?: "short" | "paragraph";
  maxLength?: number;
}

export interface TicketFormAnswer {
  label: string;
  value: string;
}

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
