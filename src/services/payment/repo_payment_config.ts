import { prisma } from "../../core/db.js";
import type { EffectiveCredentials } from "../../types/payment.type.js";

export async function getPaymentConfig(guildId: string) {
  return prisma.paymentConfig.findUnique({ where: { guildId } });
}

export async function upsertPaymentConfig(
  guildId: string,
  data: {
    dcvc?: string | null;
    rvg2c?: string | null;
    verifyKey?: string | null;
    enabled?: boolean;
    feeFamily?: number | null;
    fee711?: number | null;
    fee711Over?: number | null;
    fee711Threshold?: number | null;
  },
) {
  return prisma.paymentConfig.upsert({
    where: { guildId },
    create: { guildId, ...data },
    update: data,
  });
}

export function getEffectiveCredentials(dbConfig: {
  dcvc?: string | null;
  rvg2c?: string | null;
  verifyKey?: string | null;
} | null): EffectiveCredentials {
  const dcvc = dbConfig?.dcvc || process.env.SMILEPAY_DCVC;
  const rvg2c = dbConfig?.rvg2c || process.env.SMILEPAY_RVG2C;
  const verifyKey = dbConfig?.verifyKey || process.env.SMILEPAY_VERIFY_KEY;
  const roturl = process.env.SMILEPAY_ROTURL;
  const isTest = process.env.SMILEPAY_ENV === "test";
  const merchantVerifyParam = process.env.SMILEPAY_MERCHANT_VERIFY_PARAM ?? "";

  if (!dcvc || !rvg2c || !verifyKey || !roturl) {
    throw new Error("Missing SmilePay credentials. Set SMILEPAY_DCVC, SMILEPAY_RVG2C, SMILEPAY_VERIFY_KEY, SMILEPAY_ROTURL environment variables or configure per-guild settings.");
  }

  return { dcvc, rvg2c, verifyKey, roturl, isTest, merchantVerifyParam };
}

export function calculateFee(
  config: { feeFamily?: number | null; fee711?: number | null; fee711Over?: number | null; fee711Threshold?: number | null } | null,
  store: "fami" | "711",
  amount: number,
): number {
  if (!config) return 0;
  if (store === "fami") return config.feeFamily ?? 0;
  const threshold = config.fee711Threshold ?? 1000;
  return amount > threshold ? (config.fee711Over ?? 0) : (config.fee711 ?? 0);
}
