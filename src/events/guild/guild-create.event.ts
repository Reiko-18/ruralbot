import { type Client, Events } from "discord.js";
import { leaveBlockedGuild } from "../../services/discord/guild_guard.js";
import { logger } from "../../services/logger/logger.js";

export function registerGuildCreateEvent(client: Client): void {
  client.on(Events.GuildCreate, async (guild) => {
    try {
      if (await leaveBlockedGuild(guild, "guild_create")) {
        return;
      }
    } catch (err) {
      logger.error({ err, guildId: guild.id, guildName: guild.name }, "Failed to leave blocked guild on join");
      return;
    }

    logger.info(
      {
        guildId: guild.id,
        guildName: guild.name,
        memberCount: guild.memberCount,
      },
      "Bot joined new guild",
    );
  });
}
