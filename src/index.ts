import "dotenv/config";
import { Client, Events, GatewayIntentBits } from "discord.js";
import { prisma } from "./core/db.js";
import { registerCommand, handleInteraction, deployCommands, commands } from "./core/command_handler.js";
import { loadLogConfigs } from "./services/logger/log_cache.js";
import { loadBotConfig } from "./services/config/repo_bot_config.js";
import { logger } from "./services/logger/logger.js";
import { KeepAliveService } from "./services/keepalive/keep_alive.js";
import { startDashboard } from "./services/dashboard/server.js";
import { auditPreviousBoot } from "./services/host/boot_audit.js";
import { startGatewayWatchdog } from "./services/discord/gateway_watchdog.js";
import { enforceBlockedGuilds } from "./services/discord/guild_guard.js";

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
import * as accountingBackfill from "./commands/accounting/accounting-backfill.cmd.js";

// Payment commands
import * as payment from "./commands/payment/payment.cmd.js";
import * as rp from "./commands/payment/rp.cmd.js";

// Config commands
import * as botConfig from "./commands/config/bot-config.cmd.js";

// Price commands
import * as priceList from "./commands/price/price-list.cmd.js";

// Ticket commands
import * as ticketAdmin from "./commands/ticket/ticket-admin.cmd.js";

// Security commands
import * as leave from "./commands/security/leave.cmd.js";

// Price events
import { registerPriceMenuEvent } from "./events/price/price-menu.event.js";

// Price cache
import { loadPriceCache } from "./services/price/price_cache.js";

// Presence rotator
import { startPresenceRotator, stopPresenceRotator } from "./services/presence/presence_rotator.js";

// Guild events
import { registerGuildCreateEvent } from "./events/guild/guild-create.event.js";

// Ticket events
import { registerTicketButtonEvent } from "./events/ticket/ticket-button.event.js";
import { registerRpInteractEvent } from "./events/payment/rp-interact.event.js";
import { registerTicketManageEvent } from "./events/ticket/ticket-manage.event.js";
import { registerTicketActivityEvent } from "./events/ticket/ticket-activity.event.js";

// Ticket timeout
import { startTicketTimeout, stopTicketTimeout } from "./services/ticket/ticket_timeout.js";

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
registerCommand(accountingBackfill);
registerCommand(botConfig);
registerCommand(priceList);
registerCommand(payment);
registerCommand(rp);
registerCommand(ticketAdmin);
registerCommand(leave);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

startDashboard(client);
const gatewayWatchdog = startGatewayWatchdog(client);

client.once(Events.ClientReady, async (readyClient) => {
  logger.info(`Ready! Logged in as ${readyClient.user.tag}`);

  try {
    await loadLogConfigs();
    logger.info("Log configs loaded from database");
  } catch (err) {
    logger.error({ err }, "Failed to load log configs during startup");
  }

  try {
    await enforceBlockedGuilds(readyClient);
  } catch (err) {
    logger.error({ err }, "Failed to enforce blocked guild list during startup");
  }

  try {
    await loadBotConfig();
  } catch (err) {
    logger.error({ err }, "Failed to load bot config during startup");
  }

  try {
    await auditPreviousBoot();
  } catch (err) {
    logger.warn({ err }, "Boot audit crashed during startup");
  }

  try {
    await loadPriceCache();
  } catch (err) {
    logger.error({ err }, "Failed to load price cache during startup");
  }

  try {
    await deployCommands();
    logger.info("Slash commands deployed");
  } catch (err) {
    logger.error({ err }, "Failed to deploy slash commands during startup");
  }

  KeepAliveService.startDatabaseHeartbeat();
  logger.info("Database health heartbeat started");

  startPresenceRotator(readyClient);
  startTicketTimeout(readyClient);
});

registerGuildCreateEvent(client);
registerPriceMenuEvent(client);
registerTicketButtonEvent(client);
registerRpInteractEvent(client);
registerTicketManageEvent(client);
registerTicketActivityEvent(client);

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

client.on(Events.ShardDisconnect, (event, shardId) => {
  logger.warn(
    {
      shardId,
      code: event.code,
      reason: event.reason,
      wasClean: event.wasClean,
    },
    "Discord gateway disconnected",
  );
});

client.on(Events.ShardError, (err, shardId) => {
  logger.error({ err, shardId }, "Discord gateway shard error");
});

client.on(Events.ShardReconnecting, (shardId) => {
  logger.warn({ shardId }, "Discord gateway reconnecting");
});

client.on(Events.ShardResume, (_replayedEvents, shardId) => {
  logger.info({ shardId }, "Discord gateway resumed");
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
  clearInterval(gatewayWatchdog);
  stopPresenceRotator();
  stopTicketTimeout();
  await prisma.$disconnect();
  client.destroy();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  logger.info("Shutting down...");
  clearInterval(gatewayWatchdog);
  stopPresenceRotator();
  stopTicketTimeout();
  await prisma.$disconnect();
  client.destroy();
  process.exit(0);
});

void client.login(process.env.TOKEN).catch((err) => {
  logger.fatal({ err }, "Discord login failed");
  setTimeout(() => process.exit(1), 2000);
});
