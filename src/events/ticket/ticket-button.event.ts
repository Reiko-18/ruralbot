import {
  type Client,
  Events,
  ChannelType,
  PermissionFlagsBits,
  MessageFlags,
} from "discord.js";
import { TICKET_BUTTON_PREFIX } from "../../types/ticket.type.js";
import { getTicketConfig, incrementTicketNum } from "../../services/ticket/repo_ticket_config.js";
import { getButtonTypeById } from "../../services/ticket/repo_ticket_button_type.js";
import { isBlacklisted } from "../../services/ticket/repo_ticket_blacklist.js";
import { createInstance } from "../../services/ticket/repo_ticket_instance.js";
import {
  buildWelcomeEmbed,
  buildOpenTicketButtons,
} from "../../services/ticket/ticket_panel_builder.js";
import { logger } from "../../services/logger/logger.js";

export function registerTicketButtonEvent(client: Client): void {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith(TICKET_BUTTON_PREFIX)) return;

    const buttonTypeId = interaction.customId.slice(TICKET_BUTTON_PREFIX.length);
    const guildId = interaction.guildId;
    if (!guildId) return;

    try {
      const config = await getTicketConfig(guildId);
      if (!config) {
        await interaction.reply({ content: "❌ 票口系統尚未設定。", flags: MessageFlags.Ephemeral });
        return;
      }

      // Blacklist check
      const blocked = await isBlacklisted(config.id, interaction.user.id);
      if (blocked) {
        if (config.blacklistMode === "silent") return;
        const message = config.blacklistMessage ?? "您已被禁止使用票口功能。";
        if (config.blacklistMode === "dm") {
          try { await interaction.user.send(message); } catch { /* DMs disabled */ }
          return;
        }
        // ephemeral
        await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
        return;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const buttonType = await getButtonTypeById(buttonTypeId);
      const categoryId = buttonType?.categoryOpenId;
      if (!categoryId) {
        await interaction.editReply("❌ 尚未設定票口分類。");
        return;
      }

      // Check category channel count
      const category = interaction.guild!.channels.cache.get(categoryId);
      if (category && category.type === ChannelType.GuildCategory) {
        const childCount = interaction.guild!.channels.cache.filter(
          (c) => c.parentId === categoryId,
        ).size;
        if (childCount >= 50) {
          await interaction.editReply("❌ 票口分類已達上限 (50)，請稍後再試。");
          return;
        }
      }

      const ticketNum = await incrementTicketNum(guildId);
      const channelName = `ticket-${String(ticketNum).padStart(4, "0")}`;

      // Build permission overwrites
      const permissionOverwrites: any[] = [
        { id: guildId, deny: [PermissionFlagsBits.ViewChannel] },
        {
          id: interaction.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.AttachFiles,
          ],
        },
        {
          id: interaction.client.user!.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.ManageMessages,
          ],
        },
      ];

      // Add notify role permissions
      if (buttonType?.notifyRoleIds) {
        try {
          const roleIds = JSON.parse(buttonType.notifyRoleIds) as string[];
          for (const roleId of roleIds) {
            permissionOverwrites.push({
              id: roleId,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
            });
          }
        } catch { /* Invalid JSON, skip */ }
      }

      const ticketChannel = await interaction.guild!.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: categoryId,
        permissionOverwrites,
      });

      // Send welcome embed + management buttons
      const welcomeMessage = buttonType?.welcomeMessage ?? config.defaultMessage;
      const embedSettings = buttonType?.embedSettings ?? null;
      const welcomeEmbed = buildWelcomeEmbed(ticketNum, interaction.user.id, welcomeMessage, embedSettings);
      const buttons = buildOpenTicketButtons();

      // Build mentions
      let mentionContent = `<@${interaction.user.id}>`;
      if (buttonType?.notifyRoleIds) {
        try {
          const roleIds = JSON.parse(buttonType.notifyRoleIds) as string[];
          mentionContent += " " + roleIds.map((id) => `<@&${id}>`).join(" ");
        } catch { /* skip */ }
      }

      await ticketChannel.send({
        content: mentionContent,
        embeds: [welcomeEmbed],
        components: buttons,
      });

      // Create DB record
      await createInstance({
        configId: config.id,
        buttonTypeId: buttonType?.id,
        channelId: ticketChannel.id,
        creatorId: interaction.user.id,
        ticketNum,
      });

      await interaction.editReply(`✅ 票口已建立：<#${ticketChannel.id}>`);
      logger.info(
        { guildId, ticketNum, creatorId: interaction.user.id, buttonType: buttonType?.label },
        "Ticket created",
      );
    } catch (err) {
      logger.error({ err }, "Failed to create ticket");
      try {
        if (interaction.deferred) {
          await interaction.editReply("❌ 建立票口失敗，請確認機器人權限。");
        } else {
          await interaction.reply({ content: "❌ 建立票口失敗。", flags: MessageFlags.Ephemeral });
        }
      } catch { /* interaction expired */ }
    }
  });
}
