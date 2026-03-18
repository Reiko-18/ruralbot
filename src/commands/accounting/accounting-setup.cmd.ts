import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  type ChatInputCommandInteraction,
} from "discord.js";
import { upsertAccountingConfig } from "../../services/accounting/repo_accounting_config.js";
import { logger } from "../../services/logger/logger.js";

export const data = new SlashCommandBuilder()
  .setName("accounting-setup")
  .setDescription("Set the accounting log channel for order threads")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addChannelOption((o) =>
    o
      .setName("channel")
      .setDescription("The channel for order log threads")
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });
  const channel = interaction.options.getChannel("channel", true);

  try {
    await upsertAccountingConfig(interaction.guildId!, channel.id);
    logger.info(
      { guildId: interaction.guildId, channelId: channel.id },
      "Accounting channel configured",
    );
    await interaction.editReply(`會計日誌頻道已設定為 <#${channel.id}>`);
  } catch (err) {
    logger.error({ err }, "Failed to set accounting channel");
    await interaction.editReply("設定失敗，請確認機器人權限。");
  }
}
