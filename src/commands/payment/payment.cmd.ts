import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { getPaymentConfig, getEffectiveCredentials } from "../../services/payment/repo_payment_config.js";
import {
  createTransaction,
  getTransactionByOrderId,
  listTransactions,
  getTransactionStats,
  updateTransactionStatus,
} from "../../services/payment/repo_payment_transaction.js";
import { generatePaymentOrderId } from "../../services/payment/payment_id.js";
import { buildPaymentPageUrl, createBackgroundPayment } from "../../services/payment/smilepay_api.js";
import { logger } from "../../services/logger/logger.js";
import { validateBuyerInfo } from "../../services/payment/buyer_info.js";

export const data = new SlashCommandBuilder()
  .setName("payment")
  .setDescription("金流管理")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((sub) =>
    sub
      .setName("create")
      .setDescription("建立付款")
      .addIntegerOption((o) => o.setName("amount").setDescription("金額 (新台幣)").setRequired(true).setMinValue(1))
      .addStringOption((o) => o.setName("payer").setDescription("買家真實姓名").setRequired(true))
      .addStringOption((o) => o.setName("email").setDescription("買家 Gmail").setRequired(true))
      .addStringOption((o) => o.setName("phone").setDescription("買家電話").setRequired(true))
      .addStringOption((o) => o.setName("remark").setDescription("備註")),
  )
  .addSubcommand((sub) =>
    sub
      .setName("status")
      .setDescription("查詢交易狀態")
      .addStringOption((o) => o.setName("order_id").setDescription("訂單編號").setRequired(true)),
  )
  .addSubcommand((sub) =>
    sub
      .setName("list")
      .setDescription("列出近期交易")
      .addStringOption((o) =>
        o.setName("status").setDescription("篩選狀態").addChoices(
          { name: "待付款", value: "PENDING" },
          { name: "已完成", value: "COMPLETED" },
          { name: "失敗", value: "FAILED" },
          { name: "已過期", value: "EXPIRED" },
        ),
      )
      .addIntegerOption((o) => o.setName("days").setDescription("天數 (預設 7)").setMinValue(1).setMaxValue(90)),
  )
  .addSubcommand((sub) =>
    sub
      .setName("stats")
      .setDescription("交易統計")
      .addIntegerOption((o) => o.setName("days").setDescription("天數 (預設 30)").setMinValue(1).setMaxValue(365)),
  );

const STATUS_LABELS: Record<string, string> = {
  PENDING: "⏳ 待付款",
  COMPLETED: "✅ 已完成",
  FAILED: "❌ 失敗",
  EXPIRED: "⌛ 已過期",
};

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.editReply("此指令只能在伺服器中使用。");
    return;
  }

  try {
    switch (sub) {
      case "create":
        await handleCreate(interaction, guildId);
        break;
      case "status":
        await handleStatus(interaction);
        break;
      case "list":
        await handleList(interaction, guildId);
        break;
      case "stats":
        await handleStats(interaction, guildId);
        break;
    }
  } catch (err) {
    logger.error({ err, sub }, "Payment command failed");
    await interaction.editReply("操作失敗，請稍後再試。");
  }
}

async function handleCreate(interaction: ChatInputCommandInteraction, guildId: string) {
  const amount = interaction.options.getInteger("amount", true);
  const payerName = interaction.options.getString("payer", true);
  const payerEmail = interaction.options.getString("email", true);
  const payerPhone = interaction.options.getString("phone", true);
  const remark = interaction.options.getString("remark") ?? undefined;
  const buyerInfo = validateBuyerInfo({ payerName, payerEmail, payerPhone });

  if (!buyerInfo.ok) {
    await interaction.editReply(buyerInfo.error);
    return;
  }

  const config = await getPaymentConfig(guildId);
  const credentials = getEffectiveCredentials(config);
  const orderId = await generatePaymentOrderId(guildId);

  const transaction = await createTransaction({
    guildId,
    orderId,
    amount,
    payerName: buyerInfo.value.payerName,
    payerEmail: buyerInfo.value.payerEmail,
    payerPhone: buyerInfo.value.payerPhone,
    remark,
  });

  const paymentUrl = buildPaymentPageUrl(credentials, {
    orderId,
    amount,
    payerName: buyerInfo.value.payerName,
    email: buyerInfo.value.payerEmail,
    phone: buyerInfo.value.payerPhone,
    remark,
  });

  // Try background API
  let paymentCode: string | undefined;
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
      await updateTransactionStatus(transaction.id, "PENDING", {
        smilePayNo: bgResult.SmilePayNO,
        paymentCode: bgResult.SmilePayNO,
      });
    }
  } catch {
    // Background API failed, payment page URL still works
  }

  const embed = new EmbedBuilder()
    .setTitle("付款已建立")
    .setColor(0x7c3aed)
    .addFields(
      { name: "訂單編號", value: orderId, inline: true },
      { name: "金額", value: `$${amount.toLocaleString()}`, inline: true },
      { name: "付款人", value: buyerInfo.value.payerName, inline: true },
      ...(paymentCode ? [{ name: "超商繳費代碼", value: `\`${paymentCode}\``, inline: false }] : []),
      { name: "付款連結", value: paymentUrl, inline: false },
    );

  logger.info({ orderId, amount, guildId, payerName: buyerInfo.value.payerName }, "Payment created via Discord command");
  await interaction.editReply({ embeds: [embed] });
}

async function handleStatus(interaction: ChatInputCommandInteraction) {
  const orderId = interaction.options.getString("order_id", true);
  const transaction = await getTransactionByOrderId(orderId);

  if (!transaction) {
    await interaction.editReply(`找不到訂單 **${orderId}**`);
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(`訂單 ${transaction.orderId}`)
    .setColor(transaction.status === "COMPLETED" ? 0x22c55e : transaction.status === "PENDING" ? 0xeab308 : 0xef4444)
    .addFields(
      { name: "狀態", value: STATUS_LABELS[transaction.status] ?? transaction.status, inline: true },
      { name: "金額", value: `$${transaction.amount.toLocaleString()}`, inline: true },
      ...(transaction.payerName ? [{ name: "付款人", value: transaction.payerName, inline: true }] : []),
      ...(transaction.smilePayNo ? [{ name: "SmilePay 編號", value: transaction.smilePayNo, inline: true }] : []),
      ...(transaction.paymentCode ? [{ name: "繳費代碼", value: `\`${transaction.paymentCode}\``, inline: true }] : []),
      { name: "建立時間", value: transaction.createdAt.toLocaleString("zh-TW"), inline: true },
      ...(transaction.completedAt ? [{ name: "完成時間", value: transaction.completedAt.toLocaleString("zh-TW"), inline: true }] : []),
    );

  await interaction.editReply({ embeds: [embed] });
}

async function handleList(interaction: ChatInputCommandInteraction, guildId: string) {
  const status = interaction.options.getString("status") as any;
  const days = interaction.options.getInteger("days") ?? 7;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const { transactions, total } = await listTransactions(guildId, { status, startDate, limit: 10 });

  if (transactions.length === 0) {
    await interaction.editReply("沒有找到符合條件的交易。");
    return;
  }

  const lines = transactions.map(
    (t) => `${STATUS_LABELS[t.status] ?? t.status} \`${t.orderId}\` — $${t.amount.toLocaleString()} ${t.payerName ?? ""}`,
  );

  const embed = new EmbedBuilder()
    .setTitle(`近 ${days} 天交易 (共 ${total} 筆)`)
    .setColor(0x7c3aed)
    .setDescription(lines.join("\n"));

  await interaction.editReply({ embeds: [embed] });
}

async function handleStats(interaction: ChatInputCommandInteraction, guildId: string) {
  const days = interaction.options.getInteger("days") ?? 30;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const stats = await getTransactionStats(guildId, startDate);

  const completionRate = stats.totalCount > 0
    ? ((stats.completedCount / stats.totalCount) * 100).toFixed(1)
    : "0";

  const embed = new EmbedBuilder()
    .setTitle(`近 ${days} 天交易統計`)
    .setColor(0x7c3aed)
    .addFields(
      { name: "訂單售價合計", value: `$${stats.totalSalesAmount.toLocaleString()}`, inline: true },
      { name: "客人應繳合計", value: `$${stats.totalPaymentAmount.toLocaleString()}`, inline: true },
      { name: "SmilePay 代收手續費", value: `$${stats.totalFeeAmount.toLocaleString()}`, inline: true },
      { name: "總交易筆數", value: String(stats.totalCount), inline: true },
      { name: "完成率", value: `${completionRate}%`, inline: true },
      { name: "已完成", value: String(stats.completedCount), inline: true },
      { name: "待付款", value: String(stats.pendingCount), inline: true },
      { name: "失敗/過期", value: String(stats.failedCount + stats.expiredCount), inline: true },
    );

  await interaction.editReply({ embeds: [embed] });
}
