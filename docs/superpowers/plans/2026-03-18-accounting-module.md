# Accounting Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement an e-commerce accounting module with product/order management, profit calculation, and Discord thread-based logging.

**Architecture:** Layered architecture following existing patterns — slash commands → services/repos → Prisma DB. Orders logged to Discord threads named by date. Cascading select menu for sales overview.

**Tech Stack:** TypeScript, Discord.js v14, Prisma 7.x, PostgreSQL (Supabase), nanoid v5, pino logger

---

## File Structure

```
src/
  types/accounting.type.ts              — Type definitions and constants
  services/accounting/
    order_id.ts                         — nanoid-based 6-char ID generator
    profit_engine.ts                    — Profit calculation logic
    repo_category.ts                    — Category CRUD
    repo_product.ts                     — Product CRUD
    repo_order.ts                       — Order CRUD + aggregation queries
    repo_accounting_config.ts           — AccountingConfig CRUD
    thread_logger.ts                    — Discord thread creation + embed dispatch
  commands/accounting/
    accounting-setup.cmd.ts             — Admin sets log channel
    category-add.cmd.ts                 — Create category
    product-add.cmd.ts                  — Register product
    order-add.cmd.ts                    — Order from existing product
    order-custom.cmd.ts                 — Fully manual order
    order-delete.cmd.ts                 — Delete order by ID
    sales-overview.cmd.ts               — Sales summary with cascading select
    order-lookup.cmd.ts                 — Search orders
```

---

### Task 1: Install nanoid + Prisma Schema

**Files:**
- Modify: `package.json` (add nanoid)
- Modify: `src/prisma/schema.prisma` (add 4 models)

- [ ] **Step 1: Install nanoid**

```bash
npm install nanoid
```

- [ ] **Step 2: Add Prisma models**

Append to `src/prisma/schema.prisma`:

```prisma
model Category {
  id       String    @id @default(cuid())
  name     String    @unique
  products Product[]

  @@map("categories")
}

model Product {
  id            String   @id @default(cuid())
  name          String   @unique
  cost          Float
  price         Float
  source        String?
  categoryId    String   @map("category_id")
  faceValue     Float?   @map("face_value")
  costDiscount  Float?   @map("cost_discount")
  priceDiscount Float?   @map("price_discount")

  category Category @relation(fields: [categoryId], references: [id])
  orders   Order[]

  @@map("products")
}

model Order {
  id          String   @id
  productId   String?  @map("product_id")
  productName String   @map("product_name")
  quantity    Int      @default(1)
  actualPrice Float    @map("actual_price")
  actualCost  Float    @map("actual_cost")
  profit      Float
  isCustom    Boolean  @default(false) @map("is_custom")
  createdAt   DateTime @default(now()) @map("created_at")

  product Product? @relation(fields: [productId], references: [id])

  @@map("orders")
}

model AccountingConfig {
  id        String   @id @default(cuid())
  guildId   String   @unique @map("guild_id")
  channelId String   @map("channel_id")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("accounting_configs")
}
```

- [ ] **Step 3: Push schema to database**

```bash
npx prisma db push
```

- [ ] **Step 4: Generate Prisma client**

```bash
npm run db:generate
```

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/prisma/schema.prisma
git commit -m "feat(accounting): add Prisma models and nanoid dependency"
```

---

### Task 2: Type Definitions

**Files:**
- Create: `src/types/accounting.type.ts`

- [ ] **Step 1: Create type file**

```typescript
// src/types/accounting.type.ts

export interface ProfitResult {
  actualPrice: number;
  actualCost: number;
  profit: number;
}

export interface SalesAggregation {
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  orderCount: number;
}

// Cascading select menu states
export type OverviewState =
  | { level: "all" }
  | { level: "year"; year: number }
  | { level: "month"; year: number; month: number }
  | { level: "day"; year: number; month: number; day: number };
```

- [ ] **Step 2: Commit**

```bash
git add src/types/accounting.type.ts
git commit -m "feat(accounting): add type definitions"
```

---

### Task 3: Utility Services (order_id + profit_engine)

**Files:**
- Create: `src/services/accounting/order_id.ts`
- Create: `src/services/accounting/profit_engine.ts`

- [ ] **Step 1: Create order ID generator**

```typescript
// src/services/accounting/order_id.ts
import { customAlphabet } from "nanoid";
import { prisma } from "../../core/db.js";

const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const generate = customAlphabet(alphabet, 6);

export async function generateOrderId(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const id = generate();
    const exists = await prisma.order.findUnique({ where: { id } });
    if (!exists) return id;
  }
  throw new Error("Failed to generate unique order ID after 10 attempts");
}
```

- [ ] **Step 2: Create profit engine**

```typescript
// src/services/accounting/profit_engine.ts
import type { ProfitResult } from "../../types/accounting.type.js";

interface ProductData {
  price: number;
  cost: number;
  faceValue?: number | null;
  costDiscount?: number | null;
  priceDiscount?: number | null;
}

export function calculateProfit(
  product: ProductData,
  quantity: number,
  customPrice?: number,
): ProfitResult {
  const hasDiscount =
    product.faceValue != null &&
    product.costDiscount != null &&
    product.priceDiscount != null;

  let actualPrice: number;
  let actualCost: number;

  if (hasDiscount) {
    actualCost = product.faceValue! * product.costDiscount!;
    actualPrice = customPrice ?? product.faceValue! * product.priceDiscount!;
  } else {
    actualCost = product.cost;
    actualPrice = customPrice ?? product.price;
  }

  const profit = (actualPrice - actualCost) * quantity;

  return { actualPrice, actualCost, profit };
}

export function calculateCustomProfit(
  price: number,
  cost: number,
  quantity: number,
): ProfitResult {
  return {
    actualPrice: price,
    actualCost: cost,
    profit: (price - cost) * quantity,
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add src/services/accounting/order_id.ts src/services/accounting/profit_engine.ts
git commit -m "feat(accounting): add order ID generator and profit engine"
```

---

### Task 4: Repository Layer

**Files:**
- Create: `src/services/accounting/repo_category.ts`
- Create: `src/services/accounting/repo_product.ts`
- Create: `src/services/accounting/repo_order.ts`
- Create: `src/services/accounting/repo_accounting_config.ts`

- [ ] **Step 1: Create category repository**

```typescript
// src/services/accounting/repo_category.ts
import { prisma } from "../../core/db.js";

export async function createCategory(name: string) {
  return prisma.category.create({ data: { name } });
}

export async function getAllCategories() {
  return prisma.category.findMany({ orderBy: { name: "asc" } });
}

export async function getCategoryById(id: string) {
  return prisma.category.findUnique({ where: { id } });
}
```

- [ ] **Step 2: Create product repository**

```typescript
// src/services/accounting/repo_product.ts
import { prisma } from "../../core/db.js";

export async function createProduct(data: {
  name: string;
  cost: number;
  price: number;
  categoryId: string;
  source?: string;
  faceValue?: number;
  costDiscount?: number;
  priceDiscount?: number;
}) {
  return prisma.product.create({ data, include: { category: true } });
}

export async function getAllProducts() {
  return prisma.product.findMany({
    include: { category: true },
    orderBy: { name: "asc" },
  });
}

export async function getProductById(id: string) {
  return prisma.product.findUnique({
    where: { id },
    include: { category: true },
  });
}

export async function getProductByName(name: string) {
  return prisma.product.findUnique({
    where: { name },
    include: { category: true },
  });
}
```

- [ ] **Step 3: Create order repository**

```typescript
// src/services/accounting/repo_order.ts
import { prisma } from "../../core/db.js";
import type { SalesAggregation } from "../../types/accounting.type.js";

export async function createOrder(data: {
  id: string;
  productId?: string;
  productName: string;
  quantity: number;
  actualPrice: number;
  actualCost: number;
  profit: number;
  isCustom?: boolean;
  createdAt?: Date;
}) {
  return prisma.order.create({ data });
}

export async function deleteOrder(id: string) {
  return prisma.order.delete({ where: { id } });
}

export async function getOrderById(id: string) {
  return prisma.order.findUnique({ where: { id } });
}

export async function getOrdersByDateRange(
  start: Date,
  end: Date,
) {
  return prisma.order.findMany({
    where: { createdAt: { gte: start, lt: end } },
    orderBy: { createdAt: "desc" },
  });
}

export async function aggregateSales(
  start?: Date,
  end?: Date,
): Promise<SalesAggregation> {
  const where = start && end ? { createdAt: { gte: start, lt: end } } : {};
  const result = await prisma.order.aggregate({
    where,
    _sum: { actualPrice: true, actualCost: true, profit: true },
    _count: true,
  });
  return {
    totalRevenue: result._sum.actualPrice ?? 0,
    totalCost: result._sum.actualCost ?? 0,
    totalProfit: result._sum.profit ?? 0,
    orderCount: result._count,
  };
}

export async function getDistinctYears(): Promise<number[]> {
  const results = await prisma.$queryRaw<{ year: number }[]>`
    SELECT DISTINCT EXTRACT(YEAR FROM created_at)::int AS year
    FROM orders ORDER BY year DESC
  `;
  return results.map((r) => r.year);
}

export async function getDistinctMonths(year: number): Promise<number[]> {
  const results = await prisma.$queryRaw<{ month: number }[]>`
    SELECT DISTINCT EXTRACT(MONTH FROM created_at)::int AS month
    FROM orders
    WHERE EXTRACT(YEAR FROM created_at) = ${year}
    ORDER BY month ASC
  `;
  return results.map((r) => r.month);
}

export async function getDistinctDays(year: number, month: number): Promise<number[]> {
  const results = await prisma.$queryRaw<{ day: number }[]>`
    SELECT DISTINCT EXTRACT(DAY FROM created_at)::int AS day
    FROM orders
    WHERE EXTRACT(YEAR FROM created_at) = ${year}
      AND EXTRACT(MONTH FROM created_at) = ${month}
    ORDER BY day ASC
  `;
  return results.map((r) => r.day);
}
```

- [ ] **Step 4: Create accounting config repository**

```typescript
// src/services/accounting/repo_accounting_config.ts
import { prisma } from "../../core/db.js";

export async function upsertAccountingConfig(guildId: string, channelId: string) {
  return prisma.accountingConfig.upsert({
    where: { guildId },
    update: { channelId },
    create: { guildId, channelId },
  });
}

export async function getAccountingConfig(guildId: string) {
  return prisma.accountingConfig.findUnique({ where: { guildId } });
}
```

- [ ] **Step 5: Commit**

```bash
git add src/services/accounting/repo_category.ts src/services/accounting/repo_product.ts src/services/accounting/repo_order.ts src/services/accounting/repo_accounting_config.ts
git commit -m "feat(accounting): add repository layer for all models"
```

---

### Task 5: Thread Logger Service

**Files:**
- Create: `src/services/accounting/thread_logger.ts`

- [ ] **Step 1: Create thread logger**

```typescript
// src/services/accounting/thread_logger.ts
import {
  type Client,
  type TextChannel,
  ChannelType,
  EmbedBuilder,
  ThreadAutoArchiveDuration,
} from "discord.js";
import { getAccountingConfig } from "./repo_accounting_config.js";
import { logger } from "../logger/logger.js";

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0]; // YYYY-MM-DD
}

async function getOrCreateThread(channel: TextChannel, name: string) {
  // Check active threads
  const active = await channel.threads.fetchActive();
  let thread = active.threads.find((t) => t.name === name);
  if (thread) return thread;

  // Check archived threads
  const archived = await channel.threads.fetchArchived({ type: "public" });
  thread = archived.threads.find((t) => t.name === name);
  if (thread) {
    await thread.setArchived(false);
    return thread;
  }

  // Create new thread
  return channel.threads.create({
    name,
    autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
    type: ChannelType.PublicThread,
    reason: `會計日誌 - ${name}`,
  });
}

export async function logOrderToThread(
  client: Client,
  guildId: string,
  order: {
    id: string;
    productName: string;
    quantity: number;
    actualPrice: number;
    actualCost: number;
    profit: number;
    isCustom: boolean;
    createdAt: Date;
  },
): Promise<void> {
  try {
    const config = await getAccountingConfig(guildId);
    if (!config) {
      logger.warn({ guildId }, "No accounting config found, skipping thread log");
      return;
    }

    const channel = await client.channels.fetch(config.channelId);
    if (!channel || channel.type !== ChannelType.GuildText) {
      logger.warn({ channelId: config.channelId }, "Accounting channel not found or not text");
      return;
    }

    const threadName = formatDate(order.createdAt);
    const thread = await getOrCreateThread(channel as TextChannel, threadName);

    const profitColor = order.profit >= 0 ? 0x00c853 : 0xff1744;
    const embed = new EmbedBuilder()
      .setTitle(`📦 訂單 #${order.id}`)
      .setColor(profitColor)
      .addFields(
        { name: "商品", value: order.productName, inline: true },
        { name: "數量", value: `${order.quantity}`, inline: true },
        { name: "類型", value: order.isCustom ? "自訂" : "商品", inline: true },
        { name: "售價", value: `$${order.actualPrice.toFixed(2)}`, inline: true },
        { name: "成本", value: `$${order.actualCost.toFixed(2)}`, inline: true },
        { name: "利潤", value: `$${order.profit.toFixed(2)}`, inline: true },
      )
      .setTimestamp(order.createdAt);

    await thread.send({ embeds: [embed] });
    logger.info({ orderId: order.id, threadName }, "Order logged to thread");
  } catch (err) {
    logger.error({ err, guildId }, "Failed to log order to thread");
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/accounting/thread_logger.ts
git commit -m "feat(accounting): add Discord thread logger for orders"
```

---

### Task 6: Commands — accounting-setup + category-add

**Files:**
- Create: `src/commands/accounting/accounting-setup.cmd.ts`
- Create: `src/commands/accounting/category-add.cmd.ts`

- [ ] **Step 1: Create accounting-setup command**

```typescript
// src/commands/accounting/accounting-setup.cmd.ts
import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  type ChatInputCommandInteraction,
} from "discord.js";
import { upsertAccountingConfig } from "../../services/accounting/repo_accounting_config.js";
import { logger } from "../../services/logger/logger.js";

export const data = new SlashCommandBuilder()
  .setName("accounting-setup")
  .setDescription("Set the accounting log channel for order threads")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addChannelOption((o) =>
    o
      .setName("channel")
      .setDescription("The channel for order log threads")
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });
  const channel = interaction.options.getChannel("channel", true);

  try {
    await upsertAccountingConfig(interaction.guildId!, channel.id);
    logger.info({ guildId: interaction.guildId, channelId: channel.id }, "Accounting channel configured");
    await interaction.editReply(`會計日誌頻道已設定為 <#${channel.id}>`);
  } catch (err) {
    logger.error({ err }, "Failed to set accounting channel");
    await interaction.editReply("設定失敗，請確認機器人權限。");
  }
}
```

- [ ] **Step 2: Create category-add command**

```typescript
// src/commands/accounting/category-add.cmd.ts
import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { createCategory } from "../../services/accounting/repo_category.js";
import { logger } from "../../services/logger/logger.js";

export const data = new SlashCommandBuilder()
  .setName("category-add")
  .setDescription("Create a new product category")
  .addStringOption((o) =>
    o.setName("name").setDescription("Category name").setRequired(true),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });
  const name = interaction.options.getString("name", true);

  try {
    const category = await createCategory(name);
    logger.info({ categoryId: category.id, name }, "Category created");
    await interaction.editReply(`分類 **${name}** 已建立`);
  } catch (err: any) {
    if (err?.code === "P2002") {
      await interaction.editReply(`分類 **${name}** 已存在`);
      return;
    }
    logger.error({ err }, "Failed to create category");
    await interaction.editReply("建立分類失敗。");
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/commands/accounting/accounting-setup.cmd.ts src/commands/accounting/category-add.cmd.ts
git commit -m "feat(accounting): add accounting-setup and category-add commands"
```

---

### Task 7: Command — product-add

**Files:**
- Create: `src/commands/accounting/product-add.cmd.ts`

- [ ] **Step 1: Create product-add command**

```typescript
// src/commands/accounting/product-add.cmd.ts
import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { createProduct } from "../../services/accounting/repo_product.js";
import { getAllCategories } from "../../services/accounting/repo_category.js";
import { logger } from "../../services/logger/logger.js";

export const data = new SlashCommandBuilder()
  .setName("product-add")
  .setDescription("Register a new product")
  .addStringOption((o) =>
    o.setName("name").setDescription("Product name").setRequired(true),
  )
  .addNumberOption((o) =>
    o.setName("price").setDescription("Selling price").setRequired(true),
  )
  .addNumberOption((o) =>
    o.setName("cost").setDescription("Cost price").setRequired(true),
  )
  .addStringOption((o) =>
    o.setName("category").setDescription("Category name").setRequired(true).setAutocomplete(true),
  )
  .addStringOption((o) =>
    o.setName("source").setDescription("Supplier / source"),
  )
  .addNumberOption((o) =>
    o.setName("face_value").setDescription("Face value (for discount-type products)"),
  )
  .addNumberOption((o) =>
    o.setName("cost_discount").setDescription("Cost discount rate (e.g. 0.8)"),
  )
  .addNumberOption((o) =>
    o.setName("price_discount").setDescription("Price discount rate (e.g. 0.9)"),
  );

export async function autocomplete(interaction: any) {
  const focused = interaction.options.getFocused(true);
  if (focused.name === "category") {
    const categories = await getAllCategories();
    const filtered = categories
      .filter((c) => c.name.toLowerCase().includes(focused.value.toLowerCase()))
      .slice(0, 25);
    await interaction.respond(filtered.map((c) => ({ name: c.name, value: c.id })));
  }
}

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const name = interaction.options.getString("name", true);
  const price = interaction.options.getNumber("price", true);
  const cost = interaction.options.getNumber("cost", true);
  const categoryId = interaction.options.getString("category", true);
  const source = interaction.options.getString("source");
  const faceValue = interaction.options.getNumber("face_value");
  const costDiscount = interaction.options.getNumber("cost_discount");
  const priceDiscount = interaction.options.getNumber("price_discount");

  try {
    const product = await createProduct({
      name,
      price,
      cost,
      categoryId,
      source: source ?? undefined,
      faceValue: faceValue ?? undefined,
      costDiscount: costDiscount ?? undefined,
      priceDiscount: priceDiscount ?? undefined,
    });

    logger.info({ productId: product.id, name }, "Product registered");

    const fields = [`名稱: **${name}**`, `分類: ${product.category.name}`, `售價: $${price}`, `成本: $${cost}`];
    if (source) fields.push(`貨源: ${source}`);
    if (faceValue != null) fields.push(`面額: $${faceValue}`);
    if (costDiscount != null) fields.push(`成本折數: ${costDiscount}`);
    if (priceDiscount != null) fields.push(`售價折數: ${priceDiscount}`);

    await interaction.editReply(`商品已登記\n${fields.join("\n")}`);
  } catch (err: any) {
    if (err?.code === "P2002") {
      await interaction.editReply(`商品 **${name}** 已存在`);
      return;
    }
    if (err?.code === "P2003") {
      await interaction.editReply("指定的分類不存在，請先建立分類。");
      return;
    }
    logger.error({ err }, "Failed to register product");
    await interaction.editReply("登記商品失敗。");
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/commands/accounting/product-add.cmd.ts
git commit -m "feat(accounting): add product-add command with autocomplete"
```

---

### Task 8: Commands — order-add + order-custom + order-delete

**Files:**
- Create: `src/commands/accounting/order-add.cmd.ts`
- Create: `src/commands/accounting/order-custom.cmd.ts`
- Create: `src/commands/accounting/order-delete.cmd.ts`

- [ ] **Step 1: Create order-add command**

```typescript
// src/commands/accounting/order-add.cmd.ts
import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { getAllProducts } from "../../services/accounting/repo_product.js";
import { createOrder } from "../../services/accounting/repo_order.js";
import { generateOrderId } from "../../services/accounting/order_id.js";
import { calculateProfit } from "../../services/accounting/profit_engine.js";
import { logOrderToThread } from "../../services/accounting/thread_logger.js";
import { logger } from "../../services/logger/logger.js";

export const data = new SlashCommandBuilder()
  .setName("order-add")
  .setDescription("Create an order from an existing product")
  .addStringOption((o) =>
    o.setName("product").setDescription("Product name").setRequired(true).setAutocomplete(true),
  )
  .addIntegerOption((o) =>
    o.setName("quantity").setDescription("Quantity (default: 1)"),
  )
  .addNumberOption((o) =>
    o.setName("custom_price").setDescription("Override selling price"),
  )
  .addStringOption((o) =>
    o.setName("date").setDescription("Order date (YYYY-MM-DD, default: today)"),
  );

export async function autocomplete(interaction: any) {
  const focused = interaction.options.getFocused(true);
  if (focused.name === "product") {
    const products = await getAllProducts();
    const filtered = products
      .filter((p) => p.name.toLowerCase().includes(focused.value.toLowerCase()))
      .slice(0, 25);
    await interaction.respond(filtered.map((p) => ({ name: `${p.name} ($${p.price})`, value: p.id })));
  }
}

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const productId = interaction.options.getString("product", true);
  const quantity = interaction.options.getInteger("quantity") ?? 1;
  const customPrice = interaction.options.getNumber("custom_price") ?? undefined;
  const dateStr = interaction.options.getString("date");

  try {
    // Fetch product by ID (from autocomplete value)
    const { getProductById } = await import("../../services/accounting/repo_product.js");
    const product = await getProductById(productId);
    if (!product) {
      await interaction.editReply("找不到該商品。");
      return;
    }

    const result = calculateProfit(product, quantity, customPrice);
    const orderId = await generateOrderId();
    const createdAt = dateStr ? new Date(`${dateStr}T00:00:00`) : new Date();

    const order = await createOrder({
      id: orderId,
      productId: product.id,
      productName: product.name,
      quantity,
      actualPrice: result.actualPrice,
      actualCost: result.actualCost,
      profit: result.profit,
      createdAt,
    });

    logger.info({ orderId, productName: product.name, profit: result.profit }, "Order created");

    await logOrderToThread(interaction.client, interaction.guildId!, order);

    await interaction.editReply(
      `訂單已建立 **#${orderId}**\n商品: ${product.name}\n數量: ${quantity}\n售價: $${result.actualPrice.toFixed(2)}\n成本: $${result.actualCost.toFixed(2)}\n利潤: $${result.profit.toFixed(2)}`,
    );
  } catch (err) {
    logger.error({ err }, "Failed to create order");
    await interaction.editReply("建立訂單失敗。");
  }
}
```

- [ ] **Step 2: Create order-custom command**

```typescript
// src/commands/accounting/order-custom.cmd.ts
import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { createOrder } from "../../services/accounting/repo_order.js";
import { generateOrderId } from "../../services/accounting/order_id.js";
import { calculateCustomProfit } from "../../services/accounting/profit_engine.js";
import { logOrderToThread } from "../../services/accounting/thread_logger.js";
import { logger } from "../../services/logger/logger.js";

export const data = new SlashCommandBuilder()
  .setName("order-custom")
  .setDescription("Create a fully manual order")
  .addStringOption((o) =>
    o.setName("name").setDescription("Product/item name").setRequired(true),
  )
  .addNumberOption((o) =>
    o.setName("price").setDescription("Selling price").setRequired(true),
  )
  .addNumberOption((o) =>
    o.setName("cost").setDescription("Cost price").setRequired(true),
  )
  .addIntegerOption((o) =>
    o.setName("quantity").setDescription("Quantity (default: 1)"),
  )
  .addStringOption((o) =>
    o.setName("date").setDescription("Order date (YYYY-MM-DD, default: today)"),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const name = interaction.options.getString("name", true);
  const price = interaction.options.getNumber("price", true);
  const cost = interaction.options.getNumber("cost", true);
  const quantity = interaction.options.getInteger("quantity") ?? 1;
  const dateStr = interaction.options.getString("date");

  try {
    const result = calculateCustomProfit(price, cost, quantity);
    const orderId = await generateOrderId();
    const createdAt = dateStr ? new Date(`${dateStr}T00:00:00`) : new Date();

    const order = await createOrder({
      id: orderId,
      productName: name,
      quantity,
      actualPrice: result.actualPrice,
      actualCost: result.actualCost,
      profit: result.profit,
      isCustom: true,
      createdAt,
    });

    logger.info({ orderId, productName: name, profit: result.profit }, "Custom order created");

    await logOrderToThread(interaction.client, interaction.guildId!, order);

    await interaction.editReply(
      `自訂訂單已建立 **#${orderId}**\n品名: ${name}\n數量: ${quantity}\n售價: $${result.actualPrice.toFixed(2)}\n成本: $${result.actualCost.toFixed(2)}\n利潤: $${result.profit.toFixed(2)}`,
    );
  } catch (err) {
    logger.error({ err }, "Failed to create custom order");
    await interaction.editReply("建立自訂訂單失敗。");
  }
}
```

- [ ] **Step 3: Create order-delete command**

```typescript
// src/commands/accounting/order-delete.cmd.ts
import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { getOrderById, deleteOrder } from "../../services/accounting/repo_order.js";
import { logger } from "../../services/logger/logger.js";

export const data = new SlashCommandBuilder()
  .setName("order-delete")
  .setDescription("Delete an order by its 6-character ID")
  .addStringOption((o) =>
    o.setName("order_id").setDescription("6-character order ID").setRequired(true),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });
  const orderId = interaction.options.getString("order_id", true).toUpperCase();

  try {
    const order = await getOrderById(orderId);
    if (!order) {
      await interaction.editReply(`找不到訂單 **#${orderId}**`);
      return;
    }

    await deleteOrder(orderId);
    logger.info({ orderId, productName: order.productName }, "Order deleted");

    await interaction.editReply(
      `訂單 **#${orderId}** 已刪除\n商品: ${order.productName}\n利潤: $${order.profit.toFixed(2)}`,
    );
  } catch (err) {
    logger.error({ err }, "Failed to delete order");
    await interaction.editReply("刪除訂單失敗。");
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/commands/accounting/order-add.cmd.ts src/commands/accounting/order-custom.cmd.ts src/commands/accounting/order-delete.cmd.ts
git commit -m "feat(accounting): add order-add, order-custom, and order-delete commands"
```

---

### Task 9: Command — sales-overview (Cascading Select Menu)

**Files:**
- Create: `src/commands/accounting/sales-overview.cmd.ts`

- [ ] **Step 1: Create sales-overview command**

```typescript
// src/commands/accounting/sales-overview.cmd.ts
import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ComponentType,
  type ChatInputCommandInteraction,
} from "discord.js";
import {
  aggregateSales,
  getDistinctYears,
  getDistinctMonths,
  getDistinctDays,
} from "../../services/accounting/repo_order.js";
import type { OverviewState } from "../../types/accounting.type.js";
import { logger } from "../../services/logger/logger.js";

export const data = new SlashCommandBuilder()
  .setName("sales-overview")
  .setDescription("View sales summary with date filtering");

function buildEmbed(stats: { totalRevenue: number; totalCost: number; totalProfit: number; orderCount: number }, label: string) {
  const profitColor = stats.totalProfit >= 0 ? 0x00c853 : 0xff1744;
  return new EmbedBuilder()
    .setTitle(`📊 營業總覽`)
    .setDescription(`**${label}**`)
    .setColor(profitColor)
    .addFields(
      { name: "總營收", value: `$${stats.totalRevenue.toFixed(2)}`, inline: true },
      { name: "總成本", value: `$${stats.totalCost.toFixed(2)}`, inline: true },
      { name: "總利潤", value: `$${stats.totalProfit.toFixed(2)}`, inline: true },
      { name: "訂單數", value: `${stats.orderCount}`, inline: true },
    )
    .setTimestamp();
}

function buildYearMenu(years: number[]) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId("sales_select")
    .setPlaceholder("選擇年份")
    .addOptions(
      { label: "全部時間", value: "all", description: "顯示所有時間的總計" },
      ...years.map((y) => ({ label: `${y} 年`, value: `year:${y}` })),
    );
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

function buildMonthMenu(year: number, months: number[]) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId("sales_select")
    .setPlaceholder("選擇月份")
    .addOptions(
      { label: `← 返回年份選擇`, value: "all" },
      ...months.map((m) => ({
        label: `${year} 年 ${m} 月`,
        value: `month:${year}:${m}`,
      })),
    );
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

function buildDayMenu(year: number, month: number, days: number[]) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId("sales_select")
    .setPlaceholder("選擇日期")
    .addOptions(
      { label: `← 返回 ${year} 年 ${month} 月`, value: `year:${year}` },
      ...days.map((d) => ({
        label: `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
        value: `day:${year}:${month}:${d}`,
      })),
    );
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

function parseDateRange(state: OverviewState): { start?: Date; end?: Date; label: string } {
  if (state.level === "all") return { label: "全部時間" };
  if (state.level === "year") {
    return {
      start: new Date(state.year, 0, 1),
      end: new Date(state.year + 1, 0, 1),
      label: `${state.year} 年`,
    };
  }
  if (state.level === "month") {
    return {
      start: new Date(state.year, state.month - 1, 1),
      end: new Date(state.year, state.month, 1),
      label: `${state.year} 年 ${state.month} 月`,
    };
  }
  // day
  return {
    start: new Date(state.year, state.month - 1, state.day),
    end: new Date(state.year, state.month - 1, state.day + 1),
    label: `${state.year}-${String(state.month).padStart(2, "0")}-${String(state.day).padStart(2, "0")}`,
  };
}

function parseSelection(value: string): OverviewState {
  if (value === "all") return { level: "all" };
  const parts = value.split(":");
  if (parts[0] === "year") return { level: "year", year: Number(parts[1]) };
  if (parts[0] === "month") return { level: "month", year: Number(parts[1]), month: Number(parts[2]) };
  if (parts[0] === "day") return { level: "day", year: Number(parts[1]), month: Number(parts[2]), day: Number(parts[3]) };
  return { level: "all" };
}

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  try {
    const stats = await aggregateSales();
    const years = await getDistinctYears();
    const embed = buildEmbed(stats, "全部時間");

    if (years.length === 0) {
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const row = buildYearMenu(years);
    const response = await interaction.editReply({ embeds: [embed], components: [row] });

    const collector = response.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      filter: (i) => i.user.id === interaction.user.id,
      time: 300_000, // 5 minutes
    });

    collector.on("collect", async (i) => {
      const state = parseSelection(i.values[0]);
      const range = parseDateRange(state);
      const newStats = await aggregateSales(range.start, range.end);
      const newEmbed = buildEmbed(newStats, range.label);

      let newRow: ActionRowBuilder<StringSelectMenuBuilder>;
      if (state.level === "all") {
        newRow = buildYearMenu(await getDistinctYears());
      } else if (state.level === "year") {
        const months = await getDistinctMonths(state.year);
        newRow = months.length > 0 ? buildMonthMenu(state.year, months) : buildYearMenu(await getDistinctYears());
      } else if (state.level === "month") {
        const days = await getDistinctDays(state.year, state.month);
        newRow = days.length > 0 ? buildDayMenu(state.year, state.month, days) : buildMonthMenu(state.year, await getDistinctMonths(state.year));
      } else {
        // day level - show day menu to allow switching days
        const days = await getDistinctDays(state.year, state.month);
        newRow = buildDayMenu(state.year, state.month, days);
      }

      await i.update({ embeds: [newEmbed], components: [newRow] });
    });

    collector.on("end", async () => {
      try {
        await interaction.editReply({ components: [] });
      } catch {
        // Message may have been deleted
      }
    });

    logger.info("Sales overview displayed");
  } catch (err) {
    logger.error({ err }, "Failed to display sales overview");
    await interaction.editReply("無法載入營業總覽。");
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/commands/accounting/sales-overview.cmd.ts
git commit -m "feat(accounting): add sales-overview command with cascading select menu"
```

---

### Task 10: Command — order-lookup

**Files:**
- Create: `src/commands/accounting/order-lookup.cmd.ts`

- [ ] **Step 1: Create order-lookup command**

```typescript
// src/commands/accounting/order-lookup.cmd.ts
import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { getOrderById, getOrdersByDateRange } from "../../services/accounting/repo_order.js";
import { logger } from "../../services/logger/logger.js";

export const data = new SlashCommandBuilder()
  .setName("order-lookup")
  .setDescription("Look up orders by ID or date")
  .addStringOption((o) =>
    o
      .setName("query")
      .setDescription("Order ID (6-char) or date (YYYY-MM-DD)")
      .setRequired(true),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });
  const query = interaction.options.getString("query", true).trim();

  try {
    // Detect if query is a date (YYYY-MM-DD) or an order ID
    const dateMatch = query.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (dateMatch) {
      const start = new Date(`${query}T00:00:00`);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);

      const orders = await getOrdersByDateRange(start, end);
      if (orders.length === 0) {
        await interaction.editReply(`${query} 沒有訂單記錄。`);
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(`📋 ${query} 的訂單`)
        .setColor(0x2196f3)
        .setDescription(
          orders
            .map(
              (o) =>
                `**#${o.id}** | ${o.productName} x${o.quantity} | 利潤 $${o.profit.toFixed(2)}${o.isCustom ? " (自訂)" : ""}`,
            )
            .join("\n"),
        )
        .setFooter({ text: `共 ${orders.length} 筆訂單` });

      await interaction.editReply({ embeds: [embed] });
    } else {
      const order = await getOrderById(query.toUpperCase());
      if (!order) {
        await interaction.editReply(`找不到訂單 **#${query.toUpperCase()}**`);
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(`📦 訂單 #${order.id}`)
        .setColor(order.profit >= 0 ? 0x00c853 : 0xff1744)
        .addFields(
          { name: "商品", value: order.productName, inline: true },
          { name: "數量", value: `${order.quantity}`, inline: true },
          { name: "類型", value: order.isCustom ? "自訂" : "商品", inline: true },
          { name: "售價", value: `$${order.actualPrice.toFixed(2)}`, inline: true },
          { name: "成本", value: `$${order.actualCost.toFixed(2)}`, inline: true },
          { name: "利潤", value: `$${order.profit.toFixed(2)}`, inline: true },
          { name: "日期", value: order.createdAt.toISOString().split("T")[0], inline: true },
        );

      await interaction.editReply({ embeds: [embed] });
    }

    logger.info({ query }, "Order lookup executed");
  } catch (err) {
    logger.error({ err }, "Failed to look up order");
    await interaction.editReply("查詢訂單失敗。");
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/commands/accounting/order-lookup.cmd.ts
git commit -m "feat(accounting): add order-lookup command"
```

---

### Task 11: Register Commands + Autocomplete Handler in index.ts

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Add imports and register all accounting commands**

Add after existing command imports in `src/index.ts`:

```typescript
// Accounting commands
import * as accountingSetup from "./commands/accounting/accounting-setup.cmd.js";
import * as categoryAdd from "./commands/accounting/category-add.cmd.js";
import * as productAdd from "./commands/accounting/product-add.cmd.js";
import * as orderAdd from "./commands/accounting/order-add.cmd.js";
import * as orderCustom from "./commands/accounting/order-custom.cmd.js";
import * as orderDelete from "./commands/accounting/order-delete.cmd.js";
import * as salesOverview from "./commands/accounting/sales-overview.cmd.js";
import * as orderLookup from "./commands/accounting/order-lookup.cmd.js";

registerCommand(accountingSetup);
registerCommand(categoryAdd);
registerCommand(productAdd);
registerCommand(orderAdd);
registerCommand(orderCustom);
registerCommand(orderDelete);
registerCommand(salesOverview);
registerCommand(orderLookup);
```

- [ ] **Step 2: Add autocomplete handler**

Add an autocomplete handler in the `InteractionCreate` event listener, before or after the existing chatInputCommand handler:

```typescript
client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isAutocomplete()) {
    const command = commands.get(interaction.commandName) as any;
    if (command?.autocomplete) {
      await command.autocomplete(interaction);
    }
    return;
  }
  if (!interaction.isChatInputCommand()) return;
  await handleInteraction(interaction);
});
```

Also add `commands` to the import from `command_handler.ts`:

```typescript
import { registerCommand, handleInteraction, deployCommands, commands } from "./core/command_handler.js";
```

- [ ] **Step 3: Delete old empty template file**

Delete `src/commands/accounting/register.cmd.ts` (empty template).

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git rm src/commands/accounting/register.cmd.ts 2>/dev/null; true
git commit -m "feat(accounting): register all commands and add autocomplete handler"
```

---

### Task 12: Push Schema + Deploy + Verify

- [ ] **Step 1: Push Prisma schema to database**

```bash
npx prisma db push
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Start bot locally to verify**

```bash
npm start
```

Verify: bot starts, slash commands deploy, no errors in console.

- [ ] **Step 4: Final commit and push**

```bash
git add -A
git commit -m "feat(accounting): complete accounting module implementation"
git push origin main
```
