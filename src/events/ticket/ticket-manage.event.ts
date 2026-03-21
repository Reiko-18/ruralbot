import {
  type Client,
  Events,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type TextChannel,
  type ButtonInteraction,
} from "discord.js";
import {
  TICKET_CLOSE_ID,
  TICKET_CLOSE_CONFIRM_ID,
  TICKET_CLOSE_CANCEL_ID,
  TICKET_REOPEN_ID,
  TICKET_DELETE_ID,
  TICKET_TRANSCRIPT_ID,
  TICKET_DELETE_CONFIRM_ID,
} from "../../types/ticket.type.js";
import {
  getInstanceByChannelId,
  updateInstanceStatus,
} from "../../services/ticket/repo_ticket_instance.js";
import {
  buildClosedTicketButtons,
  buildOpenTicketButtons,
} from "../../services/ticket/ticket_panel_builder.js";
import { generateAndSendTranscript } from "../../services/ticket/ticket_transcript.js";
import { logger } from "../../services/logger/logger.js";

const MANAGE_IDS = new Set([
  TICKET_CLOSE_ID,
  TICKET_CLOSE_CONFIRM_ID,
  TICKET_CLOSE_CANCEL_ID,
  TICKET_REOPEN_ID,
  TICKET_DELETE_ID,
  TICKET_TRANSCRIPT_ID,
  TICKET_DELETE_CONFIRM_ID,
]);

export function registerTicketManageEvent(client: Client): void {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isButton() && MANAGE_IDS.has(interaction.customId)) {
      await handleButton(client, interaction);
    }
  });
}

async function handleButton(client: Client, interaction: ButtonInteraction): Promise<void> {
  const channelId = interaction.channelId;
  const instance = await getInstanceByChannelId(channelId);
  if (!instance) {
    await interaction.reply({ content: "❌ 此頻道不是票口。", flags: MessageFlags.Ephemeral });
    return;
  }

  const member = interaction.member as any;
  const hasAdmin = member?.permissions?.has?.(PermissionFlagsBits.Administrator);

  switch (interaction.customId) {
    case TICKET_CLOSE_ID: {
      if (!hasAdmin) {
        // Check if user has notify role
        const roleIds = instance.buttonType?.notifyRoleIds
          ? JSON.parse(instance.buttonType.notifyRoleIds) as string[]
          : [];
        const hasRole = roleIds.some((id: string) => member?.roles?.cache?.has(id));
        if (!hasRole) {
          await interaction.reply({ content: "❌ 您沒有權限關閉此票口。", flags: MessageFlags.Ephemeral });
          return;
        }
      }

      // Show close confirmation
      const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(TICKET_CLOSE_CONFIRM_ID).setLabel("確定").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(TICKET_CLOSE_CANCEL_ID).setLabel("取消").setStyle(ButtonStyle.Secondary),
      );
      await interaction.reply({
        content: "### 確認沒有問題的話可以自行關閉此票口",
        components: [confirmRow],
      });
      break;
    }

    case TICKET_CLOSE_CONFIRM_ID: {
      await interaction.message?.delete().catch(() => {});

      await interaction.deferReply();
      const channel = interaction.channel as TextChannel;

      // Remove creator permissions
      const creatorPerms = channel.permissionOverwrites.cache.get(instance.creatorId);
      if (creatorPerms) await creatorPerms.delete();

      // Move to close category
      const closeCategoryId = instance.buttonType?.categoryCloseId;
      if (closeCategoryId) {
        await channel.setParent(closeCategoryId, { lockPermissions: false });
      }

      await updateInstanceStatus(channelId, "CLOSED", new Date());

      const closedEmbed = new EmbedBuilder()
        .setTitle("🔒 票口已關閉")
        .setDescription(`由 <@${interaction.user.id}> 關閉`)
        .setColor(0xed4245)
        .setTimestamp();

      await interaction.editReply({
        embeds: [closedEmbed.toJSON()],
        components: buildClosedTicketButtons(),
      });

      logger.info({ ticketNum: instance.ticketNum, closedBy: interaction.user.id }, "Ticket closed");
      break;
    }

    case TICKET_CLOSE_CANCEL_ID: {
      await interaction.message?.delete().catch(() => {});
      break;
    }

    case TICKET_REOPEN_ID: {
      if (!hasAdmin) {
        await interaction.reply({ content: "❌ 僅管理員可重新開啟票口。", flags: MessageFlags.Ephemeral });
        return;
      }

      await interaction.deferReply();
      const channel = interaction.channel as TextChannel;

      // Restore creator permissions
      await channel.permissionOverwrites.edit(instance.creatorId, {
        ViewChannel: true,
        SendMessages: true,
        AttachFiles: true,
      });

      // Move back to open category
      const openCategoryId = instance.buttonType?.categoryOpenId;
      if (openCategoryId) {
        await channel.setParent(openCategoryId, { lockPermissions: false });
      }

      await updateInstanceStatus(channelId, "OPEN");

      const reopenEmbed = new EmbedBuilder()
        .setTitle("🔓 票口已重新開啟")
        .setDescription(`由 <@${interaction.user.id}> 重新開啟`)
        .setColor(0x57f287)
        .setTimestamp();

      await interaction.editReply({
        embeds: [reopenEmbed.toJSON()],
        components: buildOpenTicketButtons(),
      });

      logger.info({ ticketNum: instance.ticketNum, reopenedBy: interaction.user.id }, "Ticket reopened");
      break;
    }

    case TICKET_DELETE_ID: {
      if (!hasAdmin) {
        await interaction.reply({ content: "❌ 僅管理員可刪除票口。", flags: MessageFlags.Ephemeral });
        return;
      }

      const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(TICKET_DELETE_CONFIRM_ID).setLabel("確認刪除").setStyle(ButtonStyle.Danger),
      );
      await interaction.reply({
        content: "⚠️ 確定要刪除此票口嗎？此操作無法復原。",
        components: [confirmRow],
        flags: MessageFlags.Ephemeral,
      });
      break;
    }

    case TICKET_DELETE_CONFIRM_ID: {
      await interaction.deferUpdate();
      await updateInstanceStatus(channelId, "ARCHIVED");
      const channel = interaction.channel as TextChannel;
      logger.info({ ticketNum: instance.ticketNum, deletedBy: interaction.user.id }, "Ticket deleted");
      await channel.delete("Ticket deleted by admin");
      break;
    }

    case TICKET_TRANSCRIPT_ID: {
      if (!hasAdmin) {
        await interaction.reply({ content: "❌ 僅管理員可存檔紀錄。", flags: MessageFlags.Ephemeral });
        return;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await generateAndSendTranscript(
        client,
        interaction.channel as TextChannel,
        {
          ticketNum: instance.ticketNum,
          creatorId: instance.creatorId,
          createdAt: instance.createdAt,
          closedAt: instance.closedAt,
          configId: instance.configId,
          status: instance.status,
        },
        instance.config.transcriptTarget,
        instance.config.logChannelId,
      );
      await interaction.editReply("✅ 存檔紀錄已生成並發送。");
      break;
    }
  }
}
