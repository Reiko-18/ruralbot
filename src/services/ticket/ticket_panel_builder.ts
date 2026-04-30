import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  type APIEmbed,
} from "discord.js";
import type { TicketButtonType, TicketConfig } from "../../prisma/generated/prisma/client.js";
import type { TicketEmbedSettings } from "../../types/ticket.type.js";
import {
  TICKET_BUTTON_PREFIX,
  TICKET_SELECT_ID,
  TICKET_CLOSE_ID,
  TICKET_REOPEN_ID,
  TICKET_DELETE_ID,
  TICKET_TRANSCRIPT_ID,
  TICKET_CLAIM_ID,
  TICKET_LOCK_ID,
  TICKET_ADD_USER_ID,
  TICKET_REMOVE_USER_ID,
  TICKET_RENAME_ID,
} from "../../types/ticket.type.js";

const BUTTON_STYLE_MAP: Record<string, ButtonStyle> = {
  PRIMARY: ButtonStyle.Primary,
  SECONDARY: ButtonStyle.Secondary,
  SUCCESS: ButtonStyle.Success,
  DANGER: ButtonStyle.Danger,
};

export function buildPanelEmbed(config: TicketConfig): APIEmbed {
  if (config.panelEmbed) {
    try {
      const parsed = JSON.parse(config.panelEmbed) as TicketEmbedSettings & {
        title?: string;
        description?: string;
        imageUrl?: string;
      };
      const embed = new EmbedBuilder()
        .setTitle(parsed.title ?? "🎫 客服中心")
        .setDescription(parsed.description ?? "請選擇下方按鈕開啟票口")
        .setColor(parsed.color ? parseInt(parsed.color.replace("#", ""), 16) : 0xf9b4fe);
      if (parsed.authorName) embed.setAuthor({ name: parsed.authorName, iconURL: parsed.authorIconUrl ?? undefined });
      if (parsed.thumbnailUrl) embed.setThumbnail(parsed.thumbnailUrl);
      if (parsed.imageUrl) embed.setImage(parsed.imageUrl);
      if (parsed.footerText) embed.setFooter({ text: parsed.footerText, iconURL: parsed.footerIconUrl ?? undefined });
      if (parsed.showTimestamp) embed.setTimestamp();
      return embed.toJSON();
    } catch {
      // Fall through to default
    }
  }

  return new EmbedBuilder()
    .setTitle("🎫 客服中心")
    .setDescription("請選擇下方按鈕開啟票口")
    .setColor(0xf9b4fe)
    .toJSON();
}

export function buildPanelButtons(
  buttonTypes: TicketButtonType[],
): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  // Discord allows max 5 buttons per row
  for (let i = 0; i < Math.min(buttonTypes.length, 25); i += 5) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    const slice = buttonTypes.slice(i, i + 5);
    for (const bt of slice) {
      const button = new ButtonBuilder()
        .setCustomId(`${TICKET_BUTTON_PREFIX}${bt.id}`)
        .setLabel(bt.label)
        .setStyle(BUTTON_STYLE_MAP[bt.style] ?? ButtonStyle.Primary);
      if (bt.emoji) button.setEmoji(bt.emoji);
      row.addComponents(button);
    }
    rows.push(row);
  }
  return rows;
}

export function buildPanelComponents(
  config: TicketConfig,
  buttonTypes: TicketButtonType[],
): ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] {
  if (config.panelComponentType === "select") {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(TICKET_SELECT_ID)
      .setPlaceholder("請選擇票口類型")
      .addOptions(
        buttonTypes.slice(0, 25).map((bt) => ({
          label: bt.label,
          value: bt.id,
          emoji: bt.emoji ?? undefined,
        })),
      );
    return [new ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>().addComponents(menu)];
  }

  return buildPanelButtons(buttonTypes);
}

export function buildWelcomeEmbed(
  ticketNum: number,
  creatorId: string,
  welcomeMessage: string | null,
  embedSettingsJson: string | null,
): APIEmbed {
  const description = welcomeMessage ?? "感謝您的來信！請描述您的問題，我們會盡快為您處理。";

  const embed = new EmbedBuilder()
    .setTitle(`🎫 票口 #${String(ticketNum).padStart(4, "0")}`)
    .setDescription(`${description}\n\n<@${creatorId}>`)
    .setColor(0xf9b4fe)
    .setTimestamp();

  if (embedSettingsJson) {
    try {
      const settings = JSON.parse(embedSettingsJson) as TicketEmbedSettings;
      if (settings.color) embed.setColor(parseInt(settings.color.replace("#", ""), 16));
      if (settings.footerText) embed.setFooter({ text: settings.footerText });
    } catch {
      // Use defaults
    }
  }

  return embed.toJSON();
}

export function buildOpenTicketButtons(): ActionRowBuilder<ButtonBuilder>[] {
  const mainRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(TICKET_CLOSE_ID).setLabel("關閉票口").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(TICKET_CLAIM_ID).setLabel("認領").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(TICKET_LOCK_ID).setLabel("鎖定/解鎖").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(TICKET_TRANSCRIPT_ID).setLabel("發送紀錄").setStyle(ButtonStyle.Secondary),
  );
  const memberRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(TICKET_ADD_USER_ID).setLabel("加入成員").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(TICKET_REMOVE_USER_ID).setLabel("移除成員").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(TICKET_RENAME_ID).setLabel("重新命名").setStyle(ButtonStyle.Secondary),
  );
  return [mainRow, memberRow];
}

export function buildClosedTicketButtons(): ActionRowBuilder<ButtonBuilder>[] {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(TICKET_REOPEN_ID).setLabel("重新開啟").setEmoji("🔓").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(TICKET_DELETE_ID).setLabel("刪除票口").setEmoji("⛔").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(TICKET_TRANSCRIPT_ID).setLabel("存檔紀錄").setEmoji("📜").setStyle(ButtonStyle.Secondary),
  );
  return [row];
}
