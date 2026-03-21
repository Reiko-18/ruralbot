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

  const embed = new EmbedBuilder()
    .setTitle("選擇繳費超商")
    .setColor(0x7c3aed)
    .addFields({ name: "訂單金額", value: `$${amount.toLocaleString()}`, inline: true })
    .setFooter({ text: "請在 15 分鐘內完成操作" });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`rp:${userId}:${ts}:store:fami:${amount}:${encodedRemark}`)
      .setLabel("全家 FamilyMart")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`rp:${userId}:${ts}:store:711:${amount}:${encodedRemark}`)
      .setLabel("7-11 ibon")
      .setStyle(ButtonStyle.Primary),
  );

  await interaction.reply({ embeds: [embed], components: [row] });
}
