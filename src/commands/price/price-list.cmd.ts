import {
  SlashCommandBuilder,
  MessageFlags,
  ChannelType,
  type ChatInputCommandInteraction,
  type TextChannel,
} from "discord.js";
import { buildPriceView } from "../../services/price/price_list_builder.js";
import { logger } from "../../services/logger/logger.js";

export const data = new SlashCommandBuilder()
  .setName("price-list")
  .setDescription("Deploy the interactive price list to a channel")
  .addChannelOption((o) =>
    o
      .setName("channel")
      .setDescription("Channel to send the price list to")
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const channel = interaction.options.getChannel("channel", true) as TextChannel;
    const view = buildPriceView(null);

    await channel.send({
      embeds: view.embeds,
      components: view.components,
    });

    logger.info(
      { channelId: channel.id, userId: interaction.user.id },
      "Price list deployed to channel",
    );

    await interaction.editReply(`✅ 價目表已發送至 <#${channel.id}>`);
  } catch (err) {
    logger.error({ err }, "Failed to deploy price list");
    await interaction.editReply("❌ 發送價目表失敗。");
  }
}
