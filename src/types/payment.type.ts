export type PaymentStatus = "PENDING" | "COMPLETED" | "FAILED" | "EXPIRED";

export interface SmilePayRequestParams {
  Dcvc: string;
  Rvg2c: string;
  Od_sob: string;
  Amount: number;
  Pur_name?: string;
  Email?: string;
  Tel_number?: string;
  Remark?: string;
  Roturl: string;
  Pay_zg: string;
  Verify_key: string;
}

export interface SmilePayXmlResponse {
  Status: string;
  Desc: string;
  SmilePayNO?: string;
  Amount?: string;
  AtmBankNo?: string;
  AtmNo?: string;
  Data_id?: string;
  Rvg2c?: string;
  Dcvc?: string;
}

export interface SmilePayCallbackData {
  Dcvc: string;
  Od_sob: string;
  Amount: string;
  SmilePayNO: string;
  Classif: string;
  Data_id: string;
  Verify_key?: string;
  Roturl_status?: string;
}

export interface EffectiveCredentials {
  dcvc: string;
  rvg2c: string;
  verifyKey: string;
  roturl: string;
  isTest: boolean;
}

export interface TransactionFilters {
  status?: PaymentStatus;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}

export interface TransactionStats {
  totalAmount: number;
  totalCount: number;
  completedCount: number;
  pendingCount: number;
  failedCount: number;
  expiredCount: number;
}
