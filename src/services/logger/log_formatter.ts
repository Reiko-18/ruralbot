import { LEVEL_LABELS, LEVEL_COLORS } from "../../types/logger.type.js";

interface LogObject {
  level: number;
  msg?: string;
  time?: number;
  err?: { message?: string; stack?: string };
  [key: string]: unknown;
}

export function formatLogEmbed(log: LogObject) {
  const level = log.level;
  const label = LEVEL_LABELS[level] ?? `LVL${level}`;
  const color = LEVEL_COLORS[level] ?? 0x808080;
  const timestamp = log.time ? new Date(log.time).toISOString() : new Date().toISOString();

  let description = log.msg ?? "No message";

  if (log.err?.stack) {
    description += `\n\`\`\`\n${log.err.stack.slice(0, 1800)}\n\`\`\``;
  }

  // Collect extra fields (skip pino internals)
  const skipKeys = new Set(["level", "msg", "time", "pid", "hostname", "err", "v"]);
  const extras: string[] = [];
  for (const [key, value] of Object.entries(log)) {
    if (skipKeys.has(key)) continue;
    extras.push(`**${key}**: ${JSON.stringify(value)}`);
  }

  const fields = extras.length > 0
    ? [{ name: "Context", value: extras.join("\n").slice(0, 1024) }]
    : [];

  return {
    embeds: [
      {
        title: `${levelEmoji(level)} ${label}`,
        description: description.slice(0, 4000),
        color,
        fields,
        timestamp,
        footer: { text: "RuralBot Logger" },
      },
    ],
  };
}

function levelEmoji(level: number): string {
  if (level >= 60) return "💀";
  if (level >= 50) return "🔴";
  if (level >= 40) return "🟠";
  if (level >= 30) return "🟢";
  if (level >= 20) return "🔵";
  return "⚪";
}
