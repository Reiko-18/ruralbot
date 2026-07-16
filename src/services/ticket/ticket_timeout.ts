import { type Client, type TextChannel, ChannelType, EmbedBuilder } from "discord.js";
import { getOpenInstances, markReminded, updateInstanceStatus } from "./repo_ticket_instance.js";
import { buildClosedTicketButtons } from "./ticket_panel_builder.js";
import { logger } from "../logger/logger.js";

const INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
let timer: ReturnType<typeof setInterval> | null = null;
let clientRef: Client | null = null;
let isRunning = false; // 防止 checkTimeouts 於前一輪尚未結束時重入

function getEffectiveTimeout(instance: any): { remindHours: number | null; closeHours: number | null } {
  return {
    remindHours: instance.buttonType?.autoRemindHours ?? instance.config.autoRemindHours ?? null,
    closeHours: instance.buttonType?.autoCloseHours ?? instance.config.autoCloseHours ?? null,
  };
}

async function checkTimeouts(): Promise<void> {
  if (!clientRef) return;
  if (isRunning) return; // 前一輪尚未結束，跳過本次觸發避免重入
  isRunning = true;

  try {
    const instances = await getOpenInstances();
    const now = Date.now();

    for (const instance of instances) {
      const { remindHours, closeHours } = getEffectiveTimeout(instance);
      const elapsed = (now - instance.lastActivityAt.getTime()) / (1000 * 60 * 60);

      // Check if channel still exists
      let channel: TextChannel | null = null;
      try {
        const fetched = await clientRef.channels.fetch(instance.channelId);
        if (!fetched || fetched.type !== ChannelType.GuildText) throw new Error("Not a text channel");
        channel = fetched as TextChannel;
      } catch {
        // Channel was deleted manually
        await updateInstanceStatus(instance.channelId, "ARCHIVED");
        logger.warn({ channelId: instance.channelId, ticketNum: instance.ticketNum }, "Ticket channel deleted externally, marking ARCHIVED");
        continue;
      }

      // Auto-close check (takes priority)
      if (closeHours && elapsed >= closeHours) {
        try {
          await channel.send({
            embeds: [
              new EmbedBuilder()
                .setTitle("🔒 票口已自動關閉")
                .setDescription(`此票口因超過 ${closeHours} 小時無活動而自動關閉。`)
                .setColor(0xed4245)
                .setTimestamp()
                .toJSON(),
            ],
            components: buildClosedTicketButtons(),
          });

          // Remove creator permissions
          const creatorPerms = channel.permissionOverwrites.cache.get(instance.creatorId);
          if (creatorPerms) await creatorPerms.delete();

          // Move to close category
          const closeCategoryId = instance.buttonType?.categoryCloseId ?? instance.config.categoryCloseId;
          if (closeCategoryId) {
            await channel.setParent(closeCategoryId, { lockPermissions: false });
          }

          await updateInstanceStatus(instance.channelId, "CLOSED", new Date(), {
            closeReason: "自動超時關閉",
            locked: true,
          });
          logger.info({ ticketNum: instance.ticketNum }, "Ticket auto-closed due to timeout");
        } catch (err) {
          logger.error({ err, ticketNum: instance.ticketNum }, "Failed to auto-close ticket");
        }
        continue;
      }

      // Remind check
      if (remindHours && elapsed >= remindHours && !instance.reminded) {
        try {
          await channel.send({
            embeds: [
              new EmbedBuilder()
                .setTitle("⏰ 票口即將超時")
                .setDescription(
                  `此票口已超過 ${remindHours} 小時無活動。` +
                  (closeHours ? `\n若持續無回覆，將於 ${closeHours} 小時後自動關閉。` : ""),
                )
                .setColor(0xfee75c)
                .setTimestamp()
                .toJSON(),
            ],
          });
          await markReminded(instance.id);
          logger.info({ ticketNum: instance.ticketNum }, "Ticket timeout reminder sent");
        } catch (err) {
          logger.error({ err, ticketNum: instance.ticketNum }, "Failed to send timeout reminder");
        }
      }
    }
  } catch (err) {
    logger.error({ err }, "Ticket timeout check failed");
  } finally {
    isRunning = false;
  }
}

export function startTicketTimeout(client: Client): void {
  clientRef = client;
  timer = setInterval(checkTimeouts, INTERVAL_MS);
  logger.info({ intervalMs: INTERVAL_MS }, "Ticket timeout service started");
}

export function stopTicketTimeout(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
