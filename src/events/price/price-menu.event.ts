import { type Client, Events, MessageFlags } from "discord.js";
import { buildPriceView } from "../../services/price/price_list_builder.js";
import { PRICE_MENU_ID } from "../../types/price.type.js";
import { logger } from "../../services/logger/logger.js";

export function registerPriceMenuEvent(client: Client): void {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isStringSelectMenu()) return;
    if (interaction.customId !== PRICE_MENU_ID) return;

    try {
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

      const isEphemeral = interaction.message.flags.has(MessageFlags.Ephemeral);

      if (isEphemeral) {
        // Already in ephemeral context — update in place
        await interaction.update({
          embeds: view.embeds,
          components: view.components,
        });
      } else {
        // Public homepage message — reply ephemeral, keep homepage visible
        await interaction.reply({
          embeds: view.embeds,
          components: view.components,
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch (err) {
      logger.error({ err }, "Price menu interaction failed");
      try {
        const isEphemeral = interaction.message.flags.has(MessageFlags.Ephemeral);
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
        } else {
          await interaction.reply({
            ...errorPayload,
            flags: MessageFlags.Ephemeral,
          });
        }
      } catch {
        // interaction already responded
      }
    }
  });
}
