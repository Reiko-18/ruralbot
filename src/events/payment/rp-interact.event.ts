import {
  type Client,
  Events,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { getPaymentConfig, getEffectiveCredentials, calculateFee } from "../../services/payment/repo_payment_config.js";
import { createTransaction, updateTransactionStatus } from "../../services/payment/repo_payment_transaction.js";
import { generatePaymentOrderId } from "../../services/payment/payment_id.js";
import { createBackgroundPayment } from "../../services/payment/smilepay_api.js";
import { logger } from "../../services/logger/logger.js";
import { validateBuyerInfo, type BuyerInfo } from "../../services/payment/buyer_info.js";
import { resolveButtonEmoji, resolveClientEmoji } from "../../services/discord/emoji.js";

const STORE_LABELS: Record<string, string> = { fami: "全家 FamilyMart", "711": "7-11 ibon" };
const STORE_PAY_ZG: Record<string, string> = { fami: "6", "711": "4" };
const RP_THEME_COLOR = 0xb8a7ff;
const PAYMENT_EMOJI = "<a:ZSz26520125622:1343576083617812502>";
const FAMILY_MART_EMOJI = "<:FamilyMart:1332695203735142440>";
const SEVEN_ELEVEN_EMOJI = "<:711:1332695189403336738>";
const buyerInfoCache = new Map<string, BuyerInfo>();

function buildBuyerInfoKey(parts: string[]): string {
  return [parts[1], parts[2], parts[4], parts[5], parts[6] ?? ""].join(":");
}

function buildBaseCustomId(parts: string[], action: string): string {
  return `rp:${parts[1]}:${parts[2]}:${action}:${parts[4]}:${parts[5]}:${parts[6] ?? ""}`;
}

function getBotThumbnail(interaction: any): string | null {
  return interaction.client?.user?.displayAvatarURL?.({ size: 128 }) ?? null;
}

function getPaymentEmoji(interaction: any): string {
  return resolveClientEmoji(interaction.client, PAYMENT_EMOJI);
}

function getPaymentButtonEmoji(interaction: any) {
  return resolveButtonEmoji(interaction.client, PAYMENT_EMOJI);
}

function getStoreEmoji(interaction: any, store: string): string {
  const emoji = store === "711" ? SEVEN_ELEVEN_EMOJI : FAMILY_MART_EMOJI;
  return resolveClientEmoji(interaction.client, emoji);
}

function formatDisplayOrderId(orderId: string): string {
  const parts = orderId.split("-");
  return parts.at(-1) ?? orderId.slice(-6);
}

export function registerRpInteractEvent(client: Client): void {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton() && !interaction.isModalSubmit()) return;
    if (!interaction.customId.startsWith("rp:")) return;

    const parts = interaction.customId.split(":");
    const ts = parseInt(parts[2], 10);

    // Timeout check (15 min = 900 seconds)
    if (Math.floor(Date.now() / 1000) - ts > 900) {
      await interaction.reply({ content: "此付款已逾時，請重新使用 /rp" });
      return;
    }

    const action = parts[3]; // "store", "confirm", "buyer", "pay", "cancel", or "back"

    try {
      if (interaction.isButton() && action === "store") {
        await handleStoreSelect(interaction, parts);
      } else if (interaction.isButton() && action === "confirm") {
        await handleBuyerInfoReview(interaction, parts);
      } else if (interaction.isButton() && action === "buyer") {
        await handleBuyerInfoModal(interaction, parts);
      } else if (interaction.isModalSubmit() && action === "buyer") {
        await handleBuyerInfoSubmit(interaction, parts);
      } else if (interaction.isButton() && action === "pay") {
        await handlePay(interaction, parts);
      } else if (interaction.isButton() && action === "back") {
        await handleStoreSelect(interaction, parts);
      } else if (interaction.isButton() && action === "cancel") {
        await handleCancel(interaction);
      }
    } catch (err) {
      logger.error({ err }, "rp interaction failed");
      const payload = {
        embeds: [new EmbedBuilder().setTitle("發生錯誤").setDescription("操作失敗，請重新使用 /rp").setColor(0xef4444)],
        components: [],
      };
      if (interaction.isButton()) {
        await interaction.update(payload);
      } else if (interaction.isModalSubmit()) {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply(payload);
        } else {
          await interaction.reply({ content: "操作失敗，請重新使用 /rp", ephemeral: true });
        }
      }
    }
  });
}

async function handleStoreSelect(interaction: any, parts: string[]) {
  const ts = parts[2];
  const store = parts[4]; // "fami" or "711"
  const amount = parseInt(parts[5], 10);
  const encodedRemark = parts[6] ?? "";
  const guildId = interaction.guildId;
  const clickerId = interaction.user.id;

  const config = await getPaymentConfig(guildId);
  const fee = calculateFee(config, store as "fami" | "711", amount);
  const total = amount + fee;

  const storeName = STORE_LABELS[store] ?? store;
  const storeEmoji = getStoreEmoji(interaction, store);
  const paymentEmoji = getPaymentEmoji(interaction);
  const descLines = [
    `${paymentEmoji} **再次確認您的付款方式**`,
    `◆ 訂單金額：${amount.toLocaleString()} 新台幣`,
    `◆ 付款方式：${storeEmoji} ${storeName} 代碼繳費`,
  ];
  const remark = encodedRemark ? decodeURIComponent(encodedRemark) : "";

  const embed = new EmbedBuilder()
    .setTitle(`${paymentEmoji} 付款方式確認`)
    .setColor(RP_THEME_COLOR)
    .setDescription(descLines.join("\n"))
    .setThumbnail(getBotThumbnail(interaction))
    .addFields(
      { name: "◇ 付款金額", value: `└ ${amount.toLocaleString()} 元`, inline: true },
      { name: "◇ 手續費", value: `└ ${fee.toLocaleString()} 元`, inline: true },
      { name: "◇ 總付款金額", value: `└ **${total.toLocaleString()} 元**`, inline: false },
      ...(remark ? [{ name: "◇ 備註", value: `└ ${remark}`, inline: false }] : []),
    )
    .setFooter({ text: "◆ 請確認金額與超商後繼續 ◆ RuralBot" })
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`rp:${clickerId}:${ts}:cancel`)
      .setLabel("取消重選")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`rp:${clickerId}:${ts}:confirm:${store}:${amount}:${encodedRemark}`)
      .setLabel("下一步：確認購買資訊")
      .setEmoji(getPaymentButtonEmoji(interaction))
      .setStyle(ButtonStyle.Primary),
  );

  await interaction.update({ embeds: [embed], components: [row] });
}

async function handleBuyerInfoReview(interaction: any, parts: string[]) {
  const buyerInfo = buyerInfoCache.get(buildBuyerInfoKey(parts));
  await interaction.update(buildBuyerInfoReviewPayload(interaction, parts, buyerInfo));
}

function buildBuyerInfoReviewPayload(interaction: any, parts: string[], buyerInfo?: BuyerInfo) {
  const filled = !!buyerInfo;
  const paymentEmoji = getPaymentEmoji(interaction);
  const description = [
    `${paymentEmoji} **購買人資訊確認**`,
    "◆ 根據金流平台相關規定，所有訂單消費者需提供真實姓名、電話與 Gmail。",
    "◆ 資料僅用於本次付款建立與後續對帳。",
  ];

  const embed = new EmbedBuilder()
    .setTitle(`${paymentEmoji} 購買人資訊確認`)
    .setColor(RP_THEME_COLOR)
    .setDescription(description.join("\n"))
    .setThumbnail(getBotThumbnail(interaction))
    .addFields(
      { name: "◇ 您的姓名", value: `└ ${buyerInfo?.payerName ?? "⚠️ 尚未填寫"}`, inline: true },
      { name: "◇ 電話號碼", value: `└ ${buyerInfo?.payerPhone ?? "⚠️ 尚未填寫"}`, inline: true },
      { name: "◇ 電子郵件", value: `└ ${buyerInfo?.payerEmail ?? "⚠️ 尚未填寫"}`, inline: false },
    )
    .setFooter({ text: "◆ 完成資料後即可取得付款碼 ◆ RuralBot" })
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildBaseCustomId(parts, "back"))
      .setLabel("上一步")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(buildBaseCustomId(parts, "buyer"))
      .setLabel("填寫/修改資訊")
      .setEmoji("📝")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(buildBaseCustomId(parts, "pay"))
      .setLabel("確認並獲取付款碼")
      .setEmoji(getPaymentButtonEmoji(interaction))
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!filled),
  );

  return { embeds: [embed], components: [row] };
}

async function handleBuyerInfoModal(interaction: any, parts: string[]) {
  const ts = parts[2];
  const store = parts[4];
  const amount = parts[5];
  const encodedRemark = parts[6] ?? "";

  const modal = new ModalBuilder()
    .setCustomId(`rp:${interaction.user.id}:${ts}:buyer:${store}:${amount}:${encodedRemark}`)
    .setTitle("填寫買家資料");

  const nameInput = new TextInputBuilder()
    .setCustomId("payerName")
    .setLabel("買家真實姓名")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(2)
    .setMaxLength(50);

  const phoneInput = new TextInputBuilder()
    .setCustomId("payerPhone")
    .setLabel("電話")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(8)
    .setMaxLength(15)
    .setPlaceholder("09xxxxxxxx");

  const emailInput = new TextInputBuilder()
    .setCustomId("payerEmail")
    .setLabel("Gmail 信箱")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder("name@gmail.com");

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(phoneInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(emailInput),
  );

  await interaction.showModal(modal);
}

async function handleBuyerInfoSubmit(interaction: any, parts: string[]) {
  const buyerInfo = validateBuyerInfo({
    payerName: interaction.fields.getTextInputValue("payerName"),
    payerPhone: interaction.fields.getTextInputValue("payerPhone"),
    payerEmail: interaction.fields.getTextInputValue("payerEmail"),
  });

  if (!buyerInfo.ok) {
    await interaction.reply({ content: buyerInfo.error, ephemeral: true });
    return;
  }

  buyerInfoCache.set(buildBuyerInfoKey(parts), buyerInfo.value);
  await interaction.update(buildBuyerInfoReviewPayload(interaction, parts, buyerInfo.value));
}

async function handlePay(interaction: any, parts: string[]) {
  const buyerInfo = buyerInfoCache.get(buildBuyerInfoKey(parts));
  if (!buyerInfo) {
    await interaction.update(buildBuyerInfoReviewPayload(interaction, parts));
    return;
  }

  await handleConfirm(interaction, parts, buyerInfo);
}

async function handleConfirm(interaction: any, parts: string[], buyerInfo: BuyerInfo) {
  const store = parts[4]; // "fami" or "711"
  const amount = parseInt(parts[5], 10);
  const encodedRemark = parts[6] ?? "";
  const remark = encodedRemark ? decodeURIComponent(encodedRemark) : undefined;
  const guildId = interaction.guildId;

  // Show loading state
  await interaction.deferUpdate();
  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setTitle(`${getPaymentEmoji(interaction)} 取號中...`)
        .setDescription("◆ 正在向 SmilePay 取得繳費代碼\n◇ 請稍候，系統正在建立付款資訊")
        .setColor(RP_THEME_COLOR),
    ],
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
    payerName: buyerInfo.payerName,
    email: buyerInfo.payerEmail,
    phone: buyerInfo.payerPhone,
    remark,
  });

  if (bgResult.Status !== "1") {
    logger.error({ orderId, status: bgResult.Status, desc: bgResult.Desc }, "SmilePay API returned error for /rp");
    await interaction.editReply({
      embeds: [new EmbedBuilder().setTitle("取號失敗").setDescription(`SmilePay 回應: ${bgResult.Desc}\n請稍後重試或聯繫管理員`).setColor(RP_THEME_COLOR)],
      components: [],
    });
    return;
  }

  // Extract payment code based on store
  const paymentCode = store === "711" ? bgResult.IbonNo : bgResult.FamiNO;
  const payEndDate = bgResult.PayEndDate;

  // Create transaction record (store channel/message/user for callback notifications)
  const replyMsg = await interaction.fetchReply();
  const transaction = await createTransaction({
    guildId,
    orderId,
    amount: total,
    originalAmount: amount,
    feeAmount: fee,
    paymentStore: store,
    payerName: buyerInfo.payerName,
    payerEmail: buyerInfo.payerEmail,
    payerPhone: buyerInfo.payerPhone,
    remark,
    channelId: replyMsg.channelId,
    messageId: replyMsg.id,
    userId: interaction.user.id,
  });

  await updateTransactionStatus(transaction.id, "PENDING", {
    smilePayNo: bgResult.SmilePayNO,
    paymentCode: paymentCode ?? bgResult.SmilePayNO,
    paymentDeadline: payEndDate ? new Date(payEndDate) : undefined,
  });

  logger.info({ orderId, store, amount, fee, total, paymentCode, payerName: buyerInfo.payerName }, "Payment created via /rp");

  // Build result embed
  const storeName = STORE_LABELS[store] ?? store;
  const storeEmoji = getStoreEmoji(interaction, store);
  const deadlineText = payEndDate ?? "依超商規定";
  const paymentEmoji = getPaymentEmoji(interaction);
  const displayOrderId = formatDisplayOrderId(orderId);
  const paymentCodeText = paymentCode ?? "-";

  const resultEmbed = new EmbedBuilder()
    .setTitle(`${paymentEmoji} 超商繳費單`)
    .setColor(RP_THEME_COLOR)
    .setThumbnail(getBotThumbnail(interaction))
    .setDescription(
      `◆ 請至 ${storeEmoji} **${storeName}** 使用以下代碼繳費\n` +
      `◇ 繳費代碼：\n` +
      `# \`${paymentCodeText}\`\n` +
      `◇ 訂單編號：\`${displayOrderId}\`\n` +
      `◆ 備註：${remark || "無"}`,
    )
    .addFields(
      { name: "◇ 繳費位置", value: `└ ${storeEmoji} **${storeName}**`, inline: false },
      { name: "◇ 總付款金額", value: `└ **$${total.toLocaleString()}**`, inline: true },
      { name: "◇ 付款期限", value: `└ ${deadlineText}`, inline: true },
      { name: "◇ 手續費", value: `└ ${fee.toLocaleString()} 元`, inline: true },
      { name: "◇ 訂單編號", value: `└ \`${displayOrderId}\``, inline: true },
    )
    .setFooter({ text: "◆ 繳費完成後系統會自動更新狀態 ◆ RuralBot" })
    .setTimestamp();

  await interaction.editReply({ embeds: [resultEmbed], components: [] });

  // Send the same payment info to the user's DM
  try {
    const dmEmbed = new EmbedBuilder()
      .setTitle(`${paymentEmoji} 超商繳費單`)
      .setColor(RP_THEME_COLOR)
      .setThumbnail(getBotThumbnail(interaction))
      .setDescription(
        `◆ 請至 ${storeEmoji} **${storeName}** 使用以下代碼繳費\n` +
        `◇ 繳費代碼：\n` +
        `# \`${paymentCodeText}\`\n` +
        `◇ 訂單編號：\`${displayOrderId}\``,
      )
      .addFields(
        { name: "◇ 繳費位置", value: `└ ${storeEmoji} **${storeName}**`, inline: false },
        { name: "◇ 訂單金額", value: `└ $${amount.toLocaleString()}`, inline: true },
        { name: "◇ 手續費", value: `└ $${fee.toLocaleString()}`, inline: true },
        { name: "◇ 總付款金額", value: `└ **$${total.toLocaleString()}**`, inline: true },
        { name: "◇ 繳費期限", value: `└ ${deadlineText}`, inline: true },
        { name: "◇ 訂單編號", value: `└ \`${displayOrderId}\``, inline: true },
        ...(remark ? [{ name: "◇ 備註", value: `└ ${remark}`, inline: false }] : []),
      )
      .setFooter({ text: "◆ 繳費完成後系統會自動更新狀態 ◆ 自動私人訊息" })
      .setTimestamp();

    await interaction.user.send({ embeds: [dmEmbed] });
    logger.info({ orderId, userId: interaction.user.id }, "Payment info DM sent to user");
  } catch (dmErr) {
    logger.warn({ err: dmErr, orderId, userId: interaction.user.id }, "Failed to send payment DM — user may have DMs disabled");
  }
}

async function handleCancel(interaction: any) {
  const embed = new EmbedBuilder()
    .setTitle(`${getPaymentEmoji(interaction)} 付款已取消`)
    .setColor(RP_THEME_COLOR)
    .setDescription("◆ 此付款已取消\n◇ 如需重新付款請使用 `/rp`")
    .setTimestamp();

  await interaction.update({ embeds: [embed], components: [] });
}
