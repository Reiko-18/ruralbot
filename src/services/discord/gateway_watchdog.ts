import { type Client, Events, Status } from "discord.js";
import { logger } from "../logger/logger.js";

const DEFAULT_INITIAL_READY_TIMEOUT_MS = 2 * 60 * 1000;
const DEFAULT_STALE_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_CHECK_INTERVAL_MS = 30 * 1000;

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;

  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    logger.warn({ name, raw, fallback }, "Invalid gateway watchdog env value, using fallback");
    return fallback;
  }

  return value;
}

function statusName(status: Status): string {
  return Status[status] ?? `Unknown(${status})`;
}

export function startGatewayWatchdog(client: Client): NodeJS.Timeout {
  const startedAt = Date.now();
  let lastReadyAt: number | null = null;
  let lastGatewayIssueAt: number | null = null;

  const initialReadyTimeoutMs = readPositiveIntegerEnv(
    "DISCORD_INITIAL_READY_TIMEOUT_MS",
    DEFAULT_INITIAL_READY_TIMEOUT_MS,
  );
  const staleTimeoutMs = readPositiveIntegerEnv(
    "DISCORD_GATEWAY_STALE_TIMEOUT_MS",
    DEFAULT_STALE_TIMEOUT_MS,
  );
  const checkIntervalMs = readPositiveIntegerEnv(
    "DISCORD_GATEWAY_WATCHDOG_INTERVAL_MS",
    DEFAULT_CHECK_INTERVAL_MS,
  );

  client.once(Events.ClientReady, () => {
    lastReadyAt = Date.now();
    lastGatewayIssueAt = null;
  });

  client.on(Events.ShardReady, () => {
    lastReadyAt = Date.now();
    lastGatewayIssueAt = null;
  });

  client.on(Events.ShardResume, () => {
    lastReadyAt = Date.now();
    lastGatewayIssueAt = null;
  });

  const markGatewayIssue = (): void => {
    lastGatewayIssueAt = Date.now();
  };

  client.on(Events.ShardDisconnect, markGatewayIssue);
  client.on(Events.ShardError, markGatewayIssue);
  client.on(Events.ShardReconnecting, markGatewayIssue);

  const timer = setInterval(() => {
    const now = Date.now();
    const status = client.ws.status;

    if (status === Status.Ready && client.isReady()) {
      lastReadyAt = now;
      lastGatewayIssueAt = null;
      return;
    }

    if (lastReadyAt === null && now - startedAt >= initialReadyTimeoutMs) {
      logger.fatal(
        {
          status,
          statusName: statusName(status),
          timeoutMs: initialReadyTimeoutMs,
        },
        "Discord client did not become ready before startup timeout",
      );
      process.exit(1);
    }

    if (lastGatewayIssueAt !== null && now - lastGatewayIssueAt >= staleTimeoutMs) {
      logger.fatal(
        {
          status,
          statusName: statusName(status),
          staleMs: now - lastGatewayIssueAt,
          lastReadyAt: lastReadyAt ? new Date(lastReadyAt).toISOString() : null,
        },
        "Discord gateway stayed unhealthy beyond watchdog timeout",
      );
      process.exit(1);
    }
  }, checkIntervalMs);

  timer.unref();
  logger.info({ initialReadyTimeoutMs, staleTimeoutMs, checkIntervalMs }, "Discord gateway watchdog started");

  return timer;
}
