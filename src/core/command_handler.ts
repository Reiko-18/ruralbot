import {
  Collection,
  InteractionContextType,
  MessageFlags,
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
  if (!interaction.inGuild()) return;

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

  try {
    await command.execute(interaction);
  } catch (err) {
    logger.error(
      { err, commandName: interaction.commandName, userId: interaction.user.id },
      "指令執行時發生未攔截例外",
    );

    if (interaction.isRepliable() && !interaction.replied) {
      try {
        const failureContent = "❌ 指令執行時發生錯誤，請稍後再試。";
        if (interaction.deferred) {
          await interaction.editReply({ content: failureContent });
        } else {
          await interaction.reply({ content: failureContent, flags: MessageFlags.Ephemeral });
        }
      } catch (replyErr) {
        logger.error(
          { err: replyErr, commandName: interaction.commandName },
          "回覆指令錯誤訊息失敗",
        );
      }
    }
    return;
  }

  if (command.mirrorResponse !== false) {
    await mirrorToSyncChannel(interaction);
  }
}

export async function deployCommands(): Promise<void> {
  const rest = new REST().setToken(process.env.TOKEN!);
  const body = commands.map((cmd) => ({
    ...(cmd.data.toJSON() as object),
    contexts: [InteractionContextType.Guild],
  }));

  // 全域註冊，但只允許在伺服器內使用。
  await rest.put(
    Routes.applicationCommands(process.env.APPLICATION_ID!),
    { body },
  );
}

export { commands };
