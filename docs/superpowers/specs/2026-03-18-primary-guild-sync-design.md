# Primary Guild Sync & Global Command Registration

**Date:** 2026-03-18
**Status:** Approved

## Overview

Enhance RuralBot to support a "primary guild" concept where all command responses are mirrored, all channel/thread creation is centralized, and slash commands work globally as a Discord app.

## Goals

1. **Primary guild + sync channel** — all command replies from any guild are mirrored to a configurable channel in the primary guild
2. **Channel/thread creation centralization** — services that create channels/threads (e.g., accounting order threads) only create them in the primary guild, never in other guilds
3. **Auto-register commands on guild join** — `guildCreate` event deploys commands instantly
4. **Hybrid global + guild command deployment** — global commands for all servers, guild-scoped for primary guild (instant updates)

## Data Model

New `BotConfig` Prisma model — single-row table (enforced by `id = 1` pattern like `SystemHealth`):

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

- `primaryGuildId` — the one guild that receives all mirrored command responses and channel/thread creation
- `syncChannelId` — the specific channel in that guild where mirrors go
- Only one primary guild globally — setting a new one replaces the old one

## `/bot-config` Slash Command

**File:** `src/commands/config/bot-config.cmd.ts`

- **Subcommands:**
  - `/bot-config set` — sets primary guild (current guild) and sync channel (channel option)
  - `/bot-config view` — shows current config (primary guild name + sync channel)
- **Permissions:** Requires `Administrator`
- **Behavior:**
  - `set` always uses the guild where the command is run as `primaryGuildId`
  - Only one row ever exists — upserts on `id = 1`
  - Confirms with an ephemeral reply showing the new config
  - On `set`, also ensures an `AccountingConfig` entry exists for the primary guild (required for thread logger redirection)

**Repository:** `src/services/config/repo_bot_config.ts` — `upsertConfig()`, `getConfig()`, `getCachedConfig()`

## Response Mirroring System

**File:** `src/services/config/sync_mirror.ts`

A utility function `mirrorToSyncChannel()`:

- Wraps the command handler's `execute()` in `command_handler.ts` so every command auto-mirrors without modifying individual command files
- After `execute()` completes, reconstructs the response (embeds, content) from `interaction.fetchReply()` and sends to the sync channel
- **Ephemeral replies:** Since ephemeral replies cannot be fetched/forwarded, the wrapper intercepts the interaction to track what was sent. Commands build embeds before replying — the mirror captures the embed objects directly from the reply options passed to `interaction.reply()` / `interaction.editReply()`, rather than fetching from Discord API
- Components (buttons, select menus) are stripped from mirrored messages — they are non-functional outside the original context
- Adds a footer to mirrored embeds: guild name, channel, and user who ran the command
- **Caching:** `BotConfig` is loaded once at startup and cached in-memory (same pattern as `loadLogConfigs`). Cache refreshed when `/bot-config set` is called
- If `BotConfig` doesn't exist or sync channel is unreachable, silently skips (no crash, warning logged)

## Channel/Thread Creation Redirection

Modify services that create channels/threads (currently `thread_logger.ts` for accounting order threads):

- Before creating a channel/thread, look up `BotConfig` to find the primary guild
- **If no BotConfig exists:** fall back to current behavior (create in originating guild)
- **If primary guild configured:** always create channels/threads in the primary guild, regardless of which guild triggered the command
- The thread logger uses `getAccountingConfig(primaryGuildId)` instead of the originating guild's ID — this requires the primary guild to have a valid `AccountingConfig` entry (enforced by `/bot-config set`)

## `guildCreate` Event Handler

**File:** `src/events/guild/guild-create.event.ts`

- Fires when bot joins a new server
- Deploys slash commands to the new guild via REST API (guild-scoped for instant availability)
- Rate limited: queues deployment with a 2-second delay to respect Discord's API limits (2 creates per minute per guild)
- Logs the event via existing logger system: guild name, member count, etc.

## Hybrid Command Deployment

Modify `command_handler.ts` startup:

- Deploy commands **globally** (for all servers + DMs) — this is the primary registration method
- On `guildCreate`, deploy guild-scoped to the new guild as well (instant availability without waiting for global 1-hour cache)
- **Deprecate `SERVER_ID` env var** — replaced by database-driven `BotConfig.primaryGuildId`. Remove the `SERVER_ID` conditional logic from `deployCommands()`
- **No duplicate commands:** Global registration covers all guilds including primary. Guild-scoped deployment only used for new guilds (temporary until global cache syncs) — these can be cleaned up or will be overridden by global registration

## Files to Create/Modify

### New Files
- `src/services/config/repo_bot_config.ts` — BotConfig repository with caching
- `src/services/config/sync_mirror.ts` — response mirroring utility
- `src/commands/config/bot-config.cmd.ts` — config slash command
- `src/events/guild/guild-create.event.ts` — guild join event handler

### New Directories
- `src/services/config/` — new domain directory
- `src/commands/config/` — new command directory
- `src/events/guild/` — new event directory

### Modified Files
- `src/prisma/schema.prisma` — add BotConfig model
- `src/core/command_handler.ts` — wrap execute with mirroring, global deployment, remove `SERVER_ID` logic
- `src/index.ts` — register new command, attach guildCreate event, load BotConfig cache on startup
- `src/services/accounting/thread_logger.ts` — redirect thread creation to primary guild

### Deprecated
- `SERVER_ID` environment variable — no longer used for command deployment

## Error Handling

- **Missing BotConfig:** mirroring silently skips, thread creation falls back to originating guild, no crash
- **Sync channel unreachable:** log warning via logger, continue normal operation
- **Guild deploy failure on join:** log error, commands still available via global registration
- **Missing AccountingConfig for primary guild:** log warning, skip thread creation (admin must run `/accounting-setup` in primary guild)
