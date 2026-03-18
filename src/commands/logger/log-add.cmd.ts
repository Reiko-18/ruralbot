import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  type ChatInputCommandInteraction,
} from "discord.js";
import { LEVEL_CHOICES } from "../../types/logger.type.js";
import { upsertConfig } from "../../services/logger/repo_log_config.js";
import { refreshLogConfigs } from "../../services/logger/log_cache.js";
import { logger } from "../../services/logger/logger.js";

export const data = new SlashCommandBuilder()
  .setName("log-add")
  .setDescription("Add or update a logging channel")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addChannelOption((o) =>
    o
      .setName("channel")
      .setDescription("The channel to send logs to")
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true),
  )
  .addIntegerOption((o) =>
    o
      .setName("level")
      .setDescription("Minimum log level for this channel")
      .addChoices(...LEVEL_CHOICES)
      .setRequired(true),
  )
  .addStringOption((o) =>
    o.setName("label").setDescription("Optional label for this channel"),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const channel = interaction.options.getChannel("channel", true);
  const level = interaction.options.getInteger("level", true);
  const label = interaction.options.getString("label");

  try {
    // Create webhook for the channel
    const guild = interaction.guild!;
    const textChannel = await guild.channels.fetch(channel.id);
    if (!textChannel || !("createWebhook" in textChannel)) {
      await interaction.editReply("Cannot create webhook in that channel.");
      return;
    }

    // Check for existing RuralBot webhook
    const webhooks = await (textChannel as any).fetchWebhooks();
    let webhook = webhooks.find((w: any) => w.name === "RuralBot Logger");
    if (!webhook) {
      webhook = await (textChannel as any).createWebhook({
        name: "RuralBot Logger",
        reason: "Automated logging webhook",
      });
    }

    await upsertConfig(channel.id, webhook.url, level, label);
    await refreshLogConfigs();

    const levelName = LEVEL_CHOICES.find((c) => c.value === level)?.name ?? `${level}`;
    logger.info({ channelId: channel.id, level: levelName }, "Log channel configured");

    await interaction.editReply(
      `Logging configured for <#${channel.id}> at level **${levelName}**${label ? ` (${label})` : ""}`,
    );
  } catch (err) {
    logger.error({ err }, "Failed to configure log channel");
    await interaction.editReply("Failed to configure logging. Check bot permissions.");
  }
}
