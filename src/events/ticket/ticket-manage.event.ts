import {
  type Client,
  Events,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type TextChannel,
  type ButtonInteraction,
  type ModalSubmitInteraction,
} from "discord.js";
import {
  TICKET_CLOSE_ID,
  TICKET_REOPEN_ID,
  TICKET_DELETE_ID,
  TICKET_TRANSCRIPT_ID,
  TICKET_DELETE_CONFIRM_ID,
  TICKET_CLAIM_ID,
  TICKET_LOCK_ID,
  TICKET_ADD_USER_ID,
  TICKET_REMOVE_USER_ID,
  TICKET_RENAME_ID,
  TICKET_CLOSE_MODAL_ID,
  TICKET_CLOSE_REASON_INPUT_ID,
  TICKET_ADD_USER_MODAL_ID,
  TICKET_REMOVE_USER_MODAL_ID,
  TICKET_USER_INPUT_ID,
  TICKET_RENAME_MODAL_ID,
  TICKET_RENAME_INPUT_ID,
} from "../../types/ticket.type.js";
import {
  claimInstance,
  getInstanceByChannelId,
  setInstanceLocked,
  updateInstanceStatus,
} from "../../services/ticket/repo_ticket_instance.js";
import {
  buildClosedTicketButtons,
  buildOpenTicketButtons,
} from "../../services/ticket/ticket_panel_builder.js";
import { generateAndSendTranscript } from "../../services/ticket/ticket_transcript.js";
import { canManageTicket } from "../../services/ticket/ticket_permissions.js";
import { logger } from "../../services/logger/logger.js";

const MANAGE_IDS = new Set([
  TICKET_CLOSE_ID,
  TICKET_REOPEN_ID,
  TICKET_DELETE_ID,
  TICKET_TRANSCRIPT_ID,
  TICKET_DELETE_CONFIRM_ID,
  TICKET_CLAIM_ID,
  TICKET_LOCK_ID,
  TICKET_ADD_USER_ID,
  TICKET_REMOVE_USER_ID,
  TICKET_RENAME_ID,
]);

const MODAL_IDS = new Set([
  TICKET_CLOSE_MODAL_ID,
  TICKET_ADD_USER_MODAL_ID,
  TICKET_REMOVE_USER_MODAL_ID,
  TICKET_RENAME_MODAL_ID,
]);

export function registerTicketManageEvent(client: Client): void {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isButton() && MANAGE_IDS.has(interaction.customId)) {
      await handleButton(client, interaction);
      return;
    }
    if (interaction.isModalSubmit() && MODAL_IDS.has(interaction.customId)) {
      await handleModal(client, interaction);
    }
  });
}

function parseRoleIds(raw?: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return raw.split(/[,\s]+/);
  }
}

function hasAdminPermission(interaction: ButtonInteraction | ModalSubmitInteraction): boolean {
  const member = interaction.member as any;
  return Boolean(member?.permissions?.has?.(PermissionFlagsBits.Administrator));
}

function hasSupportRole(interaction: ButtonInteraction | ModalSubmitInteraction, instance: any): boolean {
  const member = interaction.member as any;
  const roleIds = parseRoleIds(instance?.config?.supportRoleIds).filter((id) => /^\d{15,25}$/.test(id));
  return roleIds.some((roleId) => member?.roles?.cache?.has?.(roleId));
}

async function requireAdmin(interaction: ButtonInteraction | ModalSubmitInteraction, instance?: any): Promise<boolean> {
  if (instance && canManageTicket(interaction, instance)) return true;
  await interaction.reply({ content: "❌ 只有管理員或支援角色可以操作票口管理功能。", flags: MessageFlags.Ephemeral });
  return false;
}

function parseUserId(input: string): string | null {
  const match = input.trim().match(/^(?:<@!?)?(\d{15,25})>?$/);
  return match?.[1] ?? null;
}

function textInput(customId: string, label: string, style: TextInputStyle, required = true): TextInputBuilder {
  return new TextInputBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(style)
    .setRequired(required);
}

async function closeTicket(
  client: Client,
  channel: TextChannel,
  interaction: ButtonInteraction | ModalSubmitInteraction,
  closeReason: string | null,
): Promise<void> {
  const instance = await getInstanceByChannelId(channel.id);
  if (!instance) throw new Error("Ticket instance not found");

  const creatorPerms = channel.permissionOverwrites.cache.get(instance.creatorId);
  if (creatorPerms) await creatorPerms.delete();

  const closeCategoryId = instance.buttonType?.categoryCloseId ?? instance.config.categoryCloseId;
  if (closeCategoryId) {
    await channel.setParent(closeCategoryId, { lockPermissions: false });
  }

  await updateInstanceStatus(channel.id, "CLOSED", new Date(), {
    closeReason,
    closedById: interaction.user.id,
    locked: true,
  });

  const closedEmbed = new EmbedBuilder()
    .setTitle("🔒 票口已關閉")
    .setDescription(`由 <@${interaction.user.id}> 關閉${closeReason ? `\n\n原因：${closeReason}` : ""}`)
    .setColor(0xed4245)
    .setTimestamp();

  await channel.send({
    embeds: [closedEmbed.toJSON()],
  });

  logger.info({ ticketNum: instance.ticketNum, closedBy: interaction.user.id }, "Ticket closed");

  if (interaction.deferred || interaction.replied) {
    await interaction.editReply("✅ 票口已關閉。");
  } else {
    await interaction.reply({ content: "✅ 票口已關閉。", flags: MessageFlags.Ephemeral });
  }

  void client;
}

async function handleButton(client: Client, interaction: ButtonInteraction): Promise<void> {
  const channel = interaction.channel as TextChannel | null;
  const instance = await getInstanceByChannelId(interaction.channelId);
  if (!instance || !channel) {
    await interaction.reply({ content: "❌ 此頻道不是票口。", flags: MessageFlags.Ephemeral });
    return;
  }

  switch (interaction.customId) {
    case TICKET_CLOSE_ID: {
      if (!(await requireAdmin(interaction, instance))) return;
      const modal = new ModalBuilder()
        .setCustomId(TICKET_CLOSE_MODAL_ID)
        .setTitle("關閉票口");
      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          textInput(TICKET_CLOSE_REASON_INPUT_ID, "關閉原因", TextInputStyle.Paragraph, false)
            .setPlaceholder("可留空，會寫入紀錄摘要。"),
        ),
      );
      await interaction.showModal(modal);
      break;
    }

    case TICKET_CLAIM_ID: {
      if (!(await requireAdmin(interaction, instance))) return;
      if (instance.claimedById && instance.claimedById !== interaction.user.id) {
        await interaction.reply({
          content: `❌ 此票口已由 <@${instance.claimedById}> 認領。`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const nextClaimedBy = instance.claimedById === interaction.user.id ? null : interaction.user.id;
      await claimInstance(channel.id, nextClaimedBy);
      await interaction.reply({
        content: nextClaimedBy ? `✅ 已由 <@${interaction.user.id}> 認領此票口。` : "✅ 已取消認領此票口。",
      });
      break;
    }

    case TICKET_LOCK_ID: {
      if (!(await requireAdmin(interaction, instance))) return;
      const nextLocked = !instance.locked;
      await channel.permissionOverwrites.edit(instance.creatorId, {
        SendMessages: !nextLocked,
        AttachFiles: !nextLocked,
      });
      await setInstanceLocked(channel.id, nextLocked);
      await interaction.reply(nextLocked ? "🔒 已鎖定票口，客人暫時不能發送訊息。" : "🔓 已解除鎖定，客人可以再次發送訊息。");
      break;
    }

    case TICKET_ADD_USER_ID:
    case TICKET_REMOVE_USER_ID: {
      if (!(await requireAdmin(interaction, instance))) return;
      const isAdd = interaction.customId === TICKET_ADD_USER_ID;
      const modal = new ModalBuilder()
        .setCustomId(isAdd ? TICKET_ADD_USER_MODAL_ID : TICKET_REMOVE_USER_MODAL_ID)
        .setTitle(isAdd ? "加入票口成員" : "移除票口成員");
      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          textInput(TICKET_USER_INPUT_ID, "使用者 ID 或 mention", TextInputStyle.Short)
            .setPlaceholder("例如：123456789012345678 或 @user"),
        ),
      );
      await interaction.showModal(modal);
      break;
    }

    case TICKET_RENAME_ID: {
      if (!(await requireAdmin(interaction, instance))) return;
      const modal = new ModalBuilder()
        .setCustomId(TICKET_RENAME_MODAL_ID)
        .setTitle("重新命名票口");
      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          textInput(TICKET_RENAME_INPUT_ID, "新的頻道名稱", TextInputStyle.Short)
            .setValue(channel.name.slice(0, 100)),
        ),
      );
      await interaction.showModal(modal);
      break;
    }

    case TICKET_REOPEN_ID: {
      if (!(await requireAdmin(interaction, instance))) return;
      await interaction.deferReply();

      await channel.permissionOverwrites.edit(instance.creatorId, {
        ViewChannel: true,
        SendMessages: true,
        AttachFiles: true,
      });

      const openCategoryId = instance.buttonType?.categoryOpenId ?? instance.config.categoryOpenId;
      if (openCategoryId) {
        await channel.setParent(openCategoryId, { lockPermissions: false });
      }

      await updateInstanceStatus(channel.id, "OPEN", undefined, {
        closeReason: null,
        closedById: null,
        locked: false,
      });

      const reopenEmbed = new EmbedBuilder()
        .setTitle("🔓 票口已重新開啟")
        .setDescription(`由 <@${interaction.user.id}> 重新開啟`)
        .setColor(0x57f287)
        .setTimestamp();

      await interaction.editReply({
        embeds: [reopenEmbed.toJSON()],
        components: buildOpenTicketButtons(),
      });
      break;
    }

    case TICKET_DELETE_ID: {
      if (!(await requireAdmin(interaction, instance))) return;
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
      if (!(await requireAdmin(interaction, instance))) return;
      await interaction.deferUpdate();
      await updateInstanceStatus(channel.id, "ARCHIVED");
      logger.info({ ticketNum: instance.ticketNum, deletedBy: interaction.user.id }, "Ticket deleted");
      await channel.delete("Ticket deleted by admin");
      break;
    }

    case TICKET_TRANSCRIPT_ID: {
      if (!(await requireAdmin(interaction, instance))) return;
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await generateAndSendTranscript(
        client,
        channel,
        {
          ticketNum: instance.ticketNum,
          creatorId: instance.creatorId,
          createdAt: instance.createdAt,
          closedAt: instance.closedAt,
          configId: instance.configId,
          status: instance.status,
          closeReason: instance.closeReason,
          closedById: instance.closedById,
          claimedById: instance.claimedById,
        },
        instance.config.transcriptTarget,
        instance.config.logChannelId,
        instance.config.transcriptLogMessage,
        instance.config.transcriptDmMessage,
      );
      await interaction.editReply("✅ 票口紀錄已產生並發送。");
      break;
    }
  }
}

async function handleModal(client: Client, interaction: ModalSubmitInteraction): Promise<void> {
  if (!interaction.channelId) {
    await interaction.reply({ content: "❌ 此操作必須在票口頻道內執行。", flags: MessageFlags.Ephemeral });
    return;
  }
  const channel = interaction.channel as TextChannel | null;
  const instance = await getInstanceByChannelId(interaction.channelId);
  if (!instance || !channel) {
    await interaction.reply({ content: "❌ 此頻道不是票口。", flags: MessageFlags.Ephemeral });
    return;
  }
  if (!(await requireAdmin(interaction, instance))) return;

  switch (interaction.customId) {
    case TICKET_CLOSE_MODAL_ID: {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const reason = interaction.fields.getTextInputValue(TICKET_CLOSE_REASON_INPUT_ID).trim() || null;
      await closeTicket(client, channel, interaction, reason);
      break;
    }

    case TICKET_ADD_USER_MODAL_ID:
    case TICKET_REMOVE_USER_MODAL_ID: {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const userId = parseUserId(interaction.fields.getTextInputValue(TICKET_USER_INPUT_ID));
      if (!userId) {
        await interaction.editReply("❌ 請輸入有效的使用者 ID 或 mention。");
        return;
      }

      if (interaction.customId === TICKET_ADD_USER_MODAL_ID) {
        await channel.permissionOverwrites.edit(userId, {
          ViewChannel: true,
          SendMessages: true,
          AttachFiles: true,
        });
        await interaction.editReply(`✅ 已將 <@${userId}> 加入票口。`);
      } else {
        if (userId === instance.creatorId) {
          await interaction.editReply("❌ 票口建立者請使用關閉或鎖定流程處理。");
          return;
        }
        await channel.permissionOverwrites.delete(userId).catch(() => {});
        await interaction.editReply(`✅ 已將 <@${userId}> 從票口移除。`);
      }
      break;
    }

    case TICKET_RENAME_MODAL_ID: {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const nextName = interaction.fields.getTextInputValue(TICKET_RENAME_INPUT_ID).trim().slice(0, 100);
      if (!nextName) {
        await interaction.editReply("❌ 頻道名稱不可為空。");
        return;
      }
      await channel.setName(nextName, `Ticket renamed by ${interaction.user.tag}`);
      await interaction.editReply(`✅ 票口已重新命名為 ${nextName}。`);
      break;
    }
  }
}
