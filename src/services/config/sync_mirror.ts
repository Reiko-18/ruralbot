import {
  type ChatInputCommandInteraction,
  type TextChannel,
  ChannelType,
  EmbedBuilder,
} from "discord.js";
import { getCachedBotConfig } from "./repo_bot_config.js";
import { logger } from "../logger/logger.js";

export async function mirrorToSyncChannel(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  try {
    const config = getCachedBotConfig();
    if (!config) return;

    const channel = await interaction.client.channels.fetch(
      config.syncChannelId,
    );
    if (!channel || channel.type !== ChannelType.GuildText) {
      logger.warn(
        { syncChannelId: config.syncChannelId },
        "Sync channel not found or not text",
      );
      return;
    }

    // Skip mirroring for ephemeral replies — they cannot be fetched/forwarded
    if (interaction.ephemeral) return;

    const reply = await interaction.fetchReply().catch(() => null);
    if (!reply) return;

    const syncChannel = channel as TextChannel;

    // Build context footer
    const guildName =
      interaction.guild?.name ?? "DM";
    const channelName =
      interaction.channel && "name" in interaction.channel
        ? interaction.channel.name
        : "unknown";
    const userName = interaction.user.tag;

    const contextEmbed = new EmbedBuilder()
      .setFooter({
        text: `${userName} · #${channelName} · ${guildName}`,
      })
      .setColor(0x5865f2)
      .setTimestamp();

    // Mirror embeds from the reply (strip components)
    const embeds = reply.embeds.map((e) => EmbedBuilder.from(e));

    // If reply has text content but no embeds, wrap it in an embed
    if (embeds.length === 0 && reply.content) {
      embeds.push(
        new EmbedBuilder().setDescription(reply.content).setColor(0x5865f2),
      );
    }

    // Add the context footer to the last embed, or use standalone
    if (embeds.length > 0) {
      const last = embeds[embeds.length - 1];
      last.setFooter({
        text: `${userName} · #${channelName} · ${guildName}`,
      });
      last.setTimestamp();
    } else {
      embeds.push(contextEmbed);
    }

    await syncChannel.send({ embeds });
  } catch (err) {
    logger.warn({ err }, "Failed to mirror response to sync channel");
  }
}
