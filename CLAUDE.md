# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working in this repository.

## Project Overview

RuralBot is a TypeScript Discord bot and dashboard application using Prisma with PostgreSQL.

Production deployment now runs on a self-hosted Ubuntu server with:

- systemd service management
- local PostgreSQL on the same host
- cron-based GitHub polling for automatic deployment
- Express dashboard and API served by the bot process

Railway, Coolify, Supabase, and other PaaS-specific deployment assumptions are not part of the current production design.

## Architecture

The codebase follows a layered architecture with clear separation of concerns:

- `src/index.ts` — application entry point
- `src/commands/<feature>/<name>.cmd.ts` — bot command definitions
- `src/events/<feature>/<name>.event.ts` — event handlers that map incoming events to service calls
- `src/services/<feature>/repo_<name>.ts` — repository/service layer for Prisma queries and business logic
- `src/types/<feature>.type.ts` — TypeScript type definitions
- `src/core/db.ts` — shared Prisma database client instance
- `src/core/command_handler.ts` — command registration and dispatch system
- `src/prisma/schema.prisma` — Prisma schema
- `dashboard/` — Vite + React dashboard
- `ops/` — Ubuntu systemd and cron deployment templates

## Data Flow

```text
Command/Event -> Event Handler -> Service/Repo -> Prisma DB
Dashboard/API -> Express Route -> Service/Repo -> Prisma DB
```

## Conventions

- Command files use the `.cmd.ts` suffix.
- Event files use the `.event.ts` suffix.
- Type files use the `.type.ts` suffix.
- Services acting as repositories are prefixed with `repo_`.
- Features are grouped into subdirectories by domain name.
- Use TypeScript, ESM imports, 2-space indentation, and double-quoted strings.

## Deployment Rules

- Production is managed by `systemd` as a single `ruralbot` service.
- The recommended repository path on the host is `/opt/ruralbot`.
- The recommended environment file path is `/etc/ruralbot/ruralbot.env`.
- `DATABASE_URL` and `DIRECT_URL` should point to local PostgreSQL, for example:

```env
DATABASE_URL=postgresql://ruralbot:<password>@localhost:5432/ruralbot
DIRECT_URL=postgresql://ruralbot:<password>@localhost:5432/ruralbot
```

- Automatic deployment should use cron and `ops/ruralbot-auto-deploy.sh`.
- The deploy flow should use `git fetch` and `git pull --ff-only`, then run dependency install, Prisma generation, migrations, build, and systemd restart.
- Do not use destructive Git reset as the default deployment mechanism.

## Safety Rules

- Always review relevant code, documentation, and deployment settings before making changes.
- Always check current official documentation before implementing deployment, database, or framework-sensitive changes.
- Do not commit `.env`, database passwords, Discord tokens, SmilePay secrets, or any other secrets.
- Use the existing logger for critical flows and error handling.
- After changes, run necessary verification, update repo docs and Obsidian notes, then commit and push.

## Obsidian

External Obsidian notes are stored at:

```text
D:\reiko's coding corner\reiko's corner\ruralbot
```
