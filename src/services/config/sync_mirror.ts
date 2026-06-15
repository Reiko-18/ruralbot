import {
  type ChatInputCommandInteraction,
  type TextChannel,
  ChannelType,
  EmbedBuilder,
} from "discord.js";
import { getCachedBotConfig } from "./repo_bot_config.js";
import { logger } from "../logger/logger.js";

function getDiscordErrorCode(err: unknown): number | string | undefined {
  if (err && typeof err === "object" && "code" in err) {
    return (err as { code?: number | string }).code;
  }
  return undefined;
}

export async function mirrorToSyncChannel(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  try {
    // Ephemeral command replies cannot be fetched and forwarded as public audit messages.
    if (interaction.ephemeral) return;

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
    if (getDiscordErrorCode(err) === 50001) {
      const config = getCachedBotConfig();
      logger.warn(
        { syncChannelId: config?.syncChannelId, code: 50001 },
        "Sync channel missing access; run /bot-config set with a channel the bot can access",
      );
      return;
    }

    logger.warn({ err }, "Failed to mirror response to sync channel");
  }
}
