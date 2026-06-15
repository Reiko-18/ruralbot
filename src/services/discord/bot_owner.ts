import { type Client, type Team, type User } from "discord.js";

const OWNER_ID_PATTERN = /^\d{17,20}$/;

function parseOwnerIds(value: string | undefined): Set<string> {
  const ownerIds = new Set<string>();

  for (const ownerId of value?.split(/[\s,]+/) ?? []) {
    const trimmed = ownerId.trim();
    if (OWNER_ID_PATTERN.test(trimmed)) {
      ownerIds.add(trimmed);
    }
  }

  return ownerIds;
}

export function getConfiguredBotOwnerIds(): Set<string> {
  return parseOwnerIds(process.env.BOT_OWNER_IDS);
}

function addApplicationOwner(ownerIds: Set<string>, owner: Team | User | null): void {
  if (!owner) {
    return;
  }

  if ("ownerId" in owner) {
    if (owner.ownerId) {
      ownerIds.add(owner.ownerId);
    }
    return;
  }

  ownerIds.add(owner.id);
}

export async function getBotOwnerIds(client?: Client): Promise<Set<string>> {
  const ownerIds = getConfiguredBotOwnerIds();
  if (ownerIds.size > 0 || !client?.application) {
    return ownerIds;
  }

  const application = await client.application.fetch().catch(() => null);
  addApplicationOwner(ownerIds, application?.owner ?? null);
  return ownerIds;
}

export async function isBotOwner(userId: string, client?: Client): Promise<boolean> {
  return (await getBotOwnerIds(client)).has(userId);
}
