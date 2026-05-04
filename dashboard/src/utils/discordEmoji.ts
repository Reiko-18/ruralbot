const KNOWN_CUSTOM_EMOJI: Record<string, string> = {
  "1332695189403336738": "<:711:1332695189403336738>",
  "1332695203735142440": "<:FamilyMart:1332695203735142440>",
  "1343576083617812502": "<a:ZSz26520125622:1343576083617812502>",
  "1343575955834408981": "<a:verifypurple:1343575955834408981>",
  "1343576044246138982": "<a:emoji_114:1343576044246138982>",
};

const BROKEN_CUSTOM_EMOJI_RE = /<(a?)[^:\w\s<>][^:\s<>]*?(\d{15,25})>/g;

export function normalizeDiscordEmojiText(text: string): string {
  return text.replace(BROKEN_CUSTOM_EMOJI_RE, (match, animated: string, id: string) => {
    const known = KNOWN_CUSTOM_EMOJI[id];
    if (known) return known;

    const name = `emoji_${id}`;
    return animated === "a" ? `<a:${name}:${id}>` : `<:${name}:${id}>`;
  });
}

export function normalizeDiscordEmojiObject<T extends Record<string, unknown>>(data: T): T {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [
      key,
      typeof value === "string" ? normalizeDiscordEmojiText(value) : value,
    ]),
  ) as T;
}
