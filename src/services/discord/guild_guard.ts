import { type Client, type Guild } from "discord.js";
import { logger } from "../logger/logger.js";

const DEFAULT_BLOCKED_GUILD_IDS = new Set(["1500125455619985460"]);

function parseBlockedGuildIds(value: string | undefined): Set<string> {
  const guildIds = new Set(DEFAULT_BLOCKED_GUILD_IDS);

  for (const guildId of value?.split(/[\s,]+/) ?? []) {
    const trimmed = guildId.trim();
    if (trimmed) {
      guildIds.add(trimmed);
    }
  }

  return guildIds;
}

export function getBlockedGuildIds(): Set<string> {
  return parseBlockedGuildIds(process.env.BLOCKED_GUILD_IDS);
}

export function isBlockedGuildId(guildId: string | null | undefined): boolean {
  return Boolean(guildId && getBlockedGuildIds().has(guildId));
}

export async function leaveBlockedGuild(guild: Guild, reason: string): Promise<boolean> {
  if (!isBlockedGuildId(guild.id)) {
    return false;
  }

  logger.warn(
    {
      guildId: guild.id,
      guildName: guild.name,
      memberCount: guild.memberCount,
      reason,
    },
    "Leaving blocked guild",
  );

  await guild.leave();
  return true;
}

export async function enforceBlockedGuilds(client: Client): Promise<void> {
  const blockedGuildIds = getBlockedGuildIds();
  if (blockedGuildIds.size === 0) {
    return;
  }

  for (const guild of client.guilds.cache.values()) {
    try {
      await leaveBlockedGuild(guild, "startup_scan");
    } catch (err) {
      logger.error({ err, guildId: guild.id, guildName: guild.name }, "Failed to leave blocked guild");
    }
  }
}
