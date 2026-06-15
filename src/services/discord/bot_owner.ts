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

export function getBotOwnerIds(): Set<string> {
  return parseOwnerIds(process.env.BOT_OWNER_IDS);
}

export function isBotOwner(userId: string): boolean {
  return getBotOwnerIds().has(userId);
}
