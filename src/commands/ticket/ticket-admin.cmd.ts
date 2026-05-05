import {
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { getInstanceByChannelId } from "../../services/ticket/repo_ticket_instance.js";
import {
  buildClosedTicketButtons,
  buildOpenTicketButtons,
} from "../../services/ticket/ticket_panel_builder.js";
import { canManageTicket } from "../../services/ticket/ticket_permissions.js";
import { logger } from "../../services/logger/logger.js";

export const data = new SlashCommandBuilder()
  .setName("ticket-admin")
  .setDescription("顯示票口管理員專用按鈕");

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const instance = await getInstanceByChannelId(interaction.channelId);
    if (!instance) {
      await interaction.editReply("此頻道不是票口。");
      return;
    }

    if (!canManageTicket(interaction, instance)) {
      await interaction.editReply("只有管理員或票口支援角色可以開啟管理面板。");
      return;
    }

    await interaction.editReply({
      content: `票口 #${String(instance.ticketNum).padStart(4, "0")} 管理面板`,
      components: instance.status === "CLOSED" ? buildClosedTicketButtons() : buildOpenTicketButtons(),
    });

    logger.info(
      { channelId: interaction.channelId, userId: interaction.user.id, ticketNum: instance.ticketNum },
      "Ticket admin panel opened",
    );
  } catch (err) {
    logger.error({ err, channelId: interaction.channelId }, "Failed to open ticket admin panel");
    await interaction.editReply("開啟票口管理面板失敗。");
  }
}
