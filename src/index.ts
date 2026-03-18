import "dotenv/config";
import { Client, Events, GatewayIntentBits } from "discord.js";
import { prisma } from "./core/db.js";
import { registerCommand, handleInteraction, deployCommands } from "./core/command_handler.js";
import { loadLogConfigs } from "./services/logger/log_cache.js";
import { logger } from "./services/logger/logger.js";
import { KeepAliveService } from "./services/keepalive/keep_alive.js";

// Import commands
import * as logAdd from "./commands/logger/log-add.cmd.js";
import * as logList from "./commands/logger/log-list.cmd.js";
import * as logRemove from "./commands/logger/log-remove.cmd.js";

// Register commands
registerCommand(logAdd);
registerCommand(logList);
registerCommand(logRemove);

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

  // Deploy slash commands
  await deployCommands();
  logger.info("Slash commands deployed");

  // Start keep-alive services
  KeepAliveService.startDatabaseHeartbeat();
  KeepAliveService.startSelfPing(process.env.RAILWAY_PUBLIC_URL ?? "");
  logger.info("Keep-alive services started");
});

client.on(Events.InteractionCreate, async (interaction) => {
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
