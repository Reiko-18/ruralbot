import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
  type ChatInputCommandInteraction,
  type TextChannel,
} from "discord.js";
import { getTicketConfig, updatePanelMessageId } from "../../services/ticket/repo_ticket_config.js";
import { getButtonTypes } from "../../services/ticket/repo_ticket_button_type.js";
import { buildPanelEmbed, buildPanelButtons } from "../../services/ticket/ticket_panel_builder.js";
import { logger } from "../../services/logger/logger.js";

export const data = new SlashCommandBuilder()
  .setName("ticket-panel")
  .setDescription("部署或更新票口面板")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const config = await getTicketConfig(interaction.guildId!);
  if (!config || !config.panelChannelId) {
    await interaction.editReply("❌ 請先使用 `/ticket-setup` 設定票口系統。");
    return;
  }

  const buttonTypes = await getButtonTypes(config.id);
  if (buttonTypes.length === 0) {
    await interaction.editReply("❌ 請先在 Dashboard 新增至少一個按鈕類型。");
    return;
  }

  try {
    const channel = await interaction.guild!.channels.fetch(config.panelChannelId);
    if (!channel || channel.type !== ChannelType.GuildText) {
      await interaction.editReply("❌ 面板頻道不存在或非文字頻道。");
      return;
    }

    const embed = buildPanelEmbed(config);
    const buttons = buildPanelButtons(buttonTypes);

    // Try to edit existing panel message
    if (config.panelMessageId) {
      try {
        const existingMsg = await (channel as TextChannel).messages.fetch(config.panelMessageId);
        await existingMsg.edit({ embeds: [embed], components: buttons });
        await interaction.editReply("✅ 面板已更新。");
        logger.info({ guildId: interaction.guildId }, "Ticket panel updated");
        return;
      } catch {
        // Message deleted, create new one
      }
    }

    // Send new panel message
    const msg = await (channel as TextChannel).send({ embeds: [embed], components: buttons });
    await updatePanelMessageId(interaction.guildId!, msg.id);
    await interaction.editReply("✅ 面板已部署。");
    logger.info({ guildId: interaction.guildId, messageId: msg.id }, "Ticket panel deployed");
  } catch (err) {
    logger.error({ err }, "Failed to deploy ticket panel");
    await interaction.editReply("❌ 部署面板失敗，請確認機器人權限。");
  }
}
