import "dotenv/config";
import { Client, Events, GatewayIntentBits } from "discord.js";
import { prisma } from "./core/db.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`[RuralBot] Ready! Logged in as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "ping") {
    await interaction.reply("Pong!");
  }
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("[RuralBot] Shutting down...");
  await prisma.$disconnect();
  client.destroy();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("[RuralBot] Shutting down...");
  await prisma.$disconnect();
  client.destroy();
  process.exit(0);
});

client.login(process.env.TOKEN);
