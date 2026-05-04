import {
  type Client,
  Events,
  ChannelType,
  PermissionFlagsBits,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  type ButtonInteraction,
  type StringSelectMenuInteraction,
  type ModalSubmitInteraction,
} from "discord.js";
import {
  TICKET_BUTTON_PREFIX,
  TICKET_CREATE_MODAL_PREFIX,
  TICKET_CREATE_QUESTION_PREFIX,
  TICKET_SELECT_ID,
  type TicketFormAnswer,
  type TicketQuestion,
} from "../../types/ticket.type.js";
import { getTicketConfig, incrementTicketNum } from "../../services/ticket/repo_ticket_config.js";
import { getButtonTypeById } from "../../services/ticket/repo_ticket_button_type.js";
import { isBlacklisted } from "../../services/ticket/repo_ticket_blacklist.js";
import {
  countOpenInstancesForUser,
  createInstance,
  getLatestInstanceForUser,
} from "../../services/ticket/repo_ticket_instance.js";
import {
  buildWelcomeEmbed,
  buildOpenTicketButtons,
} from "../../services/ticket/ticket_panel_builder.js";
import { logger } from "../../services/logger/logger.js";

export function registerTicketButtonEvent(client: Client): void {
  client.on(Events.InteractionCreate, async (interaction) => {
    const isTicketButton = interaction.isButton() && interaction.customId.startsWith(TICKET_BUTTON_PREFIX);
    const isTicketSelect = interaction.isStringSelectMenu() && interaction.customId === TICKET_SELECT_ID;
    const isTicketModal = interaction.isModalSubmit() && interaction.customId.startsWith(TICKET_CREATE_MODAL_PREFIX);
    if (!isTicketButton && !isTicketSelect && !isTicketModal) return;

    const buttonTypeId = interaction.isModalSubmit()
      ? interaction.customId.slice(TICKET_CREATE_MODAL_PREFIX.length)
      : interaction.isStringSelectMenu()
      ? interaction.values[0]
      : interaction.customId.slice(TICKET_BUTTON_PREFIX.length);
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

      const buttonType = await getButtonTypeById(buttonTypeId);
      if (!buttonType) {
        await interaction.reply({ content: "❌ 找不到此票口類型。", flags: MessageFlags.Ephemeral });
        return;
      }

      const answers = interaction.isModalSubmit() ? collectModalAnswers(interaction, buttonType.questions) : [];
      const limitResult = await checkTicketLimits(config, buttonType, interaction.user.id);
      if (limitResult) {
        await interaction.reply({ content: limitResult, flags: MessageFlags.Ephemeral });
        return;
      }

      const questions = parseQuestions(buttonType.questions);
      if (!interaction.isModalSubmit() && questions.length > 0) {
        await interaction.showModal(buildTicketModal(buttonType.id, buttonType.label, questions));
        return;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const categoryId = buttonType?.categoryOpenId ?? config.categoryOpenId;
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
      const formattedNum = String(ticketNum).padStart(4, "0");
      const now = new Date();
      const dateStr = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const typeLabel = buttonType?.label ?? "票口";
      const channelName = formatChannelName(config.channelNameFormat, {
        number: formattedNum,
        type: typeLabel,
        username: interaction.user.username,
        userId: interaction.user.id,
        date: dateStr,
      });

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
      const roleIds = uniqueRoleIds([
        ...parseRoleIds(config.supportRoleIds),
        ...parseRoleIds(buttonType.notifyRoleIds),
      ]);
      for (const roleId of roleIds) {
        permissionOverwrites.push({
          id: roleId,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
        });
      }

      const ticketChannel = await interaction.guild!.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: categoryId,
        topic: `票口資訊：\n${formattedNum}｜${dateStr}｜${typeLabel}｜${interaction.user.username} / ${interaction.user.id}`,
        permissionOverwrites,
      });

      // Send welcome embed + management buttons
      const answerSummary = formatAnswerSummary(answers);
      const welcomeMessage = [buttonType?.welcomeMessage ?? config.defaultMessage, answerSummary]
        .filter(Boolean)
        .join("\n\n");
      const embedSettings = buttonType?.embedSettings ?? null;
      const welcomeEmbed = buildWelcomeEmbed(ticketNum, interaction.user.id, welcomeMessage || null, embedSettings);
      const buttons = buildOpenTicketButtons();

      // Build mentions
      let mentionContent = `<@${interaction.user.id}>`;
      if (roleIds.length > 0) {
        mentionContent += " " + roleIds.map((id) => `<@&${id}>`).join(" ");
      }

      const welcomeMsg = await ticketChannel.send({
        content: mentionContent,
        embeds: [welcomeEmbed],
        components: buttons,
      });

      // Pin the welcome message
      await welcomeMsg.pin().catch(() => { /* Missing permission, skip */ });

      // Create DB record
      await createInstance({
        configId: config.id,
        buttonTypeId: buttonType?.id,
        channelId: ticketChannel.id,
        creatorId: interaction.user.id,
        ticketNum,
        formAnswers: answers.length > 0 ? JSON.stringify(answers) : undefined,
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

function parseQuestions(raw?: string | null): TicketQuestion[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as TicketQuestion[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((q) => q?.label && typeof q.label === "string")
      .slice(0, 5)
      .map((q) => ({
        label: q.label.slice(0, 45),
        placeholder: q.placeholder?.slice(0, 100),
        required: q.required !== false,
        style: q.style === "paragraph" ? "paragraph" : "short",
        maxLength: Math.min(Math.max(q.maxLength ?? 200, 1), q.style === "paragraph" ? 1000 : 200),
      }));
  } catch {
    return [];
  }
}

function buildTicketModal(buttonTypeId: string, label: string, questions: TicketQuestion[]): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(`${TICKET_CREATE_MODAL_PREFIX}${buttonTypeId}`)
    .setTitle(`${label.slice(0, 32)} 表單`);

  for (const [index, question] of questions.entries()) {
    const input = new TextInputBuilder()
      .setCustomId(`${TICKET_CREATE_QUESTION_PREFIX}${index}`)
      .setLabel(question.label)
      .setRequired(question.required ?? true)
      .setMaxLength(question.maxLength ?? 200)
      .setStyle(question.style === "paragraph" ? TextInputStyle.Paragraph : TextInputStyle.Short);
    if (question.placeholder) input.setPlaceholder(question.placeholder);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  }

  return modal;
}

function collectModalAnswers(interaction: ModalSubmitInteraction, rawQuestions?: string | null): TicketFormAnswer[] {
  const questions = parseQuestions(rawQuestions);
  return questions.map((question, index) => ({
    label: question.label,
    value: interaction.fields.getTextInputValue(`${TICKET_CREATE_QUESTION_PREFIX}${index}`).trim() || "未填寫",
  }));
}

function formatAnswerSummary(answers: TicketFormAnswer[]): string {
  if (answers.length === 0) return "";
  return [
    "## 開票表單",
    ...answers.map((answer) => `**${answer.label}**\n${answer.value}`),
  ].join("\n\n");
}

function parseRoleIds(raw?: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed.filter((id) => /^\d{15,25}$/.test(id)) : [];
  } catch {
    return raw.split(/[,\s]+/).filter((id) => /^\d{15,25}$/.test(id));
  }
}

function uniqueRoleIds(ids: string[]): string[] {
  return [...new Set(ids)];
}

async function checkTicketLimits(config: any, buttonType: any, userId: string): Promise<string | null> {
  const maxOpen = buttonType.maxOpenPerUser ?? config.maxOpenPerUser;
  if (maxOpen && maxOpen > 0) {
    const openCount = await countOpenInstancesForUser(config.id, userId, buttonType.id);
    if (openCount >= maxOpen) {
      return `❌ 您已達此票口類型的開啟上限 (${maxOpen})。`;
    }
  }

  const cooldown = buttonType.cooldownSeconds ?? config.openCooldownSeconds;
  if (cooldown && cooldown > 0) {
    const latest = await getLatestInstanceForUser(config.id, userId, buttonType.id);
    if (latest) {
      const remaining = cooldown - Math.floor((Date.now() - latest.createdAt.getTime()) / 1000);
      if (remaining > 0) {
        return `❌ 請等待 ${remaining} 秒後再開啟新的同類型票口。`;
      }
    }
  }

  return null;
}

function formatChannelName(
  template: string | null | undefined,
  values: { number: string; type: string; username: string; userId: string; date: string },
): string {
  const raw = (template || "{type}➤{number}｜{date}")
    .replaceAll("{number}", values.number)
    .replaceAll("{type}", values.type)
    .replaceAll("{username}", values.username)
    .replaceAll("{userId}", values.userId)
    .replaceAll("{date}", values.date);

  const formatted = raw
    .toLowerCase()
    .replace(/[\s#:@]/g, "-")
    .replace(/[^\p{L}\p{N}\-｜➤_]/gu, "")
    .slice(0, 100);
  return formatted || `ticket-${values.number}`;
}
