import { logger } from "../logger/logger.js";
import {
  getTransactionByOrderId,
  updateTransactionStatus,
  createCallbackLog,
} from "./repo_payment_transaction.js";
import { getPaymentConfig, getEffectiveCredentials } from "./repo_payment_config.js";
import { buildVerifyCode } from "./smilepay_api.js";
import type { SmilePayCallbackData } from "../../types/payment.type.js";

export async function handleCallback(
  rawData: Record<string, string>,
  sourceIp?: string,
): Promise<{ success: boolean; responseHtml: string }> {
  const callbackData = rawData as unknown as SmilePayCallbackData;
  const orderId = callbackData.Od_sob;

  logger.info({ orderId, smilePayNo: callbackData.SmilePayNO, sourceIp }, "Payment callback received");

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

  // Verify callback authenticity using verify code
  try {
    const config = await getPaymentConfig(transaction.guildId);
    const credentials = getEffectiveCredentials(config);

    const expectedCode = buildVerifyCode({
      Dcvc: callbackData.Dcvc,
      Od_sob: callbackData.Od_sob,
      Amount: callbackData.Amount,
      SmilePayNO: callbackData.SmilePayNO,
      verifyKey: credentials.verifyKey,
    });

    if (callbackData.Verify_key && callbackData.Verify_key !== expectedCode) {
      logger.error(
        { expected: expectedCode, received: callbackData.Verify_key, orderId, sourceIp },
        "Callback verify code mismatch — possible forgery",
      );
      return { success: false, responseHtml: "<Roturlstatus>VERIFY_FAIL</Roturlstatus>" };
    }
  } catch (err) {
    logger.error({ err, orderId }, "Failed to verify callback credentials");
    return { success: false, responseHtml: "<Roturlstatus>VERIFY_FAIL</Roturlstatus>" };
  }

  // Determine payment status from callback data
  const isSuccess = callbackData.Classif !== "0" && callbackData.Data_id !== "";
  const newStatus = isSuccess ? "COMPLETED" : "FAILED";

  // Update transaction status
  try {
    await updateTransactionStatus(transaction.id, newStatus, {
      smilePayNo: callbackData.SmilePayNO,
      ...(isSuccess ? { completedAt: new Date() } : {}),
    });

    if (isSuccess) {
      logger.info(
        { orderId, smilePayNo: callbackData.SmilePayNO, amount: transaction.amount },
        "Payment completed successfully",
      );
    } else {
      logger.warn(
        { orderId, smilePayNo: callbackData.SmilePayNO, classif: callbackData.Classif },
        "Payment failed per SmilePay callback",
      );
    }

    return { success: true, responseHtml: "<Roturlstatus>SmilePay_OK</Roturlstatus>" };
  } catch (err) {
    logger.error({ err, orderId }, "Failed to update transaction status from callback");
    return { success: false, responseHtml: "<Roturlstatus>ERROR</Roturlstatus>" };
  }
}
