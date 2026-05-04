import { type Client, EmbedBuilder, type TextChannel } from "discord.js";
import { logger } from "../logger/logger.js";
import {
  getTransactionByOrderId,
  updateTransactionStatus,
  createCallbackLog,
} from "./repo_payment_transaction.js";
import { getPaymentConfig, getEffectiveCredentials } from "./repo_payment_config.js";
import { buildMidSmilepay } from "./smilepay_api.js";
import type { SmilePayCallbackData } from "../../types/payment.type.js";
import { resolveClientEmoji } from "../discord/emoji.js";

const STORE_LABELS: Record<string, string> = { fami: "全家 FamilyMart", "711": "7-11 ibon" };
const PAYMENT_EMOJI = "<a:ZSz26520125622:1343576083617812502>";
const FAMILY_MART_EMOJI = "<:FamilyMart:1332695203735142440>";
const SEVEN_ELEVEN_EMOJI = "<:711:1332695189403336738>";

export async function handleCallback(
  rawData: Record<string, string>,
  sourceIp?: string,
  discordClient?: Client | null,
): Promise<{ success: boolean; responseHtml: string }> {
  if (!rawData || typeof rawData !== "object") {
    logger.debug({ sourceIp }, "Payment callback received without form data");
    return { success: false, responseHtml: "<Roturlstatus>ERROR</Roturlstatus>" };
  }

  const callbackData = rawData as unknown as SmilePayCallbackData;
  const orderId = callbackData.Od_sob;
  if (!orderId) {
    logger.debug({ sourceIp, keys: Object.keys(rawData) }, "Payment callback missing Od_sob");
    return { success: false, responseHtml: "<Roturlstatus>ERROR</Roturlstatus>" };
  }

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

      // Send Discord notifications
      if (discordClient) {
        await sendPaymentSuccessNotifications(discordClient, transaction);
      }
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

async function sendPaymentSuccessNotifications(
  client: Client,
  transaction: {
    orderId: string;
    amount: number;
    originalAmount?: number | null;
    feeAmount?: number | null;
    paymentStore?: string | null;
    remark?: string | null;
    channelId?: string | null;
    messageId?: string | null;
    userId?: string | null;
    guildId: string;
  },
): Promise<void> {
  const store = transaction.paymentStore ?? "";
  const storeEmoji = resolveClientEmoji(client, store === "711" ? SEVEN_ELEVEN_EMOJI : FAMILY_MART_EMOJI);
  const storeName = STORE_LABELS[store] ?? "超商";
  const originalAmount = transaction.originalAmount ?? transaction.amount;
  const fee = transaction.feeAmount ?? 0;
  const paymentEmoji = resolveClientEmoji(client, PAYMENT_EMOJI);

  // Build the success embed for channel notification
  const successEmbed = new EmbedBuilder()
    .setTitle(`${paymentEmoji} 已成功登入消費紀錄`)
    .setColor(0x22c55e)
    .setDescription(
      `◆ 超商：${storeEmoji} **${storeName}**\n` +
      `◆ 編號：\`${transaction.orderId}\`\n` +
      `◆ 備註：${transaction.remark || "無"}`,
    )
    .addFields(
      { name: "◇ 消費日期", value: `└ <t:${Math.floor(Date.now() / 1000)}:D>`, inline: true },
      { name: "◇ 消費金額", value: `└ ${transaction.amount.toLocaleString()}`, inline: true },
      { name: "◇ 消費編號", value: `└ #${transaction.orderId}`, inline: true },
      { name: "◇ 訂單金額", value: `└ $${originalAmount.toLocaleString()}`, inline: true },
      { name: "◇ 手續費", value: `└ $${fee.toLocaleString()}`, inline: true },
      { name: "◇ 實付金額", value: `└ **$${transaction.amount.toLocaleString()}**`, inline: true },
    )
    .setFooter({ text: "◆ 繳費成功 ◆ RuralBot" })
    .setTimestamp();

  if (transaction.remark) {
    successEmbed.addFields({ name: "◇ 備註", value: `└ ${transaction.remark}`, inline: false });
  }

  // Update the original message embed to show completed status
  if (transaction.channelId && transaction.messageId) {
    try {
      const channel = await client.channels.fetch(transaction.channelId) as TextChannel;
      if (channel) {
        const message = await channel.messages.fetch(transaction.messageId);
        if (message) {
          const updatedEmbed = new EmbedBuilder()
            .setTitle(`${paymentEmoji} 繳費完成`)
            .setColor(0x22c55e)
            .setDescription(
              `◆ 此筆訂單已繳費完成\n` +
              `◆ 編號：\`${transaction.orderId}\``,
            )
            .addFields(
              { name: "◇ 訂單編號", value: `└ \`${transaction.orderId}\``, inline: true },
              { name: `◇ ${storeEmoji} 繳費超商`, value: `└ ${storeName}`, inline: true },
              { name: "◇ 實付金額", value: `└ **$${transaction.amount.toLocaleString()}**`, inline: true },
            )
            .setFooter({ text: "◆ 繳費成功 ◆ RuralBot" })
            .setTimestamp();

          await message.edit({ embeds: [updatedEmbed], components: [] });
        }

        // Send a new success notification in the same channel
        await channel.send({ embeds: [successEmbed] });

        logger.info({ orderId: transaction.orderId, channelId: transaction.channelId }, "Payment success notification sent to channel");
      }
    } catch (err) {
      logger.warn({ err, orderId: transaction.orderId }, "Failed to send channel payment success notification");
    }
  }

  // DM the user
  if (transaction.userId) {
    try {
      const user = await client.users.fetch(transaction.userId);
      const dmEmbed = new EmbedBuilder()
        .setTitle(`${paymentEmoji} 繳費成功`)
        .setColor(0x22c55e)
        .setDescription(
          `◆ 您在 ${storeEmoji} **${storeName}** 的繳費已完成\n` +
          `◆ 編號：\`${transaction.orderId}\``,
        )
        .addFields(
          { name: "◇ 訂單編號", value: `└ \`${transaction.orderId}\``, inline: true },
          { name: "◇ 訂單金額", value: `└ $${originalAmount.toLocaleString()}`, inline: true },
          { name: "◇ 手續費", value: `└ $${fee.toLocaleString()}`, inline: true },
          { name: "◇ 實付金額", value: `└ **$${transaction.amount.toLocaleString()}**`, inline: true },
        )
        .setFooter({ text: "◆ 感謝您的付款 ◆ 自動私人訊息" })
        .setTimestamp();

      if (transaction.remark) {
        dmEmbed.addFields({ name: "◇ 備註", value: `└ ${transaction.remark}`, inline: false });
      }

      await user.send({ embeds: [dmEmbed] });
      logger.info({ orderId: transaction.orderId, userId: transaction.userId }, "Payment success DM sent to user");
    } catch (err) {
      logger.warn({ err, orderId: transaction.orderId, userId: transaction.userId }, "Failed to send payment success DM — user may have DMs disabled");
    }
  }
}
