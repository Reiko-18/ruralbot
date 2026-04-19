import { type Client, Events, MessageFlags } from "discord.js";
import { buildPriceView } from "../../services/price/price_list_builder.js";
import { PRICE_MENU_ID } from "../../types/price.type.js";
import { logger } from "../../services/logger/logger.js";

export function registerPriceMenuEvent(client: Client): void {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isStringSelectMenu()) return;
    if (interaction.customId !== PRICE_MENU_ID) return;

    const isEphemeral = interaction.message.flags.has(MessageFlags.Ephemeral);

    try {
      if (!isEphemeral) {
        if (!interaction.isRepliable()) return;
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      }

      const value = interaction.values[0];
      let view;

      if (value === "back:root") {
        view = buildPriceView(null);
      } else if (value.startsWith("back:")) {
        const parentId = value.slice(5);
        view = buildPriceView(parentId);
      } else {
        view = buildPriceView(value);
      }

      if (isEphemeral) {
        // Already in ephemeral context — update in place
        await interaction.update({
          embeds: view.embeds,
          components: view.components,
        });
      } else {
        // Public homepage message — defer first, then respond ephemerally
        await interaction.editReply({
          embeds: view.embeds,
          components: view.components,
        });
      }
    } catch (err) {
      logger.error({ err }, "Price menu interaction failed");
      try {
        const errorPayload = {
          embeds: [
            {
              title: "❌ 載入失敗",
              description: "載入失敗，請稍後再試。",
              color: 0xff0000,
            },
          ],
          components: [],
        };

        if (isEphemeral) {
          await interaction.update(errorPayload);
        } else if (interaction.deferred || interaction.replied) {
          await interaction.editReply(errorPayload);
        }
      } catch {
        // interaction already responded
      }
    }
  });
}
