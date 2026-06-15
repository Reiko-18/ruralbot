import {
  Collection,
  REST,
  Routes,
  type ChatInputCommandInteraction,
  type SharedNameAndDescription,
} from "discord.js";
import { mirrorToSyncChannel } from "../services/config/sync_mirror.js";
import { isBlockedGuildId, leaveBlockedGuild } from "../services/discord/guild_guard.js";
import { logger } from "../services/logger/logger.js";

interface Command {
  data: SharedNameAndDescription & { toJSON(): unknown };
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  mirrorResponse?: boolean;
}

const commands = new Collection<string, Command>();

export function registerCommand(command: Command): void {
  commands.set(command.data.name, command);
}

export async function handleInteraction(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (isBlockedGuildId(interaction.guildId)) {
    logger.warn(
      {
        guildId: interaction.guildId,
        commandName: interaction.commandName,
        userId: interaction.user.id,
      },
      "Ignored command from blocked guild",
    );

    if (interaction.guild) {
      try {
        await leaveBlockedGuild(interaction.guild, "blocked_guild_interaction");
      } catch (err) {
        logger.error({ err, guildId: interaction.guildId }, "Failed to leave blocked guild after interaction");
      }
    }

    return;
  }

  const command = commands.get(interaction.commandName);
  if (!command) return;
  await command.execute(interaction);
  if (command.mirrorResponse !== false) {
    await mirrorToSyncChannel(interaction);
  }
}

export async function deployCommands(): Promise<void> {
  const rest = new REST().setToken(process.env.TOKEN!);
  const body = commands.map((cmd) => cmd.data.toJSON());

  // Deploy globally — available in all servers + DMs
  await rest.put(
    Routes.applicationCommands(process.env.APPLICATION_ID!),
    { body },
  );
}

export { commands };
