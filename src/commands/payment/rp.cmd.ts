import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
} from "discord.js";
import { resolveButtonEmoji, resolveClientEmoji } from "../../services/discord/emoji.js";

const RP_THEME_COLOR = 0xb8a7ff;
const PAYMENT_EMOJI = "<a:ZSz26520125622:1343576083617812502>";

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
  const encodedRemark = encodeURIComponent(remark);
  const paymentEmoji = resolveClientEmoji(interaction.client, PAYMENT_EMOJI);
  const buttonEmoji = resolveButtonEmoji(interaction.client, PAYMENT_EMOJI);

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
      { name: "◇ 繳費金額", value: `└ **$${amount.toLocaleString()}**`, inline: true },
      { name: "◇ 有效時間", value: "└ 15 分鐘", inline: true },
      ...(remark ? [{ name: "◇ 備註", value: `└ ${remark}`, inline: false }] : []),
    )
    .setFooter({ text: "◇ 請選擇繳費超商 ◆ RuralBot" })
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`rp:${userId}:${ts}:store:fami:${amount}:${encodedRemark}`)
      .setLabel("全家 FamilyMart")
      .setEmoji(buttonEmoji)
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`rp:${userId}:${ts}:store:711:${amount}:${encodedRemark}`)
      .setLabel("7-11 ibon")
      .setEmoji("🏪")
      .setStyle(ButtonStyle.Primary),
  );

  await interaction.reply({ embeds: [embed], components: [row] });
}
