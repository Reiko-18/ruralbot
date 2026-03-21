import {
  type Client,
  type TextChannel,
  type Message,
  type Collection,
  ChannelType,
  EmbedBuilder,
  AttachmentBuilder,
  ThreadAutoArchiveDuration,
} from "discord.js";
import { logger } from "../logger/logger.js";
import { getCachedBotConfig } from "../config/repo_bot_config.js";

const MAX_MESSAGES = 500;
const FETCH_BATCH = 100;
/** Discord message content limit */
const MSG_LIMIT = 2000;

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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderMessage(msg: Message): string {
  const avatar = msg.author.displayAvatarURL({ size: 32 });
  const name = escapeHtml(msg.author.displayName ?? msg.author.username);
  const time = msg.createdAt.toISOString().replace("T", " ").slice(0, 19);
  const content = escapeHtml(msg.content || "");

  let attachmentsHtml = "";
  for (const att of msg.attachments.values()) {
    if (att.contentType?.startsWith("image/")) {
      attachmentsHtml += `<div class="attachment"><img src="${escapeHtml(att.url)}" alt="attachment" style="max-width:400px;border-radius:4px;margin-top:4px;"></div>`;
    } else {
      attachmentsHtml += `<div class="attachment"><a href="${escapeHtml(att.url)}" style="color:#00aff4;">${escapeHtml(att.name ?? "attachment")}</a></div>`;
    }
  }

  let embedsHtml = "";
  for (const embed of msg.embeds) {
    const color = embed.color ? `border-left:3px solid #${embed.color.toString(16).padStart(6, "0")};` : "";
    embedsHtml += `<div class="embed" style="${color}padding:8px 12px;background:#2f3136;border-radius:4px;margin-top:4px;">`;
    if (embed.title) embedsHtml += `<div style="font-weight:bold;color:#fff;">${escapeHtml(embed.title)}</div>`;
    if (embed.description) embedsHtml += `<div style="color:#dcddde;font-size:14px;margin-top:4px;">${escapeHtml(embed.description)}</div>`;
    embedsHtml += `</div>`;
  }

  let replyHtml = "";
  if (msg.reference?.messageId) {
    replyHtml = `<div class="reply" style="color:#72767d;font-size:12px;margin-bottom:2px;padding-left:16px;border-left:2px solid #4f545c;">↩ 回覆訊息</div>`;
  }

  return `
    <div class="message" style="display:flex;gap:12px;padding:4px 16px;margin:2px 0;">
      <img src="${avatar}" style="width:32px;height:32px;border-radius:50%;flex-shrink:0;margin-top:2px;">
      <div style="flex:1;min-width:0;">
        ${replyHtml}
        <div style="display:flex;align-items:baseline;gap:8px;">
          <span style="font-weight:500;color:#fff;">${name}</span>
          <span style="font-size:11px;color:#72767d;">${time}</span>
        </div>
        <div style="color:#dcddde;white-space:pre-wrap;word-break:break-word;">${content}</div>
        ${attachmentsHtml}
        ${embedsHtml}
      </div>
    </div>`;
}

export function generateTranscriptHtml(
  messages: Message[],
  channelName: string,
  guildName: string,
): string {
  const messagesHtml = messages.map(renderMessage).join("\n");

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(channelName)} - 票口紀錄</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#36393f; color:#dcddde; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; font-size:15px; }
  .header { background:#2f3136; padding:16px 20px; border-bottom:1px solid #202225; }
  .header h1 { color:#fff; font-size:16px; font-weight:600; }
  .header p { color:#72767d; font-size:12px; margin-top:4px; }
  .messages { padding:8px 0; }
  .message:hover { background:#32353b; }
</style>
</head>
<body>
<div class="header">
  <h1># ${escapeHtml(channelName)}</h1>
  <p>${escapeHtml(guildName)} — ${messages.length} 則訊息 — 匯出於 ${new Date().toISOString().replace("T", " ").slice(0, 19)}</p>
</div>
<div class="messages">
${messagesHtml}
</div>
</body>
</html>`;
}

/**
 * Format a single message as plain text for thread display.
 * Format: `[HH:MM] username: content`
 */
function formatMessageText(msg: Message): string {
  const time = msg.createdAt.toISOString().replace("T", " ").slice(11, 16);
  const name = msg.author.displayName ?? msg.author.username;
  let line = `[${time}] ${name}`;

  if (msg.content) {
    line += `: ${msg.content}`;
  }

  for (const att of msg.attachments.values()) {
    line += `\n  📎 ${att.name ?? "attachment"}: ${att.url}`;
  }

  for (const embed of msg.embeds) {
    if (embed.title) line += `\n  📋 [Embed] ${embed.title}`;
  }

  return line;
}

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
): Promise<void> {
  const messages = await fetchAllMessages(channel);
  if (messages.length === 0) {
    logger.warn({ channelId: channel.id }, "No messages found for transcript");
    return;
  }

  const html = generateTranscriptHtml(messages, channel.name, channel.guild.name);
  const buffer = Buffer.from(html, "utf-8");
  const fileName = `${channel.name}.html`;
  const threadName = `票口紀錄-${new Date().toISOString().slice(0, 7)}`;
  const ticketLabel = `票口 #${String(ticket.ticketNum).padStart(4, "0")}`;

  // ── DM to creator: just send the HTML file ──
  try {
    const user = await client.users.fetch(ticket.creatorId);
    const dmEmbed = new EmbedBuilder()
      .setTitle(`📜 ${ticketLabel} 對話紀錄`)
      .setDescription("以下是您的票口對話紀錄，下載檔案可永久保存。")
      .setColor(0xf9b4fe)
      .setTimestamp();
    await user.send({
      embeds: [dmEmbed.toJSON()],
      files: [new AttachmentBuilder(buffer, { name: fileName })],
    });
  } catch (err) {
    logger.warn({ err, creatorId: ticket.creatorId }, "Failed to DM transcript to creator");
  }

  // ── Build plain-text conversation for thread display ──
  const headerText = `**📜 ${ticketLabel} 對話紀錄**\n` +
    `創建者: <@${ticket.creatorId}> | 訊息數: ${messages.length} | 狀態: ${ticket.status}\n` +
    `開單: ${ticket.createdAt.toISOString().slice(0, 19)} | 關閉: ${ticket.closedAt?.toISOString().slice(0, 19) ?? "尚未關閉"}\n` +
    `${"─".repeat(40)}`;

  const formattedMessages = messages.map(formatMessageText);

  // Split into chunks that fit within Discord's 2000 char limit
  const chunks: string[] = [];
  let current = "";
  for (const line of formattedMessages) {
    if (current.length + line.length + 1 > MSG_LIMIT) {
      if (current) chunks.push(current);
      // If a single line exceeds limit, truncate it
      current = line.length > MSG_LIMIT ? line.slice(0, MSG_LIMIT - 3) + "..." : line;
    } else {
      current += (current ? "\n" : "") + line;
    }
  }
  if (current) chunks.push(current);

  // ── Send to log channel thread: full conversation + HTML download ──
  const sendToThread = async (logChannelId: string) => {
    try {
      const logChannel = await client.channels.fetch(logChannelId);
      if (!logChannel || logChannel.type !== ChannelType.GuildText) return;

      const thread = await getOrCreateThread(logChannel as TextChannel, threadName);

      // Send header
      await thread.send(headerText);

      // Send all conversation messages as plain text
      for (const chunk of chunks) {
        await thread.send(chunk);
      }

      // Send HTML download at the end
      await thread.send({
        content: `**📥 下載完整 HTML 紀錄 (${messages.length} 則訊息)**`,
        files: [new AttachmentBuilder(buffer, { name: fileName })],
      });
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
