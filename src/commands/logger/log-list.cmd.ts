import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import { LEVEL_LABELS } from "../../types/logger.type.js";
import { getAllConfigs } from "../../services/logger/repo_log_config.js";

export const data = new SlashCommandBuilder()
  .setName("log-list")
  .setDescription("List all configured logging channels")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const configs = await getAllConfigs();

  if (configs.length === 0) {
    await interaction.editReply("No logging channels configured. Use `/log-add` to set one up.");
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle("📋 Log Channels")
    .setColor(0x00bfff)
    .setDescription(
      configs
        .map((c) => {
          const status = c.isEnabled ? "🟢" : "🔴";
          const levelName = LEVEL_LABELS[c.minLevel] ?? `LVL${c.minLevel}`;
          const label = c.label ? ` — *${c.label}*` : "";
          return `${status} <#${c.channelId}> | **${levelName}** (≥${c.minLevel})${label}`;
        })
        .join("\n"),
    )
    .setFooter({ text: `${configs.length} channel(s)` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
