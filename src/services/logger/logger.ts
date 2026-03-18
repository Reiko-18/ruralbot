import pino from "pino";
import { Writable } from "node:stream";
import { getLogConfigs } from "./log_cache.js";
import { formatLogEmbed } from "./log_formatter.js";

// Queue to batch webhook sends and respect rate limits
const sendQueue: Map<string, Promise<void>> = new Map();

async function sendToWebhook(webhookUrl: string, body: object): Promise<void> {
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("retry-after") ?? "2") * 1000;
      await new Promise((r) => setTimeout(r, retryAfter));
      await sendToWebhook(webhookUrl, body);
    }
  } catch {
    // Silently fail — we can't log a logging failure
  }
}

function dispatchLog(logObj: Record<string, unknown>): void {
  const level = logObj.level as number;
  const configs = getLogConfigs();

  for (const config of configs) {
    if (level >= config.minLevel) {
      const body = formatLogEmbed(logObj as Parameters<typeof formatLogEmbed>[0]);
      const prev = sendQueue.get(config.webhookUrl) ?? Promise.resolve();
      const next = prev.then(() => sendToWebhook(config.webhookUrl, body));
      sendQueue.set(config.webhookUrl, next);
    }
  }
}

// Custom writable stream that dispatches parsed log objects to Discord
const discordStream = new Writable({
  objectMode: true,
  write(chunk: Buffer, _encoding, callback) {
    try {
      const logObj = JSON.parse(chunk.toString());
      dispatchLog(logObj);
    } catch {
      // Skip malformed log lines
    }
    callback();
  },
});

export const logger = pino(
  {
    level: "trace",
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  pino.multistream([
    { stream: process.stdout },
    { stream: discordStream, level: "trace" },
  ]),
);
