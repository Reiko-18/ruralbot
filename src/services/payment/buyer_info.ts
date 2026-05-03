export interface BuyerInfoInput {
  payerName?: unknown;
  payerEmail?: unknown;
  payerPhone?: unknown;
}

export interface BuyerInfo {
  payerName: string;
  payerEmail: string;
  payerPhone: string;
}

const GMAIL_RE = /^[A-Z0-9._%+-]+@gmail\.com$/i;

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeBuyerInfo(input: BuyerInfoInput): BuyerInfo {
  return {
    payerName: normalizeText(input.payerName),
    payerEmail: normalizeText(input.payerEmail).toLowerCase(),
    payerPhone: normalizeText(input.payerPhone),
  };
}

export function validateBuyerInfo(input: BuyerInfoInput): { ok: true; value: BuyerInfo } | { ok: false; error: string } {
  const value = normalizeBuyerInfo(input);
  const phoneDigits = value.payerPhone.replace(/\D/g, "");

  if (value.payerName.length < 2 || value.payerName.length > 50) {
    return { ok: false, error: "請填寫買家真實姓名，長度需為 2 到 50 個字。" };
  }

  if (!GMAIL_RE.test(value.payerEmail)) {
    return { ok: false, error: "請填寫有效的 Gmail 信箱，格式需為 @gmail.com。" };
  }

  if (phoneDigits.length < 8 || phoneDigits.length > 15) {
    return { ok: false, error: "請填寫有效電話，至少 8 碼、最多 15 碼。" };
  }

  return { ok: true, value };
}
