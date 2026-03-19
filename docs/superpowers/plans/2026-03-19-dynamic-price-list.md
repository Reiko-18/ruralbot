# Dynamic Multi-Level Price List — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a hierarchical price list system with Discord interactive navigation and a web dashboard for management.

**Architecture:** Prisma models (PriceNode tree + PriceItem) → Repository + in-memory cache → Discord embed builder with select menu navigation → Express REST API → React SPA dashboard with tree view, editor, and live Discord preview.

**Tech Stack:** TypeScript, Prisma (PostgreSQL), discord.js, Express, React + Vite + Tailwind CSS + Lucide Icons + @dnd-kit/sortable

**Spec:** `docs/superpowers/specs/2026-03-19-dynamic-price-list-design.md`

---

## File Map

### New Files (Bot)
| File | Responsibility |
|------|----------------|
| `src/types/price.type.ts` | TypeScript interfaces + constants |
| `src/services/price/repo_price_node.ts` | Database CRUD for PriceNode/PriceItem |
| `src/services/price/price_cache.ts` | In-memory cache with mutex refresh |
| `src/services/price/price_list_builder.ts` | Discord embed + select menu builder |
| `src/commands/price/price-list.cmd.ts` | `/price-list send` slash command |
| `src/events/price/price-menu.event.ts` | Global select menu interaction handler |
| `src/services/dashboard/server.ts` | Express app + REST API routes |

### New Files (Dashboard)
| File | Responsibility |
|------|----------------|
| `dashboard/package.json` | SPA dependencies |
| `dashboard/vite.config.ts` | Vite config with API proxy |
| `dashboard/tailwind.config.js` | Tailwind setup |
| `dashboard/postcss.config.js` | PostCSS for Tailwind |
| `dashboard/tsconfig.json` | TypeScript config for React |
| `dashboard/index.html` | SPA entry HTML |
| `dashboard/src/main.tsx` | React mount point |
| `dashboard/src/App.tsx` | Main layout (TreeView + Editor + Preview) |
| `dashboard/src/types.ts` | Shared TypeScript types |
| `dashboard/src/api/client.ts` | Fetch wrapper for API calls |
| `dashboard/src/components/TreeView.tsx` | Tree navigation with drag-and-drop |
| `dashboard/src/components/NodeEditor.tsx` | Node editing form |
| `dashboard/src/components/PriceItemList.tsx` | Price items CRUD list |
| `dashboard/src/components/DiscordPreview.tsx` | Live Discord embed preview |

### Modified Files
| File | Change |
|------|--------|
| `src/prisma/schema.prisma` | Add PriceNode + PriceItem models |
| `src/index.ts` | Register command, event, start Express, load cache |
| `deploy-commands.mjs` | Add price-list command definition |
| `package.json` | Add express + @types/express deps, build:dashboard script |

---

## Phase 1: Data Layer

### Task 1: Prisma Schema + Migration

**Files:**
- Modify: `src/prisma/schema.prisma`

- [ ] **Step 1: Add PriceNode and PriceItem models to schema**

Append to `src/prisma/schema.prisma`:

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
  price     String
  nodeId    String    @map("node_id")
  order     Int       @default(0)
  createdAt DateTime  @default(now()) @map("created_at")
  updatedAt DateTime  @updatedAt @map("updated_at")

  node      PriceNode @relation(fields: [nodeId], references: [id], onDelete: Cascade)

  @@map("price_items")
}
```

- [ ] **Step 2: Push schema to database**

Run: `npx prisma db push`
Expected: "Your database is now in sync with your Prisma schema."

- [ ] **Step 3: Regenerate Prisma client**

Run: `npx prisma generate`
Expected: "Generated Prisma Client"

- [ ] **Step 4: Commit**

```bash
git add src/prisma/schema.prisma
git commit -m "feat(price): add PriceNode and PriceItem models to Prisma schema"
```

---

### Task 2: Type Definitions

**Files:**
- Create: `src/types/price.type.ts`

- [ ] **Step 1: Create type definitions and constants**

```typescript
// src/types/price.type.ts

export const PRICE_MENU_ID = "price_menu";
export const MAX_CHILDREN_PER_NODE = 24;

export interface PriceNodeFlat {
  id: string;
  name: string;
  content: string | null;
  imageUrl: string | null;
  parentId: string | null;
  order: number;
}

export interface PriceItemData {
  id: string;
  label: string;
  price: string;
  nodeId: string;
  order: number;
}

export interface PriceNodeWithRelations extends PriceNodeFlat {
  children: PriceNodeFlat[];
  items: PriceItemData[];
}

export interface PriceTreeNode extends PriceNodeFlat {
  children: PriceTreeNode[];
  items: PriceItemData[];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types/price.type.ts
git commit -m "feat(price): add TypeScript type definitions and constants"
```

---

### Task 3: Repository Layer

**Files:**
- Create: `src/services/price/repo_price_node.ts`

- [ ] **Step 1: Create the repository with all CRUD functions**

```typescript
// src/services/price/repo_price_node.ts

import { prisma } from "../../core/db.js";
import type { PriceTreeNode } from "../../types/price.type.js";

// ── Node queries ──

export async function getRootNodes() {
  return prisma.priceNode.findMany({
    where: { parentId: null },
    orderBy: { order: "asc" },
    include: {
      children: { orderBy: { order: "asc" } },
      items: { orderBy: { order: "asc" } },
    },
  });
}

export async function getNodeById(id: string) {
  return prisma.priceNode.findUnique({
    where: { id },
    include: {
      children: { orderBy: { order: "asc" } },
      items: { orderBy: { order: "asc" } },
    },
  });
}

export async function getFullTree(): Promise<PriceTreeNode[]> {
  const allNodes = await prisma.priceNode.findMany({
    orderBy: { order: "asc" },
    include: { items: { orderBy: { order: "asc" } } },
  });

  const nodeMap = new Map<string, PriceTreeNode>();
  for (const node of allNodes) {
    nodeMap.set(node.id, { ...node, children: [] });
  }

  const roots: PriceTreeNode[] = [];
  for (const node of nodeMap.values()) {
    if (node.parentId) {
      const parent = nodeMap.get(node.parentId);
      if (parent) parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

export async function getChildrenCount(parentId: string | null) {
  return prisma.priceNode.count({
    where: { parentId },
  });
}

// ── Node mutations ──

export async function createNode(data: {
  name: string;
  content?: string;
  imageUrl?: string;
  parentId?: string;
}) {
  const maxOrder = await prisma.priceNode.aggregate({
    where: { parentId: data.parentId ?? null },
    _max: { order: true },
  });
  return prisma.priceNode.create({
    data: {
      name: data.name,
      content: data.content,
      imageUrl: data.imageUrl,
      parentId: data.parentId ?? null,
      order: (maxOrder._max.order ?? -1) + 1,
    },
    include: {
      children: { orderBy: { order: "asc" } },
      items: { orderBy: { order: "asc" } },
    },
  });
}

export async function updateNode(
  id: string,
  data: { name?: string; content?: string | null; imageUrl?: string | null },
) {
  return prisma.priceNode.update({
    where: { id },
    data,
    include: {
      children: { orderBy: { order: "asc" } },
      items: { orderBy: { order: "asc" } },
    },
  });
}

export async function deleteNode(id: string) {
  return prisma.priceNode.delete({ where: { id } });
}

// ── Item mutations ──

export async function createItem(data: {
  label: string;
  price: string;
  nodeId: string;
}) {
  const maxOrder = await prisma.priceItem.aggregate({
    where: { nodeId: data.nodeId },
    _max: { order: true },
  });
  return prisma.priceItem.create({
    data: {
      label: data.label,
      price: data.price,
      nodeId: data.nodeId,
      order: (maxOrder._max.order ?? -1) + 1,
    },
  });
}

export async function updateItem(
  id: string,
  data: { label?: string; price?: string },
) {
  return prisma.priceItem.update({ where: { id }, data });
}

export async function deleteItem(id: string) {
  return prisma.priceItem.delete({ where: { id } });
}

// ── Reorder ──

export async function reorderNodes(parentId: string | null, ids: string[]) {
  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.priceNode.update({
        where: { id },
        data: { order: index },
      }),
    ),
  );
}

export async function reorderItems(nodeId: string, ids: string[]) {
  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.priceItem.update({
        where: { id },
        data: { order: index },
      }),
    ),
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/services/price/repo_price_node.ts
git commit -m "feat(price): add repository layer for PriceNode and PriceItem"
```

---

### Task 4: In-Memory Cache

**Files:**
- Create: `src/services/price/price_cache.ts`

- [ ] **Step 1: Create the cache module**

```typescript
// src/services/price/price_cache.ts

import { prisma } from "../../core/db.js";
import { logger } from "../logger/logger.js";
import type { PriceNodeWithRelations } from "../../types/price.type.js";

let cache = new Map<string, PriceNodeWithRelations>();
let refreshing = false;

export async function loadPriceCache(): Promise<void> {
  const nodes = await prisma.priceNode.findMany({
    include: {
      children: { orderBy: { order: "asc" } },
      items: { orderBy: { order: "asc" } },
    },
    orderBy: { order: "asc" },
  });

  const newCache = new Map<string, PriceNodeWithRelations>();
  for (const node of nodes) {
    newCache.set(node.id, node);
  }
  cache = newCache;
  logger.info({ nodeCount: nodes.length }, "Price cache loaded");
}

export async function refreshPriceCache(): Promise<void> {
  if (refreshing) return;
  refreshing = true;
  try {
    await loadPriceCache();
  } finally {
    refreshing = false;
  }
}

export function getCachedNode(
  id: string,
): PriceNodeWithRelations | undefined {
  return cache.get(id);
}

export function getCachedRoots(): PriceNodeWithRelations[] {
  return Array.from(cache.values())
    .filter((n) => n.parentId === null)
    .sort((a, b) => a.order - b.order);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/services/price/price_cache.ts
git commit -m "feat(price): add in-memory cache with mutex refresh"
```

---

## Phase 2: Discord Interaction Layer

### Task 5: Price List Builder

**Files:**
- Create: `src/services/price/price_list_builder.ts`

- [ ] **Step 1: Create the embed + component builder**

```typescript
// src/services/price/price_list_builder.ts

import {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  type APIActionRowComponent,
  type APIMessageActionRowComponent,
} from "discord.js";
import { getCachedNode, getCachedRoots } from "./price_cache.js";
import {
  PRICE_MENU_ID,
  MAX_CHILDREN_PER_NODE,
} from "../../types/price.type.js";

interface PriceView {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<StringSelectMenuBuilder>[];
}

export function buildPriceView(nodeId: string | null): PriceView {
  if (nodeId === null) {
    return buildRootView();
  }
  const node = getCachedNode(nodeId);
  if (!node) {
    return buildErrorView("找不到此節點。");
  }
  if (node.children.length > 0) {
    return buildCategoryView(node);
  }
  return buildLeafView(node);
}

function buildRootView(): PriceView {
  const roots = getCachedRoots();
  const embed = new EmbedBuilder()
    .setTitle("📋 價目表")
    .setColor(0x5865f2);

  if (roots.length === 0) {
    embed.setDescription("目前沒有任何價目表，請至管理面板新增。");
    return { embeds: [embed], components: [] };
  }

  embed.setDescription("請從下方選單選擇分類：");

  const options = roots.slice(0, MAX_CHILDREN_PER_NODE).map((r) => ({
    label: r.name,
    value: r.id,
  }));

  const menu = new StringSelectMenuBuilder()
    .setCustomId(PRICE_MENU_ID)
    .setPlaceholder("選擇分類...")
    .addOptions(options);

  if (roots.length > MAX_CHILDREN_PER_NODE) {
    embed.setFooter({ text: `⚠️ 僅顯示前 ${MAX_CHILDREN_PER_NODE} 個分類` });
  }

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
  return { embeds: [embed], components: [row] };
}

function buildCategoryView(node: {
  id: string;
  name: string;
  content: string | null;
  imageUrl: string | null;
  parentId: string | null;
  children: { id: string; name: string }[];
}): PriceView {
  const embed = new EmbedBuilder()
    .setTitle(node.name)
    .setColor(0x5865f2);

  if (node.content) embed.setDescription(node.content);
  if (node.imageUrl) embed.setImage(node.imageUrl);

  const backValue = node.parentId ? `back:${node.parentId}` : "back:root";

  const options = node.children.slice(0, MAX_CHILDREN_PER_NODE).map((c) => ({
    label: c.name,
    value: c.id,
  }));
  options.push({ label: "⬅ 返回", value: backValue });

  if (node.children.length > MAX_CHILDREN_PER_NODE) {
    embed.setFooter({ text: `⚠️ 僅顯示前 ${MAX_CHILDREN_PER_NODE} 個子項目` });
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId(PRICE_MENU_ID)
    .setPlaceholder("選擇項目...")
    .addOptions(options);

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
  return { embeds: [embed], components: [row] };
}

function buildLeafView(node: {
  id: string;
  name: string;
  content: string | null;
  imageUrl: string | null;
  parentId: string | null;
  items: { label: string; price: string }[];
}): PriceView {
  const embed = new EmbedBuilder()
    .setTitle(node.name)
    .setColor(0x5865f2);

  if (node.content) embed.setDescription(node.content);
  if (node.imageUrl) embed.setImage(node.imageUrl);

  for (const item of node.items) {
    embed.addFields({ name: item.label, value: item.price, inline: true });
  }

  const backValue = node.parentId ? `back:${node.parentId}` : "back:root";

  const menu = new StringSelectMenuBuilder()
    .setCustomId(PRICE_MENU_ID)
    .setPlaceholder("操作...")
    .addOptions([{ label: "⬅ 返回", value: backValue }]);

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
  return { embeds: [embed], components: [row] };
}

function buildErrorView(message: string): PriceView {
  const embed = new EmbedBuilder()
    .setTitle("❌ 錯誤")
    .setDescription(message)
    .setColor(0xff0000);
  return { embeds: [embed], components: [] };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/services/price/price_list_builder.ts
git commit -m "feat(price): add PriceListBuilder for Discord embeds and select menus"
```

---

### Task 6: Slash Command `/price-list`

**Files:**
- Create: `src/commands/price/price-list.cmd.ts`

- [ ] **Step 1: Create the command file**

```typescript
// src/commands/price/price-list.cmd.ts

import {
  SlashCommandBuilder,
  MessageFlags,
  ChannelType,
  type ChatInputCommandInteraction,
  type TextChannel,
} from "discord.js";
import { buildPriceView } from "../../services/price/price_list_builder.js";
import { logger } from "../../services/logger/logger.js";

export const data = new SlashCommandBuilder()
  .setName("price-list")
  .setDescription("Deploy the interactive price list to a channel")
  .addChannelOption((o) =>
    o
      .setName("channel")
      .setDescription("Channel to send the price list to")
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const channel = interaction.options.getChannel("channel", true) as TextChannel;
    const view = buildPriceView(null);

    await channel.send({
      embeds: view.embeds,
      components: view.components,
    });

    logger.info(
      { channelId: channel.id, userId: interaction.user.id },
      "Price list deployed to channel",
    );

    await interaction.editReply(`✅ 價目表已發送至 <#${channel.id}>`);
  } catch (err) {
    logger.error({ err }, "Failed to deploy price list");
    await interaction.editReply("❌ 發送價目表失敗。");
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/commands/price/price-list.cmd.ts
git commit -m "feat(price): add /price-list send slash command"
```

---

### Task 7: Select Menu Event Handler

**Files:**
- Create: `src/events/price/price-menu.event.ts`

- [ ] **Step 1: Create the event handler**

```typescript
// src/events/price/price-menu.event.ts

import { type Client, Events } from "discord.js";
import { buildPriceView } from "../../services/price/price_list_builder.js";
import { PRICE_MENU_ID } from "../../types/price.type.js";
import { logger } from "../../services/logger/logger.js";

export function registerPriceMenuEvent(client: Client): void {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isStringSelectMenu()) return;
    if (interaction.customId !== PRICE_MENU_ID) return;

    try {
      const value = interaction.values[0];
      let view;

      if (value === "back:root") {
        view = buildPriceView(null);
      } else if (value.startsWith("back:")) {
        const parentId = value.slice(5);
        view = buildPriceView(parentId);
      } else {
        view = buildPriceView(value);
      }

      await interaction.update({
        embeds: view.embeds,
        components: view.components,
      });
    } catch (err) {
      logger.error({ err }, "Price menu interaction failed");
      try {
        await interaction.update({
          embeds: [
            {
              title: "❌ 載入失敗",
              description: "載入失敗，請稍後再試。",
              color: 0xff0000,
            },
          ],
          components: [],
        });
      } catch {
        // interaction already responded
      }
    }
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/events/price/price-menu.event.ts
git commit -m "feat(price): add global select menu event handler for price navigation"
```

---

### Task 8: Register Command + Event + Cache in index.ts

**Files:**
- Modify: `src/index.ts`
- Modify: `deploy-commands.mjs`

- [ ] **Step 1: Update index.ts — add imports**

Add after the `import * as botConfig` line (line 29):

```typescript
// Price commands
import * as priceList from "./commands/price/price-list.cmd.js";

// Price events
import { registerPriceMenuEvent } from "./events/price/price-menu.event.js";

// Price cache
import { loadPriceCache } from "./services/price/price_cache.js";
```

- [ ] **Step 2: Update index.ts — register command**

Add after `registerCommand(botConfig);` (line 49):

```typescript
registerCommand(priceList);
```

- [ ] **Step 3: Update index.ts — register event**

Add after `registerGuildCreateEvent(client);` (line 78):

```typescript
registerPriceMenuEvent(client);
```

- [ ] **Step 4: Update index.ts — load cache on ready**

Add after `await loadBotConfig();` (inside the ClientReady handler, around line 66):

```typescript
  await loadPriceCache();
```

- [ ] **Step 5: Update deploy-commands.mjs — add price-list command**

Add before the `// ── Deploy ──` section:

```javascript
// ── 16. price-list ──
const priceList = new SlashCommandBuilder()
  .setName("price-list")
  .setDescription("Deploy the interactive price list to a channel")
  .addChannelOption((o) =>
    o
      .setName("channel")
      .setDescription("Channel to send the price list to")
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true),
  );
```

Add `priceList` to the commands array.

- [ ] **Step 6: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add src/index.ts deploy-commands.mjs
git commit -m "feat(price): integrate price-list command, event handler, and cache into bot"
```

---

## Phase 3: Express REST API

### Task 9: Install Express + Create Server

**Files:**
- Modify: `package.json`
- Create: `src/services/dashboard/server.ts`

- [ ] **Step 1: Install Express**

Run: `npm install express && npm install -D @types/express`

- [ ] **Step 2: Create the Express server with all API routes**

```typescript
// src/services/dashboard/server.ts

import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { logger } from "../logger/logger.js";
import { refreshPriceCache } from "../price/price_cache.js";
import {
  getFullTree,
  getNodeById,
  createNode,
  updateNode,
  deleteNode,
  createItem,
  updateItem,
  deleteItem,
  reorderNodes,
  reorderItems,
  getChildrenCount,
} from "../price/repo_price_node.js";
import { MAX_CHILDREN_PER_NODE } from "../../types/price.type.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function startDashboard(): void {
  const app = express();
  app.use(express.json());

  // ── API Routes ──

  // GET /api/price-nodes — full tree
  app.get("/api/price-nodes", async (_req, res) => {
    try {
      const tree = await getFullTree();
      res.json(tree);
    } catch (err) {
      logger.error({ err }, "Failed to fetch price tree");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/price-nodes/:id — single node
  app.get("/api/price-nodes/:id", async (req, res) => {
    try {
      const node = await getNodeById(req.params.id);
      if (!node) return res.status(404).json({ error: "Node not found" });
      res.json(node);
    } catch (err) {
      logger.error({ err }, "Failed to fetch price node");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/price-nodes — create node
  app.post("/api/price-nodes", async (req, res) => {
    try {
      const { name, content, imageUrl, parentId } = req.body;
      if (!name || typeof name !== "string" || name.trim() === "") {
        return res.status(400).json({ error: "name is required" });
      }
      if (parentId) {
        const parent = await getNodeById(parentId);
        if (!parent) return res.status(400).json({ error: "parentId not found" });
      }
      const siblingCount = await getChildrenCount(parentId ?? null);
      if (siblingCount >= MAX_CHILDREN_PER_NODE) {
        return res.status(400).json({ error: `Maximum ${MAX_CHILDREN_PER_NODE} children per node` });
      }
      const node = await createNode({
        name: name.trim(),
        content: content || undefined,
        imageUrl: imageUrl || undefined,
        parentId: parentId || undefined,
      });
      await refreshPriceCache();
      logger.info({ nodeId: node.id, name: node.name }, "Price node created");
      res.status(201).json(node);
    } catch (err) {
      logger.error({ err }, "Failed to create price node");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PUT /api/price-nodes/:id — update node
  app.put("/api/price-nodes/:id", async (req, res) => {
    try {
      const existing = await getNodeById(req.params.id);
      if (!existing) return res.status(404).json({ error: "Node not found" });
      const { name, content, imageUrl } = req.body;
      if (name !== undefined && (typeof name !== "string" || name.trim() === "")) {
        return res.status(400).json({ error: "name cannot be empty" });
      }
      const node = await updateNode(req.params.id, {
        name: name?.trim(),
        content: content !== undefined ? content : undefined,
        imageUrl: imageUrl !== undefined ? imageUrl : undefined,
      });
      await refreshPriceCache();
      logger.info({ nodeId: node.id }, "Price node updated");
      res.json(node);
    } catch (err) {
      logger.error({ err }, "Failed to update price node");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // DELETE /api/price-nodes/:id — delete node (cascade)
  app.delete("/api/price-nodes/:id", async (req, res) => {
    try {
      const existing = await getNodeById(req.params.id);
      if (!existing) return res.status(404).json({ error: "Node not found" });
      await deleteNode(req.params.id);
      await refreshPriceCache();
      logger.info({ nodeId: req.params.id }, "Price node deleted");
      res.status(204).end();
    } catch (err) {
      logger.error({ err }, "Failed to delete price node");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/price-items — create item
  app.post("/api/price-items", async (req, res) => {
    try {
      const { label, price, nodeId } = req.body;
      if (!label || typeof label !== "string" || label.trim() === "") {
        return res.status(400).json({ error: "label is required" });
      }
      if (!price || typeof price !== "string" || price.trim() === "") {
        return res.status(400).json({ error: "price is required" });
      }
      if (!nodeId) {
        return res.status(400).json({ error: "nodeId is required" });
      }
      const node = await getNodeById(nodeId);
      if (!node) return res.status(400).json({ error: "nodeId not found" });
      const item = await createItem({
        label: label.trim(),
        price: price.trim(),
        nodeId,
      });
      await refreshPriceCache();
      logger.info({ itemId: item.id, nodeId }, "Price item created");
      res.status(201).json(item);
    } catch (err) {
      logger.error({ err }, "Failed to create price item");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PUT /api/price-items/:id — update item
  app.put("/api/price-items/:id", async (req, res) => {
    try {
      const { label, price } = req.body;
      if (label !== undefined && (typeof label !== "string" || label.trim() === "")) {
        return res.status(400).json({ error: "label cannot be empty" });
      }
      if (price !== undefined && (typeof price !== "string" || price.trim() === "")) {
        return res.status(400).json({ error: "price cannot be empty" });
      }
      const item = await updateItem(req.params.id, {
        label: label?.trim(),
        price: price?.trim(),
      });
      await refreshPriceCache();
      logger.info({ itemId: item.id }, "Price item updated");
      res.json(item);
    } catch (err: any) {
      if (err?.code === "P2025") {
        return res.status(404).json({ error: "Item not found" });
      }
      logger.error({ err }, "Failed to update price item");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // DELETE /api/price-items/:id — delete item
  app.delete("/api/price-items/:id", async (req, res) => {
    try {
      await deleteItem(req.params.id);
      await refreshPriceCache();
      logger.info({ itemId: req.params.id }, "Price item deleted");
      res.status(204).end();
    } catch (err: any) {
      if (err?.code === "P2025") {
        return res.status(404).json({ error: "Item not found" });
      }
      logger.error({ err }, "Failed to delete price item");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PUT /api/reorder/nodes — batch reorder
  app.put("/api/reorder/nodes", async (req, res) => {
    try {
      const { parentId, ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "ids array is required" });
      }
      await reorderNodes(parentId ?? null, ids);
      await refreshPriceCache();
      res.json({ success: true });
    } catch (err) {
      logger.error({ err }, "Failed to reorder nodes");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PUT /api/reorder/items — batch reorder
  app.put("/api/reorder/items", async (req, res) => {
    try {
      const { nodeId, ids } = req.body;
      if (!nodeId) return res.status(400).json({ error: "nodeId is required" });
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "ids array is required" });
      }
      await reorderItems(nodeId, ids);
      await refreshPriceCache();
      res.json({ success: true });
    } catch (err) {
      logger.error({ err }, "Failed to reorder items");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── Static files (SPA) ──
  const dashboardDist = path.resolve(__dirname, "../../../dashboard/dist");
  app.use(express.static(dashboardDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(dashboardDist, "index.html"), (err) => {
      if (err) res.status(404).send("Dashboard not built. Run: cd dashboard && npm run build");
    });
  });

  // ── Check for dashboard build ──
  const fs = await import("fs");
  if (!fs.existsSync(dashboardDist)) {
    logger.warn("dashboard/dist/ not found — dashboard UI unavailable. Run: cd dashboard && npm run build");
  }

  // ── Start server ──
  const port = parseInt(process.env.DASHBOARD_PORT || "3000", 10);
  const server = app.listen(port, "127.0.0.1", () => {
    logger.info({ port }, "Dashboard server started on http://127.0.0.1:" + port);
  });
  server.on("error", (err) => {
    logger.error({ err }, "Failed to start dashboard server");
  });
}
```

- [ ] **Step 3: Update index.ts — import and start dashboard**

Add import at the top of `src/index.ts`:

```typescript
import { startDashboard } from "./services/dashboard/server.js";
```

Add inside the `ClientReady` handler, after keep-alive services:

```typescript
  // Start dashboard
  startDashboard();
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/services/dashboard/server.ts src/index.ts
git commit -m "feat(price): add Express REST API server for dashboard"
```

---

## Phase 4: React Dashboard SPA

### Task 10: Dashboard Project Scaffold

**Files:**
- Create: `dashboard/package.json`, `dashboard/vite.config.ts`, `dashboard/tailwind.config.js`, `dashboard/postcss.config.js`, `dashboard/tsconfig.json`, `dashboard/index.html`

- [ ] **Step 1: Create dashboard directory and package.json**

```bash
mkdir -p dashboard/src/components dashboard/src/api
```

Create `dashboard/package.json`:

```json
{
  "name": "ruralbot-dashboard",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "@dnd-kit/core": "^6.3.1",
    "@dnd-kit/sortable": "^10.0.0",
    "@dnd-kit/utilities": "^3.2.2",
    "lucide-react": "^0.511.0"
  },
  "devDependencies": {
    "@types/react": "^19.1.4",
    "@types/react-dom": "^19.1.5",
    "@vitejs/plugin-react": "^4.5.2",
    "autoprefixer": "^10.4.21",
    "postcss": "^8.5.4",
    "tailwindcss": "^3.4.17",
    "typescript": "^5.9.3",
    "vite": "^6.3.5"
  }
}
```

- [ ] **Step 2: Create vite.config.ts**

```typescript
// dashboard/vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:3000",
    },
  },
  build: {
    outDir: "dist",
  },
});
```

- [ ] **Step 3: Create tailwind.config.js**

```javascript
// dashboard/tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
};
```

- [ ] **Step 4: Create postcss.config.js**

```javascript
// dashboard/postcss.config.js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 5: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true
  },
  "include": ["src"]
}
```

- [ ] **Step 6: Create index.html**

```html
<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>RuralBot 價目表管理</title>
</head>
<body class="bg-gray-900 text-gray-100">
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

- [ ] **Step 7: Update .gitignore**

Add to the project root `.gitignore`:
```
dashboard/node_modules/
dashboard/dist/
```

- [ ] **Step 8: Install dependencies**

Run: `cd dashboard && npm install`

- [ ] **Step 9: Add build:dashboard script to root package.json**

Add to root `package.json` scripts:
```json
"build:dashboard": "cd dashboard && npm run build"
```

- [ ] **Step 10: Commit**

```bash
git add dashboard/ package.json .gitignore
git commit -m "feat(dashboard): scaffold React + Vite + Tailwind project"
```

---

### Task 11: Dashboard Types + API Client

**Files:**
- Create: `dashboard/src/types.ts`
- Create: `dashboard/src/api/client.ts`
- Create: `dashboard/src/index.css`

- [ ] **Step 1: Create shared types**

```typescript
// dashboard/src/types.ts

export interface PriceItem {
  id: string;
  label: string;
  price: string;
  nodeId: string;
  order: number;
}

export interface PriceNode {
  id: string;
  name: string;
  content: string | null;
  imageUrl: string | null;
  parentId: string | null;
  order: number;
  children: PriceNode[];
  items: PriceItem[];
}
```

- [ ] **Step 2: Create API client**

```typescript
// dashboard/src/api/client.ts

import type { PriceNode, PriceItem } from "../types";

const BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// Nodes
export const fetchTree = () => request<PriceNode[]>("/price-nodes");

export const fetchNode = (id: string) => request<PriceNode>(`/price-nodes/${id}`);

export const createNode = (data: {
  name: string;
  content?: string;
  imageUrl?: string;
  parentId?: string;
}) => request<PriceNode>("/price-nodes", { method: "POST", body: JSON.stringify(data) });

export const updateNode = (id: string, data: {
  name?: string;
  content?: string | null;
  imageUrl?: string | null;
}) => request<PriceNode>(`/price-nodes/${id}`, { method: "PUT", body: JSON.stringify(data) });

export const deleteNode = (id: string) =>
  request<void>(`/price-nodes/${id}`, { method: "DELETE" });

// Items
export const createItem = (data: { label: string; price: string; nodeId: string }) =>
  request<PriceItem>("/price-items", { method: "POST", body: JSON.stringify(data) });

export const updateItem = (id: string, data: { label?: string; price?: string }) =>
  request<PriceItem>(`/price-items/${id}`, { method: "PUT", body: JSON.stringify(data) });

export const deleteItem = (id: string) =>
  request<void>(`/price-items/${id}`, { method: "DELETE" });

// Reorder
export const reorderNodes = (parentId: string | null, ids: string[]) =>
  request<{ success: boolean }>("/reorder/nodes", {
    method: "PUT",
    body: JSON.stringify({ parentId, ids }),
  });

export const reorderItems = (nodeId: string, ids: string[]) =>
  request<{ success: boolean }>("/reorder/items", {
    method: "PUT",
    body: JSON.stringify({ nodeId, ids }),
  });
```

- [ ] **Step 3: Create index.css with Tailwind imports**

```css
/* dashboard/src/index.css */
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/
git commit -m "feat(dashboard): add types, API client, and Tailwind CSS setup"
```

---

### Task 12: Main App + TreeView Component

**Files:**
- Create: `dashboard/src/main.tsx`
- Create: `dashboard/src/App.tsx`
- Create: `dashboard/src/components/TreeView.tsx`

- [ ] **Step 1: Create main.tsx entry point**

```tsx
// dashboard/src/main.tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 2: Create App.tsx layout**

```tsx
// dashboard/src/App.tsx
import { useState, useEffect, useCallback } from "react";
import type { PriceNode } from "./types";
import { fetchTree } from "./api/client";
import { TreeView } from "./components/TreeView";
import { NodeEditor } from "./components/NodeEditor";
import { DiscordPreview } from "./components/DiscordPreview";

export default function App() {
  const [tree, setTree] = useState<PriceNode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const data = await fetchTree();
      setTree(data);
    } catch (err) {
      console.error("Failed to load tree:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const findNode = (nodes: PriceNode[], id: string): PriceNode | null => {
    for (const node of nodes) {
      if (node.id === id) return node;
      const found = findNode(node.children, id);
      if (found) return found;
    }
    return null;
  };

  const selected = selectedId ? findNode(tree, selectedId) : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-400">
        載入中...
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-3">
        <h1 className="text-xl font-bold">RuralBot 價目表管理</h1>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <div className="w-72 border-r border-gray-700 overflow-y-auto bg-gray-850">
          <TreeView
            tree={tree}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onReload={reload}
          />
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {selected ? (
            <NodeEditor
              node={selected}
              onSave={reload}
              onDelete={() => {
                setSelectedId(null);
                reload();
              }}
            />
          ) : (
            <div className="text-gray-500 text-center mt-20">
              ← 從左側選擇一個節點開始編輯
            </div>
          )}
        </div>
        <div className="w-96 border-l border-gray-700 overflow-y-auto p-4 bg-gray-800">
          <DiscordPreview node={selected} roots={tree} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create TreeView.tsx**

```tsx
// dashboard/src/components/TreeView.tsx
import { useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  Plus,
  FolderOpen,
  File,
  GripVertical,
} from "lucide-react";
import type { PriceNode } from "../types";
import { createNode, reorderNodes } from "../api/client";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface TreeViewProps {
  tree: PriceNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReload: () => Promise<void>;
}

export function TreeView({ tree, selectedId, onSelect, onReload }: TreeViewProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = tree.findIndex((n) => n.id === active.id);
    const newIndex = tree.findIndex((n) => n.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(tree, oldIndex, newIndex);
    try {
      await reorderNodes(null, reordered.map((n) => n.id));
      await onReload();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
          分類
        </span>
        <AddNodeButton parentId={undefined} onReload={onReload} />
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={tree.map((n) => n.id)} strategy={verticalListSortingStrategy}>
          {tree.map((node) => (
            <SortableTreeNode
              key={node.id}
              node={node}
              depth={0}
              selectedId={selectedId}
              onSelect={onSelect}
              onReload={onReload}
            />
          ))}
        </SortableContext>
      </DndContext>
      {tree.length === 0 && (
        <p className="text-gray-500 text-sm text-center mt-4">尚無分類</p>
      )}
    </div>
  );
}

function SortableTreeNode({
  node,
  depth,
  selectedId,
  onSelect,
  onReload,
}: {
  node: PriceNode;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReload: () => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;
  const isSelected = node.id === selectedId;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: node.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleChildDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = node.children.findIndex((c) => c.id === active.id);
    const newIndex = node.children.findIndex((c) => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(node.children, oldIndex, newIndex);
    try {
      await reorderNodes(node.id, reordered.map((c) => c.id));
      await onReload();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div
        className={`flex items-center gap-1 px-2 py-1.5 rounded cursor-pointer group hover:bg-gray-700 ${
          isSelected ? "bg-gray-700 text-white" : "text-gray-300"
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => onSelect(node.id)}
      >
        <span {...attributes} {...listeners} className="cursor-grab text-gray-500 hover:text-gray-300">
          <GripVertical size={14} />
        </span>
        {hasChildren ? (
          <button
            className="p-0.5 hover:text-white"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : (
          <span className="w-5" />
        )}
        {hasChildren ? (
          <FolderOpen size={14} className="text-yellow-400" />
        ) : (
          <File size={14} className="text-blue-400" />
        )}
        <span className="flex-1 text-sm truncate">{node.name}</span>
        <span className="opacity-0 group-hover:opacity-100">
          <AddNodeButton parentId={node.id} onReload={onReload} />
        </span>
      </div>
      {expanded && hasChildren && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleChildDragEnd}>
          <SortableContext items={node.children.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            {node.children.map((child) => (
              <SortableTreeNode
                key={child.id}
                node={child}
                depth={depth + 1}
                selectedId={selectedId}
                onSelect={onSelect}
                onReload={onReload}
              />
            ))}
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

function AddNodeButton({
  parentId,
  onReload,
}: {
  parentId: string | undefined;
  onReload: () => Promise<void>;
}) {
  const handleAdd = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const name = prompt("輸入名稱：");
    if (!name?.trim()) return;
    try {
      await createNode({ name: name.trim(), parentId });
      await onReload();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <button
      className="p-0.5 hover:text-green-400 text-gray-500"
      onClick={handleAdd}
      title="新增子項目"
    >
      <Plus size={14} />
    </button>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/main.tsx dashboard/src/App.tsx dashboard/src/components/TreeView.tsx
git commit -m "feat(dashboard): add main app layout and TreeView component"
```

---

### Task 13: NodeEditor Component

**Files:**
- Create: `dashboard/src/components/NodeEditor.tsx`

- [ ] **Step 1: Create NodeEditor with form and delete**

```tsx
// dashboard/src/components/NodeEditor.tsx
import { useState, useEffect } from "react";
import { Save, Trash2 } from "lucide-react";
import type { PriceNode } from "../types";
import { updateNode, deleteNode } from "../api/client";
import { PriceItemList } from "./PriceItemList";

interface NodeEditorProps {
  node: PriceNode;
  onSave: () => Promise<void>;
  onDelete: () => void;
}

export function NodeEditor({ node, onSave, onDelete }: NodeEditorProps) {
  const [name, setName] = useState(node.name);
  const [content, setContent] = useState(node.content ?? "");
  const [imageUrl, setImageUrl] = useState(node.imageUrl ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(node.name);
    setContent(node.content ?? "");
    setImageUrl(node.imageUrl ?? "");
  }, [node.id, node.name, node.content, node.imageUrl]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateNode(node.id, {
        name: name.trim(),
        content: content || null,
        imageUrl: imageUrl || null,
      });
      await onSave();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`確定要刪除「${node.name}」及其所有子項目嗎？`)) return;
    try {
      await deleteNode(node.id);
      onDelete();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">編輯節點</h2>
        <div className="flex gap-2">
          <button
            className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-sm disabled:opacity-50"
            onClick={handleSave}
            disabled={saving || !name.trim()}
          >
            <Save size={14} /> 儲存
          </button>
          <button
            className="flex items-center gap-1 px-3 py-1.5 bg-red-600 hover:bg-red-500 rounded text-sm"
            onClick={handleDelete}
          >
            <Trash2 size={14} /> 刪除
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm text-gray-400 mb-1">名稱</label>
          <input
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">說明文字</label>
          <textarea
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500 min-h-[80px]"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">圖片連結</label>
          <input
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://..."
          />
        </div>
      </div>

      <hr className="border-gray-700" />

      <div>
        <h3 className="text-sm font-semibold text-gray-400 mb-3">價目項目</h3>
        <PriceItemList nodeId={node.id} items={node.items} onReload={onSave} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/components/NodeEditor.tsx
git commit -m "feat(dashboard): add NodeEditor component with save/delete"
```

---

### Task 14: PriceItemList Component

**Files:**
- Create: `dashboard/src/components/PriceItemList.tsx`

- [ ] **Step 1: Create PriceItemList with inline editing**

```tsx
// dashboard/src/components/PriceItemList.tsx
import { useState, useEffect } from "react";
import { Plus, Trash2, GripVertical } from "lucide-react";
import type { PriceItem } from "../types";
import {
  createItem,
  updateItem,
  deleteItem,
  reorderItems,
} from "../api/client";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface PriceItemListProps {
  nodeId: string;
  items: PriceItem[];
  onReload: () => Promise<void>;
}

export function PriceItemList({ nodeId, items, onReload }: PriceItemListProps) {
  const [localItems, setLocalItems] = useState(items);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Sync local state when parent provides new items
  useEffect(() => {
    setLocalItems(items);
  }, [items]);

  const handleAdd = async () => {
    const label = prompt("項目名稱：");
    if (!label?.trim()) return;
    const price = prompt("價格：");
    if (!price?.trim()) return;
    try {
      await createItem({ label: label.trim(), price: price.trim(), nodeId });
      await onReload();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = localItems.findIndex((i) => i.id === active.id);
    const newIndex = localItems.findIndex((i) => i.id === over.id);
    const reordered = arrayMove(localItems, oldIndex, newIndex);
    setLocalItems(reordered);
    try {
      await reorderItems(nodeId, reordered.map((i) => i.id));
      await onReload();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={localItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-1">
            {localItems.map((item) => (
              <SortableItem key={item.id} item={item} onReload={onReload} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <button
        className="flex items-center gap-1 mt-3 px-3 py-1.5 text-sm text-green-400 hover:text-green-300 border border-gray-600 rounded hover:border-green-400"
        onClick={handleAdd}
      >
        <Plus size={14} /> 新增項目
      </button>
    </div>
  );
}

function SortableItem({
  item,
  onReload,
}: {
  item: PriceItem;
  onReload: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(item.label);
  const [price, setPrice] = useState(item.price);

  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: item.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleSave = async () => {
    try {
      await updateItem(item.id, { label: label.trim(), price: price.trim() });
      setEditing(false);
      await onReload();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteItem(item.id);
      await onReload();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 bg-gray-700 rounded px-2 py-1.5 group"
    >
      <span {...attributes} {...listeners} className="cursor-grab text-gray-500 hover:text-gray-300">
        <GripVertical size={14} />
      </span>
      {editing ? (
        <>
          <input
            className="flex-1 bg-gray-600 border border-gray-500 rounded px-2 py-1 text-sm"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
          />
          <input
            className="w-24 bg-gray-600 border border-gray-500 rounded px-2 py-1 text-sm"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
          />
          <button className="text-blue-400 text-sm hover:text-blue-300" onClick={handleSave}>
            保存
          </button>
          <button className="text-gray-400 text-sm hover:text-gray-300" onClick={() => setEditing(false)}>
            取消
          </button>
        </>
      ) : (
        <>
          <span
            className="flex-1 text-sm cursor-pointer hover:text-white"
            onClick={() => setEditing(true)}
          >
            {item.label}
          </span>
          <span className="text-sm text-green-400">{item.price}</span>
          <button
            className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300"
            onClick={handleDelete}
          >
            <Trash2 size={14} />
          </button>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/components/PriceItemList.tsx
git commit -m "feat(dashboard): add PriceItemList with drag-and-drop and inline editing"
```

---

### Task 15: DiscordPreview Component

**Files:**
- Create: `dashboard/src/components/DiscordPreview.tsx`

- [ ] **Step 1: Create Discord embed preview**

```tsx
// dashboard/src/components/DiscordPreview.tsx
import type { PriceNode } from "../types";

interface DiscordPreviewProps {
  node: PriceNode | null;
  roots: PriceNode[];
}

export function DiscordPreview({ node, roots }: DiscordPreviewProps) {
  const title = node ? node.name : "📋 價目表";
  const description = node
    ? node.content || undefined
    : roots.length > 0
      ? "請從下方選單選擇分類："
      : "目前沒有任何價目表，請至管理面板新增。";
  const imageUrl = node?.imageUrl || undefined;
  const items = node?.items ?? [];
  const children = node ? node.children : roots;
  const hasMenu = children.length > 0 || (node !== null);

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-400 mb-3">Discord 預覽</h3>

      {/* Embed */}
      <div className="bg-[#2b2d31] rounded-lg overflow-hidden border-l-4 border-[#5865f2]">
        <div className="p-4 space-y-2">
          <div className="font-semibold text-white">{title}</div>
          {description && (
            <div className="text-sm text-[#dbdee1]">{description}</div>
          )}
          {items.length > 0 && (
            <div className="grid grid-cols-3 gap-2 mt-2">
              {items.map((item) => (
                <div key={item.id}>
                  <div className="text-xs font-semibold text-white">{item.label}</div>
                  <div className="text-xs text-[#dbdee1]">{item.price}</div>
                </div>
              ))}
            </div>
          )}
          {imageUrl && (
            <img
              src={imageUrl}
              alt="preview"
              className="rounded mt-2 max-w-full"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          )}
        </div>
      </div>

      {/* Select Menu */}
      {hasMenu && (
        <div className="mt-2">
          <div className="bg-[#1e1f22] border border-[#3f4147] rounded px-3 py-2 text-sm text-[#949ba4]">
            {children.length > 0 ? "選擇項目..." : "操作..."}
          </div>
          <div className="mt-1 space-y-0.5">
            {children.map((child) => (
              <div
                key={child.id}
                className="text-xs text-[#dbdee1] bg-[#2b2d31] rounded px-3 py-1.5"
              >
                {child.name}
              </div>
            ))}
            {node && (
              <div className="text-xs text-[#dbdee1] bg-[#2b2d31] rounded px-3 py-1.5">
                ⬅ 返回
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/components/DiscordPreview.tsx
git commit -m "feat(dashboard): add Discord embed preview component"
```

---

## Phase 5: Integration + Deploy

### Task 16: Build, Test, and Deploy

- [ ] **Step 1: Build dashboard**

Run: `cd dashboard && npm run build`
Expected: Build succeeds, `dashboard/dist/` created with `index.html` + assets

- [ ] **Step 2: Verify TypeScript for bot**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Start the bot locally and verify**

Run: `npm start`
Expected:
- "Price cache loaded" in logs
- "Dashboard server started on http://127.0.0.1:3000" in logs
- Visit http://127.0.0.1:3000 to see the dashboard

- [ ] **Step 4: Deploy slash command**

Run: `node deploy-commands.mjs`
Expected: "Successfully deployed 16 global commands."

- [ ] **Step 5: Test Discord interaction**

In Discord:
1. Run `/price-list send #some-channel`
2. Verify the price list embed appears
3. If no nodes exist, verify it shows "目前沒有任何價目表"
4. Add nodes via dashboard, verify they appear in Discord after re-sending

- [ ] **Step 6: Final commit and push**

```bash
git add -A
git commit -m "feat(price): complete dynamic price list system with dashboard"
git push
```

---

### Task 17: Obsidian Documentation

**Files:**
- Create: `D:\reiko's coding corner\reiko's corner\ruralbot\dynamic-price-list.md`

- [ ] **Step 1: Write feature documentation**

Document the feature in Obsidian per CLAUDE.md requirements, covering:
- Feature overview (中/英雙語)
- Database models (PriceNode, PriceItem)
- Discord commands (/price-list send)
- Dashboard usage (http://127.0.0.1:3000)
- API endpoints reference
- File structure summary

- [ ] **Step 2: Commit documentation**

```bash
git add -A
git commit -m "docs: add dynamic price list feature documentation"
git push
```
