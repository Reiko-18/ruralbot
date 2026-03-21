import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
} from "discord.js";

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

  const descLines = [
    `<@${userId}> 發起了一筆繳費單`,
    "",
    `### 💰 繳費金額`,
    `# \`$${amount.toLocaleString()}\``,
  ];
  if (remark) descLines.push("", `> 📝 ${remark}`);
  descLines.push("", "━━━━━━━━━━━━━━━━━━━", "**請選擇繳費超商 👇**");

  const embed = new EmbedBuilder()
    .setTitle("🧾 超商代碼繳費")
    .setColor(0x7c3aed)
    .setDescription(descLines.join("\n"))
    .setFooter({ text: "⏱ 15 分鐘內有效 · 所有人皆可操作" })
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`rp:${userId}:${ts}:store:fami:${amount}:${encodedRemark}`)
      .setLabel("全家 FamilyMart")
      .setEmoji("🏬")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`rp:${userId}:${ts}:store:711:${amount}:${encodedRemark}`)
      .setLabel("7-11 ibon")
      .setEmoji("🏪")
      .setStyle(ButtonStyle.Secondary),
  );

  await interaction.reply({ embeds: [embed], components: [row] });
}
