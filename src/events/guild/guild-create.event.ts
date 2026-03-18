import { type Client, Events, REST, Routes } from "discord.js";
import { commands } from "../../core/command_handler.js";
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

    // Deploy commands to the new guild for instant availability
    // Rate limit: 2s delay to respect Discord API limits
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const rest = new REST().setToken(process.env.TOKEN!);
      const body = commands.map((cmd) => cmd.data.toJSON());

      await rest.put(
        Routes.applicationGuildCommands(
          process.env.APPLICATION_ID!,
          guild.id,
        ),
        { body },
      );
      logger.info({ guildId: guild.id }, "Commands deployed to new guild");
    } catch (err) {
      logger.error(
        { err, guildId: guild.id },
        "Failed to deploy commands to new guild",
      );
    }
  });
}
