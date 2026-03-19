import { ActivityType, type Client } from "discord.js";
import { getAllPresenceTexts } from "./repo_presence.js";
import { logger } from "../logger/logger.js";

const INTERVAL_MS = 15_000; // 15 seconds

let texts: string[] = [];
let currentIndex = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let clientRef: Client | null = null;

function applyPresence() {
  if (!clientRef?.user || texts.length === 0) return;

  const raw = texts[currentIndex % texts.length];
  // Replace {users} placeholder with actual guild member count
  const totalUsers = clientRef.guilds.cache.reduce((sum, g) => sum + g.memberCount, 0);
  const text = raw.replace(/\{users\}/g, String(totalUsers));

  clientRef.user.setPresence({
    activities: [{ name: text, type: ActivityType.Custom }],
    status: "online",
  });

  currentIndex = (currentIndex + 1) % texts.length;
}

export async function refreshPresenceTexts(): Promise<void> {
  const rows = await getAllPresenceTexts();
  texts = rows.map((r) => r.text);
  currentIndex = 0;
  applyPresence();
  logger.info({ count: texts.length }, "Presence texts refreshed");
}

export function startPresenceRotator(client: Client): void {
  clientRef = client;

  refreshPresenceTexts().catch((err) =>
    logger.error({ err }, "Failed to load presence texts"),
  );

  timer = setInterval(() => {
    applyPresence();
  }, INTERVAL_MS);

  logger.info({ intervalMs: INTERVAL_MS }, "Presence rotator started");
}

export function stopPresenceRotator(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
