export type PaymentStatus = "PENDING" | "COMPLETED" | "FAILED" | "EXPIRED";

export interface SmilePayCallbackData {
  Classif: string;
  Od_sob: string;
  Data_id: string;
  Amount: string;
  Purchamt: string;
  Smseid: string;
  Mid_smilepay?: string;
  Process_date?: string;
  Process_time?: string;
  Response_id?: string;
  Pur_name?: string;
  Tel_number?: string;
  Mobile_number?: string;
  Email?: string;
  Remark?: string;
  Payment_no?: string;
}

export interface EffectiveCredentials {
  dcvc: string;
  rvg2c: string;
  verifyKey: string;
  roturl: string;
  isTest: boolean;
  merchantVerifyParam: string; // 商家驗證參數 (4碼), for Mid_smilepay callback verification
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
  totalSalesAmount: number;
  totalPaymentAmount: number;
  totalFeeAmount: number;
  totalCount: number;
  completedCount: number;
  pendingCount: number;
  failedCount: number;
  expiredCount: number;
}
