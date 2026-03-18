import { prisma } from "../../core/db.js";
import { logger } from "../logger/logger.js";

const TWELVE_HOURS = 1000 * 60 * 60 * 12;
const TEN_MINUTES = 1000 * 60 * 10;

export class KeepAliveService {
  /** Upsert SystemHealth row every 12h to prevent Supabase auto-pause */
  static startDatabaseHeartbeat() {
    setInterval(async () => {
      try {
        await prisma.systemHealth.upsert({
          where: { id: 1 },
          update: { lastPing: new Date() },
          create: { id: 1, lastPing: new Date() },
        });
        logger.info("Supabase heartbeat sent successfully");
      } catch (error) {
        logger.error(error, "Failed to send Supabase heartbeat");
      }
    }, TWELVE_HOURS);
  }

  /** Self-ping Railway public URL every 10min to prevent sleep */
  static startSelfPing(url: string) {
    if (!url) return;
    setInterval(() => {
      fetch(url)
        .then(() => logger.debug("Self-ping successful"))
        .catch((err: unknown) => logger.error(err, "Self-ping failed"));
    }, TEN_MINUTES);
  }
}
