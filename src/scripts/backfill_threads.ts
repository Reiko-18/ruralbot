import "dotenv/config";
import {
  Client,
  GatewayIntentBits,
} from "discord.js";
import { prisma } from "../core/db.js";
import { backfillAccountingThreads } from "../services/accounting/thread_backfill.js";

type CliOptions = {
  start?: Date;
  end?: Date;
  orderId?: string;
  guildId?: string;
  channelId?: string;
  dryRun: boolean;
};

function takeOption(args: string[], name: string) {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);

  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1];

  return undefined;
}

function parseTaipeiDate(value: string) {
  const normalized = value.replace(/\//g, "-");
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return new Date(`${normalized}T00:00:00+08:00`);
  }
  return new Date(value);
}

function parseOptions(): CliOptions {
  const args = process.argv.slice(2);
  const startValue = takeOption(args, "--start");
  const endValue = takeOption(args, "--end");
  const orderId = takeOption(args, "--order-id")?.toUpperCase();
  const guildId = takeOption(args, "--guild-id");
  const channelId = takeOption(args, "--channel-id") ?? process.env.ACCOUNTING_CHANNEL_ID?.trim();

  const options = {
    start: startValue ? parseTaipeiDate(startValue) : undefined,
    end: endValue ? parseTaipeiDate(endValue) : undefined,
    orderId,
    guildId,
    channelId,
    dryRun: !args.includes("--yes"),
  };

  for (const [key, date] of [["start", options.start], ["end", options.end]] as const) {
    if (date && Number.isNaN(date.getTime())) {
      throw new Error(`Invalid --${key} date`);
    }
  }

  if (!options.orderId && !options.start && !options.end) {
    throw new Error("請提供 --start/--end 或 --order-id，避免不小心補發全部訂單。");
  }

  return options;
}

async function main() {
  const options = parseOptions();
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });
  await client.login(process.env.TOKEN);
  console.log(`已登入 Discord：${client.user?.tag}`);

  const summary = await backfillAccountingThreads(client, options, (message) => console.log(message));
  console.log(`完成：候選 ${summary.candidateOrders} 筆，模式：${summary.dryRun ? "dry-run" : "實際補發"}`);

  for (const target of summary.targets) {
    console.log(
      `頻道 ${target.channelId}: 日期 ${target.dates} 天，待補 ${target.missing} 筆，已補 ${target.sent} 筆，略過 ${target.skipped} 筆`,
    );
  }

  client.destroy();
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
