# Primary Guild Sync & Global Command Registration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a primary guild concept that mirrors all command responses, centralizes channel/thread creation, and deploys slash commands globally as a Discord app.

**Architecture:** Single-row `BotConfig` DB table stores the primary guild + sync channel. A wrapper in the command handler intercepts every command response and mirrors it. Thread creation in `thread_logger.ts` redirects to the primary guild. Commands deploy globally + guild-scoped on join via `guildCreate` event.

**Tech Stack:** Discord.js v14, Prisma (PostgreSQL), TypeScript

**Spec:** `docs/superpowers/specs/2026-03-18-primary-guild-sync-design.md`

---

### Task 1: Prisma Schema — Add BotConfig Model

**Files:**
- Modify: `src/prisma/schema.prisma:109` (append after AccountingConfig)

- [ ] **Step 1: Add BotConfig model to schema**

Append after line 109 in `src/prisma/schema.prisma`:

```prisma
model BotConfig {
  id             Int      @id @default(1)
  primaryGuildId String   @map("primary_guild_id")
  syncChannelId  String   @map("sync_channel_id")
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  @@map("bot_configs")
}
```

- [ ] **Step 2: Generate Prisma client and create migration**

Run: `npx prisma migrate dev --name add_bot_config`
Expected: Migration created, Prisma client regenerated.

- [ ] **Step 3: Commit**

```bash
git add src/prisma/schema.prisma prisma/migrations/
git commit -m "feat: add BotConfig model to Prisma schema"
```

---

### Task 2: BotConfig Repository with Caching

**Files:**
- Create: `src/services/config/repo_bot_config.ts`

- [ ] **Step 1: Create the repository file**

```typescript
import { prisma } from "../../core/db.js";
import { logger } from "../logger/logger.js";

type BotConfigCache = {
  primaryGuildId: string;
  syncChannelId: string;
} | null;

let cache: BotConfigCache = null;

export async function loadBotConfig(): Promise<void> {
  const config = await prisma.botConfig.findUnique({ where: { id: 1 } });
  cache = config
    ? { primaryGuildId: config.primaryGuildId, syncChannelId: config.syncChannelId }
    : null;
  logger.info({ config: cache }, "BotConfig loaded");
}

export function getCachedBotConfig(): BotConfigCache {
  return cache;
}

export async function upsertBotConfig(
  primaryGuildId: string,
  syncChannelId: string,
) {
  const result = await prisma.botConfig.upsert({
    where: { id: 1 },
    update: { primaryGuildId, syncChannelId },
    create: { primaryGuildId, syncChannelId },
  });
  cache = { primaryGuildId, syncChannelId };
  return result;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/services/config/repo_bot_config.ts
git commit -m "feat: add BotConfig repository with in-memory caching"
```

---

### Task 3: `/bot-config` Slash Command

**Files:**
- Create: `src/commands/config/bot-config.cmd.ts`

- [ ] **Step 1: Create the command file**

```typescript
import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import {
  upsertBotConfig,
  getCachedBotConfig,
} from "../../services/config/repo_bot_config.js";
import { getAccountingConfig } from "../../services/accounting/repo_accounting_config.js";
import { logger } from "../../services/logger/logger.js";

export const data = new SlashCommandBuilder()
  .setName("bot-config")
  .setDescription("Configure the primary guild and sync channel")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((sub) =>
    sub
      .setName("set")
      .setDescription("Set this guild as primary and choose a sync channel")
      .addChannelOption((o) =>
        o
          .setName("channel")
          .setDescription("The channel to mirror all command responses to")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("view")
      .setDescription("View current primary guild and sync channel config"),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const sub = interaction.options.getSubcommand();

  if (sub === "set") {
    const channel = interaction.options.getChannel("channel", true);
    try {
      await upsertBotConfig(interaction.guildId!, channel.id);

      // Ensure AccountingConfig exists for primary guild (required for thread redirection)
      const existingAccounting = await getAccountingConfig(interaction.guildId!);
      const accountingNote = existingAccounting
        ? ""
        : "\n⚠️ 請執行 `/accounting-setup` 設定會計頻道，否則訂單日誌不會在此伺服器建立。";

      logger.info(
        {
          guildId: interaction.guildId,
          syncChannelId: channel.id,
        },
        "Primary guild configured",
      );
      await interaction.editReply(
        `✅ 主伺服器已設定為此伺服器\n同步頻道: <#${channel.id}>${accountingNote}`,
      );
    } catch (err) {
      logger.error({ err }, "Failed to set bot config");
      await interaction.editReply("設定失敗，請確認機器人權限。");
    }
  }

  if (sub === "view") {
    const config = getCachedBotConfig();
    if (!config) {
      await interaction.editReply("尚未設定主伺服器。使用 `/bot-config set` 設定。");
      return;
    }
    const guild = interaction.client.guilds.cache.get(config.primaryGuildId);
    await interaction.editReply(
      `主伺服器: **${guild?.name ?? config.primaryGuildId}**\n同步頻道: <#${config.syncChannelId}>`,
    );
  }
}
```

- [ ] **Step 2: Register command in `src/index.ts`**

Add import after line 25:
```typescript
import * as botConfig from "./commands/config/bot-config.cmd.js";
```

Add registration after line 41:
```typescript
registerCommand(botConfig);
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/commands/config/bot-config.cmd.ts src/index.ts
git commit -m "feat: add /bot-config slash command for primary guild setup"
```

---

### Task 4: Response Mirroring System

**Files:**
- Create: `src/services/config/sync_mirror.ts`
- Modify: `src/core/command_handler.ts:20-26`

- [ ] **Step 1: Create the sync mirror utility**

```typescript
import {
  type ChatInputCommandInteraction,
  type TextChannel,
  ChannelType,
  EmbedBuilder,
} from "discord.js";
import { getCachedBotConfig } from "./repo_bot_config.js";
import { logger } from "../logger/logger.js";

export async function mirrorToSyncChannel(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  try {
    const config = getCachedBotConfig();
    if (!config) return;

    const channel = await interaction.client.channels.fetch(
      config.syncChannelId,
    );
    if (!channel || channel.type !== ChannelType.GuildText) {
      logger.warn(
        { syncChannelId: config.syncChannelId },
        "Sync channel not found or not text",
      );
      return;
    }

    // Skip mirroring for ephemeral replies — they cannot be fetched/forwarded
    if (interaction.ephemeral) return;

    const reply = await interaction.fetchReply().catch(() => null);
    if (!reply) return;

    const syncChannel = channel as TextChannel;

    // Build context footer
    const guildName =
      interaction.guild?.name ?? "DM";
    const channelName =
      interaction.channel && "name" in interaction.channel
        ? interaction.channel.name
        : "unknown";
    const userName = interaction.user.tag;

    const contextEmbed = new EmbedBuilder()
      .setFooter({
        text: `${userName} · #${channelName} · ${guildName}`,
      })
      .setColor(0x5865f2)
      .setTimestamp();

    // Mirror embeds from the reply (strip components)
    const embeds = reply.embeds.map((e) => EmbedBuilder.from(e));

    // If reply has text content but no embeds, wrap it in an embed
    if (embeds.length === 0 && reply.content) {
      embeds.push(
        new EmbedBuilder().setDescription(reply.content).setColor(0x5865f2),
      );
    }

    // Add the context footer to the last embed, or use standalone
    if (embeds.length > 0) {
      const last = embeds[embeds.length - 1];
      last.setFooter({
        text: `${userName} · #${channelName} · ${guildName}`,
      });
      last.setTimestamp();
    } else {
      embeds.push(contextEmbed);
    }

    await syncChannel.send({ embeds });
  } catch (err) {
    logger.warn({ err }, "Failed to mirror response to sync channel");
  }
}
```

- [ ] **Step 2: Wrap `handleInteraction` in `src/core/command_handler.ts`**

Replace lines 20-26 in `command_handler.ts`:

```typescript
export async function handleInteraction(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const command = commands.get(interaction.commandName);
  if (!command) return;
  await command.execute(interaction);
  // Mirror response to primary guild sync channel
  await mirrorToSyncChannel(interaction);
}
```

Add import at top of `command_handler.ts`:

```typescript
import { mirrorToSyncChannel } from "../services/config/sync_mirror.js";
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/services/config/sync_mirror.ts src/core/command_handler.ts
git commit -m "feat: add response mirroring to primary guild sync channel"
```

---

### Task 5: Thread Logger Redirection to Primary Guild

**Files:**
- Modify: `src/services/accounting/thread_logger.ts:38-53`

- [ ] **Step 1: Modify `logOrderToThread` to redirect to primary guild**

Update `thread_logger.ts` — change the `logOrderToThread` function to check for primary guild and redirect:

Add import at top:
```typescript
import { getCachedBotConfig } from "../config/repo_bot_config.js";
```

Replace lines 53-57 (the config lookup and null check inside the `try` block of `logOrderToThread`):

```typescript
    // Redirect to primary guild if configured
    const botConfig = getCachedBotConfig();
    const targetGuildId = botConfig?.primaryGuildId ?? guildId;

    const config = await getAccountingConfig(targetGuildId);
    if (!config) {
      logger.warn({ guildId: targetGuildId }, "No accounting config found, skipping thread log");
      return;
    }
```

This replaces the existing:
```typescript
    const config = await getAccountingConfig(guildId);
    if (!config) {
      logger.warn({ guildId }, "No accounting config found, skipping thread log");
      return;
    }
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/services/accounting/thread_logger.ts
git commit -m "feat: redirect thread creation to primary guild"
```

---

### Task 6: `guildCreate` Event Handler

**Files:**
- Create: `src/events/guild/guild-create.event.ts`
- Modify: `src/index.ts:66` (after ClientReady block)

- [ ] **Step 1: Create the event handler**

```typescript
import { type Client, Events, REST, Routes } from "discord.js";
import { commands } from "../../core/command_handler.js";
import { logger } from "../../services/logger/logger.js";

export function registerGuildCreateEvent(client: Client): void {
  client.on(Events.GuildCreate, async (guild) => {
    logger.info(
      {
        guildId: guild.id,
        guildName: guild.name,
        memberCount: guild.memberCount,
      },
      "Bot joined new guild",
    );

    // Deploy commands to the new guild for instant availability
    // Rate limit: 2s delay to respect Discord API limits
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const rest = new REST().setToken(process.env.TOKEN!);
      const body = commands.map((cmd) => cmd.data.toJSON());

      await rest.put(
        Routes.applicationGuildCommands(
          process.env.APPLICATION_ID!,
          guild.id,
        ),
        { body },
      );
      logger.info({ guildId: guild.id }, "Commands deployed to new guild");
    } catch (err) {
      logger.error(
        { err, guildId: guild.id },
        "Failed to deploy commands to new guild",
      );
    }
  });
}
```

- [ ] **Step 2: Register the event in `src/index.ts`**

Add import after existing imports:
```typescript
import { registerGuildCreateEvent } from "./events/guild/guild-create.event.js";
```

Add after line 66 (after the `client.once(Events.ClientReady, ...)` block):
```typescript
registerGuildCreateEvent(client);
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/events/guild/guild-create.event.ts src/index.ts
git commit -m "feat: auto-deploy commands when bot joins new guild"
```

---

### Task 7: Hybrid Global Command Deployment

**Files:**
- Modify: `src/core/command_handler.ts:28-46`
- Modify: `src/index.ts:54-55` (load BotConfig on startup)

- [ ] **Step 1: Update `deployCommands()` to deploy globally**

Replace the `deployCommands()` function in `command_handler.ts` (originally lines 28-46, shifted by prior edits in Task 4):

```typescript
export async function deployCommands(): Promise<void> {
  const rest = new REST().setToken(process.env.TOKEN!);
  const body = commands.map((cmd) => cmd.data.toJSON());

  // Deploy globally — available in all servers + DMs
  await rest.put(
    Routes.applicationCommands(process.env.APPLICATION_ID!),
    { body },
  );
}
```

- [ ] **Step 2: Load BotConfig cache on startup in `src/index.ts`**

Add import:
```typescript
import { loadBotConfig } from "./services/config/repo_bot_config.js";
```

Inside `ClientReady` handler, after `await loadLogConfigs();` (line 55), add:
```typescript
  await loadBotConfig();
```

Note: `loadBotConfig()` already logs internally, no extra `logger.info` needed.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/core/command_handler.ts src/index.ts
git commit -m "feat: switch to global command deployment, load BotConfig on startup"
```

---

### Task 8: Final Integration & Cleanup

**Files:**
- Modify: `src/index.ts` (verify all pieces are wired)

- [ ] **Step 1: Remove `SERVER_ID` from `.env` (or leave unused)**

The `SERVER_ID` env var is no longer referenced in code. It can remain in `.env` without effect, or be removed. No code change needed — just awareness.

- [ ] **Step 2: Full TypeScript compilation check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Build the project**

Run: `npm run build` (or `npx tsc`)
Expected: Clean build, no errors.

- [ ] **Step 4: Final commit and push**

```bash
git add -A
git commit -m "feat: primary guild sync — final integration"
git push
```
