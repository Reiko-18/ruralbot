import { logger } from "../logger/logger.js";
import {
  getTransactionByOrderId,
  updateTransactionStatus,
  createCallbackLog,
} from "./repo_payment_transaction.js";
import { getPaymentConfig, getEffectiveCredentials } from "./repo_payment_config.js";
import { buildMidSmilepay } from "./smilepay_api.js";
import type { SmilePayCallbackData } from "../../types/payment.type.js";

export async function handleCallback(
  rawData: Record<string, string>,
  sourceIp?: string,
): Promise<{ success: boolean; responseHtml: string }> {
  const callbackData = rawData as unknown as SmilePayCallbackData;
  const orderId = callbackData.Od_sob;

  logger.info({ orderId, smseid: callbackData.Smseid, sourceIp }, "Payment callback received");

  // Find the transaction
  const transaction = await getTransactionByOrderId(orderId);
  if (!transaction) {
    logger.error({ orderId }, "Payment callback for unknown order");
    return { success: false, responseHtml: "<Roturlstatus>ERROR</Roturlstatus>" };
  }

  // Log raw callback data
  await createCallbackLog({
    transactionId: transaction.id,
    rawData: JSON.stringify(rawData),
    sourceIp,
  });

  // Skip if already in terminal status
  if (["COMPLETED", "FAILED", "EXPIRED"].includes(transaction.status)) {
    logger.info({ orderId, status: transaction.status }, "Callback for already-terminal transaction, acknowledging");
    return { success: true, responseHtml: "<Roturlstatus>SmilePay_OK</Roturlstatus>" };
  }

  // Verify callback authenticity using Mid_smilepay (SmilePay 驗證碼)
  try {
    const config = await getPaymentConfig(transaction.guildId);
    const credentials = getEffectiveCredentials(config);

    if (credentials.merchantVerifyParam && callbackData.Mid_smilepay) {
      const expected = buildMidSmilepay({
        merchantVerifyParam: credentials.merchantVerifyParam,
        amount: parseInt(callbackData.Amount, 10),
        smseid: callbackData.Smseid,
      });

      if (String(expected) !== callbackData.Mid_smilepay) {
        logger.error(
          { expected, received: callbackData.Mid_smilepay, orderId, sourceIp },
          "Callback Mid_smilepay mismatch — possible forgery",
        );
        return { success: false, responseHtml: "<Roturlstatus>VERIFY_FAIL</Roturlstatus>" };
      }
    }
  } catch (err) {
    logger.error({ err, orderId }, "Failed to verify callback credentials");
    return { success: false, responseHtml: "<Roturlstatus>VERIFY_FAIL</Roturlstatus>" };
  }

  // Determine payment status from callback data
  // Amount > 0 means actual payment received; Classif indicates payment method
  const actualAmount = parseInt(callbackData.Amount, 10);
  const isSuccess = actualAmount > 0 && callbackData.Classif !== "";
  const newStatus = isSuccess ? "COMPLETED" : "FAILED";

  // Update transaction status
  try {
    await updateTransactionStatus(transaction.id, newStatus, {
      smilePayNo: callbackData.Smseid,
      ...(isSuccess ? { completedAt: new Date() } : {}),
    });

    if (isSuccess) {
      logger.info(
        { orderId, smseid: callbackData.Smseid, amount: actualAmount },
        "Payment completed successfully",
      );
    } else {
      logger.warn(
        { orderId, smseid: callbackData.Smseid, classif: callbackData.Classif, amount: actualAmount },
        "Payment failed per SmilePay callback",
      );
    }

    return { success: true, responseHtml: "<Roturlstatus>SmilePay_OK</Roturlstatus>" };
  } catch (err) {
    logger.error({ err, orderId }, "Failed to update transaction status from callback");
    return { success: false, responseHtml: "<Roturlstatus>ERROR</Roturlstatus>" };
  }
}
