# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RuralBot is a TypeScript Discord/chat bot application using Prisma for database access.

## Architecture

The codebase follows a layered architecture with clear separation of concerns:

- **`src/index.ts`** — Application entry point
- **`src/commands/<feature>/<name>.cmd.ts`** — Bot command definitions, organized by feature domain. Each file defines a single command.
- **`src/events/<feature>/<name>.event.ts`** — Event handlers that act as controllers, mapping incoming events to service calls and database interactions.
- **`src/services/<feature>/repo_<name>.ts`** — Repository/service layer that encapsulates database queries and business logic via Prisma.
- **`src/types/<feature>.type.ts`** — TypeScript type definitions, one file per feature domain.
- **`src/core/db.ts`** — Shared Prisma database client instance.
- **`src/core/command_handler.ts`** — Command registration and dispatch system.
- **`src/prisma/schema.prisma`** — Prisma schema defining database models.

### Data Flow

```
Command/Event → Event Handler (controller) → Service/Repo → Prisma DB
```

### Conventions

- Command files use the `.cmd.ts` suffix
- Event files use the `.event.ts` suffix
- Type files use the `.type.ts` suffix
- Services acting as repositories are prefixed with `repo_`
- Features are grouped into subdirectories by domain name

### Rules
ALWAYS before making any change, Search on the web for the newest documentation.
And only implement if you are 100% sure it will owrk.
Before making any changes. Always look up the latest documentation using 3 syb agents.
Codex will review your works.

### Mindset
you are an enterprise grade engineer. You are paid millions. You dont make mistakes.