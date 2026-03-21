import {
  type Client,
  Events,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { getPaymentConfig, getEffectiveCredentials, calculateFee } from "../../services/payment/repo_payment_config.js";
import { createTransaction, updateTransactionStatus } from "../../services/payment/repo_payment_transaction.js";
import { generatePaymentOrderId } from "../../services/payment/payment_id.js";
import { createBackgroundPayment } from "../../services/payment/smilepay_api.js";
import { logger } from "../../services/logger/logger.js";

const STORE_LABELS: Record<string, string> = { fami: "全家 FamilyMart", "711": "7-11 ibon" };
const STORE_PAY_ZG: Record<string, string> = { fami: "6", "711": "4" };

export function registerRpInteractEvent(client: Client): void {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith("rp:")) return;

    const parts = interaction.customId.split(":");
    const userId = parts[1];
    const ts = parseInt(parts[2], 10);

    // User scoping
    if (interaction.user.id !== userId) {
      await interaction.reply({ content: "只有發起者可以操作此付款" });
      return;
    }

    // Timeout check (15 min = 900 seconds)
    if (Math.floor(Date.now() / 1000) - ts > 900) {
      await interaction.reply({ content: "此付款已逾時，請重新使用 /rp" });
      return;
    }

    const action = parts[3]; // "store", "confirm", or "cancel"

    try {
      if (action === "store") {
        await handleStoreSelect(interaction, parts);
      } else if (action === "confirm") {
        await handleConfirm(interaction, parts);
      } else if (action === "cancel") {
        await handleCancel(interaction);
      }
    } catch (err) {
      logger.error({ err }, "rp interaction failed");
      await interaction.update({
        embeds: [new EmbedBuilder().setTitle("發生錯誤").setDescription("操作失敗，請重新使用 /rp").setColor(0xef4444)],
        components: [],
      });
    }
  });
}

async function handleStoreSelect(interaction: any, parts: string[]) {
  const userId = parts[1];
  const ts = parts[2];
  const store = parts[4]; // "fami" or "711"
  const amount = parseInt(parts[5], 10);
  const encodedRemark = parts[6] ?? "";
  const guildId = interaction.guildId;

  const config = await getPaymentConfig(guildId);
  const fee = calculateFee(config, store as "fami" | "711", amount);
  const total = amount + fee;

  const embed = new EmbedBuilder()
    .setTitle("確認付款資訊")
    .setColor(0xeab308)
    .addFields(
      { name: "繳費超商", value: STORE_LABELS[store] ?? store, inline: true },
      { name: "訂單金額", value: `$${amount.toLocaleString()}`, inline: true },
      { name: "手續費", value: `$${fee.toLocaleString()}`, inline: true },
      { name: "總付款金額", value: `**$${total.toLocaleString()}**`, inline: false },
    );

  if (encodedRemark) {
    embed.addFields({ name: "備註", value: decodeURIComponent(encodedRemark), inline: false });
  }

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`rp:${userId}:${ts}:confirm:${store}:${amount}:${encodedRemark}`)
      .setLabel("確認付款")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`rp:${userId}:${ts}:cancel`)
      .setLabel("取消")
      .setStyle(ButtonStyle.Danger),
  );

  await interaction.update({ embeds: [embed], components: [row] });
}

async function handleConfirm(interaction: any, parts: string[]) {
  const store = parts[4]; // "fami" or "711"
  const amount = parseInt(parts[5], 10);
  const encodedRemark = parts[6] ?? "";
  const remark = encodedRemark ? decodeURIComponent(encodedRemark) : undefined;
  const guildId = interaction.guildId;

  // Show loading state
  await interaction.update({
    embeds: [new EmbedBuilder().setTitle("取號中...").setDescription("正在向 SmilePay 取得繳費代碼").setColor(0x7c3aed)],
    components: [],
  });

  const config = await getPaymentConfig(guildId);
  const credentials = getEffectiveCredentials(config);
  const fee = calculateFee(config, store as "fami" | "711", amount);
  const total = amount + fee;
  const payZg = STORE_PAY_ZG[store];
  const orderId = await generatePaymentOrderId(guildId);

  // Call SmilePay Background API
  const bgResult = await createBackgroundPayment(credentials, {
    orderId,
    amount: total,
    payZg,
    remark,
  });

  if (bgResult.Status !== "1") {
    logger.error({ orderId, status: bgResult.Status, desc: bgResult.Desc }, "SmilePay API returned error for /rp");
    await interaction.editReply({
      embeds: [new EmbedBuilder().setTitle("取號失敗").setDescription(`SmilePay 回應: ${bgResult.Desc}\n請稍後重試或聯繫管理員`).setColor(0xef4444)],
      components: [],
    });
    return;
  }

  // Extract payment code based on store
  const paymentCode = store === "711" ? bgResult.IbonNo : bgResult.FamiNO;
  const payEndDate = bgResult.PayEndDate;

  // Create transaction record
  const transaction = await createTransaction({
    guildId,
    orderId,
    amount: total,
    originalAmount: amount,
    feeAmount: fee,
    paymentStore: store,
    remark,
  });

  await updateTransactionStatus(transaction.id, "PENDING", {
    smilePayNo: bgResult.SmilePayNO,
    paymentCode: paymentCode ?? bgResult.SmilePayNO,
    paymentDeadline: payEndDate ? new Date(payEndDate) : undefined,
  });

  logger.info({ orderId, store, amount, fee, total, paymentCode }, "Payment created via /rp");

  // Build result embed
  const storeEmoji = store === "711" ? "🏪" : "🏬";
  const storeName = STORE_LABELS[store] ?? store;
  const deadlineText = payEndDate ?? "依超商規定";
  const remarkText = remark ? `\n> 📝 ${remark}` : "";

  const resultEmbed = new EmbedBuilder()
    .setTitle(`${storeEmoji} 超商繳費單`)
    .setColor(store === "711" ? 0xf97316 : 0x22c55e)
    .setDescription(
      `請至 **${storeName}** 使用以下代碼繳費\n` +
      `\n` +
      `### 繳費代碼\n` +
      `# \`${paymentCode ?? "-"}\`\n` +
      `\n` +
      `───────────────────` +
      remarkText,
    )
    .addFields(
      { name: "💰 訂單金額", value: `$${amount.toLocaleString()}`, inline: true },
      { name: "📋 手續費", value: `$${fee.toLocaleString()}`, inline: true },
      { name: "💵 總付款金額", value: `**$${total.toLocaleString()}**`, inline: true },
      { name: "⏰ 繳費期限", value: deadlineText, inline: true },
      { name: "📌 訂單編號", value: `\`${orderId}\``, inline: true },
    )
    .setFooter({ text: "繳費完成後系統會自動更新狀態" })
    .setTimestamp();

  await interaction.editReply({ embeds: [resultEmbed], components: [] });

  // Send the same payment info to the user's DM
  try {
    const dmEmbed = new EmbedBuilder()
      .setTitle(`${storeEmoji} 超商繳費單`)
      .setColor(store === "711" ? 0xf97316 : 0x22c55e)
      .setDescription(
        `請至 **${storeName}** 使用以下代碼繳費\n` +
        `\n` +
        `### 繳費代碼\n` +
        `# \`${paymentCode ?? "-"}\`\n` +
        `\n` +
        `───────────────────` +
        remarkText,
      )
      .addFields(
        { name: "💰 訂單金額", value: `$${amount.toLocaleString()}`, inline: true },
        { name: "📋 手續費", value: `$${fee.toLocaleString()}`, inline: true },
        { name: "💵 總付款金額", value: `**$${total.toLocaleString()}**`, inline: true },
        { name: "⏰ 繳費期限", value: deadlineText, inline: true },
        { name: "📌 訂單編號", value: `\`${orderId}\``, inline: true },
      )
      .setFooter({ text: "繳費完成後系統會自動更新狀態 | 此為自動發送的私人訊息" })
      .setTimestamp();

    await interaction.user.send({ embeds: [dmEmbed] });
    logger.info({ orderId, userId: interaction.user.id }, "Payment info DM sent to user");
  } catch (dmErr) {
    logger.warn({ err: dmErr, orderId, userId: interaction.user.id }, "Failed to send payment DM — user may have DMs disabled");
  }
}

async function handleCancel(interaction: any) {
  const embed = new EmbedBuilder()
    .setTitle("付款已取消")
    .setColor(0xef4444)
    .setDescription("此付款已取消，如需重新付款請使用 /rp");

  await interaction.update({ embeds: [embed], components: [] });
}
