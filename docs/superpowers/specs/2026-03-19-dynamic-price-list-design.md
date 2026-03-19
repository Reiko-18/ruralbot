# Dynamic Multi-Level Price List System — Design Spec

## Overview

A dynamic, hierarchical price list system for the RuralBot Discord bot. Users navigate categories and games via Discord select menus. Administrators manage content through an integrated web dashboard (Express + React SPA) without modifying code.

## Decisions

- **Management UI**: Integrated into the bot process — Express serves REST API + React SPA static files
- **Authentication**: None (local/internal use only)
- **Dashboard stack**: React + Vite + TypeScript + Tailwind CSS + Lucide Icons, built to `dashboard/dist/`
- **Discord interaction**: Global `interactionCreate` listener with `customId`-based state (no collector timeout)
- **Initial data**: Empty system — all content added via Dashboard
- **Relationship to Category/Product**: Separate concern — Category/Product is internal accounting, PriceNode/PriceItem is public-facing price display

---

## 1. Data Layer

### 1.1 Prisma Schema

```prisma
model PriceNode {
  id        String      @id @default(cuid())
  name      String
  content   String?     @db.Text
  imageUrl  String?     @map("image_url")
  parentId  String?     @map("parent_id")
  order     Int         @default(0)
  createdAt DateTime    @default(now()) @map("created_at")
  updatedAt DateTime    @updatedAt @map("updated_at")

  parent    PriceNode?  @relation("MenuHierarchy", fields: [parentId], references: [id], onDelete: Cascade)
  children  PriceNode[] @relation("MenuHierarchy")
  items     PriceItem[]

  @@map("price_nodes")
}

model PriceItem {
  id        String    @id @default(cuid())
  label     String
  price     String    // String to support free-form text (e.g. "$250", "NT$500/月", "洽詢")
  nodeId    String    @map("node_id")
  order     Int       @default(0)
  createdAt DateTime  @default(now()) @map("created_at")
  updatedAt DateTime  @updatedAt @map("updated_at")

  node      PriceNode @relation(fields: [nodeId], references: [id], onDelete: Cascade)

  @@map("price_items")
}
```

Notes:
- `PriceNode` uses a self-referencing parent-child relation (`MenuHierarchy`) for unlimited nesting
- `parentId = null` means root-level node
- `onDelete: Cascade` on the parent relation ensures deleting a node removes all descendants
- `PriceItem.price` is `String` intentionally to support free-form price text (ranges, currencies, "call for price")
- All field/table names use `@map`/`@@map` with snake_case to match existing DB conventions
- `createdAt`/`updatedAt` included to match existing model conventions

### 1.2 Repository (`src/services/price/repo_price_node.ts`)

Functions:
- `getRootNodes()` — all nodes where `parentId` is null, ordered by `order`
- `getNodeById(id)` — single node with `children` (ordered) and `items` (ordered) included
- `getFullTree()` — fetch ALL nodes + items in a single `findMany`, assemble tree in application code (avoids N+1)
- `createNode(data)` / `updateNode(id, data)` / `deleteNode(id)`
- `createItem(data)` / `updateItem(id, data)` / `deleteItem(id)`
- `reorderNodes(parentId, ids: string[])` — batch update `order` field by array index; scoped to siblings sharing the same `parentId`; wrapped in `prisma.$transaction()` for atomicity
- `reorderItems(nodeId, ids: string[])` — batch update `order` field by array index; scoped to items within one node; wrapped in `prisma.$transaction()` for atomicity

### 1.3 Cache (`src/services/price/price_cache.ts`)

- On startup: load all `PriceNode` (with children + items) into an in-memory `Map<string, PriceNode>`
- `getCachedNode(id)` — O(1) lookup
- `getCachedRoots()` — filtered from cache
- `refreshPriceCache()` — reload everything from DB; called after any dashboard mutation
- Uses a simple mutex flag to prevent concurrent refresh races
- Exported for use by Discord interaction handler and PriceListBuilder

---

## 2. Discord Interaction Layer

### 2.1 Command: `/price-list send <channel>`

File: `src/commands/price/price-list.cmd.ts`

- Accepts one required option: `channel` (ChannelType.GuildText)
- Calls `buildPriceView(null)` to generate root-level embed + select menu
- Sends the message to the specified channel (not ephemeral — persistent message)
- Replies ephemeral confirmation to the invoking user

### 2.2 PriceListBuilder (`src/services/price/price_list_builder.ts`)

Function signature: `buildPriceView(nodeId: string | null) => { embeds, components }`

**Empty state (root has zero nodes):**
- Embed title: "📋 價目表"
- Embed description: "目前沒有任何價目表，請至管理面板新增。"
- No select menu component (Discord rejects SelectMenu with 0 options)

**When `nodeId` is null (root) with children:**
- Embed title: "📋 價目表"
- Embed description: general welcome/instruction text
- SelectMenu options: root-level children sorted by `order`

**When node has children (category page):**
- Embed title: node.name
- Embed description: node.content (if set)
- Embed image: node.imageUrl (if set)
- SelectMenu options: children sorted by `order` + "⬅ 返回" option with value `back:<parentId || root>`

**When node has items (leaf/game page):**
- Embed title: node.name
- Embed description: node.content (if set)
- Embed fields: items sorted by `order`, each as `{ name: item.label, value: item.price, inline: true }`
- Embed image: node.imageUrl (if set)
- SelectMenu: only "⬅ 返回" option with value `back:<parentId || root>`

**Discord 25-option limit:** Each node is limited to a maximum of 24 children (leaving 1 slot for the "back" option). The dashboard enforces this limit on creation. If exceeded, the builder truncates to 24 with a warning in the embed footer.

### 2.3 Event Handler (`src/events/price/price-menu.event.ts`)

- Registered via a `registerPriceMenuEvent(client)` function called from `index.ts`
- Inside: `client.on('interactionCreate', handler)` — this is a second listener (discord.js supports multiple listeners on the same event)
- Filters: `interaction.isStringSelectMenu() && interaction.customId === 'price_menu'`
- Value parsing:
  - `back:root` → call `buildPriceView(null)`
  - `back:<parentId>` → call `buildPriceView(parentId)`
  - `<nodeId>` → call `buildPriceView(nodeId)`
- Uses `interaction.update()` to edit the original message in-place
- No user filtering — anyone can navigate the menu
- Error handling: wraps in try/catch; on error, calls `interaction.update()` with an error embed ("載入失敗，請稍後再試") and logs via `logger.error()`

---

## 3. Web Dashboard

### 3.1 Express Server (`src/services/dashboard/server.ts`)

Mounted in `src/index.ts` after bot login. Listens on `process.env.DASHBOARD_PORT || 3000`, bound to `127.0.0.1` (localhost only) for security. Express startup errors are caught and logged without crashing the bot process.

**New dependencies:** `express`, `@types/express` (added to root `package.json`)

**REST API Routes:**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/price-nodes` | Full tree structure |
| GET | `/api/price-nodes/:id` | Single node + items |
| POST | `/api/price-nodes` | Create node |
| PUT | `/api/price-nodes/:id` | Update node |
| DELETE | `/api/price-nodes/:id` | Delete node (cascade) |
| POST | `/api/price-items` | Create item |
| PUT | `/api/price-items/:id` | Update item |
| DELETE | `/api/price-items/:id` | Delete item |
| PUT | `/api/reorder/nodes` | Batch reorder nodes (scoped by parentId) |
| PUT | `/api/reorder/items` | Batch reorder items (scoped by nodeId) |

**Input validation on all mutation endpoints:**
- Required fields: `name` (non-empty string) for nodes; `label` + `price` (non-empty) for items
- `parentId` must reference an existing node (if provided)
- `nodeId` must reference an existing node for items
- Children count check: reject if adding a child would exceed 24 siblings
- Return 400 with descriptive error message on validation failure

Every mutation endpoint calls `refreshPriceCache()` after the DB write.

**Static files:** `express.static('dashboard/dist')` with SPA fallback to `index.html`. If `dashboard/dist/` does not exist, the API still works; a warning is logged at startup.

### 3.2 React SPA (`dashboard/`)

Separate `package.json` with dependencies: `react`, `react-dom`, `@dnd-kit/core`, `@dnd-kit/sortable`, `lucide-react`.
Dev dependencies: `vite`, `@vitejs/plugin-react`, `typescript`, `tailwindcss`, `postcss`, `autoprefixer`, `@types/react`, `@types/react-dom`.

Build: `npm run build` outputs to `dashboard/dist/`. Added `build:dashboard` script to root `package.json` for convenience.

**Layout:**
```
┌─────────────────────────────────────────────────┐
│  Header: "RuralBot 價目表管理"                    │
├──────────────┬──────────────────────────────────┤
│  TreeView    │  NodeEditor    │ DiscordPreview  │
│  (left)      │  (center)      │ (right)         │
└──────────────┴──────────────────────────────────┘
```

**Components:**

1. **TreeView** — Recursive tree rendering of all PriceNodes
   - Shows node names with expand/collapse
   - Click to select → loads into NodeEditor
   - Drag-and-drop reorder via `@dnd-kit/sortable`
   - "Add category" button at root level
   - "Add child" button on each node

2. **NodeEditor** — Form for editing selected node
   - Fields: name, content (textarea), imageUrl
   - PriceItemList sub-component for leaf nodes
   - Save / Delete buttons
   - Save triggers API call → cache refresh

3. **PriceItemList** — CRUD list of PriceItems within a node
   - Inline editing: label + price fields
   - Add / Remove buttons
   - Drag-and-drop reorder

4. **DiscordPreview** — Live preview simulating Discord embed appearance
   - Renders current node data as a mock Discord embed
   - Updates reactively as form fields change
   - Shows select menu options preview

---

## 4. File Structure

```
src/
  commands/price/
    price-list.cmd.ts          # /price-list send command
  events/price/
    price-menu.event.ts        # Global select menu handler
  services/price/
    repo_price_node.ts         # Database repository
    price_cache.ts             # In-memory cache
    price_list_builder.ts      # Embed + component builder
  services/dashboard/
    server.ts                  # Express app + API routes
  types/
    price.type.ts              # TypeScript interfaces

dashboard/
  package.json
  vite.config.ts
  tailwind.config.js
  tsconfig.json
  index.html
  src/
    main.tsx
    App.tsx
    components/
      TreeView.tsx
      NodeEditor.tsx
      PriceItemList.tsx
      DiscordPreview.tsx
    api/
      client.ts                # fetch wrapper for API calls
    types.ts                   # shared types
```

---

## 5. Integration Points

- `src/index.ts`: Import and register `/price-list` command, call `registerPriceMenuEvent(client)`, start Express server after bot ready, load price cache on startup
- `src/core/command_handler.ts`: No changes needed (standard command registration)
- `deploy-commands.mjs`: Add `price-list` command definition with `channel` option
- Logger: All price operations logged via existing logger service
- `package.json`: Add `express` and `@types/express` dependencies; add `build:dashboard` script
