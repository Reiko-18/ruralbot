import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import { upsertTicketConfig } from "../../services/ticket/repo_ticket_config.js";
import { logger } from "../../services/logger/logger.js";

export const data = new SlashCommandBuilder()
  .setName("ticket-setup")
  .setDescription("設定票口系統")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addChannelOption((o) =>
    o.setName("panel-channel").setDescription("面板頻道").addChannelTypes(ChannelType.GuildText).setRequired(true),
  )
  .addChannelOption((o) =>
    o.setName("open-category").setDescription("開啟票口分類").addChannelTypes(ChannelType.GuildCategory).setRequired(true),
  )
  .addChannelOption((o) =>
    o.setName("close-category").setDescription("關閉票口分類").addChannelTypes(ChannelType.GuildCategory).setRequired(true),
  )
  .addChannelOption((o) =>
    o.setName("log-channel").setDescription("存檔紀錄頻道").addChannelTypes(ChannelType.GuildText).setRequired(false),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const panelChannel = interaction.options.getChannel("panel-channel", true);
  const openCategory = interaction.options.getChannel("open-category", true);
  const closeCategory = interaction.options.getChannel("close-category", true);
  const logChannel = interaction.options.getChannel("log-channel", false);

  try {
    await upsertTicketConfig(interaction.guildId!, {
      panelChannelId: panelChannel.id,
      categoryOpenId: openCategory.id,
      categoryCloseId: closeCategory.id,
      logChannelId: logChannel?.id ?? null,
    });

    logger.info({ guildId: interaction.guildId }, "Ticket system configured");
    await interaction.editReply(
      `✅ 票口系統已設定\n` +
      `面板頻道：<#${panelChannel.id}>\n` +
      `開啟分類：${openCategory.name}\n` +
      `關閉分類：${closeCategory.name}\n` +
      `${logChannel ? `存檔頻道：<#${logChannel.id}>` : "存檔頻道：未設定"}`,
    );
  } catch (err) {
    logger.error({ err }, "Failed to setup ticket system");
    await interaction.editReply("❌ 設定失敗，請確認機器人權限。");
  }
}
