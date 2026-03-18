import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import {
  upsertBotConfig,
  getCachedBotConfig,
} from "../../services/config/repo_bot_config.js";
import { getAccountingConfig } from "../../services/accounting/repo_accounting_config.js";
import { logger } from "../../services/logger/logger.js";

export const data = new SlashCommandBuilder()
  .setName("bot-config")
  .setDescription("Configure the primary guild and sync channel")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((sub) =>
    sub
      .setName("set")
      .setDescription("Set this guild as primary and choose a sync channel")
      .addChannelOption((o) =>
        o
          .setName("channel")
          .setDescription("The channel to mirror all command responses to")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("view")
      .setDescription("View current primary guild and sync channel config"),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const sub = interaction.options.getSubcommand();

  if (sub === "set") {
    const channel = interaction.options.getChannel("channel", true);
    try {
      await upsertBotConfig(interaction.guildId!, channel.id);

      // Ensure AccountingConfig exists for primary guild (required for thread redirection)
      const existingAccounting = await getAccountingConfig(interaction.guildId!);
      const accountingNote = existingAccounting
        ? ""
        : "\n⚠️ 請執行 `/accounting-setup` 設定會計頻道，否則訂單日誌不會在此伺服器建立。";

      logger.info(
        {
          guildId: interaction.guildId,
          syncChannelId: channel.id,
        },
        "Primary guild configured",
      );
      await interaction.editReply(
        `✅ 主伺服器已設定為此伺服器\n同步頻道: <#${channel.id}>${accountingNote}`,
      );
    } catch (err) {
      logger.error({ err }, "Failed to set bot config");
      await interaction.editReply("設定失敗，請確認機器人權限。");
    }
  }

  if (sub === "view") {
    const config = getCachedBotConfig();
    if (!config) {
      await interaction.editReply("尚未設定主伺服器。使用 `/bot-config set` 設定。");
      return;
    }
    const guild = interaction.client.guilds.cache.get(config.primaryGuildId);
    await interaction.editReply(
      `主伺服器: **${guild?.name ?? config.primaryGuildId}**\n同步頻道: <#${config.syncChannelId}>`,
    );
  }
}
