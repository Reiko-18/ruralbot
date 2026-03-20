# Ticket System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement an advanced ticket system with multi-button routing, blacklist, auto-timeout, HTML transcripts, cross-server archiving, bidirectional accounting integration, and a full dashboard with analytics.

**Architecture:** Four Prisma models (TicketConfig, TicketButtonType, TicketBlacklist, TicketInstance) + BotConfig/Order extensions. Backend services follow the existing `repo_*` pattern. Discord events handle button interactions, ticket management, and activity tracking. Dashboard adds a "票口" tab with four sub-pages (Settings, Button Types, Blacklist, Overview & Analytics).

**Tech Stack:** TypeScript, Discord.js v14, Prisma (PostgreSQL), Express, React 19, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-03-20-ticket-system-design.md`

---

## Task 1: Database Schema & Migration

**Files:**
- Modify: `src/prisma/schema.prisma`

- [ ] **Step 1: Add TicketConfig model**

In `src/prisma/schema.prisma`, add after the `PriceListConfig` model:

```prisma
model TicketConfig {
  id                String   @id @default(cuid())
  guildId           String   @unique @map("guild_id")
  panelChannelId    String?  @map("panel_channel_id")
  panelMessageId    String?  @map("panel_message_id")
  categoryOpenId    String?  @map("category_open_id")
  categoryCloseId   String?  @map("category_close_id")
  logChannelId      String?  @map("log_channel_id")
  panelEmbed        String?  @db.Text @map("panel_embed")
  defaultMessage    String?  @db.Text @map("default_message")
  lastTicketNum     Int      @default(0) @map("last_ticket_num")
  autoRemindHours   Int?     @map("auto_remind_hours")
  autoCloseHours    Int?     @map("auto_close_hours")
  blacklistMode     String   @default("ephemeral") @map("blacklist_mode")
  blacklistMessage  String?  @db.Text @map("blacklist_message")
  transcriptTarget  String   @default("both") @map("transcript_target")
  createdAt         DateTime @default(now()) @map("created_at")
  updatedAt         DateTime @updatedAt @map("updated_at")

  buttonTypes       TicketButtonType[]
  blacklist         TicketBlacklist[]
  instances         TicketInstance[]

  @@map("ticket_configs")
}
```

- [ ] **Step 2: Add TicketButtonType model**

```prisma
model TicketButtonType {
  id                String   @id @default(cuid())
  configId          String   @map("config_id")
  label             String
  emoji             String?
  style             String   @default("PRIMARY")
  categoryOpenId    String?  @map("category_open_id")
  welcomeMessage    String?  @db.Text @map("welcome_message")
  embedSettings     String?  @db.Text @map("embed_settings")
  notifyRoleIds     String?  @db.Text @map("notify_role_ids")
  autoRemindHours   Int?     @map("auto_remind_hours")
  autoCloseHours    Int?     @map("auto_close_hours")
  order             Int      @default(0)
  createdAt         DateTime @default(now()) @map("created_at")
  updatedAt         DateTime @updatedAt @map("updated_at")

  config            TicketConfig @relation(fields: [configId], references: [id], onDelete: Cascade)
  instances         TicketInstance[]

  @@map("ticket_button_types")
}
```

- [ ] **Step 3: Add TicketBlacklist model**

```prisma
model TicketBlacklist {
  id        String   @id @default(cuid())
  configId  String   @map("config_id")
  userId    String   @map("user_id")
  reason    String?
  addedBy   String   @map("added_by")
  createdAt DateTime @default(now()) @map("created_at")

  config    TicketConfig @relation(fields: [configId], references: [id], onDelete: Cascade)

  @@unique([configId, userId])
  @@map("ticket_blacklists")
}
```

- [ ] **Step 4: Add TicketInstance model**

```prisma
model TicketInstance {
  id             String    @id @default(cuid())
  configId       String    @map("config_id")
  buttonTypeId   String?   @map("button_type_id")
  channelId      String    @unique @map("channel_id")
  creatorId      String    @map("creator_id")
  ticketNum      Int       @map("ticket_num")
  status         String    @default("OPEN")
  orderId        String?   @map("order_id")
  lastActivityAt DateTime  @default(now()) @map("last_activity_at")
  reminded       Boolean   @default(false)
  createdAt      DateTime  @default(now()) @map("created_at")
  closedAt       DateTime? @map("closed_at")

  config         TicketConfig      @relation(fields: [configId], references: [id])
  buttonType     TicketButtonType? @relation(fields: [buttonTypeId], references: [id], onDelete: SetNull)
  order          Order?            @relation(fields: [orderId], references: [id], onDelete: SetNull)

  @@index([configId, status])
  @@index([creatorId])
  @@map("ticket_instances")
}
```

- [ ] **Step 5: Extend Order and BotConfig models**

Add to the existing `Order` model (after `product Product?` relation):
```prisma
  tickets  TicketInstance[]
```

Add to the existing `BotConfig` model (after `syncChannelId`):
```prisma
  ticketLogChannelId String?  @map("ticket_log_channel_id")
```

- [ ] **Step 6: Run migration and generate client**

```bash
npx prisma migrate dev --name add_ticket_system
npx prisma generate
```

- [ ] **Step 7: Commit**

```bash
git add src/prisma/schema.prisma src/prisma/migrations/
git commit -m "feat(ticket): add database schema for ticket system"
```

---

## Task 2: Type Definitions

**Files:**
- Create: `src/types/ticket.type.ts`

- [ ] **Step 1: Create ticket types**

```typescript
// Custom IDs for button interactions
export const TICKET_BUTTON_PREFIX = "ticket_create_";
export const TICKET_CLOSE_ID = "ticket_close";
export const TICKET_REOPEN_ID = "ticket_reopen";
export const TICKET_DELETE_ID = "ticket_delete";
export const TICKET_TRANSCRIPT_ID = "ticket_transcript";
export const TICKET_LINK_ORDER_ID = "ticket_link_order";
export const TICKET_CREATE_ORDER_ID = "ticket_create_order";
export const TICKET_LINK_ORDER_MODAL_ID = "ticket_link_order_modal";
export const TICKET_CREATE_ORDER_MODAL_ID = "ticket_create_order_modal";
export const TICKET_DELETE_CONFIRM_ID = "ticket_delete_confirm";

export interface TicketEmbedSettings {
  color?: string;
  authorName?: string;
  authorIconUrl?: string;
  thumbnailUrl?: string;
  showTimestamp?: boolean;
  footerText?: string;
  footerIconUrl?: string;
}

export interface TicketStats {
  openCount: number;
  closedCount: number;
  archivedCount: number;
  avgResolutionHours: number;
  byType: { label: string; count: number }[];
  dailyTrend: { date: string; count: number }[];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types/ticket.type.ts
git commit -m "feat(ticket): add type definitions"
```

---

## Task 3: Repository — TicketConfig

**Files:**
- Create: `src/services/ticket/repo_ticket_config.ts`

- [ ] **Step 1: Implement TicketConfig CRUD**

```typescript
import { prisma } from "../../core/db.js";
import { logger } from "../logger/logger.js";

export async function getTicketConfig(guildId: string) {
  return prisma.ticketConfig.findUnique({ where: { guildId } });
}

export async function upsertTicketConfig(
  guildId: string,
  data: {
    panelChannelId?: string | null;
    panelMessageId?: string | null;
    categoryOpenId?: string | null;
    categoryCloseId?: string | null;
    logChannelId?: string | null;
    panelEmbed?: string | null;
    defaultMessage?: string | null;
    autoRemindHours?: number | null;
    autoCloseHours?: number | null;
    blacklistMode?: string;
    blacklistMessage?: string | null;
    transcriptTarget?: string;
  },
) {
  const config = await prisma.ticketConfig.upsert({
    where: { guildId },
    create: { guildId, ...data },
    update: data,
  });
  logger.info({ guildId }, "Ticket config upserted");
  return config;
}

export async function incrementTicketNum(guildId: string): Promise<number> {
  const config = await prisma.ticketConfig.update({
    where: { guildId },
    data: { lastTicketNum: { increment: 1 } },
  });
  return config.lastTicketNum;
}

export async function updatePanelMessageId(guildId: string, panelMessageId: string) {
  return prisma.ticketConfig.update({
    where: { guildId },
    data: { panelMessageId },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/ticket/repo_ticket_config.ts
git commit -m "feat(ticket): add TicketConfig repository"
```

---

## Task 4: Repository — TicketButtonType

**Files:**
- Create: `src/services/ticket/repo_ticket_button_type.ts`

- [ ] **Step 1: Implement ButtonType CRUD**

```typescript
import { prisma } from "../../core/db.js";
import { logger } from "../logger/logger.js";

export async function getButtonTypes(configId: string) {
  return prisma.ticketButtonType.findMany({
    where: { configId },
    orderBy: { order: "asc" },
  });
}

export async function getButtonTypeById(id: string) {
  return prisma.ticketButtonType.findUnique({ where: { id } });
}

export async function createButtonType(data: {
  configId: string;
  label: string;
  emoji?: string;
  style?: string;
  categoryOpenId?: string;
  welcomeMessage?: string;
  embedSettings?: string;
  notifyRoleIds?: string;
  autoRemindHours?: number;
  autoCloseHours?: number;
}) {
  const maxOrder = await prisma.ticketButtonType.aggregate({
    where: { configId: data.configId },
    _max: { order: true },
  });
  const btn = await prisma.ticketButtonType.create({
    data: { ...data, order: (maxOrder._max.order ?? -1) + 1 },
  });
  logger.info({ id: btn.id, label: btn.label }, "Button type created");
  return btn;
}

export async function updateButtonType(
  id: string,
  data: {
    label?: string;
    emoji?: string | null;
    style?: string;
    categoryOpenId?: string | null;
    welcomeMessage?: string | null;
    embedSettings?: string | null;
    notifyRoleIds?: string | null;
    autoRemindHours?: number | null;
    autoCloseHours?: number | null;
  },
) {
  const btn = await prisma.ticketButtonType.update({ where: { id }, data });
  logger.info({ id: btn.id }, "Button type updated");
  return btn;
}

export async function deleteButtonType(id: string) {
  await prisma.ticketButtonType.delete({ where: { id } });
  logger.info({ id }, "Button type deleted");
}

export async function reorderButtonTypes(ids: string[]) {
  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.ticketButtonType.update({ where: { id }, data: { order: index } }),
    ),
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/ticket/repo_ticket_button_type.ts
git commit -m "feat(ticket): add TicketButtonType repository"
```

---

## Task 5: Repository — TicketBlacklist

**Files:**
- Create: `src/services/ticket/repo_ticket_blacklist.ts`

- [ ] **Step 1: Implement Blacklist CRUD**

```typescript
import { prisma } from "../../core/db.js";
import { logger } from "../logger/logger.js";

export async function getBlacklist(configId: string) {
  return prisma.ticketBlacklist.findMany({
    where: { configId },
    orderBy: { createdAt: "desc" },
  });
}

export async function isBlacklisted(configId: string, userId: string): Promise<boolean> {
  const entry = await prisma.ticketBlacklist.findUnique({
    where: { configId_userId: { configId, userId } },
  });
  return !!entry;
}

export async function addToBlacklist(data: {
  configId: string;
  userId: string;
  reason?: string;
  addedBy: string;
}) {
  const entry = await prisma.ticketBlacklist.create({ data });
  logger.info({ userId: data.userId, configId: data.configId }, "User added to ticket blacklist");
  return entry;
}

export async function removeFromBlacklist(id: string) {
  await prisma.ticketBlacklist.delete({ where: { id } });
  logger.info({ id }, "User removed from ticket blacklist");
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/ticket/repo_ticket_blacklist.ts
git commit -m "feat(ticket): add TicketBlacklist repository"
```

---

## Task 6: Repository — TicketInstance

**Files:**
- Create: `src/services/ticket/repo_ticket_instance.ts`

- [ ] **Step 1: Implement TicketInstance CRUD + queries**

```typescript
import { prisma } from "../../core/db.js";
import { logger } from "../logger/logger.js";
import type { TicketStats } from "../../types/ticket.type.js";

export async function createInstance(data: {
  configId: string;
  buttonTypeId?: string;
  channelId: string;
  creatorId: string;
  ticketNum: number;
}) {
  const instance = await prisma.ticketInstance.create({ data });
  logger.info({ id: instance.id, ticketNum: data.ticketNum }, "Ticket instance created");
  return instance;
}

export async function getInstanceByChannelId(channelId: string) {
  return prisma.ticketInstance.findUnique({
    where: { channelId },
    include: { config: true, buttonType: true, order: true },
  });
}

export async function getInstanceById(id: string) {
  return prisma.ticketInstance.findUnique({
    where: { id },
    include: { config: true, buttonType: true, order: true },
  });
}

export async function getInstances(params: {
  configId?: string;
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const where: any = {};
  if (params.configId) where.configId = params.configId;
  if (params.status) where.status = params.status;
  if (params.search) {
    const conditions: any[] = [
      { channelId: { contains: params.search } },
      { creatorId: { contains: params.search } },
    ];
    if (!isNaN(Number(params.search))) {
      conditions.push({ ticketNum: Number(params.search) });
    }
    where.OR = conditions;
  }

  return prisma.ticketInstance.findMany({
    where,
    include: { buttonType: true, order: true },
    orderBy: { createdAt: "desc" },
    take: params.limit ?? 50,
    skip: params.offset ?? 0,
  });
}

export async function updateInstanceStatus(
  channelId: string,
  status: string,
  closedAt?: Date,
) {
  return prisma.ticketInstance.update({
    where: { channelId },
    data: { status, closedAt: closedAt ?? null },
  });
}

export async function updateInstanceActivity(channelId: string) {
  return prisma.ticketInstance.update({
    where: { channelId },
    data: { lastActivityAt: new Date(), reminded: false },
  });
}

export async function linkOrder(channelId: string, orderId: string) {
  return prisma.ticketInstance.update({
    where: { channelId },
    data: { orderId },
  });
}

export async function markReminded(id: string) {
  return prisma.ticketInstance.update({
    where: { id },
    data: { reminded: true },
  });
}

export async function getOpenInstances() {
  return prisma.ticketInstance.findMany({
    where: { status: "OPEN" },
    include: { config: true, buttonType: true },
  });
}

export async function getTicketStats(configId: string): Promise<TicketStats> {
  const [openCount, closedCount, archivedCount] = await Promise.all([
    prisma.ticketInstance.count({ where: { configId, status: "OPEN" } }),
    prisma.ticketInstance.count({ where: { configId, status: "CLOSED" } }),
    prisma.ticketInstance.count({ where: { configId, status: "ARCHIVED" } }),
  ]);

  // Average resolution time for closed/archived tickets
  const closed = await prisma.ticketInstance.findMany({
    where: { configId, status: { in: ["CLOSED", "ARCHIVED"] }, closedAt: { not: null } },
    select: { createdAt: true, closedAt: true },
  });
  const totalHours = closed.reduce((sum, t) => {
    const diff = (t.closedAt!.getTime() - t.createdAt.getTime()) / (1000 * 60 * 60);
    return sum + diff;
  }, 0);
  const avgResolutionHours = closed.length > 0 ? Math.round((totalHours / closed.length) * 10) / 10 : 0;

  // By type
  const byTypeRaw = await prisma.ticketInstance.groupBy({
    by: ["buttonTypeId"],
    where: { configId },
    _count: true,
  });
  const buttonTypes = await prisma.ticketButtonType.findMany({
    where: { configId },
    select: { id: true, label: true },
  });
  const labelMap = new Map(buttonTypes.map((b) => [b.id, b.label]));
  const byType = byTypeRaw.map((r) => ({
    label: r.buttonTypeId ? labelMap.get(r.buttonTypeId) ?? "未知" : "未分類",
    count: r._count,
  }));

  // Daily trend (last 14 days)
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  const dailyRaw = await prisma.$queryRaw<{ date: string; count: bigint }[]>`
    SELECT TO_CHAR(created_at, 'YYYY-MM-DD') AS date, COUNT(*)::int AS count
    FROM ticket_instances
    WHERE config_id = ${configId} AND created_at >= ${fourteenDaysAgo}
    GROUP BY date ORDER BY date ASC
  `;
  const dailyTrend = dailyRaw.map((r) => ({ date: r.date, count: Number(r.count) }));

  return { openCount, closedCount, archivedCount, avgResolutionHours, byType, dailyTrend };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/ticket/repo_ticket_instance.ts
git commit -m "feat(ticket): add TicketInstance repository with stats"
```

---

## Task 7: Ticket Panel Builder

**Files:**
- Create: `src/services/ticket/ticket_panel_builder.ts`

- [ ] **Step 1: Build panel embed and button components**

This service constructs the Discord embed and action row buttons for the ticket panel message and the welcome message inside tickets.

```typescript
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
      const parsed = JSON.parse(config.panelEmbed) as TicketEmbedSettings;
      const embed = new EmbedBuilder()
        .setTitle(parsed.authorName ?? "🎫 客服中心")
        .setDescription(config.defaultMessage ?? "請選擇下方按鈕開啟票口")
        .setColor(parsed.color ? parseInt(parsed.color.replace("#", ""), 16) : 0xf9b4fe);
      if (parsed.thumbnailUrl) embed.setThumbnail(parsed.thumbnailUrl);
      if (parsed.footerText) embed.setFooter({ text: parsed.footerText, iconURL: parsed.footerIconUrl ?? undefined });
      if (parsed.showTimestamp) embed.setTimestamp();
      return embed.toJSON();
    } catch {
      // Fall through to default
    }
  }

  return new EmbedBuilder()
    .setTitle("🎫 客服中心")
    .setDescription(config.defaultMessage ?? "請選擇下方按鈕開啟票口")
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
```

- [ ] **Step 2: Commit**

```bash
git add src/services/ticket/ticket_panel_builder.ts
git commit -m "feat(ticket): add panel builder for embeds and buttons"
```

---

## Task 8: Ticket Transcript Service

**Files:**
- Create: `src/services/ticket/ticket_transcript.ts`

- [ ] **Step 1: Implement HTML transcript generator**

This service fetches messages from a ticket channel, generates a Discord-style HTML file, and sends it to the configured destinations.

```typescript
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
  const attachment = new AttachmentBuilder(buffer, { name: `${channel.name}.html` });

  const threadName = `票口紀錄-${new Date().toISOString().slice(0, 7)}`;
  const summaryEmbed = new EmbedBuilder()
    .setTitle(`📜 票口 #${String(ticket.ticketNum).padStart(4, "0")} 紀錄`)
    .setColor(0xf9b4fe)
    .addFields(
      { name: "創建者", value: `<@${ticket.creatorId}>`, inline: true },
      { name: "訊息數", value: `${messages.length}`, inline: true },
      { name: "狀態", value: ticket.status, inline: true },
      { name: "開單時間", value: ticket.createdAt.toISOString().slice(0, 19), inline: true },
      { name: "關閉時間", value: ticket.closedAt?.toISOString().slice(0, 19) ?? "尚未關閉", inline: true },
    )
    .setTimestamp();

  // DM to creator
  try {
    const user = await client.users.fetch(ticket.creatorId);
    await user.send({ content: "📜 您的票口紀錄：", files: [new AttachmentBuilder(buffer, { name: `${channel.name}.html` })] });
  } catch (err) {
    logger.warn({ err, creatorId: ticket.creatorId }, "Failed to DM transcript to creator");
  }

  // Send to local log channel
  if ((transcriptTarget === "local" || transcriptTarget === "both") && localLogChannelId) {
    try {
      const logChannel = await client.channels.fetch(localLogChannelId);
      if (logChannel && logChannel.type === ChannelType.GuildText) {
        const thread = await getOrCreateThread(logChannel as TextChannel, threadName);
        await thread.send({
          embeds: [summaryEmbed.toJSON()],
          files: [new AttachmentBuilder(buffer, { name: `${channel.name}.html` })],
        });
      }
    } catch (err) {
      logger.warn({ err, localLogChannelId }, "Failed to send transcript to local log channel");
    }
  }

  // Send to primary guild log channel
  if (transcriptTarget === "primary" || transcriptTarget === "both") {
    try {
      const botConfig = getCachedBotConfig();
      if (botConfig?.ticketLogChannelId) {
        const primaryChannel = await client.channels.fetch(botConfig.ticketLogChannelId);
        if (primaryChannel && primaryChannel.type === ChannelType.GuildText) {
          const thread = await getOrCreateThread(primaryChannel as TextChannel, threadName);
          await thread.send({
            embeds: [summaryEmbed.toJSON()],
            files: [new AttachmentBuilder(buffer, { name: `${channel.name}.html` })],
          });
        }
      }
    } catch (err) {
      logger.warn({ err }, "Failed to send transcript to primary guild log channel");
    }
  }

  logger.info({ channelId: channel.id, ticketNum: ticket.ticketNum, messageCount: messages.length }, "Transcript generated and sent");
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/ticket/ticket_transcript.ts
git commit -m "feat(ticket): add transcript service with HTML generation"
```

---

## Task 9: Ticket Timeout Service

**Files:**
- Create: `src/services/ticket/ticket_timeout.ts`

- [ ] **Step 1: Implement auto-timeout checker**

Follows the same pattern as `presence_rotator.ts` — uses `setInterval` with a module-level ref for cleanup.

```typescript
import { type Client, type TextChannel, ChannelType, EmbedBuilder } from "discord.js";
import { getOpenInstances, markReminded, updateInstanceStatus } from "./repo_ticket_instance.js";
import { buildClosedTicketButtons } from "./ticket_panel_builder.js";
import { logger } from "../logger/logger.js";

const INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
let timer: ReturnType<typeof setInterval> | null = null;
let clientRef: Client | null = null;

function getEffectiveTimeout(instance: any): { remindHours: number | null; closeHours: number | null } {
  return {
    remindHours: instance.buttonType?.autoRemindHours ?? instance.config.autoRemindHours ?? null,
    closeHours: instance.buttonType?.autoCloseHours ?? instance.config.autoCloseHours ?? null,
  };
}

async function checkTimeouts(): Promise<void> {
  if (!clientRef) return;

  try {
    const instances = await getOpenInstances();
    const now = Date.now();

    for (const instance of instances) {
      const { remindHours, closeHours } = getEffectiveTimeout(instance);
      const elapsed = (now - instance.lastActivityAt.getTime()) / (1000 * 60 * 60);

      // Check if channel still exists
      let channel: TextChannel | null = null;
      try {
        const fetched = await clientRef.channels.fetch(instance.channelId);
        if (!fetched || fetched.type !== ChannelType.GuildText) throw new Error("Not a text channel");
        channel = fetched as TextChannel;
      } catch {
        // Channel was deleted manually
        await updateInstanceStatus(instance.channelId, "ARCHIVED");
        logger.warn({ channelId: instance.channelId, ticketNum: instance.ticketNum }, "Ticket channel deleted externally, marking ARCHIVED");
        continue;
      }

      // Auto-close check (takes priority)
      if (closeHours && elapsed >= closeHours) {
        try {
          await channel.send({
            embeds: [
              new EmbedBuilder()
                .setTitle("🔒 票口已自動關閉")
                .setDescription(`此票口因超過 ${closeHours} 小時無活動而自動關閉。`)
                .setColor(0xed4245)
                .setTimestamp()
                .toJSON(),
            ],
            components: buildClosedTicketButtons(),
          });

          // Remove creator permissions
          const creatorPerms = channel.permissionOverwrites.cache.get(instance.creatorId);
          if (creatorPerms) await creatorPerms.delete();

          // Move to close category
          if (instance.config.categoryCloseId) {
            await channel.setParent(instance.config.categoryCloseId, { lockPermissions: false });
          }

          await updateInstanceStatus(instance.channelId, "CLOSED", new Date());
          logger.info({ ticketNum: instance.ticketNum }, "Ticket auto-closed due to timeout");
        } catch (err) {
          logger.error({ err, ticketNum: instance.ticketNum }, "Failed to auto-close ticket");
        }
        continue;
      }

      // Remind check
      if (remindHours && elapsed >= remindHours && !instance.reminded) {
        try {
          await channel.send({
            embeds: [
              new EmbedBuilder()
                .setTitle("⏰ 票口即將超時")
                .setDescription(
                  `此票口已超過 ${remindHours} 小時無活動。` +
                  (closeHours ? `\n若持續無回覆，將於 ${closeHours} 小時後自動關閉。` : ""),
                )
                .setColor(0xfee75c)
                .setTimestamp()
                .toJSON(),
            ],
          });
          await markReminded(instance.id);
          logger.info({ ticketNum: instance.ticketNum }, "Ticket timeout reminder sent");
        } catch (err) {
          logger.error({ err, ticketNum: instance.ticketNum }, "Failed to send timeout reminder");
        }
      }
    }
  } catch (err) {
    logger.error({ err }, "Ticket timeout check failed");
  }
}

export function startTicketTimeout(client: Client): void {
  clientRef = client;
  timer = setInterval(checkTimeouts, INTERVAL_MS);
  logger.info({ intervalMs: INTERVAL_MS }, "Ticket timeout service started");
}

export function stopTicketTimeout(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/ticket/ticket_timeout.ts
git commit -m "feat(ticket): add auto-timeout service"
```

---

## Task 10: Discord Event — Ticket Button (Creation)

**Files:**
- Create: `src/events/ticket/ticket-button.event.ts`

- [ ] **Step 1: Implement ticket creation on button click**

```typescript
import {
  type Client,
  Events,
  ChannelType,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
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
```

- [ ] **Step 2: Commit**

```bash
git add src/events/ticket/ticket-button.event.ts
git commit -m "feat(ticket): add ticket creation event handler"
```

---

## Task 11: Discord Event — Ticket Management

**Files:**
- Create: `src/events/ticket/ticket-manage.event.ts`

- [ ] **Step 1: Implement ticket management button handlers**

Handles: close, reopen, delete, transcript, link order, create order.

```typescript
import {
  type Client,
  Events,
  ChannelType,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type TextChannel,
  type ModalSubmitInteraction,
} from "discord.js";
import {
  TICKET_CLOSE_ID,
  TICKET_REOPEN_ID,
  TICKET_DELETE_ID,
  TICKET_TRANSCRIPT_ID,
  TICKET_LINK_ORDER_ID,
  TICKET_CREATE_ORDER_ID,
  TICKET_LINK_ORDER_MODAL_ID,
  TICKET_CREATE_ORDER_MODAL_ID,
  TICKET_DELETE_CONFIRM_ID,
} from "../../types/ticket.type.js";
import {
  getInstanceByChannelId,
  updateInstanceStatus,
  linkOrder,
} from "../../services/ticket/repo_ticket_instance.js";
import {
  buildClosedTicketButtons,
  buildOpenTicketButtons,
} from "../../services/ticket/ticket_panel_builder.js";
import { generateAndSendTranscript } from "../../services/ticket/ticket_transcript.js";
import { getOrderById, createOrder } from "../../services/accounting/repo_order.js";
import { generateOrderId } from "../../services/accounting/order_id.js";
import { logger } from "../../services/logger/logger.js";

const MANAGE_IDS = new Set([
  TICKET_CLOSE_ID,
  TICKET_REOPEN_ID,
  TICKET_DELETE_ID,
  TICKET_TRANSCRIPT_ID,
  TICKET_LINK_ORDER_ID,
  TICKET_CREATE_ORDER_ID,
  TICKET_DELETE_CONFIRM_ID,
]);

export function registerTicketManageEvent(client: Client): void {
  // Button interactions
  client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isButton() && MANAGE_IDS.has(interaction.customId)) {
      await handleButton(client, interaction as any);
    }
    if (interaction.isModalSubmit()) {
      if (interaction.customId === TICKET_LINK_ORDER_MODAL_ID) {
        await handleLinkOrderModal(interaction);
      }
      if (interaction.customId === TICKET_CREATE_ORDER_MODAL_ID) {
        await handleCreateOrderModal(client, interaction);
      }
    }
  });
}

async function handleButton(client: Client, interaction: import("discord.js").ButtonInteraction): Promise<void> {
  const channelId = interaction.channelId;
  const instance = await getInstanceByChannelId(channelId);
  if (!instance) {
    await interaction.reply({ content: "❌ 此頻道不是票口。", flags: MessageFlags.Ephemeral });
    return;
  }

  const member = interaction.member;
  const hasAdmin = member?.permissions?.has(PermissionFlagsBits.Administrator);

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

      await interaction.deferReply();
      const channel = interaction.channel as TextChannel;

      // Remove creator permissions
      const creatorPerms = channel.permissionOverwrites.cache.get(instance.creatorId);
      if (creatorPerms) await creatorPerms.delete();

      // Move to close category
      if (instance.config.categoryCloseId) {
        await channel.setParent(instance.config.categoryCloseId, { lockPermissions: false });
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
      const openCategoryId = instance.buttonType?.categoryOpenId ?? instance.config.categoryOpenId;
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

    case TICKET_LINK_ORDER_ID: {
      if (!hasAdmin) {
        await interaction.reply({ content: "❌ 僅管理員可連結訂單。", flags: MessageFlags.Ephemeral });
        return;
      }

      const modal = new ModalBuilder()
        .setCustomId(TICKET_LINK_ORDER_MODAL_ID)
        .setTitle("連結訂單")
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("order_id")
              .setLabel("訂單編號")
              .setStyle(TextInputStyle.Short)
              .setPlaceholder("例如：ABC123")
              .setRequired(true),
          ),
        );
      await interaction.showModal(modal);
      break;
    }

    case TICKET_CREATE_ORDER_ID: {
      if (!hasAdmin) {
        await interaction.reply({ content: "❌ 僅管理員可建立訂單。", flags: MessageFlags.Ephemeral });
        return;
      }

      const modal = new ModalBuilder()
        .setCustomId(TICKET_CREATE_ORDER_MODAL_ID)
        .setTitle("建立訂單")
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("product_name")
              .setLabel("商品名稱")
              .setStyle(TextInputStyle.Short)
              .setRequired(true),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("quantity")
              .setLabel("數量")
              .setStyle(TextInputStyle.Short)
              .setValue("1")
              .setRequired(true),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("price")
              .setLabel("售價")
              .setStyle(TextInputStyle.Short)
              .setRequired(true),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("cost")
              .setLabel("成本")
              .setStyle(TextInputStyle.Short)
              .setRequired(true),
          ),
        );
      await interaction.showModal(modal);
      break;
    }
  }
}

async function handleLinkOrderModal(interaction: ModalSubmitInteraction): Promise<void> {
  const orderId = interaction.fields.getTextInputValue("order_id").trim();
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const order = await getOrderById(orderId);
  if (!order) {
    await interaction.editReply(`❌ 找不到訂單 \`${orderId}\`。`);
    return;
  }

  await linkOrder(interaction.channelId!, orderId);

  const embed = new EmbedBuilder()
    .setTitle("🔗 訂單已連結")
    .setColor(0x57f287)
    .addFields(
      { name: "訂單編號", value: order.id, inline: true },
      { name: "商品", value: order.productName, inline: true },
      { name: "金額", value: `$${order.actualPrice.toFixed(2)}`, inline: true },
    );

  await interaction.editReply({ embeds: [embed.toJSON()] });
  logger.info({ channelId: interaction.channelId, orderId }, "Order linked to ticket");
}

async function handleCreateOrderModal(client: Client, interaction: ModalSubmitInteraction): Promise<void> {
  const productName = interaction.fields.getTextInputValue("product_name").trim();
  const quantity = parseInt(interaction.fields.getTextInputValue("quantity").trim(), 10);
  const price = parseFloat(interaction.fields.getTextInputValue("price").trim());
  const cost = parseFloat(interaction.fields.getTextInputValue("cost").trim());

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (isNaN(quantity) || isNaN(price) || isNaN(cost)) {
    await interaction.editReply("❌ 數量、售價、成本必須為數字。");
    return;
  }

  const profit = (price - cost) * quantity;
  const orderId = await generateOrderId();

  const order = await createOrder({
    id: orderId,
    productName,
    quantity,
    actualPrice: price,
    actualCost: cost,
    profit,
    isCustom: true,
  });

  await linkOrder(interaction.channelId!, orderId);

  const embed = new EmbedBuilder()
    .setTitle("🛒 訂單已建立並連結")
    .setColor(0x57f287)
    .addFields(
      { name: "訂單編號", value: orderId, inline: true },
      { name: "商品", value: productName, inline: true },
      { name: "數量", value: `${quantity}`, inline: true },
      { name: "售價", value: `$${price.toFixed(2)}`, inline: true },
      { name: "成本", value: `$${cost.toFixed(2)}`, inline: true },
      { name: "利潤", value: `$${profit.toFixed(2)}`, inline: true },
    );

  await interaction.editReply({ embeds: [embed.toJSON()] });
  logger.info({ channelId: interaction.channelId, orderId, productName }, "Order created and linked to ticket");
}
```

- [ ] **Step 2: Commit**

```bash
git add src/events/ticket/ticket-manage.event.ts
git commit -m "feat(ticket): add ticket management event handler"
```

---

## Task 12: Discord Event — Activity Tracker

**Files:**
- Create: `src/events/ticket/ticket-activity.event.ts`

- [ ] **Step 1: Implement activity tracking on message create**

```typescript
import { type Client, Events } from "discord.js";
import { updateInstanceActivity } from "../../services/ticket/repo_ticket_instance.js";

export function registerTicketActivityEvent(client: Client): void {
  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;
    if (!message.guild) return;

    // Only update if channel name looks like a ticket
    if (!("name" in message.channel) || !message.channel.name?.startsWith("ticket-")) return;

    try {
      await updateInstanceActivity(message.channelId);
    } catch {
      // Not a tracked ticket channel — ignore
    }
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/events/ticket/ticket-activity.event.ts
git commit -m "feat(ticket): add activity tracking event"
```

---

## Task 13: Discord Commands — Setup & Panel

**Files:**
- Create: `src/commands/ticket/ticket-setup.cmd.ts`
- Create: `src/commands/ticket/ticket-panel.cmd.ts`

- [ ] **Step 1: Implement ticket-setup command**

```typescript
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
```

- [ ] **Step 2: Implement ticket-panel command**

```typescript
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
```

- [ ] **Step 3: Commit**

```bash
git add src/commands/ticket/ticket-setup.cmd.ts src/commands/ticket/ticket-panel.cmd.ts
git commit -m "feat(ticket): add ticket-setup and ticket-panel commands"
```

---

## Task 14: Bot Entry Point Integration

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Import and register ticket commands, events, and services**

Add these imports after the existing imports in `src/index.ts`:

```typescript
// Ticket commands
import * as ticketSetup from "./commands/ticket/ticket-setup.cmd.js";
import * as ticketPanel from "./commands/ticket/ticket-panel.cmd.js";

// Ticket events
import { registerTicketButtonEvent } from "./events/ticket/ticket-button.event.js";
import { registerTicketManageEvent } from "./events/ticket/ticket-manage.event.js";
import { registerTicketActivityEvent } from "./events/ticket/ticket-activity.event.js";

// Ticket timeout
import { startTicketTimeout, stopTicketTimeout } from "./services/ticket/ticket_timeout.js";
```

Add command registrations after `registerCommand(priceList)`:

```typescript
registerCommand(ticketSetup);
registerCommand(ticketPanel);
```

Add event registrations after `registerPriceMenuEvent(client)`:

```typescript
registerTicketButtonEvent(client);
registerTicketManageEvent(client);
registerTicketActivityEvent(client);
```

Add `startTicketTimeout(readyClient)` in the `ClientReady` handler after `startPresenceRotator(readyClient)`.

Add `stopTicketTimeout()` in both `SIGINT` and `SIGTERM` handlers before `await prisma.$disconnect()`.

- [ ] **Step 2: Commit**

```bash
git add src/index.ts
git commit -m "feat(ticket): integrate ticket system into bot entry point"
```

---

## Task 15: Dashboard API — Ticket Endpoints

**Files:**
- Modify: `src/services/dashboard/server.ts`

- [ ] **Step 1: Add imports at top of server.ts**

Add these imports after the existing accounting imports:

```typescript
import {
  getTicketConfig,
  upsertTicketConfig,
} from "../ticket/repo_ticket_config.js";
import {
  getButtonTypes,
  createButtonType,
  updateButtonType,
  deleteButtonType,
  reorderButtonTypes,
} from "../ticket/repo_ticket_button_type.js";
import {
  getBlacklist,
  addToBlacklist,
  removeFromBlacklist,
} from "../ticket/repo_ticket_blacklist.js";
import {
  getInstances,
  getInstanceById,
  updateInstanceStatus,
  getTicketStats,
} from "../ticket/repo_ticket_instance.js";
```

- [ ] **Step 2: Add ticket API routes before the static files section**

Add all ticket endpoints before the `// ── Static files (SPA) ──` comment. Follow the exact same pattern as existing endpoints (try/catch, logger, status codes):

```typescript
  // ── Ticket API Routes ──

  // GET /api/ticket/config/:guildId
  app.get("/api/ticket/config/:guildId", async (req, res) => {
    try {
      const config = await getTicketConfig(req.params.guildId);
      if (!config) return res.status(404).json({ error: "Config not found" });
      res.json(config);
    } catch (err) {
      logger.error({ err }, "Failed to fetch ticket config");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PUT /api/ticket/config/:guildId
  app.put("/api/ticket/config/:guildId", async (req, res) => {
    try {
      const config = await upsertTicketConfig(req.params.guildId, req.body);
      res.json(config);
    } catch (err) {
      logger.error({ err }, "Failed to update ticket config");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/ticket/button-types?configId=xxx
  app.get("/api/ticket/button-types", async (req, res) => {
    try {
      const configId = req.query.configId as string;
      if (!configId) return res.status(400).json({ error: "configId is required" });
      const types = await getButtonTypes(configId);
      res.json(types);
    } catch (err) {
      logger.error({ err }, "Failed to fetch button types");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/ticket/button-types
  app.post("/api/ticket/button-types", async (req, res) => {
    try {
      const bt = await createButtonType(req.body);
      logger.info({ id: bt.id }, "Button type created via dashboard");
      res.status(201).json(bt);
    } catch (err) {
      logger.error({ err }, "Failed to create button type");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PUT /api/ticket/button-types/:id
  app.put("/api/ticket/button-types/:id", async (req, res) => {
    try {
      const bt = await updateButtonType(req.params.id, req.body);
      res.json(bt);
    } catch (err: any) {
      if (err?.code === "P2025") return res.status(404).json({ error: "Not found" });
      logger.error({ err }, "Failed to update button type");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // DELETE /api/ticket/button-types/:id
  app.delete("/api/ticket/button-types/:id", async (req, res) => {
    try {
      await deleteButtonType(req.params.id);
      res.status(204).end();
    } catch (err: any) {
      if (err?.code === "P2025") return res.status(404).json({ error: "Not found" });
      logger.error({ err }, "Failed to delete button type");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PUT /api/ticket/reorder-button-types
  app.put("/api/ticket/reorder-button-types", async (req, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids)) return res.status(400).json({ error: "ids array required" });
      await reorderButtonTypes(ids);
      res.json({ success: true });
    } catch (err) {
      logger.error({ err }, "Failed to reorder button types");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/ticket/blacklist?configId=xxx
  app.get("/api/ticket/blacklist", async (req, res) => {
    try {
      const configId = req.query.configId as string;
      if (!configId) return res.status(400).json({ error: "configId is required" });
      const list = await getBlacklist(configId);
      res.json(list);
    } catch (err) {
      logger.error({ err }, "Failed to fetch blacklist");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/ticket/blacklist
  app.post("/api/ticket/blacklist", async (req, res) => {
    try {
      const entry = await addToBlacklist(req.body);
      res.status(201).json(entry);
    } catch (err: any) {
      if (err?.code === "P2002") return res.status(409).json({ error: "User already blacklisted" });
      logger.error({ err }, "Failed to add to blacklist");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // DELETE /api/ticket/blacklist/:id
  app.delete("/api/ticket/blacklist/:id", async (req, res) => {
    try {
      await removeFromBlacklist(req.params.id);
      res.status(204).end();
    } catch (err: any) {
      if (err?.code === "P2025") return res.status(404).json({ error: "Not found" });
      logger.error({ err }, "Failed to remove from blacklist");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/ticket/instances?configId=&status=&search=&limit=50&offset=0
  app.get("/api/ticket/instances", async (req, res) => {
    try {
      const instances = await getInstances({
        configId: req.query.configId as string,
        status: req.query.status as string,
        search: req.query.search as string,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        offset: req.query.offset ? Number(req.query.offset) : undefined,
      });
      res.json(instances);
    } catch (err) {
      logger.error({ err }, "Failed to fetch ticket instances");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/ticket/instances/:id
  app.get("/api/ticket/instances/:id", async (req, res) => {
    try {
      const instance = await getInstanceById(req.params.id);
      if (!instance) return res.status(404).json({ error: "Not found" });
      res.json(instance);
    } catch (err) {
      logger.error({ err }, "Failed to fetch ticket instance");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/ticket/instances/:id/close
  app.post("/api/ticket/instances/:id/close", async (req, res) => {
    try {
      const instance = await getInstanceById(req.params.id);
      if (!instance) return res.status(404).json({ error: "Not found" });
      await updateInstanceStatus(instance.channelId, "CLOSED", new Date());
      res.json({ success: true });
    } catch (err) {
      logger.error({ err }, "Failed to close ticket via dashboard");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/ticket/instances/:id/reopen
  app.post("/api/ticket/instances/:id/reopen", async (req, res) => {
    try {
      const instance = await getInstanceById(req.params.id);
      if (!instance) return res.status(404).json({ error: "Not found" });
      await updateInstanceStatus(instance.channelId, "OPEN");
      res.json({ success: true });
    } catch (err) {
      logger.error({ err }, "Failed to reopen ticket via dashboard");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // DELETE /api/ticket/instances/:id
  app.delete("/api/ticket/instances/:id", async (req, res) => {
    try {
      const instance = await getInstanceById(req.params.id);
      if (!instance) return res.status(404).json({ error: "Not found" });
      await updateInstanceStatus(instance.channelId, "ARCHIVED");
      res.status(204).end();
    } catch (err) {
      logger.error({ err }, "Failed to archive ticket via dashboard");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/ticket/instances/:id/transcript — trigger transcript from dashboard
  app.post("/api/ticket/instances/:id/transcript", async (req, res) => {
    try {
      const instance = await getInstanceById(req.params.id);
      if (!instance) return res.status(404).json({ error: "Not found" });
      // Note: transcript generation requires the Discord client context.
      // Dashboard can only trigger DB-side operations. Full transcript with
      // message fetching must be triggered via Discord button.
      // This endpoint marks the request; actual transcript is best done in-Discord.
      res.json({ success: true, message: "Use Discord button for full transcript" });
    } catch (err) {
      logger.error({ err }, "Failed to process transcript request");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/ticket/stats/:configId
  app.get("/api/ticket/stats/:configId", async (req, res) => {
    try {
      const stats = await getTicketStats(req.params.configId);
      res.json(stats);
    } catch (err) {
      logger.error({ err }, "Failed to fetch ticket stats");
      res.status(500).json({ error: "Internal server error" });
    }
  });
```

- [ ] **Step 3: Commit**

```bash
git add src/services/dashboard/server.ts
git commit -m "feat(ticket): add dashboard API endpoints for ticket system"
```

---

## Task 16: Dashboard Types

**Files:**
- Modify: `dashboard/src/types.ts`

- [ ] **Step 1: Add ticket-related types**

Append to end of `dashboard/src/types.ts`:

```typescript
export interface TicketConfig {
  id: string;
  guildId: string;
  panelChannelId: string | null;
  panelMessageId: string | null;
  categoryOpenId: string | null;
  categoryCloseId: string | null;
  logChannelId: string | null;
  panelEmbed: string | null;
  defaultMessage: string | null;
  lastTicketNum: number;
  autoRemindHours: number | null;
  autoCloseHours: number | null;
  blacklistMode: string;
  blacklistMessage: string | null;
  transcriptTarget: string;
}

export interface TicketButtonType {
  id: string;
  configId: string;
  label: string;
  emoji: string | null;
  style: string;
  categoryOpenId: string | null;
  welcomeMessage: string | null;
  embedSettings: string | null;
  notifyRoleIds: string | null;
  autoRemindHours: number | null;
  autoCloseHours: number | null;
  order: number;
}

export interface TicketBlacklistEntry {
  id: string;
  configId: string;
  userId: string;
  reason: string | null;
  addedBy: string;
  createdAt: string;
}

export interface TicketInstance {
  id: string;
  configId: string;
  buttonTypeId: string | null;
  channelId: string;
  creatorId: string;
  ticketNum: number;
  status: string;
  orderId: string | null;
  lastActivityAt: string;
  reminded: boolean;
  createdAt: string;
  closedAt: string | null;
  buttonType: TicketButtonType | null;
  order: AccountingOrder | null;
}

export interface TicketStats {
  openCount: number;
  closedCount: number;
  archivedCount: number;
  avgResolutionHours: number;
  byType: { label: string; count: number }[];
  dailyTrend: { date: string; count: number }[];
}
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/types.ts
git commit -m "feat(ticket): add dashboard type definitions"
```

---

## Task 17: Dashboard API Client

**Files:**
- Modify: `dashboard/src/api/client.ts`

- [ ] **Step 1: Add ticket API functions**

Add imports at the top of `client.ts`:

```typescript
import type {
  // ... existing imports ...
  TicketConfig,
  TicketButtonType,
  TicketBlacklistEntry,
  TicketInstance,
  TicketStats,
} from "../types";
```

Append these functions to end of file:

```typescript
// Ticket
export const fetchTicketConfig = (guildId: string) =>
  request<TicketConfig>(`/ticket/config/${guildId}`);

export const updateTicketConfig = (guildId: string, data: Partial<TicketConfig>) =>
  request<TicketConfig>(`/ticket/config/${guildId}`, { method: "PUT", body: JSON.stringify(data) });

export const fetchButtonTypes = (configId: string) =>
  request<TicketButtonType[]>(`/ticket/button-types?configId=${configId}`);

export const createButtonTypeApi = (data: Partial<TicketButtonType> & { configId: string; label: string }) =>
  request<TicketButtonType>("/ticket/button-types", { method: "POST", body: JSON.stringify(data) });

export const updateButtonTypeApi = (id: string, data: Partial<TicketButtonType>) =>
  request<TicketButtonType>(`/ticket/button-types/${id}`, { method: "PUT", body: JSON.stringify(data) });

export const deleteButtonTypeApi = (id: string) =>
  request<void>(`/ticket/button-types/${id}`, { method: "DELETE" });

export const reorderButtonTypesApi = (ids: string[]) =>
  request<{ success: boolean }>("/ticket/reorder-button-types", { method: "PUT", body: JSON.stringify({ ids }) });

export const fetchBlacklist = (configId: string) =>
  request<TicketBlacklistEntry[]>(`/ticket/blacklist?configId=${configId}`);

export const addToBlacklistApi = (data: { configId: string; userId: string; reason?: string; addedBy: string }) =>
  request<TicketBlacklistEntry>("/ticket/blacklist", { method: "POST", body: JSON.stringify(data) });

export const removeFromBlacklistApi = (id: string) =>
  request<void>(`/ticket/blacklist/${id}`, { method: "DELETE" });

export const fetchTicketInstances = (params: { configId?: string; status?: string; search?: string; limit?: number; offset?: number }) => {
  const qs = new URLSearchParams();
  if (params.configId) qs.set("configId", params.configId);
  if (params.status) qs.set("status", params.status);
  if (params.search) qs.set("search", params.search);
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.offset) qs.set("offset", String(params.offset));
  const q = qs.toString();
  return request<TicketInstance[]>(`/ticket/instances${q ? `?${q}` : ""}`);
};

export const closeTicketApi = (id: string) =>
  request<{ success: boolean }>(`/ticket/instances/${id}/close`, { method: "POST" });

export const reopenTicketApi = (id: string) =>
  request<{ success: boolean }>(`/ticket/instances/${id}/reopen`, { method: "POST" });

export const deleteTicketApi = (id: string) =>
  request<void>(`/ticket/instances/${id}`, { method: "DELETE" });

export const fetchTicketStats = (configId: string) =>
  request<TicketStats>(`/ticket/stats/${configId}`);
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/api/client.ts
git commit -m "feat(ticket): add dashboard API client functions"
```

---

## Task 18: Dashboard Component — TicketDashboard (Main)

**Files:**
- Create: `dashboard/src/components/TicketDashboard.tsx`

- [ ] **Step 1: Create main ticket dashboard with sub-tab routing**

This component manages guildId input, fetches TicketConfig, and renders four sub-pages. The guildId should be entered once and persisted in localStorage.

```typescript
import { useState, useEffect, useCallback } from "react";
import type { TicketConfig } from "../types";
import { fetchTicketConfig } from "../api/client";
import { TicketSettings } from "./TicketSettings";
import { TicketButtonTypes } from "./TicketButtonTypes";
import { TicketBlacklistView } from "./TicketBlacklist";
import { TicketOverview } from "./TicketOverview";

type SubTab = "settings" | "buttons" | "blacklist" | "overview";

export function TicketDashboard() {
  const [guildId, setGuildId] = useState(() => localStorage.getItem("ticket_guild_id") ?? "");
  const [inputGuildId, setInputGuildId] = useState(guildId);
  const [config, setConfig] = useState<TicketConfig | null>(null);
  const [subTab, setSubTab] = useState<SubTab>("settings");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadConfig = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTicketConfig(id);
      setConfig(data);
    } catch {
      setConfig(null);
      setError("尚未設定票口系統，請先在 Discord 使用 /ticket-setup");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (guildId) loadConfig(guildId);
  }, [guildId, loadConfig]);

  const handleConnect = () => {
    const id = inputGuildId.trim();
    if (!id) return;
    localStorage.setItem("ticket_guild_id", id);
    setGuildId(id);
  };

  const subTabClass = (t: SubTab) =>
    `px-3 py-1.5 rounded text-sm font-medium transition-colors ${
      subTab === t
        ? "bg-purple-500/20 text-purple-300"
        : "text-gray-400 hover:text-purple-300 hover:bg-purple-400/10"
    }`;

  return (
    <div className="max-w-6xl mx-auto">
      {/* Guild ID input */}
      <div className="glow-card p-4 mb-4">
        <label className="text-sm text-gray-400 block mb-1">伺服器 ID (Guild ID)</label>
        <div className="flex gap-2">
          <input
            className="glow-input flex-1"
            value={inputGuildId}
            onChange={(e) => setInputGuildId(e.target.value)}
            placeholder="輸入 Discord 伺服器 ID"
            onKeyDown={(e) => e.key === "Enter" && handleConnect()}
          />
          <button className="btn-accent" onClick={handleConnect}>連接</button>
        </div>
      </div>

      {loading && <div className="text-gray-400 text-center py-8">載入中...</div>}
      {error && <div className="text-yellow-400 text-center py-8">{error}</div>}

      {config && (
        <>
          <nav className="flex gap-1 mb-4">
            <button className={subTabClass("settings")} onClick={() => setSubTab("settings")}>設定</button>
            <button className={subTabClass("buttons")} onClick={() => setSubTab("buttons")}>按鈕類型</button>
            <button className={subTabClass("blacklist")} onClick={() => setSubTab("blacklist")}>黑名單</button>
            <button className={subTabClass("overview")} onClick={() => setSubTab("overview")}>總覽 & 分析</button>
          </nav>

          {subTab === "settings" && <TicketSettings config={config} onSave={() => loadConfig(guildId)} />}
          {subTab === "buttons" && <TicketButtonTypes configId={config.id} />}
          {subTab === "blacklist" && <TicketBlacklistView configId={config.id} />}
          {subTab === "overview" && <TicketOverview configId={config.id} />}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/components/TicketDashboard.tsx
git commit -m "feat(ticket): add TicketDashboard main component"
```

---

## Task 19: Dashboard Component — TicketSettings

**Files:**
- Create: `dashboard/src/components/TicketSettings.tsx`

- [ ] **Step 1: Create settings form component**

Follows the same pattern as `HomeEditor.tsx` — controlled inputs, save button, reload on success.

```typescript
import { useState } from "react";
import type { TicketConfig } from "../types";
import { updateTicketConfig } from "../api/client";
import { EmbedSettingsEditor } from "./EmbedSettingsEditor";

interface Props {
  config: TicketConfig;
  onSave: () => void;
}

export function TicketSettings({ config, onSave }: Props) {
  const [panelChannelId, setPanelChannelId] = useState(config.panelChannelId ?? "");
  const [categoryOpenId, setCategoryOpenId] = useState(config.categoryOpenId ?? "");
  const [categoryCloseId, setCategoryCloseId] = useState(config.categoryCloseId ?? "");
  const [logChannelId, setLogChannelId] = useState(config.logChannelId ?? "");
  const [defaultMessage, setDefaultMessage] = useState(config.defaultMessage ?? "");
  const [autoRemindHours, setAutoRemindHours] = useState(config.autoRemindHours?.toString() ?? "");
  const [autoCloseHours, setAutoCloseHours] = useState(config.autoCloseHours?.toString() ?? "");
  const [blacklistMode, setBlacklistMode] = useState(config.blacklistMode);
  const [blacklistMessage, setBlacklistMessage] = useState(config.blacklistMessage ?? "");
  const [transcriptTarget, setTranscriptTarget] = useState(config.transcriptTarget);
  const [panelEmbed, setPanelEmbed] = useState(config.panelEmbed ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateTicketConfig(config.guildId, {
        panelChannelId: panelChannelId || null,
        categoryOpenId: categoryOpenId || null,
        categoryCloseId: categoryCloseId || null,
        logChannelId: logChannelId || null,
        defaultMessage: defaultMessage || null,
        autoRemindHours: autoRemindHours ? parseInt(autoRemindHours, 10) : null,
        autoCloseHours: autoCloseHours ? parseInt(autoCloseHours, 10) : null,
        blacklistMode,
        blacklistMessage: blacklistMessage || null,
        transcriptTarget,
        panelEmbed: panelEmbed || null,
      });
      onSave();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="glow-card p-4">
        <h3 className="text-purple-300 font-semibold mb-3">頻道設定</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-gray-400">面板頻道 ID</label>
            <input className="glow-input w-full" value={panelChannelId} onChange={(e) => setPanelChannelId(e.target.value)} />
          </div>
          <div>
            <label className="text-sm text-gray-400">存檔頻道 ID</label>
            <input className="glow-input w-full" value={logChannelId} onChange={(e) => setLogChannelId(e.target.value)} />
          </div>
          <div>
            <label className="text-sm text-gray-400">開啟票口分類 ID</label>
            <input className="glow-input w-full" value={categoryOpenId} onChange={(e) => setCategoryOpenId(e.target.value)} />
          </div>
          <div>
            <label className="text-sm text-gray-400">關閉票口分類 ID</label>
            <input className="glow-input w-full" value={categoryCloseId} onChange={(e) => setCategoryCloseId(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="glow-card p-4">
        <h3 className="text-purple-300 font-semibold mb-3">歡迎詞</h3>
        <textarea className="glow-input w-full h-24" value={defaultMessage} onChange={(e) => setDefaultMessage(e.target.value)} placeholder="票口開啟後的歡迎訊息..." />
      </div>

      <div className="glow-card p-4">
        <h3 className="text-purple-300 font-semibold mb-3">自動超時</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-gray-400">提醒時數（留空=不提醒）</label>
            <input className="glow-input w-full" type="number" value={autoRemindHours} onChange={(e) => setAutoRemindHours(e.target.value)} placeholder="48" />
          </div>
          <div>
            <label className="text-sm text-gray-400">自動關閉時數（留空=不關閉）</label>
            <input className="glow-input w-full" type="number" value={autoCloseHours} onChange={(e) => setAutoCloseHours(e.target.value)} placeholder="72" />
          </div>
        </div>
      </div>

      <div className="glow-card p-4">
        <h3 className="text-purple-300 font-semibold mb-3">黑名單設定</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-gray-400">回應方式</label>
            <select className="glow-input w-full" value={blacklistMode} onChange={(e) => setBlacklistMode(e.target.value)}>
              <option value="ephemeral">Ephemeral 回覆</option>
              <option value="dm">私訊通知</option>
              <option value="silent">靜默忽略</option>
            </select>
          </div>
          <div>
            <label className="text-sm text-gray-400">自訂訊息</label>
            <input className="glow-input w-full" value={blacklistMessage} onChange={(e) => setBlacklistMessage(e.target.value)} placeholder="您已被禁止使用票口功能。" />
          </div>
        </div>
      </div>

      <div className="glow-card p-4">
        <h3 className="text-purple-300 font-semibold mb-3">存檔目標</h3>
        <select className="glow-input w-full" value={transcriptTarget} onChange={(e) => setTranscriptTarget(e.target.value)}>
          <option value="both">本地 + 主伺服器</option>
          <option value="local">僅本地</option>
          <option value="primary">僅主伺服器</option>
        </select>
      </div>

      <div className="glow-card p-4">
        <h3 className="text-purple-300 font-semibold mb-3">面板 Embed 設定</h3>
        <EmbedSettingsEditor value={panelEmbed} onChange={setPanelEmbed} />
      </div>

      <button className="btn-accent w-full" onClick={handleSave} disabled={saving}>
        {saving ? "儲存中..." : "儲存設定"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/components/TicketSettings.tsx
git commit -m "feat(ticket): add TicketSettings dashboard component"
```

---

## Task 20: Dashboard Component — TicketButtonTypes

**Files:**
- Create: `dashboard/src/components/TicketButtonTypes.tsx`

- [ ] **Step 1: Create button type management component**

CRUD list with inline editing and Discord panel preview at the bottom.

```typescript
import { useState, useEffect, useCallback } from "react";
import type { TicketButtonType } from "../types";
import {
  fetchButtonTypes,
  createButtonTypeApi,
  updateButtonTypeApi,
  deleteButtonTypeApi,
} from "../api/client";
import { Trash2, Edit2, Plus } from "lucide-react";

interface Props {
  configId: string;
}

const STYLE_COLORS: Record<string, string> = {
  PRIMARY: "#5865F2",
  SECONDARY: "#4f545c",
  SUCCESS: "#57F287",
  DANGER: "#ED4245",
};

export function TicketButtonTypes({ configId }: Props) {
  const [types, setTypes] = useState<TicketButtonType[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<TicketButtonType>>({});
  const [adding, setAdding] = useState(false);

  const reload = useCallback(async () => {
    const data = await fetchButtonTypes(configId);
    setTypes(data);
  }, [configId]);

  useEffect(() => { reload(); }, [reload]);

  const handleSave = async () => {
    try {
      if (editing) {
        await updateButtonTypeApi(editing, form);
        setEditing(null);
      } else {
        await createButtonTypeApi({ configId, label: form.label || "新按鈕", ...form });
        setAdding(false);
      }
      setForm({});
      await reload();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("確定刪除此按鈕類型？")) return;
    await deleteButtonTypeApi(id);
    await reload();
  };

  const startEdit = (bt: TicketButtonType) => {
    setEditing(bt.id);
    setAdding(false);
    setForm({
      label: bt.label,
      emoji: bt.emoji,
      style: bt.style,
      categoryOpenId: bt.categoryOpenId,
      welcomeMessage: bt.welcomeMessage,
      notifyRoleIds: bt.notifyRoleIds,
      autoRemindHours: bt.autoRemindHours,
      autoCloseHours: bt.autoCloseHours,
    });
  };

  const renderForm = () => (
    <div className="glow-card p-4 space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-sm text-gray-400">按鈕文字</label>
          <input className="glow-input w-full" value={form.label ?? ""} onChange={(e) => setForm({ ...form, label: e.target.value })} />
        </div>
        <div>
          <label className="text-sm text-gray-400">Emoji</label>
          <input className="glow-input w-full" value={form.emoji ?? ""} onChange={(e) => setForm({ ...form, emoji: e.target.value })} placeholder="📩" />
        </div>
        <div>
          <label className="text-sm text-gray-400">樣式</label>
          <select className="glow-input w-full" value={form.style ?? "PRIMARY"} onChange={(e) => setForm({ ...form, style: e.target.value })}>
            <option value="PRIMARY">Primary</option>
            <option value="SECONDARY">Secondary</option>
            <option value="SUCCESS">Success</option>
            <option value="DANGER">Danger</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm text-gray-400">專屬分類 ID（留空=用全局）</label>
          <input className="glow-input w-full" value={form.categoryOpenId ?? ""} onChange={(e) => setForm({ ...form, categoryOpenId: e.target.value || null })} />
        </div>
        <div>
          <label className="text-sm text-gray-400">通知角色 IDs (JSON array)</label>
          <input className="glow-input w-full" value={form.notifyRoleIds ?? ""} onChange={(e) => setForm({ ...form, notifyRoleIds: e.target.value || null })} placeholder='["role_id_1"]' />
        </div>
      </div>
      <div>
        <label className="text-sm text-gray-400">專屬歡迎詞（留空=用全局）</label>
        <textarea className="glow-input w-full h-16" value={form.welcomeMessage ?? ""} onChange={(e) => setForm({ ...form, welcomeMessage: e.target.value || null })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm text-gray-400">提醒時數（留空=用全局）</label>
          <input className="glow-input w-full" type="number" value={form.autoRemindHours ?? ""} onChange={(e) => setForm({ ...form, autoRemindHours: e.target.value ? parseInt(e.target.value, 10) : null })} />
        </div>
        <div>
          <label className="text-sm text-gray-400">自動關閉時數（留空=用全局）</label>
          <input className="glow-input w-full" type="number" value={form.autoCloseHours ?? ""} onChange={(e) => setForm({ ...form, autoCloseHours: e.target.value ? parseInt(e.target.value, 10) : null })} />
        </div>
      </div>
      <div className="flex gap-2">
        <button className="btn-accent" onClick={handleSave}>{editing ? "更新" : "新增"}</button>
        <button className="btn-accent-outline" onClick={() => { setEditing(null); setAdding(false); setForm({}); }}>取消</button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {types.map((bt) => (
        <div key={bt.id}>
          {editing === bt.id ? renderForm() : (
            <div className="glow-item flex items-center justify-between p-3" style={{ borderLeft: `3px solid ${STYLE_COLORS[bt.style] ?? "#5865F2"}` }}>
              <div>
                <div className="text-white font-medium">{bt.emoji ? `${bt.emoji} ` : ""}{bt.label}</div>
                <div className="text-sm text-gray-400">
                  分類: {bt.categoryOpenId ?? "全局"} · 提醒: {bt.autoRemindHours ?? "全局"}h · 關閉: {bt.autoCloseHours ?? "全局"}h
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => startEdit(bt)} className="text-purple-400 hover:text-purple-300"><Edit2 size={16} /></button>
                <button onClick={() => handleDelete(bt.id)} className="text-red-400 hover:text-red-300"><Trash2 size={16} /></button>
              </div>
            </div>
          )}
        </div>
      ))}

      {adding && renderForm()}

      {!adding && !editing && (
        <button className="btn-accent-outline w-full flex items-center justify-center gap-2" onClick={() => { setAdding(true); setForm({ style: "PRIMARY" }); }}>
          <Plus size={16} /> 新增按鈕類型
        </button>
      )}

      {/* Panel Preview */}
      {types.length > 0 && (
        <div className="glow-card p-4">
          <h3 className="text-purple-300 font-semibold mb-3">面板預覽</h3>
          <div className="bg-[#36393f] p-4 rounded-lg border-l-4 border-purple-400">
            <div className="text-white font-bold">🎫 客服中心</div>
            <div className="text-gray-300 text-sm mt-1">請選擇下方按鈕開啟票口</div>
            <div className="flex gap-2 mt-3 flex-wrap">
              {types.map((bt) => (
                <span
                  key={bt.id}
                  className="px-3 py-1 rounded text-sm text-white"
                  style={{ backgroundColor: STYLE_COLORS[bt.style] ?? "#5865F2" }}
                >
                  {bt.emoji ? `${bt.emoji} ` : ""}{bt.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/components/TicketButtonTypes.tsx
git commit -m "feat(ticket): add TicketButtonTypes dashboard component"
```

---

## Task 21: Dashboard Component — TicketBlacklist

**Files:**
- Create: `dashboard/src/components/TicketBlacklist.tsx`

- [ ] **Step 1: Create blacklist management component**

```typescript
import { useState, useEffect, useCallback } from "react";
import type { TicketBlacklistEntry } from "../types";
import { fetchBlacklist, addToBlacklistApi, removeFromBlacklistApi } from "../api/client";
import { Trash2, Plus } from "lucide-react";

interface Props {
  configId: string;
}

export function TicketBlacklistView({ configId }: Props) {
  const [list, setList] = useState<TicketBlacklistEntry[]>([]);
  const [userId, setUserId] = useState("");
  const [reason, setReason] = useState("");
  const [adding, setAdding] = useState(false);

  const reload = useCallback(async () => {
    const data = await fetchBlacklist(configId);
    setList(data);
  }, [configId]);

  useEffect(() => { reload(); }, [reload]);

  const handleAdd = async () => {
    if (!userId.trim()) return;
    try {
      await addToBlacklistApi({
        configId,
        userId: userId.trim(),
        reason: reason.trim() || undefined,
        addedBy: "dashboard",
      });
      setUserId("");
      setReason("");
      setAdding(false);
      await reload();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleRemove = async (id: string) => {
    if (!confirm("確定移除此使用者？")) return;
    await removeFromBlacklistApi(id);
    await reload();
  };

  return (
    <div className="space-y-4">
      <div className="glow-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-purple-300 font-semibold">黑名單 ({list.length})</h3>
          <button className="btn-accent-outline text-sm flex items-center gap-1" onClick={() => setAdding(!adding)}>
            <Plus size={14} /> 新增
          </button>
        </div>

        {adding && (
          <div className="mb-4 p-3 bg-gray-800/50 rounded-lg space-y-2">
            <input className="glow-input w-full" value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="Discord 使用者 ID" />
            <input className="glow-input w-full" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="原因（選填）" />
            <div className="flex gap-2">
              <button className="btn-accent text-sm" onClick={handleAdd}>加入黑名單</button>
              <button className="btn-accent-outline text-sm" onClick={() => setAdding(false)}>取消</button>
            </div>
          </div>
        )}

        {list.length === 0 ? (
          <div className="text-gray-500 text-center py-4">尚無黑名單使用者</div>
        ) : (
          <div className="space-y-1">
            {list.map((entry) => (
              <div key={entry.id} className="glow-item flex items-center justify-between p-3">
                <div>
                  <span className="text-white font-mono">{entry.userId}</span>
                  {entry.reason && <span className="text-gray-400 text-sm ml-2">— {entry.reason}</span>}
                  <div className="text-gray-500 text-xs">
                    加入者: {entry.addedBy} · {new Date(entry.createdAt).toLocaleString("zh-TW")}
                  </div>
                </div>
                <button onClick={() => handleRemove(entry.id)} className="text-red-400 hover:text-red-300">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/components/TicketBlacklist.tsx
git commit -m "feat(ticket): add TicketBlacklist dashboard component"
```

---

## Task 22: Dashboard Component — TicketOverview

**Files:**
- Create: `dashboard/src/components/TicketOverview.tsx`

- [ ] **Step 1: Create overview and analytics component**

```typescript
import { useState, useEffect, useCallback } from "react";
import type { TicketInstance, TicketStats } from "../types";
import {
  fetchTicketInstances,
  fetchTicketStats,
  closeTicketApi,
  reopenTicketApi,
  deleteTicketApi,
} from "../api/client";

interface Props {
  configId: string;
}

export function TicketOverview({ configId }: Props) {
  const [stats, setStats] = useState<TicketStats | null>(null);
  const [instances, setInstances] = useState<TicketInstance[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [search, setSearch] = useState("");

  const loadStats = useCallback(async () => {
    const data = await fetchTicketStats(configId);
    setStats(data);
  }, [configId]);

  const loadInstances = useCallback(async () => {
    const data = await fetchTicketInstances({
      configId,
      status: statusFilter || undefined,
      search: search || undefined,
    });
    setInstances(data);
  }, [configId, statusFilter, search]);

  useEffect(() => { loadStats(); loadInstances(); }, [loadStats, loadInstances]);

  const handleAction = async (id: string, action: "close" | "reopen" | "delete") => {
    if (action === "delete" && !confirm("確定刪除此票口紀錄？")) return;
    if (action === "close") await closeTicketApi(id);
    else if (action === "reopen") await reopenTicketApi(id);
    else await deleteTicketApi(id);
    await Promise.all([loadStats(), loadInstances()]);
  };

  const statusColor = (s: string) => {
    if (s === "OPEN") return "text-green-400";
    if (s === "CLOSED") return "text-yellow-400";
    return "text-blue-400";
  };

  const maxTrend = stats ? Math.max(...stats.dailyTrend.map((d) => d.count), 1) : 1;

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      {stats && (
        <div className="grid grid-cols-4 gap-3">
          <div className="glow-card p-4 text-center">
            <div className="text-gray-400 text-xs">開啟中</div>
            <div className="text-green-400 text-2xl font-bold">{stats.openCount}</div>
          </div>
          <div className="glow-card p-4 text-center">
            <div className="text-gray-400 text-xs">已關閉</div>
            <div className="text-yellow-400 text-2xl font-bold">{stats.closedCount}</div>
          </div>
          <div className="glow-card p-4 text-center">
            <div className="text-gray-400 text-xs">已存檔</div>
            <div className="text-blue-400 text-2xl font-bold">{stats.archivedCount}</div>
          </div>
          <div className="glow-card p-4 text-center">
            <div className="text-gray-400 text-xs">平均處理</div>
            <div className="text-purple-400 text-2xl font-bold">{stats.avgResolutionHours}h</div>
          </div>
        </div>
      )}

      {/* Charts */}
      {stats && (
        <div className="grid grid-cols-2 gap-3">
          <div className="glow-card p-4">
            <h4 className="text-gray-400 text-sm mb-3">按類型分布</h4>
            {stats.byType.map((t) => (
              <div key={t.label} className="flex items-center gap-2 mb-2">
                <div
                  className="h-3 rounded bg-purple-400"
                  style={{ width: `${(t.count / Math.max(...stats.byType.map((x) => x.count), 1)) * 100}%`, minWidth: "8px" }}
                />
                <span className="text-sm text-gray-300">{t.label} ({t.count})</span>
              </div>
            ))}
          </div>
          <div className="glow-card p-4">
            <h4 className="text-gray-400 text-sm mb-3">每日開單量 (14天)</h4>
            <div className="flex items-end gap-1 h-16">
              {stats.dailyTrend.map((d) => (
                <div
                  key={d.date}
                  className="flex-1 bg-purple-400 rounded-sm"
                  style={{ height: `${(d.count / maxTrend) * 100}%`, minHeight: d.count > 0 ? "4px" : "0" }}
                  title={`${d.date}: ${d.count}`}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Ticket List */}
      <div className="glow-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-purple-300 font-semibold">票口列表</h3>
          <div className="flex gap-2">
            {["", "OPEN", "CLOSED", "ARCHIVED"].map((s) => (
              <button
                key={s}
                className={`px-2 py-1 rounded text-xs ${statusFilter === s ? "bg-purple-500/30 text-purple-300" : "text-gray-400 hover:text-purple-300"}`}
                onClick={() => setStatusFilter(s)}
              >
                {s || "全部"}
              </button>
            ))}
          </div>
        </div>

        <input
          className="glow-input w-full mb-3"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜尋票口編號、使用者 ID..."
        />

        <div className="space-y-1">
          {instances.map((inst) => (
            <div key={inst.id} className="glow-item flex items-center justify-between p-3 text-sm">
              <div className="flex items-center gap-4">
                <span className={statusColor(inst.status)}>
                  {inst.status === "OPEN" ? "●" : "○"} ticket-{String(inst.ticketNum).padStart(4, "0")}
                </span>
                <span className="text-gray-400">{inst.creatorId}</span>
                <span className="text-gray-500">{inst.buttonType?.label ?? "—"}</span>
                {inst.order && (
                  <span className="text-green-400 text-xs">🛒 {inst.order.id}</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-gray-500 text-xs">
                  {new Date(inst.createdAt).toLocaleString("zh-TW")}
                </span>
                <div className="flex gap-1">
                  {inst.status === "OPEN" && (
                    <button className="text-yellow-400 hover:text-yellow-300 text-xs" onClick={() => handleAction(inst.id, "close")}>關閉</button>
                  )}
                  {inst.status === "CLOSED" && (
                    <button className="text-green-400 hover:text-green-300 text-xs" onClick={() => handleAction(inst.id, "reopen")}>重開</button>
                  )}
                  <button className="text-red-400 hover:text-red-300 text-xs" onClick={() => handleAction(inst.id, "delete")}>刪除</button>
                </div>
              </div>
            </div>
          ))}
          {instances.length === 0 && (
            <div className="text-gray-500 text-center py-4">無票口紀錄</div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/components/TicketOverview.tsx
git commit -m "feat(ticket): add TicketOverview dashboard component"
```

---

## Task 23: Integrate Ticket Tab into Dashboard App

**Files:**
- Modify: `dashboard/src/App.tsx`

- [ ] **Step 1: Add ticket tab to App.tsx**

Add import at top:
```typescript
import { TicketDashboard } from "./components/TicketDashboard";
```

Change `Tab` type to include "ticket":
```typescript
type Tab = "price" | "presence" | "accounting" | "ticket";
```

Add ticket tab button in the `<nav>` section (after the presence button):
```tsx
<button className={tabClass("ticket")} onClick={() => setTab("ticket")}>
  票口
</button>
```

Add the ticket tab content rendering (after the presence section, before the closing `}`):
```tsx
) : tab === "ticket" ? (
  <div className="flex-1 overflow-y-auto p-6">
    <TicketDashboard />
  </div>
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/App.tsx
git commit -m "feat(ticket): integrate ticket tab into dashboard"
```

---

## Task 24: Update BotConfig Cache for ticketLogChannelId

**Files:**
- Modify: `src/services/config/repo_bot_config.ts`

- [ ] **Step 1: Update BotConfigCache type and loadBotConfig**

The current `BotConfigCache` type only has `primaryGuildId` and `syncChannelId`. Update it to include `ticketLogChannelId`:

Change the type:
```typescript
type BotConfigCache = {
  primaryGuildId: string;
  syncChannelId: string;
  ticketLogChannelId: string | null;
} | null;
```

Update `loadBotConfig()`:
```typescript
cache = config
  ? { primaryGuildId: config.primaryGuildId, syncChannelId: config.syncChannelId, ticketLogChannelId: config.ticketLogChannelId ?? null }
  : null;
```

Update `upsertBotConfig()` cache assignment:
```typescript
cache = { primaryGuildId, syncChannelId, ticketLogChannelId: cache?.ticketLogChannelId ?? null };
```

- [ ] **Step 2: Commit**

```bash
git add src/services/config/repo_bot_config.ts
git commit -m "feat(ticket): add ticketLogChannelId to BotConfig cache"
```

---

## Task 25: Accounting Dashboard — Ticket Badge Link

**Files:**
- Modify: `dashboard/src/components/AccountingDashboard.tsx`

- [ ] **Step 1: Add ticket badge to order rows**

In the `AccountingDashboard.tsx` component, modify the orders table rendering. After the existing `getOrders` API call, cross-reference with ticket instances. Since the Order model now has a `tickets` relation, update the accounting orders API endpoint (`GET /api/accounting/orders`) to include ticket info.

In `src/services/dashboard/server.ts`, update the orders endpoint to include ticket link:
```typescript
// Modify the existing GET /api/accounting/orders handler
const orders = await getOrders(start, end);
// For each order, check if it has linked tickets
const ordersWithTickets = await Promise.all(
  orders.map(async (o) => {
    const tickets = await prisma.ticketInstance.findMany({
      where: { orderId: o.id },
      select: { ticketNum: true, channelId: true },
    });
    return { ...o, tickets };
  }),
);
res.json(ordersWithTickets);
```

In the dashboard `AccountingDashboard.tsx`, when rendering an order row, if `order.tickets?.length > 0`, show a badge:
```tsx
{order.tickets?.map((t: any) => (
  <span key={t.channelId} className="text-purple-400 text-xs ml-2">
    📩 ticket-{String(t.ticketNum).padStart(4, "0")}
  </span>
))}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/dashboard/server.ts dashboard/src/components/AccountingDashboard.tsx
git commit -m "feat(ticket): add ticket badge to accounting order rows"
```

---

## Task 26: Build Dashboard & Final Verification

- [ ] **Step 1: Build the dashboard frontend**

```bash
cd dashboard && npm run build
```

Verify no TypeScript compilation errors.

- [ ] **Step 2: Run Prisma generate to ensure schema is up to date**

```bash
npx prisma generate
```

- [ ] **Step 3: Verify TypeScript compilation of backend**

```bash
npx tsc --noEmit
```

Fix any compilation errors.

- [ ] **Step 4: Final commit and push**

```bash
git add -A
git commit -m "feat(ticket): complete ticket system implementation"
git push
```

---

## Task 27: Obsidian Documentation

**Files:**
- Create: `D:\reiko's coding corner\reiko's corner\ruralbot\ticket-system.md`

- [ ] **Step 1: Write feature documentation in Obsidian**

Document the complete ticket system: models, commands, events, dashboard features, configuration guide.

- [ ] **Step 2: Commit documentation**

No git commit needed for Obsidian docs (separate vault).
