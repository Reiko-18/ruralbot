import type { Client, GuildEmoji } from "discord.js";

const CUSTOM_EMOJI_RE = /^<(?<animated>a?):(?<name>[A-Za-z0-9_]+):(?<id>\d+)>$/;

export interface EmojiRef {
  animated?: boolean;
  id?: string;
  name: string;
}

export function parseCustomEmoji(input: string): EmojiRef | null {
  const match = input.match(CUSTOM_EMOJI_RE);
  if (!match?.groups) return null;

  return {
    animated: match.groups.animated === "a",
    id: match.groups.id,
    name: match.groups.name,
  };
}

export function resolveClientEmoji(client: Client, input: string): string {
  const parsed = parseCustomEmoji(input);
  if (!parsed?.id) return input;

  const cached = findAvailableEmoji(client, parsed.id);
  if (cached) return cached.toString();

  return input;
}

export function resolveButtonEmoji(client: Client, input: string): EmojiRef | string {
  const parsed = parseCustomEmoji(input);
  if (!parsed?.id) return input;

  const cached = findAvailableEmoji(client, parsed.id);
  if (!cached) return parsed;

  return {
    animated: cached.animated ?? parsed.animated,
    id: cached.id,
    name: cached.name ?? parsed.name,
  };
}

export function findAvailableEmoji(client: Client, idOrName: string): GuildEmoji | null {
  const byClientId = client.emojis.cache.get(idOrName) ?? null;
  if (byClientId?.available !== false) return byClientId;

  const byClientName = client.emojis.cache.find((emoji) => emoji.name === idOrName && emoji.available !== false) ?? null;
  if (byClientName) return byClientName;

  for (const guild of client.guilds.cache.values()) {
    const guildEmoji = guild.emojis.cache.get(idOrName)
      ?? guild.emojis.cache.find((emoji) => emoji.name === idOrName && emoji.available !== false)
      ?? null;
    if (guildEmoji?.available !== false) return guildEmoji;
  }

  return null;
}
