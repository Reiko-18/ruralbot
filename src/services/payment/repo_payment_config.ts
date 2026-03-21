import { prisma } from "../../core/db.js";
import type { EffectiveCredentials } from "../../types/payment.type.js";

export async function getPaymentConfig(guildId: string) {
  return prisma.paymentConfig.findUnique({ where: { guildId } });
}

export async function upsertPaymentConfig(
  guildId: string,
  data: { dcvc?: string | null; rvg2c?: string | null; verifyKey?: string | null; enabled?: boolean },
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
