import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
} from "discord.js";
import { resolveButtonEmoji, resolveClientEmoji } from "../../services/discord/emoji.js";
import { createRemarkToken } from "../../events/payment/rp-interact.event.js";

const RP_THEME_COLOR = 0xb8a7ff;
const PAYMENT_EMOJI = "<a:ZSz26520125622:1343576083617812502>";
const FAMILY_MART_EMOJI = "<:FamilyMart:1332695203735142440>";
const SEVEN_ELEVEN_EMOJI = "<:711:1332695189403336738>";

export const data = new SlashCommandBuilder()
  .setName("rp")
  .setDescription("互動式超商繳費")
  .addIntegerOption((o) =>
    o.setName("amount").setDescription("訂單金額 (新台幣)").setRequired(true).setMinValue(1).setMaxValue(20000),
  )
  .addStringOption((o) =>
    o.setName("remark").setDescription("備註 (最多 30 字)").setMaxLength(30),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const amount = interaction.options.getInteger("amount", true);
  const remark = interaction.options.getString("remark") ?? "";
  const userId = interaction.user.id;
  const ts = Math.floor(Date.now() / 1000);
  // 備註不進 customId（中文字經 encodeURIComponent 後容易超過 Discord 100 字元硬限制），
  // 改用短 token 關聯至 process 內快取，實際內容由 rp-interact.event.ts 管理。
  const remarkToken = createRemarkToken(remark);
  const paymentEmoji = resolveClientEmoji(interaction.client, PAYMENT_EMOJI);
  const familyMartEmoji = resolveButtonEmoji(interaction.client, FAMILY_MART_EMOJI);
  const sevenElevenEmoji = resolveButtonEmoji(interaction.client, SEVEN_ELEVEN_EMOJI);

  const descLines = [
    `${paymentEmoji} **已建立一筆超商代碼繳費單**`,
    `◆ 用戶：<@${userId}>`,
    "◆ 請選擇要使用的繳費超商，系統會在確認前收集買家資料。",
  ];

  const embed = new EmbedBuilder()
    .setTitle(`${paymentEmoji} 超商代碼繳費`)
    .setColor(RP_THEME_COLOR)
    .setDescription(descLines.join("\n"))
    .setThumbnail(interaction.client.user.displayAvatarURL({ size: 128 }))
    .addFields(
      { name: "◇ 訂單金額", value: `└ **$${amount.toLocaleString()}**`, inline: true },
      { name: "◇ 有效時間", value: "└ 15 分鐘", inline: true },
      ...(remark ? [{ name: "◇ 備註", value: `└ ${remark}`, inline: false }] : []),
    )
    .setFooter({ text: "◇ 請選擇繳費超商 ◆ RuralBot" })
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`rp:${userId}:${ts}:store:fami:${amount}:${remarkToken}`)
      .setLabel("全家 FamilyMart")
      .setEmoji(familyMartEmoji)
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`rp:${userId}:${ts}:store:711:${amount}:${remarkToken}`)
      .setLabel("7-11 ibon")
      .setEmoji(sevenElevenEmoji)
      .setStyle(ButtonStyle.Primary),
  );

  await interaction.reply({ embeds: [embed], components: [row] });
}
