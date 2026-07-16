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
  MessageFlags,
} from "discord.js";
import { customAlphabet } from "nanoid";
import { getPaymentConfig, getEffectiveCredentials, calculateFee } from "../../services/payment/repo_payment_config.js";
import { createTransaction, updateTransactionStatus } from "../../services/payment/repo_payment_transaction.js";
import { generatePaymentOrderId } from "../../services/payment/payment_id.js";
import { createBackgroundPayment } from "../../services/payment/smilepay_api.js";
import { logger } from "../../services/logger/logger.js";
import { validateBuyerInfo, type BuyerInfo } from "../../services/payment/buyer_info.js";
import { resolveButtonEmoji, resolveClientEmoji } from "../../services/discord/emoji.js";
import { sendUserDm } from "../../services/discord/dm.js";

const STORE_LABELS: Record<string, string> = { fami: "全家 FamilyMart", "711": "7-11 ibon" };
const STORE_PAY_ZG: Record<string, string> = { fami: "6", "711": "4" };
const RP_THEME_COLOR = 0xb8a7ff;
const PAYMENT_EMOJI = "<a:ZSz26520125622:1343576083617812502>";
const FAMILY_MART_EMOJI = "<:FamilyMart:1332695203735142440>";
const SEVEN_ELEVEN_EMOJI = "<:711:1332695189403336738>";
// 備註不進 customId（避免中文備註經 encodeURIComponent 後超過 Discord 100 字元硬限制），
// 改用短 token 關聯，實際備註內容存在下面的 process 內快取。
interface CacheEntry<T> {
  value: T;
  timestamp: number;
}

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 分鐘，與 /rp 流程逾時時間一致
const CACHE_SWEEP_INTERVAL_MS = 5 * 60 * 1000; // 定期清掃間隔

const buyerInfoCache = new Map<string, CacheEntry<BuyerInfo>>();
const remarkCache = new Map<string, CacheEntry<string>>();
// 進行中的確認流程鎖（鍵為付款訊息 ID），防止使用者連點確認鈕建立兩筆交易 / 向 SmilePay 取兩次號。
const confirmInFlight = new Set<string>();

const TOKEN_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const generateRemarkToken = customAlphabet(TOKEN_ALPHABET, 10);

/** 建立備註快取並回傳短 token；無備註時回傳空字串，不佔用快取。供 rp.cmd.ts 呼叫。 */
export function createRemarkToken(remark: string): string {
  if (!remark) return "";
  const token = generateRemarkToken();
  remarkCache.set(token, { value: remark, timestamp: Date.now() });
  return token;
}

function getRemark(token: string): string {
  return remarkCache.get(token)?.value ?? "";
}

function deleteRemarkToken(token: string): void {
  if (token) remarkCache.delete(token);
}

/** 交易完成/取消/逾時後，清除該筆流程殘留的備註與買家資訊快取。 */
function cleanupRpCaches(parts: string[]): void {
  deleteRemarkToken(parts[6] ?? "");
  buyerInfoCache.delete(buildBuyerInfoKey(parts));
}

/** 定期清掃超過 TTL 仍未被清除的快取（例如使用者中途放棄流程）。 */
function sweepExpiredCaches(): void {
  const now = Date.now();
  for (const [key, entry] of remarkCache) {
    if (now - entry.timestamp > CACHE_TTL_MS) remarkCache.delete(key);
  }
  for (const [key, entry] of buyerInfoCache) {
    if (now - entry.timestamp > CACHE_TTL_MS) buyerInfoCache.delete(key);
  }
}

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
  setInterval(sweepExpiredCaches, CACHE_SWEEP_INTERVAL_MS);

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton() && !interaction.isModalSubmit()) return;
    if (!interaction.customId.startsWith("rp:")) return;

    const parts = interaction.customId.split(":");
    const ts = parseInt(parts[2], 10);

    // Timeout check (15 min = 900 seconds)
    if (Math.floor(Date.now() / 1000) - ts > 900) {
      cleanupRpCaches(parts);
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
        await handleCancel(interaction, parts);
      }
    } catch (err) {
      logger.error({ err }, "rp interaction failed");
      const payload = {
        embeds: [new EmbedBuilder().setTitle("發生錯誤").setDescription("操作失敗，請重新使用 /rp").setColor(0xef4444)],
        components: [],
      };
      // 已 ack（deferred/replied）的互動不能再用 update()/reply()，否則會二次拋出
      // InteractionAlreadyReplied；一律改用 editReply()。這裡再包一層 try/catch，
      // 避免「回報錯誤」這個動作本身失敗又拋出未處理例外。
      try {
        if (interaction.isButton()) {
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply(payload);
          } else {
            await interaction.update(payload);
          }
        } else if (interaction.isModalSubmit()) {
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply(payload);
          } else {
            await interaction.reply({ content: "操作失敗，請重新使用 /rp", flags: MessageFlags.Ephemeral });
          }
        }
      } catch (replyErr) {
        logger.error({ err: replyErr }, "rp interaction 錯誤回覆本身也失敗");
      }
    }
  });
}

async function handleStoreSelect(interaction: any, parts: string[]) {
  const ts = parts[2];
  const store = parts[4]; // "fami" or "711"
  const amount = parseInt(parts[5], 10);
  const remarkToken = parts[6] ?? "";
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
  const remark = getRemark(remarkToken);

  const embed = new EmbedBuilder()
    .setTitle(`${paymentEmoji} 付款方式確認`)
    .setColor(RP_THEME_COLOR)
    .setDescription(descLines.join("\n"))
    .setThumbnail(getBotThumbnail(interaction))
    .addFields(
      { name: "◇ 付款金額", value: `└ ${amount.toLocaleString()} 元`, inline: true },
      { name: "◇ SmilePay 代收手續費", value: `└ ${fee.toLocaleString()} 元`, inline: true },
      { name: "◇ 客人應繳總額", value: `└ **${total.toLocaleString()} 元**`, inline: false },
      ...(remark ? [{ name: "◇ 備註", value: `└ ${remark}`, inline: false }] : []),
    )
    .setFooter({ text: "◆ 請確認金額與超商後繼續 ◆ RuralBot" })
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildBaseCustomId(parts, "cancel"))
      .setLabel("取消重選")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`rp:${clickerId}:${ts}:confirm:${store}:${amount}:${remarkToken}`)
      .setLabel("下一步：確認購買資訊")
      .setEmoji(getPaymentButtonEmoji(interaction))
      .setStyle(ButtonStyle.Primary),
  );

  await interaction.update({ embeds: [embed], components: [row] });
}

async function handleBuyerInfoReview(interaction: any, parts: string[]) {
  const buyerInfo = buyerInfoCache.get(buildBuyerInfoKey(parts))?.value;
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
  const remarkToken = parts[6] ?? "";

  const modal = new ModalBuilder()
    .setCustomId(`rp:${interaction.user.id}:${ts}:buyer:${store}:${amount}:${remarkToken}`)
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

  buyerInfoCache.set(buildBuyerInfoKey(parts), { value: buyerInfo.value, timestamp: Date.now() });
  await interaction.update(buildBuyerInfoReviewPayload(interaction, parts, buyerInfo.value));
}

async function handlePay(interaction: any, parts: string[]) {
  const buyerInfo = buyerInfoCache.get(buildBuyerInfoKey(parts))?.value;
  if (!buyerInfo) {
    await interaction.update(buildBuyerInfoReviewPayload(interaction, parts));
    return;
  }

  await handleConfirm(interaction, parts, buyerInfo);
}

async function handleConfirm(interaction: any, parts: string[], buyerInfo: BuyerInfo) {
  // 防連點：同步（無 await）檢查並設定鎖，單執行緒下可序列化兩次近乎同時的點擊；
  // 第二次點擊會落入 has()===true 分支，靜默 ack 後直接返回，不重複建單。
  const lockKey = interaction.message?.id ?? buildBuyerInfoKey(parts);
  if (confirmInFlight.has(lockKey)) {
    await interaction.deferUpdate().catch(() => {});
    return;
  }
  confirmInFlight.add(lockKey);
  try {
  const store = parts[4]; // "fami" or "711"
  const amount = parseInt(parts[5], 10);
  const remark = getRemark(parts[6] ?? "") || undefined;
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

  // 先建立本地 PENDING 交易紀錄，再呼叫 SmilePay：避免 SmilePay 取號成功但本地寫入失敗，
  // 造成日後 callback 對不到訂單的孤兒紀錄。
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

  // 本地交易已落地，備註/買家資訊快取不再需要，提前清除避免無限成長
  cleanupRpCaches(parts);

  // Call SmilePay Background API
  let bgResult: Awaited<ReturnType<typeof createBackgroundPayment>>;
  try {
    bgResult = await createBackgroundPayment(credentials, {
      orderId,
      amount: total,
      payZg,
      payerName: buyerInfo.payerName,
      email: buyerInfo.payerEmail,
      phone: buyerInfo.payerPhone,
      remark,
    });
  } catch (err) {
    logger.error({ err, orderId }, "SmilePay API 呼叫失敗 for /rp");
    await updateTransactionStatus(transaction.id, "FAILED");
    await interaction.editReply({
      embeds: [new EmbedBuilder().setTitle("取號失敗").setDescription("SmilePay 服務暫時無法連線\n請稍後重試或聯繫管理員").setColor(RP_THEME_COLOR)],
      components: [],
    });
    return;
  }

  if (bgResult.Status !== "1") {
    logger.error({ orderId, status: bgResult.Status, desc: bgResult.Desc }, "SmilePay API returned error for /rp");
    await updateTransactionStatus(transaction.id, "FAILED");
    await interaction.editReply({
      embeds: [new EmbedBuilder().setTitle("取號失敗").setDescription(`SmilePay 回應: ${bgResult.Desc}\n請稍後重試或聯繫管理員`).setColor(RP_THEME_COLOR)],
      components: [],
    });
    return;
  }

  // Extract payment code based on store
  const paymentCode = store === "711" ? bgResult.IbonNo : bgResult.FamiNO;
  const payEndDate = bgResult.PayEndDate;

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
      { name: "◇ 客人應繳總額", value: `└ **$${total.toLocaleString()}**`, inline: true },
      { name: "◇ 付款期限", value: `└ ${deadlineText}`, inline: true },
      { name: "◇ SmilePay 代收手續費", value: `└ ${fee.toLocaleString()} 元`, inline: true },
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
        { name: "◇ SmilePay 代收手續費", value: `└ $${fee.toLocaleString()}`, inline: true },
        { name: "◇ 客人應繳總額", value: `└ **$${total.toLocaleString()}**`, inline: true },
        { name: "◇ 繳費期限", value: `└ ${deadlineText}`, inline: true },
        { name: "◇ 訂單編號", value: `└ \`${displayOrderId}\``, inline: true },
        ...(remark ? [{ name: "◇ 備註", value: `└ ${remark}`, inline: false }] : []),
      )
      .setFooter({ text: "◆ 繳費完成後系統會自動更新狀態 ◆ 自動私人訊息" })
      .setTimestamp();

    await sendUserDm(interaction.user, { embeds: [dmEmbed] }, { orderId, notificationType: "payment_info" });
  } catch (dmErr) {
    logger.warn({ err: dmErr, orderId, userId: interaction.user.id }, "Failed to build payment DM");
  }
  } finally {
    confirmInFlight.delete(lockKey);
  }
}

async function handleCancel(interaction: any, parts: string[]) {
  cleanupRpCaches(parts);

  const embed = new EmbedBuilder()
    .setTitle(`${getPaymentEmoji(interaction)} 付款已取消`)
    .setColor(RP_THEME_COLOR)
    .setDescription("◆ 此付款已取消\n◇ 如需重新付款請使用 `/rp`")
    .setTimestamp();

  await interaction.update({ embeds: [embed], components: [] });
}
