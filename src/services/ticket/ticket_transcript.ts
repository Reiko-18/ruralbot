import {
  type Client,
  type TextChannel,
  type Message,
  type Collection,
  type Embed,
  type Sticker,
  ChannelType,
  EmbedBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ThreadAutoArchiveDuration,
} from "discord.js";
import { logger } from "../logger/logger.js";
import { getCachedBotConfig } from "../config/repo_bot_config.js";

const MAX_MESSAGES = 500;
const FETCH_BATCH = 100;

// ── Message fetching ──

async function fetchAllMessages(channel: TextChannel): Promise<Message[]> {
  const messages: Message[] = [];
  let lastId: string | undefined;

  while (messages.length < MAX_MESSAGES) {
    const batch: Collection<string, Message> = await channel.messages.fetch({
      limit: FETCH_BATCH,
      ...(lastId ? { before: lastId } : {}),
    });
    if (batch.size === 0) break;
    messages.push(...batch.values());
    lastId = batch.last()!.id;
    if (batch.size < FETCH_BATCH) break;
  }

  return messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
}

// ── HTML helpers ──

function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Convert Discord markdown + mentions + emoji to HTML.
 * Handles: custom emoji, animated emoji, user/role/channel mentions,
 * bold, italic, underline, strikethrough, inline code, code blocks, links, newlines.
 */
function renderContent(raw: string): string {
  let text = esc(raw);

  // Code blocks first (```lang\ncode```)
  text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_m, lang, code) =>
    `<pre style="background:#2f3136;border:1px solid #202225;border-radius:4px;padding:8px 12px;margin:4px 0;font-family:Consolas,monospace;font-size:14px;overflow-x:auto;white-space:pre;">${code}</pre>`);

  // Inline code
  text = text.replace(/`([^`]+)`/g, '<code style="background:#2f3136;padding:1px 4px;border-radius:3px;font-family:Consolas,monospace;font-size:14px;">$1</code>');

  // Custom emoji <:name:id> and <a:name:id>
  text = text.replace(/&lt;(a?):(\w+):(\d+)&gt;/g, (_m, animated, name, id) => {
    const ext = animated ? "gif" : "webp";
    return `<img src="https://cdn.discordapp.com/emojis/${id}.${ext}?size=48" alt=":${name}:" title=":${name}:" style="width:1.375em;height:1.375em;vertical-align:middle;margin:0 1px;">`;
  });

  // User mentions <@id> or <@!id>
  text = text.replace(/&lt;@!?(\d+)&gt;/g, '<span style="color:#dee0fc;background:#5865f24d;padding:0 2px;border-radius:3px;font-weight:500;">@user</span>');

  // Role mentions <@&id>
  text = text.replace(/&lt;@&amp;(\d+)&gt;/g, '<span style="color:#dee0fc;background:#5865f24d;padding:0 2px;border-radius:3px;font-weight:500;">@role</span>');

  // Channel mentions <#id>
  text = text.replace(/&lt;#(\d+)&gt;/g, '<span style="color:#dee0fc;background:#5865f24d;padding:0 2px;border-radius:3px;">#channel</span>');

  // Timestamp <t:timestamp:style>
  text = text.replace(/&lt;t:(\d+)(?::([tTdDfFR]))?&gt;/g, (_m, ts) => {
    const d = new Date(parseInt(ts) * 1000);
    return `<span style="color:#dee0fc;background:#3b3d44;padding:0 2px;border-radius:3px;">${d.toLocaleString("zh-TW")}</span>`;
  });

  // URLs (not already in href/src)
  text = text.replace(/(https?:\/\/[^\s<"]+)/g, '<a href="$1" style="color:#00aff4;text-decoration:none;" target="_blank">$1</a>');

  // Markdown: bold, italic, underline, strikethrough
  text = text.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
  text = text.replace(/__(.+?)__/g, '<u>$1</u>');
  text = text.replace(/~~(.+?)~~/g, '<s>$1</s>');

  // Newlines
  text = text.replace(/\n/g, "<br>");

  return text;
}

function renderAttachments(msg: Message): string {
  let html = "";
  for (const att of msg.attachments.values()) {
    const url = esc(att.url);
    const name = esc(att.name ?? "attachment");
    if (att.contentType?.startsWith("image/")) {
      html += `<div style="margin-top:4px;"><img src="${url}" alt="${name}" style="max-width:400px;max-height:300px;border-radius:8px;cursor:pointer;" onclick="window.open('${url}')"></div>`;
    } else if (att.contentType?.startsWith("video/")) {
      html += `<div style="margin-top:4px;"><video src="${url}" controls style="max-width:400px;border-radius:8px;"></video></div>`;
    } else if (att.contentType?.startsWith("audio/")) {
      html += `<div style="margin-top:4px;"><audio src="${url}" controls></audio></div>`;
    } else {
      html += `<div style="margin-top:4px;background:#2f3136;border:1px solid #202225;border-radius:8px;padding:8px 12px;display:inline-flex;align-items:center;gap:8px;">
        <span style="font-size:20px;">📎</span>
        <a href="${url}" style="color:#00aff4;text-decoration:none;" target="_blank">${name}</a>
        <span style="color:#72767d;font-size:12px;">${att.size ? (att.size / 1024).toFixed(1) + " KB" : ""}</span>
      </div>`;
    }
  }
  return html;
}

function renderStickers(msg: Message): string {
  let html = "";
  for (const sticker of msg.stickers.values()) {
    const stickerUrl = getStickerUrl(sticker);
    if (stickerUrl) {
      html += `<div style="margin-top:4px;"><img src="${stickerUrl}" alt="${esc(sticker.name)}" title="${esc(sticker.name)}" style="width:160px;height:160px;object-fit:contain;"></div>`;
    } else {
      html += `<div style="margin-top:4px;color:#72767d;font-style:italic;">[貼圖: ${esc(sticker.name)}]</div>`;
    }
  }
  return html;
}

function getStickerUrl(sticker: Sticker): string | null {
  // Sticker formats: PNG=1, APNG=2, LOTTIE=3, GIF=4
  const format = sticker.format;
  if (format === 3) return null; // Lottie not renderable in HTML
  const ext = format === 4 ? "gif" : "png";
  return `https://media.discordapp.net/stickers/${sticker.id}.${ext}?size=160`;
}

function renderEmbed(embed: Embed): string {
  const borderColor = embed.color ? `#${embed.color.toString(16).padStart(6, "0")}` : "#202225";
  let html = `<div style="border-left:4px solid ${borderColor};background:#2f3136;border-radius:4px;padding:12px 16px;margin-top:4px;max-width:520px;">`;

  // Author
  if (embed.author) {
    html += `<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">`;
    if (embed.author.iconURL) html += `<img src="${esc(embed.author.iconURL)}" style="width:20px;height:20px;border-radius:50%;">`;
    html += `<span style="font-size:13px;font-weight:600;color:#fff;">${esc(embed.author.name ?? "")}</span>`;
    html += `</div>`;
  }

  // Title
  if (embed.title) {
    const titleContent = embed.url
      ? `<a href="${esc(embed.url)}" style="color:#00aff4;text-decoration:none;font-weight:bold;">${esc(embed.title)}</a>`
      : `<span style="font-weight:bold;color:#fff;">${esc(embed.title)}</span>`;
    html += `<div style="margin-bottom:4px;">${titleContent}</div>`;
  }

  // Description
  if (embed.description) {
    html += `<div style="color:#dcddde;font-size:14px;margin-bottom:8px;white-space:pre-wrap;">${renderContent(embed.description)}</div>`;
  }

  // Fields
  if (embed.fields.length > 0) {
    html += `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:8px;">`;
    for (const field of embed.fields) {
      const span = field.inline ? "" : "grid-column:1/-1;";
      html += `<div style="${span}">
        <div style="font-size:13px;font-weight:600;color:#fff;margin-bottom:2px;">${esc(field.name)}</div>
        <div style="font-size:14px;color:#dcddde;">${renderContent(field.value)}</div>
      </div>`;
    }
    html += `</div>`;
  }

  // Image
  if (embed.image) {
    html += `<div style="margin-top:8px;"><img src="${esc(embed.image.url)}" style="max-width:100%;border-radius:4px;"></div>`;
  }

  // Thumbnail
  if (embed.thumbnail) {
    html += `<div style="position:absolute;top:12px;right:16px;"><img src="${esc(embed.thumbnail.url)}" style="width:80px;height:80px;border-radius:4px;object-fit:cover;"></div>`;
  }

  // Footer
  if (embed.footer || embed.timestamp) {
    html += `<div style="display:flex;align-items:center;gap:6px;margin-top:8px;">`;
    if (embed.footer?.iconURL) html += `<img src="${esc(embed.footer.iconURL)}" style="width:16px;height:16px;border-radius:50%;">`;
    const parts: string[] = [];
    if (embed.footer?.text) parts.push(esc(embed.footer.text));
    if (embed.timestamp) parts.push(new Date(embed.timestamp).toLocaleString("zh-TW"));
    html += `<span style="font-size:12px;color:#72767d;">${parts.join(" • ")}</span>`;
    html += `</div>`;
  }

  html += `</div>`;
  return html;
}

function renderReply(msg: Message, allMessages: Message[]): string {
  if (!msg.reference?.messageId) return "";
  const refMsg = allMessages.find((m) => m.id === msg.reference!.messageId);
  if (!refMsg) {
    return `<div style="display:flex;align-items:center;gap:6px;color:#72767d;font-size:12px;margin-bottom:2px;padding-left:16px;border-left:2px solid #4f545c;">↩ 回覆訊息（已刪除）</div>`;
  }
  const avatar = refMsg.author.displayAvatarURL({ size: 16 });
  const name = esc(refMsg.author.displayName ?? refMsg.author.username);
  const preview = esc((refMsg.content || "[附件/嵌入]").slice(0, 80));
  return `<div style="display:flex;align-items:center;gap:6px;color:#72767d;font-size:12px;margin-bottom:2px;padding-left:4px;">
    <img src="${avatar}" style="width:16px;height:16px;border-radius:50%;">
    <span style="font-weight:500;color:#b5bac1;">@${name}</span>
    <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${preview}</span>
  </div>`;
}

function renderMessageHtml(msg: Message, allMessages: Message[]): string {
  const avatar = msg.author.displayAvatarURL({ size: 32 });
  const name = esc(msg.author.displayName ?? msg.author.username);
  const time = msg.createdAt.toLocaleString("zh-TW");
  const isBot = msg.author.bot;
  const botBadge = isBot ? `<span style="background:#5865f2;color:#fff;font-size:10px;padding:1px 4px;border-radius:3px;margin-left:4px;vertical-align:middle;">BOT</span>` : "";

  const replyHtml = renderReply(msg, allMessages);
  const contentHtml = msg.content ? renderContent(msg.content) : "";
  const attachHtml = renderAttachments(msg);
  const stickerHtml = renderStickers(msg);
  const embedsHtml = msg.embeds.map(renderEmbed).join("");

  // System messages (join, pin, etc.)
  if (msg.type !== 0 && msg.type !== 19 && !msg.content && msg.embeds.length === 0) {
    return ""; // Skip system messages without content
  }

  return `
    <div class="msg" style="display:flex;gap:16px;padding:2px 48px 2px 16px;margin-top:1.0625rem;position:relative;">
      <img src="${avatar}" style="width:40px;height:40px;border-radius:50%;flex-shrink:0;cursor:pointer;margin-top:2px;">
      <div style="flex:1;min-width:0;overflow:hidden;">
        ${replyHtml}
        <div style="display:flex;align-items:center;gap:4px;">
          <span style="font-weight:500;color:#f2f3f5;cursor:pointer;">${name}</span>${botBadge}
          <span style="font-size:12px;color:#949ba4;margin-left:4px;">${time}</span>
        </div>
        ${contentHtml ? `<div style="color:#dbdee1;white-space:pre-wrap;word-break:break-word;line-height:1.375;">${contentHtml}</div>` : ""}
        ${attachHtml}
        ${stickerHtml}
        ${embedsHtml}
      </div>
    </div>`;
}

export function generateTranscriptHtml(
  messages: Message[],
  channelName: string,
  guildName: string,
  guildIconUrl: string | null,
): string {
  const messagesHtml = messages.map((m) => renderMessageHtml(m, messages)).join("\n");
  const exportTime = new Date().toLocaleString("zh-TW");
  const iconHtml = guildIconUrl
    ? `<img src="${esc(guildIconUrl)}" style="width:24px;height:24px;border-radius:50%;margin-right:8px;">`
    : "";

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(channelName)} - 票口紀錄</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#313338; color:#dbdee1; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",sans-serif; font-size:16px; line-height:1.375; }
  .header { background:#2b2d31; padding:16px 20px; border-bottom:1px solid #1e1f22; display:flex; align-items:center; justify-content:space-between; }
  .header-left { display:flex; align-items:center; }
  .header h1 { color:#f2f3f5; font-size:16px; font-weight:600; }
  .header p { color:#949ba4; font-size:12px; margin-top:2px; }
  .messages { padding:16px 0; }
  .msg:hover { background:#2e3035; }
  a { color:#00a8fc; }
  a:hover { text-decoration:underline; }
  .divider { display:flex; align-items:center; margin:8px 16px; color:#949ba4; font-size:12px; font-weight:600; }
  .divider::before, .divider::after { content:""; flex:1; border-top:1px solid #3f4147; }
  .divider::before { margin-right:8px; }
  .divider::after { margin-left:8px; }
</style>
</head>
<body>
<div class="header">
  <div class="header-left">
    ${iconHtml}
    <div>
      <h1># ${esc(channelName)}</h1>
      <p>${esc(guildName)} — ${messages.length} 則訊息</p>
    </div>
  </div>
  <div style="color:#949ba4;font-size:12px;">匯出於 ${exportTime}</div>
</div>
<div class="messages">
${messagesHtml}
</div>
</body>
</html>`;
}

// ── Thread & distribution ──

async function getOrCreateThread(channel: TextChannel, name: string) {
  const active = await channel.threads.fetchActive();
  let thread = active.threads.find((t) => t.name === name);
  if (thread) return thread;

  const archived = await channel.threads.fetchArchived({ type: "public" });
  thread = archived.threads.find((t) => t.name === name);
  if (thread) {
    await thread.setArchived(false);
    return thread;
  }

  return channel.threads.create({
    name,
    autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
    type: ChannelType.PublicThread,
    reason: `票口紀錄 - ${name}`,
  });
}

export async function generateAndSendTranscript(
  client: Client,
  channel: TextChannel,
  ticket: {
    ticketNum: number;
    creatorId: string;
    createdAt: Date;
    closedAt: Date | null;
    configId: string;
    status: string;
  },
  transcriptTarget: string,
  localLogChannelId: string | null,
  transcriptLogMessage?: string | null,
  transcriptDmMessage?: string | null,
): Promise<void> {
  const messages = await fetchAllMessages(channel);
  if (messages.length === 0) {
    logger.warn({ channelId: channel.id }, "No messages found for transcript");
    return;
  }

  const guildIconUrl = channel.guild.iconURL({ size: 64 });
  const html = generateTranscriptHtml(messages, channel.name, channel.guild.name, guildIconUrl);
  const buffer = Buffer.from(html, "utf-8");
  const fileName = `${channel.name}.html`;
  const threadName = `票口紀錄-${new Date().toISOString().slice(0, 7)}`;
  const ticketLabel = `票口 #${String(ticket.ticketNum).padStart(4, "0")}`;

  // ── DM to creator: embed + HTML file + view button ──
  try {
    const user = await client.users.fetch(ticket.creatorId);
    const dmDesc = transcriptDmMessage || "以下是您的票口對話紀錄，點擊下方按鈕即可在瀏覽器中查看完整內容（含圖片、貼圖、連結等）。";
    const dmEmbed = new EmbedBuilder()
      .setTitle(`📜 ${ticketLabel} 對話紀錄`)
      .setDescription(dmDesc)
      .setColor(0xf9b4fe)
      .setTimestamp();
    const dmMsg = await user.send({
      embeds: [dmEmbed.toJSON()],
      files: [new AttachmentBuilder(buffer, { name: fileName })],
    });
    // Add view button with the attachment CDN URL
    const attachUrl = dmMsg.attachments.first()?.url;
    if (attachUrl) {
      const viewButton = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("📄 點擊查看對話紀錄").setURL(attachUrl),
      );
      await dmMsg.edit({ components: [viewButton] });
    }
  } catch (err) {
    logger.warn({ err, creatorId: ticket.creatorId }, "Failed to DM transcript to creator");
  }

  // ── Send to log channel thread: summary embed + HTML file ──
  const sendToThread = async (logChannelId: string) => {
    try {
      const logChannel = await client.channels.fetch(logChannelId);
      if (!logChannel || logChannel.type !== ChannelType.GuildText) return;

      const thread = await getOrCreateThread(logChannel as TextChannel, threadName);

      const logDesc = transcriptLogMessage || null;
      const summaryEmbed = new EmbedBuilder()
        .setTitle(`📜 ${ticketLabel} 對話紀錄`)
        .setColor(0xf9b4fe);
      if (logDesc) summaryEmbed.setDescription(logDesc);
      summaryEmbed.addFields(
          { name: "創建者", value: `<@${ticket.creatorId}>`, inline: true },
          { name: "訊息數", value: `${messages.length}`, inline: true },
          { name: "狀態", value: ticket.status, inline: true },
          { name: "開單時間", value: ticket.createdAt.toLocaleString("zh-TW"), inline: true },
          { name: "關閉時間", value: ticket.closedAt?.toLocaleString("zh-TW") ?? "尚未關閉", inline: true },
        )
        .setFooter({ text: "下載 HTML 檔案以瀏覽器開啟可查看完整對話紀錄（含圖片、貼圖、Emoji、連結）" })
        .setTimestamp();

      const threadMsg = await thread.send({
        embeds: [summaryEmbed.toJSON()],
        files: [new AttachmentBuilder(buffer, { name: fileName })],
      });
      // Add view button with the attachment CDN URL
      const attachUrl = threadMsg.attachments.first()?.url;
      if (attachUrl) {
        const viewButton = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("📄 點擊查看對話紀錄").setURL(attachUrl),
        );
        await threadMsg.edit({ components: [viewButton] });
      }
    } catch (err) {
      logger.warn({ err, logChannelId }, "Failed to send transcript to log channel thread");
    }
  };

  // Send to local log channel
  if ((transcriptTarget === "local" || transcriptTarget === "both") && localLogChannelId) {
    await sendToThread(localLogChannelId);
  }

  // Send to primary guild log channel
  if (transcriptTarget === "primary" || transcriptTarget === "both") {
    const botConfig = getCachedBotConfig();
    if (botConfig?.ticketLogChannelId) {
      await sendToThread(botConfig.ticketLogChannelId);
    }
  }

  logger.info({ channelId: channel.id, ticketNum: ticket.ticketNum, messageCount: messages.length }, "Transcript generated and sent");
}
