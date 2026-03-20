import {
  type Client,
  Events,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type TextChannel,
  type ModalSubmitInteraction,
  type ButtonInteraction,
} from "discord.js";
import {
  TICKET_CLOSE_ID,
  TICKET_REOPEN_ID,
  TICKET_DELETE_ID,
  TICKET_TRANSCRIPT_ID,
  TICKET_LINK_ORDER_ID,
  TICKET_CREATE_ORDER_ID,
  TICKET_LINK_ORDER_MODAL_ID,
  TICKET_CREATE_ORDER_MODAL_ID,
  TICKET_DELETE_CONFIRM_ID,
} from "../../types/ticket.type.js";
import {
  getInstanceByChannelId,
  updateInstanceStatus,
  linkOrder,
} from "../../services/ticket/repo_ticket_instance.js";
import {
  buildClosedTicketButtons,
  buildOpenTicketButtons,
} from "../../services/ticket/ticket_panel_builder.js";
import { generateAndSendTranscript } from "../../services/ticket/ticket_transcript.js";
import { getOrderById, createOrder } from "../../services/accounting/repo_order.js";
import { generateOrderId } from "../../services/accounting/order_id.js";
import { logger } from "../../services/logger/logger.js";

const MANAGE_IDS = new Set([
  TICKET_CLOSE_ID,
  TICKET_REOPEN_ID,
  TICKET_DELETE_ID,
  TICKET_TRANSCRIPT_ID,
  TICKET_LINK_ORDER_ID,
  TICKET_CREATE_ORDER_ID,
  TICKET_DELETE_CONFIRM_ID,
]);

export function registerTicketManageEvent(client: Client): void {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isButton() && MANAGE_IDS.has(interaction.customId)) {
      await handleButton(client, interaction);
    }
    if (interaction.isModalSubmit()) {
      if (interaction.customId === TICKET_LINK_ORDER_MODAL_ID) {
        await handleLinkOrderModal(interaction);
      }
      if (interaction.customId === TICKET_CREATE_ORDER_MODAL_ID) {
        await handleCreateOrderModal(client, interaction);
      }
    }
  });
}

async function handleButton(client: Client, interaction: ButtonInteraction): Promise<void> {
  const channelId = interaction.channelId;
  const instance = await getInstanceByChannelId(channelId);
  if (!instance) {
    await interaction.reply({ content: "❌ 此頻道不是票口。", flags: MessageFlags.Ephemeral });
    return;
  }

  const member = interaction.member as any;
  const hasAdmin = member?.permissions?.has?.(PermissionFlagsBits.Administrator);

  switch (interaction.customId) {
    case TICKET_CLOSE_ID: {
      if (!hasAdmin) {
        // Check if user has notify role
        const roleIds = instance.buttonType?.notifyRoleIds
          ? JSON.parse(instance.buttonType.notifyRoleIds) as string[]
          : [];
        const hasRole = roleIds.some((id: string) => member?.roles?.cache?.has(id));
        if (!hasRole) {
          await interaction.reply({ content: "❌ 您沒有權限關閉此票口。", flags: MessageFlags.Ephemeral });
          return;
        }
      }

      await interaction.deferReply();
      const channel = interaction.channel as TextChannel;

      // Remove creator permissions
      const creatorPerms = channel.permissionOverwrites.cache.get(instance.creatorId);
      if (creatorPerms) await creatorPerms.delete();

      // Move to close category
      if (instance.config.categoryCloseId) {
        await channel.setParent(instance.config.categoryCloseId, { lockPermissions: false });
      }

      await updateInstanceStatus(channelId, "CLOSED", new Date());

      const closedEmbed = new EmbedBuilder()
        .setTitle("🔒 票口已關閉")
        .setDescription(`由 <@${interaction.user.id}> 關閉`)
        .setColor(0xed4245)
        .setTimestamp();

      await interaction.editReply({
        embeds: [closedEmbed.toJSON()],
        components: buildClosedTicketButtons(),
      });

      logger.info({ ticketNum: instance.ticketNum, closedBy: interaction.user.id }, "Ticket closed");
      break;
    }

    case TICKET_REOPEN_ID: {
      if (!hasAdmin) {
        await interaction.reply({ content: "❌ 僅管理員可重新開啟票口。", flags: MessageFlags.Ephemeral });
        return;
      }

      await interaction.deferReply();
      const channel = interaction.channel as TextChannel;

      // Restore creator permissions
      await channel.permissionOverwrites.edit(instance.creatorId, {
        ViewChannel: true,
        SendMessages: true,
        AttachFiles: true,
      });

      // Move back to open category
      const openCategoryId = instance.buttonType?.categoryOpenId ?? instance.config.categoryOpenId;
      if (openCategoryId) {
        await channel.setParent(openCategoryId, { lockPermissions: false });
      }

      await updateInstanceStatus(channelId, "OPEN");

      const reopenEmbed = new EmbedBuilder()
        .setTitle("🔓 票口已重新開啟")
        .setDescription(`由 <@${interaction.user.id}> 重新開啟`)
        .setColor(0x57f287)
        .setTimestamp();

      await interaction.editReply({
        embeds: [reopenEmbed.toJSON()],
        components: buildOpenTicketButtons(),
      });

      logger.info({ ticketNum: instance.ticketNum, reopenedBy: interaction.user.id }, "Ticket reopened");
      break;
    }

    case TICKET_DELETE_ID: {
      if (!hasAdmin) {
        await interaction.reply({ content: "❌ 僅管理員可刪除票口。", flags: MessageFlags.Ephemeral });
        return;
      }

      const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(TICKET_DELETE_CONFIRM_ID).setLabel("確認刪除").setStyle(ButtonStyle.Danger),
      );
      await interaction.reply({
        content: "⚠️ 確定要刪除此票口嗎？此操作無法復原。",
        components: [confirmRow],
        flags: MessageFlags.Ephemeral,
      });
      break;
    }

    case TICKET_DELETE_CONFIRM_ID: {
      await interaction.deferUpdate();
      await updateInstanceStatus(channelId, "ARCHIVED");
      const channel = interaction.channel as TextChannel;
      logger.info({ ticketNum: instance.ticketNum, deletedBy: interaction.user.id }, "Ticket deleted");
      await channel.delete("Ticket deleted by admin");
      break;
    }

    case TICKET_TRANSCRIPT_ID: {
      if (!hasAdmin) {
        await interaction.reply({ content: "❌ 僅管理員可存檔紀錄。", flags: MessageFlags.Ephemeral });
        return;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await generateAndSendTranscript(
        client,
        interaction.channel as TextChannel,
        {
          ticketNum: instance.ticketNum,
          creatorId: instance.creatorId,
          createdAt: instance.createdAt,
          closedAt: instance.closedAt,
          configId: instance.configId,
          status: instance.status,
        },
        instance.config.transcriptTarget,
        instance.config.logChannelId,
      );
      await interaction.editReply("✅ 存檔紀錄已生成並發送。");
      break;
    }

    case TICKET_LINK_ORDER_ID: {
      if (!hasAdmin) {
        await interaction.reply({ content: "❌ 僅管理員可連結訂單。", flags: MessageFlags.Ephemeral });
        return;
      }

      const modal = new ModalBuilder()
        .setCustomId(TICKET_LINK_ORDER_MODAL_ID)
        .setTitle("連結訂單")
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("order_id")
              .setLabel("訂單編號")
              .setStyle(TextInputStyle.Short)
              .setPlaceholder("例如：ABC123")
              .setRequired(true),
          ),
        );
      await interaction.showModal(modal);
      break;
    }

    case TICKET_CREATE_ORDER_ID: {
      if (!hasAdmin) {
        await interaction.reply({ content: "❌ 僅管理員可建立訂單。", flags: MessageFlags.Ephemeral });
        return;
      }

      const modal = new ModalBuilder()
        .setCustomId(TICKET_CREATE_ORDER_MODAL_ID)
        .setTitle("建立訂單")
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("product_name")
              .setLabel("商品名稱")
              .setStyle(TextInputStyle.Short)
              .setRequired(true),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("quantity")
              .setLabel("數量")
              .setStyle(TextInputStyle.Short)
              .setValue("1")
              .setRequired(true),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("price")
              .setLabel("售價")
              .setStyle(TextInputStyle.Short)
              .setRequired(true),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("cost")
              .setLabel("成本")
              .setStyle(TextInputStyle.Short)
              .setRequired(true),
          ),
        );
      await interaction.showModal(modal);
      break;
    }
  }
}

async function handleLinkOrderModal(interaction: ModalSubmitInteraction): Promise<void> {
  const orderId = interaction.fields.getTextInputValue("order_id").trim();
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const order = await getOrderById(orderId);
  if (!order) {
    await interaction.editReply(`❌ 找不到訂單 \`${orderId}\`。`);
    return;
  }

  await linkOrder(interaction.channelId!, orderId);

  const embed = new EmbedBuilder()
    .setTitle("🔗 訂單已連結")
    .setColor(0x57f287)
    .addFields(
      { name: "訂單編號", value: order.id, inline: true },
      { name: "商品", value: order.productName, inline: true },
      { name: "金額", value: `$${order.actualPrice.toFixed(2)}`, inline: true },
    );

  await interaction.editReply({ embeds: [embed.toJSON()] });
  logger.info({ channelId: interaction.channelId, orderId }, "Order linked to ticket");
}

async function handleCreateOrderModal(client: Client, interaction: ModalSubmitInteraction): Promise<void> {
  const productName = interaction.fields.getTextInputValue("product_name").trim();
  const quantity = parseInt(interaction.fields.getTextInputValue("quantity").trim(), 10);
  const price = parseFloat(interaction.fields.getTextInputValue("price").trim());
  const cost = parseFloat(interaction.fields.getTextInputValue("cost").trim());

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (isNaN(quantity) || isNaN(price) || isNaN(cost)) {
    await interaction.editReply("❌ 數量、售價、成本必須為數字。");
    return;
  }

  const profit = (price - cost) * quantity;
  const orderId = await generateOrderId();

  await createOrder({
    id: orderId,
    productName,
    quantity,
    actualPrice: price,
    actualCost: cost,
    profit,
    isCustom: true,
  });

  await linkOrder(interaction.channelId!, orderId);

  const embed = new EmbedBuilder()
    .setTitle("🛒 訂單已建立並連結")
    .setColor(0x57f287)
    .addFields(
      { name: "訂單編號", value: orderId, inline: true },
      { name: "商品", value: productName, inline: true },
      { name: "數量", value: `${quantity}`, inline: true },
      { name: "售價", value: `$${price.toFixed(2)}`, inline: true },
      { name: "成本", value: `$${cost.toFixed(2)}`, inline: true },
      { name: "利潤", value: `$${profit.toFixed(2)}`, inline: true },
    );

  await interaction.editReply({ embeds: [embed.toJSON()] });
  logger.info({ channelId: interaction.channelId, orderId, productName }, "Order created and linked to ticket");
}
