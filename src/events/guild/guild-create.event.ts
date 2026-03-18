import { type Client, Events } from "discord.js";
import { logger } from "../../services/logger/logger.js";

export function registerGuildCreateEvent(client: Client): void {
  client.on(Events.GuildCreate, async (guild) => {
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
