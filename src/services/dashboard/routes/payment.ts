import { Router } from "express";
import type { Client } from "discord.js";
import { logger } from "../../logger/logger.js";
import { getPaymentConfig, upsertPaymentConfig, getEffectiveCredentials } from "../../payment/repo_payment_config.js";
import {
  createTransaction,
  listTransactions,
  getTransaction,
  getTransactionStats,
  updateTransactionStatus,
} from "../../payment/repo_payment_transaction.js";
import { generatePaymentOrderId } from "../../payment/payment_id.js";
import { buildPaymentPageUrl, createBackgroundPayment, SMILEPAY_CALLBACK_OK_STATUS } from "../../payment/smilepay_api.js";
import { handleCallback, sendPaymentSuccessNotifications } from "../../payment/payment_callback.js";
import { validateBuyerInfo } from "../../payment/buyer_info.js";

let discordClient: Client | null = null;

export function setPaymentDiscordClient(client: Client): void {
  discordClient = client;
}

export function getPaymentDiscordClient(): Client | null {
  return discordClient;
}

export const paymentRoutes = Router();

// GET /api/payment/config/:guildId
paymentRoutes.get("/config/:guildId", async (req, res) => {
  try {
    const config = await getPaymentConfig(req.params.guildId);
    const hasEnvCredentials = !!(process.env.SMILEPAY_DCVC && process.env.SMILEPAY_RVG2C && process.env.SMILEPAY_VERIFY_KEY);
    res.json({ config, hasEnvCredentials });
  } catch (err) {
    logger.error({ err }, "Failed to fetch payment config");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/payment/config/:guildId
paymentRoutes.put("/config/:guildId", async (req, res) => {
  try {
    const { dcvc, rvg2c, verifyKey, enabled, feeFamily, fee711, fee711Over, fee711Threshold } = req.body;
    const config = await upsertPaymentConfig(req.params.guildId, {
      dcvc, rvg2c, verifyKey, enabled,
      feeFamily: feeFamily != null ? Number(feeFamily) : null,
      fee711: fee711 != null ? Number(fee711) : null,
      fee711Over: fee711Over != null ? Number(fee711Over) : null,
      fee711Threshold: fee711Threshold != null ? Number(fee711Threshold) : null,
    });
    logger.info({ guildId: req.params.guildId }, "Payment config updated");
    res.json(config);
  } catch (err) {
    logger.error({ err }, "Failed to update payment config");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/payment/create/:guildId
paymentRoutes.post("/create/:guildId", async (req, res) => {
  try {
    const { amount, payerName, payerEmail, payerPhone, remark } = req.body;
    if (!amount || typeof amount !== "number" || amount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const buyerInfo = validateBuyerInfo({ payerName, payerEmail, payerPhone });
    if (!buyerInfo.ok) {
      return res.status(400).json({ error: buyerInfo.error });
    }

    const guildId = req.params.guildId;
    const config = await getPaymentConfig(guildId);
    const credentials = getEffectiveCredentials(config);
    const orderId = await generatePaymentOrderId(guildId);

    // Create transaction record
    const transaction = await createTransaction({
      guildId,
      orderId,
      amount,
      payerName: buyerInfo.value.payerName,
      payerEmail: buyerInfo.value.payerEmail,
      payerPhone: buyerInfo.value.payerPhone,
      remark,
    });

    // Build payment page URL
    const paymentUrl = buildPaymentPageUrl(credentials, {
      orderId,
      amount,
      payerName: buyerInfo.value.payerName,
      email: buyerInfo.value.payerEmail,
      phone: buyerInfo.value.payerPhone,
      remark,
    });

    // Try background API for payment code
    let paymentCode: string | undefined;
    let smilePayNo: string | undefined;
    try {
      const bgResult = await createBackgroundPayment(credentials, {
        orderId,
        amount,
        payerName: buyerInfo.value.payerName,
        email: buyerInfo.value.payerEmail,
        phone: buyerInfo.value.payerPhone,
        remark,
      });

      if (bgResult.Status === "1") {
        paymentCode = bgResult.SmilePayNO;
        smilePayNo = bgResult.SmilePayNO;
        await updateTransactionStatus(transaction.id, "PENDING", {
          smilePayNo,
          paymentCode,
        });
      } else {
        logger.warn({ orderId, status: bgResult.Status, desc: bgResult.Desc }, "SmilePay background API returned non-success");
      }
    } catch (err) {
      logger.warn({ err, orderId }, "Background payment API failed, falling back to payment page URL only");
    }

    logger.info({ orderId, amount, guildId, payerName: buyerInfo.value.payerName }, "Payment created");

    res.status(201).json({
      transaction: { ...transaction, paymentCode, smilePayNo },
      paymentUrl,
    });
  } catch (err) {
    logger.error({ err }, "Failed to create payment");
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

// GET /api/payment/test-callback/:orderId — simulate a successful SmilePay callback
paymentRoutes.get("/test-callback/:orderId", async (req, res) => {
  try {
    const { getTransactionByOrderId } = await import("../../payment/repo_payment_transaction.js");
    const transaction = await getTransactionByOrderId(req.params.orderId);
    if (!transaction) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    const fakeCallbackData: Record<string, string> = {
      Od_sob: transaction.orderId,
      Smseid: transaction.smilePayNo ?? `TEST-${Date.now()}`,
      Amount: String(transaction.amount),
      Classif: "C",
      Mid_smilepay: "",
    };

    const result = transaction.status === "COMPLETED" && discordClient
      ? { success: true, responseHtml: `<Roturlstatus>${SMILEPAY_CALLBACK_OK_STATUS}</Roturlstatus>` }
      : await handleCallback(fakeCallbackData, "test-simulate", discordClient);

    if (transaction.status === "COMPLETED" && discordClient) {
      await sendPaymentSuccessNotifications(discordClient, transaction);
    }

    logger.info({ orderId: req.params.orderId }, "Test callback simulated");
    res.json({ orderId: req.params.orderId, result });
  } catch (err) {
    logger.error({ err }, "Test callback simulation failed");
    res.status(500).json({ error: "Simulation failed", message: String(err) });
  }
});

// POST /api/payment/callback — public endpoint for SmilePay Roturl
async function processSmilePayCallback(req: any, res: any) {
  try {
    const sourceIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip;
    const data = req.method === "GET" ? req.query ?? {} : req.body ?? {};
    const result = await handleCallback(data, sourceIp, discordClient);
    res.set("Content-Type", "text/html; charset=utf-8");
    res.send(result.responseHtml);
  } catch (err) {
    logger.error({ err }, "Payment callback processing error");
    res.set("Content-Type", "text/html; charset=utf-8");
    res.send("<Roturlstatus>ERROR</Roturlstatus>");
  }
}

paymentRoutes.get("/callback", processSmilePayCallback);
paymentRoutes.post("/callback", processSmilePayCallback);
