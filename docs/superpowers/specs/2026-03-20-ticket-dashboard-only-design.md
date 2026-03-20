# Ticket Dashboard-Only Refactoring Spec

## Goal

Remove Discord slash commands for ticket setup, make all ticket configuration dashboard-only with auto-detected guild selection and channel dropdowns.

## Changes

### Backend — `src/services/dashboard/server.ts`

1. `startDashboard()` signature changes to `startDashboard(client: Client)` to receive the Discord client
2. New API endpoints:
   - `GET /api/guilds` — returns `client.guilds.cache` as `{ id, name, icon, memberCount }[]`
   - `GET /api/guilds/:id/channels` — returns text channels and categories for a guild from `client.guilds.cache.get(id).channels.cache`
   - `POST /api/ticket/deploy-panel/:guildId` — uses the client to send/update the panel message in the configured channel

### Backend — `src/index.ts`

1. Change `startDashboard()` to `startDashboard(readyClient)`
2. Remove imports and `registerCommand` for `ticket-setup` and `ticket-panel`

### Delete Files

- `src/commands/ticket/ticket-setup.cmd.ts`
- `src/commands/ticket/ticket-panel.cmd.ts`

### Frontend — `dashboard/src/api/client.ts`

New API functions:
- `fetchGuilds()` → `GET /api/guilds`
- `fetchGuildChannels(guildId)` → `GET /api/guilds/:id/channels`
- `deployTicketPanel(guildId)` → `POST /api/ticket/deploy-panel/:guildId`

### Frontend — `dashboard/src/types.ts`

New interfaces:
- `DiscordGuild { id, name, icon, memberCount }`
- `DiscordChannel { id, name, type, parentId }`

### Frontend — `dashboard/src/components/TicketDashboard.tsx`

Replace manual guildId text input with:
1. On mount, fetch `/api/guilds` to get all guilds the bot is in
2. Render a dropdown/select to pick a guild
3. On select, fetch TicketConfig (upsert on first save)

### Frontend — `dashboard/src/components/TicketSettings.tsx`

1. Fetch `/api/guilds/:id/channels` on mount
2. Replace text inputs for channelId/categoryId with `<select>` dropdowns filtered by channel type
3. Add "部署面板" button that calls `POST /api/ticket/deploy-panel/:guildId`
