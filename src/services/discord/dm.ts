import { type MessageCreateOptions, type User } from "discord.js";
import { logger } from "../logger/logger.js";

const USER_DM_UNAVAILABLE_CODES = new Set([50007, 50278]);

function getDiscordErrorCode(err: unknown): number | null {
  const code = (err as { code?: unknown })?.code;
  if (typeof code === "number") return code;
  if (typeof code === "string") {
    const parsed = Number(code);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export async function sendUserDm(
  user: User,
  payload: MessageCreateOptions,
  context: Record<string, unknown>,
): Promise<boolean> {
  try {
    await user.send(payload);
    logger.info({ ...context, userId: user.id }, "Discord DM sent");
    return true;
  } catch (err) {
    const code = getDiscordErrorCode(err);
    if (code !== null && USER_DM_UNAVAILABLE_CODES.has(code)) {
      logger.info(
        { ...context, userId: user.id, discordErrorCode: code },
        "Discord DM skipped because user cannot receive messages",
      );
      return false;
    }

    logger.warn({ err, ...context, userId: user.id }, "Failed to send Discord DM");
    return false;
  }
}
