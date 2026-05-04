import type { Client, GuildEmoji } from "discord.js";

const CUSTOM_EMOJI_RE = /^<(?<animated>a?):(?<name>[A-Za-z0-9_]+):(?<id>\d+)>$/;
const CUSTOM_EMOJI_IN_TEXT_RE = /<a?:[A-Za-z0-9_]+:\d+>/g;
const NAMED_EMOJI_RE = /:([A-Za-z0-9_]+):/g;

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
  const parsed = parseEmojiRef(client, input);
  if (!parsed) return input;

  const cached = findAvailableEmoji(client, parsed.id ?? parsed.name);
  if (cached) return cached.toString();

  return parsed.id ? formatEmojiRef(parsed) : input;
}

export function resolveButtonEmoji(client: Client, input: string): EmojiRef | string {
  const parsed = parseEmojiRef(client, input);
  if (!parsed) return input;

  const cached = findAvailableEmoji(client, parsed.id ?? parsed.name);
  if (!cached) return parsed;

  return {
    animated: cached.animated ?? parsed.animated,
    id: cached.id,
    name: cached.name ?? parsed.name,
  };
}

export function resolveEmojiText(client: Client, input: string): string {
  if (!input) return input;

  let resolved = input.replace(CUSTOM_EMOJI_IN_TEXT_RE, (match) => resolveClientEmoji(client, match));
  resolved = resolved.replace(NAMED_EMOJI_RE, (match, name: string) => {
    const cached = findAvailableEmoji(client, name);
    return cached ? cached.toString() : match;
  });

  return resolved;
}

function parseEmojiRef(client: Client, input: string): EmojiRef | null {
  const parsedCustom = parseCustomEmoji(input);
  if (parsedCustom) return parsedCustom;

  const namedMatch = input.match(/^:([A-Za-z0-9_]+):$/);
  if (!namedMatch) return null;

  const name = namedMatch[1];
  const cached = findAvailableEmoji(client, name);
  if (!cached) return { name };

  return {
    animated: cached.animated,
    id: cached.id,
    name: cached.name ?? name,
  };
}

function formatEmojiRef(emoji: EmojiRef): string {
  if (!emoji.id) return `:${emoji.name}:`;
  return `<${emoji.animated ? "a" : ""}:${emoji.name}:${emoji.id}>`;
}

export function findAvailableEmoji(client: Client, idOrName: string): GuildEmoji | null {
  const byClientId = client.emojis.cache.get(idOrName) ?? null;
  if (byClientId && byClientId.available !== false) return byClientId;

  const byClientName = client.emojis.cache.find((emoji) => emoji.name === idOrName && emoji.available !== false) ?? null;
  if (byClientName) return byClientName;

  for (const guild of client.guilds.cache.values()) {
    const guildEmoji = guild.emojis.cache.get(idOrName)
      ?? guild.emojis.cache.find((emoji) => emoji.name === idOrName && emoji.available !== false)
      ?? null;
    if (guildEmoji && guildEmoji.available !== false) return guildEmoji;
  }

  return null;
}
