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
  primaryGuildId String
  syncChannelId  String
  updatedAt      DateTime @updatedAt
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

**Repository:** `src/services/config/repo_bot_config.ts` — `upsertConfig()`, `getConfig()`

## Response Mirroring System

**File:** `src/services/config/sync_mirror.ts`

A utility function `mirrorToSyncChannel()`:

- Called after every command's `interaction.reply()` / `interaction.editReply()`
- Fetches the reply from the interaction and sends an exact copy (embeds, components stripped of interactivity) to the sync channel
- Wraps the command handler's `execute()` in `command_handler.ts` so every command auto-mirrors without modifying individual command files
- If `BotConfig` doesn't exist or sync channel is unreachable, silently skips (no crash)

## Channel/Thread Creation Redirection

Modify services that create channels/threads (currently `thread_logger.ts` for accounting order threads):

- Before creating a channel/thread, check if current guild is the primary guild
- **If primary guild:** create normally
- **If other guild:** redirect creation to the primary guild instead (fetch primary guild's config, create threads there)
- All daily order threads, accounting channels etc. live in the primary guild only

## `guildCreate` Event Handler

**File:** `src/events/guild/guild-create.event.ts`

- Fires when bot joins a new server
- Deploys slash commands to the new guild via REST API (guild-scoped for instant availability)
- Logs the event via existing logger system: guild name, member count, etc.

## Hybrid Command Deployment

Modify `command_handler.ts` startup:

- Deploy commands **globally** (for all servers + DMs)
- **Also** deploy to primary guild (guild-scoped for instant updates during development)
- On `guildCreate`, deploy guild-scoped to the new guild as well (instant availability without waiting for global cache)

## Files to Create/Modify

### New Files
- `src/services/config/repo_bot_config.ts` — BotConfig repository
- `src/services/config/sync_mirror.ts` — response mirroring utility
- `src/commands/config/bot-config.cmd.ts` — config slash command
- `src/events/guild/guild-create.event.ts` — guild join event handler

### Modified Files
- `src/prisma/schema.prisma` — add BotConfig model
- `src/core/command_handler.ts` — wrap execute with mirroring, hybrid deployment
- `src/index.ts` — register new command, attach guildCreate event, add Guilds intent
- `src/services/accounting/thread_logger.ts` — redirect thread creation to primary guild

## Error Handling

- Missing BotConfig: mirroring silently skips, no crash
- Sync channel unreachable: log warning, continue normal operation
- Guild deploy failure on join: log error, commands still available via global registration
