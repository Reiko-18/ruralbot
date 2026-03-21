import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import { logger } from "../logger/logger.js";
import type {
  SmilePayXmlResponse,
  EffectiveCredentials,
} from "../../types/payment.type.js";

const ENDPOINTS = {
  background: "https://ssl.smse.com.tw/api/SPPayment.asp",
  standardPage: "https://ssl.smse.com.tw/pay/pay_a_utf.asp",
  testPage: "https://ssl.smse.com.tw/pay_test/pay_a_utf.asp",
};

const xmlParser = new XMLParser();

export function buildPaymentPageUrl(
  credentials: EffectiveCredentials,
  params: { orderId: string; amount: number; payerName?: string; email?: string; phone?: string; remark?: string },
): string {
  const base = credentials.isTest ? ENDPOINTS.testPage : ENDPOINTS.standardPage;
  const query = new URLSearchParams({
    Dcvc: credentials.dcvc,
    Rvg2c: credentials.rvg2c,
    Od_sob: params.orderId,
    Amount: String(params.amount),
    Pay_zg: "3",
    Roturl: credentials.roturl,
    Verify_key: credentials.verifyKey,
    ...(params.payerName ? { Pur_name: params.payerName } : {}),
    ...(params.email ? { Email: params.email } : {}),
    ...(params.phone ? { Tel_number: params.phone } : {}),
    ...(params.remark ? { Remark: params.remark } : {}),
  });
  return `${base}?${query.toString()}`;
}

export async function createBackgroundPayment(
  credentials: EffectiveCredentials,
  params: { orderId: string; amount: number; payerName?: string; email?: string; phone?: string; remark?: string },
): Promise<SmilePayXmlResponse> {
  const body = new URLSearchParams({
    Dcvc: credentials.dcvc,
    Rvg2c: credentials.rvg2c,
    Od_sob: params.orderId,
    Amount: String(params.amount),
    Pay_zg: "3",
    Roturl: credentials.roturl,
    Verify_key: credentials.verifyKey,
    ...(params.payerName ? { Pur_name: params.payerName } : {}),
    ...(params.email ? { Email: params.email } : {}),
    ...(params.phone ? { Tel_number: params.phone } : {}),
    ...(params.remark ? { Remark: params.remark } : {}),
  });

  logger.info({ orderId: params.orderId, amount: params.amount }, "Sending background payment request to SmilePay");

  const res = await fetch(ENDPOINTS.background, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    logger.error({ status: res.status, body: text }, "SmilePay API HTTP error");
    throw new Error(`SmilePay API returned HTTP ${res.status}`);
  }

  const xml = await res.text();
  return parseXmlResponse(xml);
}

export function parseXmlResponse(xml: string): SmilePayXmlResponse {
  const parsed = xmlParser.parse(xml);
  const data = parsed.SmilePay;
  if (!data) {
    logger.error({ xml }, "SmilePay XML response missing SmilePay root element");
    throw new Error("Invalid SmilePay XML response");
  }
  return {
    Status: String(data.Status ?? ""),
    Desc: String(data.Desc ?? ""),
    SmilePayNO: data.SmilePayNO ? String(data.SmilePayNO) : undefined,
    Amount: data.Amount ? String(data.Amount) : undefined,
    AtmBankNo: data.AtmBankNo ? String(data.AtmBankNo) : undefined,
    AtmNo: data.AtmNo ? String(data.AtmNo) : undefined,
    Data_id: data.Data_id ? String(data.Data_id) : undefined,
    Rvg2c: data.Rvg2c ? String(data.Rvg2c) : undefined,
    Dcvc: data.Dcvc ? String(data.Dcvc) : undefined,
  };
}

/**
 * Build SmilePay verification code for callback validation.
 * Computes MD5 hash of concatenated key fields + merchant verify key.
 */
export function buildVerifyCode(params: {
  Dcvc: string;
  Od_sob: string;
  Amount: string;
  SmilePayNO: string;
  verifyKey: string;
}): string {
  const raw = `${params.Dcvc}${params.Od_sob}${params.Amount}${params.SmilePayNO}${params.verifyKey}`;
  return createHash("md5").update(raw).digest("hex").toUpperCase();
}
