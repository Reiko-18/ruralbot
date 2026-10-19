/**
 * Standalone script to deploy all slash commands globally.
 * Does NOT import any project source code (avoids Prisma issues).
 *
 * Usage: node deploy-commands.mjs
 */

import "dotenv/config";
import {
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  InteractionContextType,
} from "discord.js";

const TOKEN = process.env.TOKEN || process.env.DISCORD_TOKEN;
const APP_ID = process.env.APPLICATION_ID;

if (!TOKEN || !APP_ID) {
  console.error("Missing TOKEN or APPLICATION_ID in .env");
  process.exit(1);
}

// ── LEVEL_CHOICES (from src/types/logger.type.ts) ──
const LEVEL_CHOICES = [
  { name: "ALL (1)", value: 1 },
  { name: "TRACE (10)", value: 10 },
  { name: "DEBUG (20)", value: 20 },
  { name: "INFO (30)", value: 30 },
  { name: "WARN (40)", value: 40 },
  { name: "ERROR (50)", value: 50 },
  { name: "FATAL (60)", value: 60 },
];

// ── 1. log-add ──
const logAdd = new SlashCommandBuilder()
  .setName("log-add")
  .setDescription("Add or update a logging channel")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addChannelOption((o) =>
    o
      .setName("channel")
      .setDescription("The channel to send logs to")
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true),
  )
  .addIntegerOption((o) =>
    o
      .setName("level")
      .setDescription("Minimum log level for this channel")
      .addChoices(...LEVEL_CHOICES)
      .setRequired(true),
  )
  .addStringOption((o) =>
    o.setName("label").setDescription("Optional label for this channel"),
  );

// ── 2. log-list ──
const logList = new SlashCommandBuilder()
  .setName("log-list")
  .setDescription("List all configured logging channels")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

// ── 3. log-remove ──
const logRemove = new SlashCommandBuilder()
  .setName("log-remove")
  .setDescription("Remove a logging channel")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addChannelOption((o) =>
    o
      .setName("channel")
      .setDescription("The channel to remove from logging")
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true),
  );

// ── 4. accounting-setup ──
const accountingSetup = new SlashCommandBuilder()
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

// ── 5. category-add ──
const categoryAdd = new SlashCommandBuilder()
  .setName("category-add")
  .setDescription("Create a new product category")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption((o) =>
    o.setName("name").setDescription("Category name").setRequired(true).setMaxLength(80),
  );

// ── 6. category-delete ──
const categoryDelete = new SlashCommandBuilder()
  .setName("category-delete")
  .setDescription("Delete an existing product category")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption((o) =>
    o
      .setName("category")
      .setDescription("Category to delete")
      .setRequired(true)
      .setAutocomplete(true),
  );

// ── 7. product-add ──
const productAdd = new SlashCommandBuilder()
  .setName("product-add")
  .setDescription("Register a new product")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption((o) =>
    o.setName("name").setDescription("Product name").setRequired(true).setMaxLength(80),
  )
  .addNumberOption((o) =>
    o.setName("price").setDescription("Selling price").setRequired(true).setMinValue(0),
  )
  .addNumberOption((o) =>
    o.setName("cost").setDescription("Cost price").setRequired(true).setMinValue(0),
  )
  .addStringOption((o) =>
    o
      .setName("category")
      .setDescription("Category name")
      .setRequired(true)
      .setAutocomplete(true),
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

// ── 8. product-list ──
const productList = new SlashCommandBuilder()
  .setName("product-list")
  .setDescription("Browse registered products by category")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

// ── 9. product-delete ──
const productDelete = new SlashCommandBuilder()
  .setName("product-delete")
  .setDescription("Delete a registered product")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption((o) =>
    o
      .setName("product")
      .setDescription("Product to delete")
      .setRequired(true)
      .setAutocomplete(true),
  );

// ── 10. order-add ──
const orderAdd = new SlashCommandBuilder()
  .setName("order-add")
  .setDescription("Create an order from an existing product")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption((o) =>
    o
      .setName("product")
      .setDescription("Product name")
      .setRequired(true)
      .setAutocomplete(true),
  )
  .addIntegerOption((o) =>
    o.setName("quantity").setDescription("Quantity (default: 1)").setMinValue(1),
  )
  .addNumberOption((o) =>
    o.setName("face_value").setDescription("面額（折數商品必填）").setMinValue(0),
  )
  .addNumberOption((o) =>
    o.setName("custom_price").setDescription("Override selling price").setMinValue(0),
  )
  .addStringOption((o) =>
    o.setName("date").setDescription("Order date (YYYY-MM-DD, default: today)"),
  );

// ── 11. order-custom ──
const orderCustom = new SlashCommandBuilder()
  .setName("order-custom")
  .setDescription("Create a fully manual order")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption((o) =>
    o.setName("name").setDescription("Product/item name").setRequired(true).setMaxLength(80),
  )
  .addNumberOption((o) =>
    o.setName("price").setDescription("Selling price").setRequired(true).setMinValue(0),
  )
  .addNumberOption((o) =>
    o.setName("cost").setDescription("Cost price").setRequired(true).setMinValue(0),
  )
  .addIntegerOption((o) =>
    o.setName("quantity").setDescription("Quantity (default: 1)").setMinValue(1),
  )
  .addStringOption((o) =>
    o.setName("date").setDescription("Order date (YYYY-MM-DD, default: today)"),
  );

// ── 12. order-delete ──
const orderDelete = new SlashCommandBuilder()
  .setName("order-delete")
  .setDescription("Delete an order by its 6-character ID")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption((o) =>
    o
      .setName("order_id")
      .setDescription("6-character order ID")
      .setRequired(true),
  );

// ── 12b. order-restore ──
const orderRestore = new SlashCommandBuilder()
  .setName("order-restore")
  .setDescription("Restore a voided order by its 6-character ID")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption((o) =>
    o
      .setName("order_id")
      .setDescription("6-character order ID")
      .setRequired(true),
  );

// ── 13. sales-overview ──
const salesOverview = new SlashCommandBuilder()
  .setName("sales-overview")
  .setDescription("View sales summary with order list and date filtering")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

// ── 13b. sales-export ──
const salesExport = new SlashCommandBuilder()
  .setName("sales-export")
  .setDescription("Export sales orders in a date range as CSV")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption((o) =>
    o
      .setName("start")
      .setDescription("起始日期 YYYY-MM-DD（台北曆日，選填，預設本月）"),
  )
  .addStringOption((o) =>
    o
      .setName("end")
      .setDescription("結束日期 YYYY-MM-DD（台北曆日，含當日，選填，預設本月）"),
  );

// ── 14. order-lookup ──
const orderLookup = new SlashCommandBuilder()
  .setName("order-lookup")
  .setDescription("Look up orders by ID or date")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption((o) =>
    o
      .setName("query")
      .setDescription("Order ID (6-char) or date (YYYY-MM-DD)")
      .setRequired(true),
  );

// ── 15. accounting-backfill ──
const accountingBackfill = new SlashCommandBuilder()
  .setName("accounting-backfill")
  .setDescription("Backfill missing accounting order thread logs")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addChannelOption((o) =>
    o
      .setName("channel")
      .setDescription("訂單紀錄頻道")
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true),
  )
  .addStringOption((o) =>
    o
      .setName("start")
      .setDescription("起始日期 YYYY-MM-DD，例如 2026-05-01")
      .setRequired(true),
  )
  .addStringOption((o) =>
    o
      .setName("end")
      .setDescription("結束日期 YYYY-MM-DD（不含），例如 2026-06-01")
      .setRequired(true),
  )
  .addBooleanOption((o) =>
    o
      .setName("dry_run")
      .setDescription("只檢查不發送，預設 true"),
  );

// ── 16. bot-config ──
const botConfig = new SlashCommandBuilder()
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

// ── 17. payment ──
const payment = new SlashCommandBuilder()
  .setName("payment")
  .setDescription("金流管理")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((sub) =>
    sub
      .setName("status")
      .setDescription("查詢交易狀態")
      .addStringOption((o) => o.setName("order_id").setDescription("訂單編號").setRequired(true)),
  )
  .addSubcommand((sub) =>
    sub
      .setName("list")
      .setDescription("列出近期交易")
      .addStringOption((o) =>
        o
          .setName("status")
          .setDescription("篩選狀態")
          .addChoices(
            { name: "待付款", value: "PENDING" },
            { name: "已完成", value: "COMPLETED" },
            { name: "失敗", value: "FAILED" },
            { name: "已過期", value: "EXPIRED" },
          ),
      )
      .addIntegerOption((o) =>
        o.setName("days").setDescription("天數 (預設 7)").setMinValue(1).setMaxValue(90),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("stats")
      .setDescription("交易統計")
      .addIntegerOption((o) =>
        o.setName("days").setDescription("天數 (預設 30)").setMinValue(1).setMaxValue(365),
      ),
  );

// ── Deploy ──
const ticketAdmin = new SlashCommandBuilder()
  .setName("ticket-admin")
  .setDescription("顯示票口管理員專用按鈕");

const leave = new SlashCommandBuilder()
  .setName("leave")
  .setDescription("讓機器人退出指定伺服器")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption((o) =>
    o
      .setName("guild_id")
      .setDescription("要退出的 Discord 伺服器 ID")
      .setRequired(true)
      .setMinLength(17)
      .setMaxLength(20),
  );

const commands = [
  logAdd,
  logList,
  logRemove,
  accountingSetup,
  categoryAdd,
  categoryDelete,
  productAdd,
  productList,
  productDelete,
  orderAdd,
  orderCustom,
  orderDelete,
  orderRestore,
  salesOverview,
  salesExport,
  orderLookup,
  accountingBackfill,
  botConfig,
  priceList,
  payment,
  ticketAdmin,
  leave,
].map((cmd) => ({
  ...cmd.toJSON(),
  contexts: [InteractionContextType.Guild],
}));

const rest = new REST({ version: "10" }).setToken(TOKEN);

try {
  console.log(`Deploying ${commands.length} commands globally...`);
  const result = await rest.put(Routes.applicationCommands(APP_ID), {
    body: commands,
  });
  console.log(`Successfully deployed ${result.length} global commands.`);
} catch (err) {
  console.error("Failed to deploy commands:", err);
  process.exit(1);
}
