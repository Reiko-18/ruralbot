import { Router } from "express";
import type { Client } from "discord.js";
import { logger } from "../../logger/logger.js";
import { getPaymentConfig, upsertPaymentConfig } from "../../payment/repo_payment_config.js";
import {
  listTransactions,
  getTransaction,
  getTransactionStats,
} from "../../payment/repo_payment_transaction.js";
import { handleCallback } from "../../payment/payment_callback.js";

let discordClient: Client | null = null;

export function setPaymentDiscordClient(client: Client): void {
  discordClient = client;
}

export function getPaymentDiscordClient(): Client | null {
  return discordClient;
}

export const paymentRoutes = Router();

// 將 config 回應中的 dcvc/rvg2c/verifyKey 明文移除，改回布林旗標，避免商家金鑰經 API 外洩。
function sanitizeConfig(config: Awaited<ReturnType<typeof getPaymentConfig>>) {
  if (!config) return null;
  const { dcvc, rvg2c, verifyKey, ...rest } = config;
  return {
    ...rest,
    hasDcvc: !!(dcvc || process.env.SMILEPAY_DCVC),
    hasRvg2c: !!(rvg2c || process.env.SMILEPAY_RVG2C),
    hasVerifyKey: !!(verifyKey || process.env.SMILEPAY_VERIFY_KEY),
  };
}

// GET /api/payment/config/:guildId
paymentRoutes.get("/config/:guildId", async (req, res) => {
  try {
    const config = await getPaymentConfig(req.params.guildId);
    const hasEnvCredentials = !!(process.env.SMILEPAY_DCVC && process.env.SMILEPAY_RVG2C && process.env.SMILEPAY_VERIFY_KEY);
    res.json({ config: sanitizeConfig(config), hasEnvCredentials });
  } catch (err) {
    logger.error({ err }, "Failed to fetch payment config");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/payment/config/:guildId
paymentRoutes.put("/config/:guildId", async (req, res) => {
  try {
    const { dcvc, rvg2c, verifyKey } = req.body;
    const data: Parameters<typeof upsertPaymentConfig>[1] = {};
    // 敏感金鑰欄位：留空字串或未提供時不覆寫既有 DB 值，避免前端讀不到金鑰、存檔時把既有值清空。
    if (typeof dcvc === "string" && dcvc.trim() !== "") data.dcvc = dcvc;
    if (typeof rvg2c === "string" && rvg2c.trim() !== "") data.rvg2c = rvg2c;
    if (typeof verifyKey === "string" && verifyKey.trim() !== "") data.verifyKey = verifyKey;

    const config = await upsertPaymentConfig(req.params.guildId, data);
    logger.info({ guildId: req.params.guildId }, "Payment config updated");
    res.json(sanitizeConfig(config));
  } catch (err) {
    logger.error({ err }, "Failed to update payment config");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/payment/transactions/:guildId
paymentRoutes.get("/transactions/:guildId", async (req, res) => {
  try {
    const { status, start, end, page, limit } = req.query;
    const result = await listTransactions(req.params.guildId, {
      status: status as any,
      startDate: start ? new Date(start as string) : undefined,
      endDate: end ? new Date(end as string) : undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    res.json(result);
  } catch (err) {
    logger.error({ err }, "Failed to list transactions");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/payment/transaction/:id
paymentRoutes.get("/transaction/:id", async (req, res) => {
  try {
    const transaction = await getTransaction(req.params.id);
    if (!transaction) return res.status(404).json({ error: "Transaction not found" });
    res.json(transaction);
  } catch (err) {
    logger.error({ err }, "Failed to fetch transaction");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/payment/stats/:guildId
paymentRoutes.get("/stats/:guildId", async (req, res) => {
  try {
    const { start, end } = req.query;
    const stats = await getTransactionStats(
      req.params.guildId,
      start ? new Date(start as string) : undefined,
      end ? new Date(end as string) : undefined,
    );
    res.json(stats);
  } catch (err) {
    logger.error({ err }, "Failed to fetch transaction stats");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/payment/callback — public endpoint for SmilePay Roturl
async function processSmilePayCallback(req: any, res: any) {
  try {
    const sourceIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip;
    const data = req.method === "GET" ? req.query ?? {} : req.body ?? {};
    const result = await handleCallback(data, sourceIp, discordClient);
    res.type("text/plain; charset=utf-8");
    res.send(result.responseText);
  } catch (err) {
    logger.error({ err }, "Payment callback processing error");
    res.type("text/plain; charset=utf-8");
    res.send("ERROR");
  }
}

paymentRoutes.get("/callback", processSmilePayCallback);
paymentRoutes.post("/callback", processSmilePayCallback);
