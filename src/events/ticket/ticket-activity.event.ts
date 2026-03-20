import { type Client, Events } from "discord.js";
import { updateInstanceActivity } from "../../services/ticket/repo_ticket_instance.js";

export function registerTicketActivityEvent(client: Client): void {
  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;
    if (!message.guild) return;

    // Only update if channel name looks like a ticket
    if (!("name" in message.channel) || !message.channel.name?.startsWith("ticket-")) return;

    try {
      await updateInstanceActivity(message.channelId);
    } catch {
      // Not a tracked ticket channel — ignore
    }
  });
}
