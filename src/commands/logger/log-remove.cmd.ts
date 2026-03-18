import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  type ChatInputCommandInteraction,
} from "discord.js";
import { removeConfig } from "../../services/logger/repo_log_config.js";
import { refreshLogConfigs } from "../../services/logger/log_cache.js";
import { logger } from "../../services/logger/logger.js";

export const data = new SlashCommandBuilder()
  .setName("log-remove")
  .setDescription("Remove a logging channel")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addChannelOption((o) =>
    o
      .setName("channel")
      .setDescription("The channel to remove from logging")
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const channel = interaction.options.getChannel("channel", true);

  try {
    await removeConfig(channel.id);
    await refreshLogConfigs();

    logger.info({ channelId: channel.id }, "Log channel removed");
    await interaction.editReply(`Logging removed for <#${channel.id}>`);
  } catch {
    await interaction.editReply(
      `No logging configuration found for <#${channel.id}>`,
    );
  }
}
