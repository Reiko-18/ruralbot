import "dotenv/config";
import { Client, Events, GatewayIntentBits } from "discord.js";
import { prisma } from "./core/db.js";
import { registerCommand, handleInteraction, deployCommands, commands } from "./core/command_handler.js";
import { loadLogConfigs } from "./services/logger/log_cache.js";
import { loadBotConfig } from "./services/config/repo_bot_config.js";
import { logger } from "./services/logger/logger.js";
import { KeepAliveService } from "./services/keepalive/keep_alive.js";

// Import commands
import * as logAdd from "./commands/logger/log-add.cmd.js";
import * as logList from "./commands/logger/log-list.cmd.js";
import * as logRemove from "./commands/logger/log-remove.cmd.js";

// Accounting commands
import * as accountingSetup from "./commands/accounting/accounting-setup.cmd.js";
import * as categoryAdd from "./commands/accounting/category-add.cmd.js";
import * as categoryDelete from "./commands/accounting/category-delete.cmd.js";
import * as productAdd from "./commands/accounting/product-add.cmd.js";
import * as productList from "./commands/accounting/product-list.cmd.js";
import * as productDelete from "./commands/accounting/product-delete.cmd.js";
import * as orderAdd from "./commands/accounting/order-add.cmd.js";
import * as orderCustom from "./commands/accounting/order-custom.cmd.js";
import * as orderDelete from "./commands/accounting/order-delete.cmd.js";
import * as salesOverview from "./commands/accounting/sales-overview.cmd.js";
import * as orderLookup from "./commands/accounting/order-lookup.cmd.js";

// Config commands
import * as botConfig from "./commands/config/bot-config.cmd.js";

// Guild events
import { registerGuildCreateEvent } from "./events/guild/guild-create.event.js";

// Register commands
registerCommand(logAdd);
registerCommand(logList);
registerCommand(logRemove);
registerCommand(accountingSetup);
registerCommand(categoryAdd);
registerCommand(categoryDelete);
registerCommand(productAdd);
registerCommand(productList);
registerCommand(productDelete);
registerCommand(orderAdd);
registerCommand(orderCustom);
registerCommand(orderDelete);
registerCommand(salesOverview);
registerCommand(orderLookup);
registerCommand(botConfig);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once(Events.ClientReady, async (readyClient) => {
  logger.info(`Ready! Logged in as ${readyClient.user.tag}`);

  // Load log configs from DB into memory cache
  await loadLogConfigs();
  logger.info("Log configs loaded from database");

  await loadBotConfig();

  // Deploy slash commands
  await deployCommands();
  logger.info("Slash commands deployed");

  // Start keep-alive services
  KeepAliveService.startDatabaseHeartbeat();
  KeepAliveService.startSelfPing(process.env.RAILWAY_PUBLIC_URL ?? "");
  logger.info("Keep-alive services started");
});

registerGuildCreateEvent(client);

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

// Global error handlers — send fatal logs before crashing
process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "Uncaught Exception");
  setTimeout(() => process.exit(1), 2000);
});

process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "Unhandled Rejection");
});

// Graceful shutdown
process.on("SIGINT", async () => {
  logger.info("Shutting down...");
  await prisma.$disconnect();
  client.destroy();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  logger.info("Shutting down...");
  await prisma.$disconnect();
  client.destroy();
  process.exit(0);
});

client.login(process.env.TOKEN);
