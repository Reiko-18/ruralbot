import { prisma } from "../../core/db.js";
import { logger } from "../logger/logger.js";

const TWELVE_HOURS = 1000 * 60 * 60 * 12;

export class KeepAliveService {
  /** Upsert SystemHealth row every 12h so operators can verify database writes. */
  static startDatabaseHeartbeat() {
    setInterval(async () => {
      try {
        await prisma.systemHealth.upsert({
          where: { id: 1 },
          update: { lastPing: new Date() },
          create: { id: 1, lastPing: new Date() },
        });
        logger.info("Database heartbeat sent successfully");
      } catch (error) {
        logger.error(error, "Failed to send database heartbeat");
      }
    }, TWELVE_HOURS);
  }
}
