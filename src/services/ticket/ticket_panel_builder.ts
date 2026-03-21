import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type APIEmbed,
} from "discord.js";
import type { TicketButtonType, TicketConfig } from "../../prisma/generated/prisma/client.js";
import type { TicketEmbedSettings } from "../../types/ticket.type.js";
import {
  TICKET_BUTTON_PREFIX,
  TICKET_CLOSE_ID,
  TICKET_REOPEN_ID,
  TICKET_DELETE_ID,
  TICKET_TRANSCRIPT_ID,
  TICKET_LINK_ORDER_ID,
  TICKET_CREATE_ORDER_ID,
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
  for (let i = 0; i < buttonTypes.length; i += 5) {
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
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(TICKET_CLOSE_ID).setLabel("關閉票口").setEmoji("🔒").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(TICKET_LINK_ORDER_ID).setLabel("連結訂單").setEmoji("🔗").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(TICKET_CREATE_ORDER_ID).setLabel("建立訂單").setEmoji("🛒").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(TICKET_TRANSCRIPT_ID).setLabel("存檔紀錄").setEmoji("📜").setStyle(ButtonStyle.Secondary),
  );
  return [row1];
}

export function buildClosedTicketButtons(): ActionRowBuilder<ButtonBuilder>[] {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(TICKET_REOPEN_ID).setLabel("重新開啟").setEmoji("🔓").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(TICKET_DELETE_ID).setLabel("刪除票口").setEmoji("⛔").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(TICKET_TRANSCRIPT_ID).setLabel("存檔紀錄").setEmoji("📜").setStyle(ButtonStyle.Secondary),
  );
  return [row];
}
