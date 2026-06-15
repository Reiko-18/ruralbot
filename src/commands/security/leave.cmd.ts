import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type Guild,
} from "discord.js";
import { getBotOwnerIds } from "../../services/discord/bot_owner.js";
import { logger } from "../../services/logger/logger.js";

const GUILD_ID_PATTERN = /^\d{17,20}$/;
export const mirrorResponse = false;

async function fetchGuild(interaction: ChatInputCommandInteraction, guildId: string): Promise<Guild | null> {
  const cachedGuild = interaction.client.guilds.cache.get(guildId);
  if (cachedGuild) {
    return cachedGuild;
  }

  return await interaction.client.guilds.fetch(guildId).catch(() => null);
}

export const data = new SlashCommandBuilder()
  .setName("leave")
  .setDescription("讓機器人退出指定伺服器")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption((o) =>
    o
      .setName("guild_id")
      .setDescription("要退出的 Discord 伺服器 ID")
      .setRequired(true)
      .setMinLength(17)
      .setMaxLength(20),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const ownerIds = await getBotOwnerIds(interaction.client);
  if (ownerIds.size === 0) {
    logger.warn(
      { userId: interaction.user.id, commandName: interaction.commandName },
      "Leave command blocked because no bot owner id is available",
    );
    await interaction.editReply("安全設定未完成：請先在環境變數設定 `BOT_OWNER_IDS`。");
    return;
  }

  if (!ownerIds.has(interaction.user.id)) {
    logger.warn(
      {
        userId: interaction.user.id,
        guildId: interaction.guildId,
        commandName: interaction.commandName,
      },
      "Unauthorized leave command attempt",
    );
    await interaction.editReply("你沒有權限執行這個指令。");
    return;
  }

  const guildId = interaction.options.getString("guild_id", true).trim();
  if (!GUILD_ID_PATTERN.test(guildId)) {
    await interaction.editReply("guild id 格式錯誤，請輸入 17 到 20 位數字。");
    return;
  }

  const guild = await fetchGuild(interaction, guildId);
  if (!guild) {
    await interaction.editReply(`找不到伺服器 \`${guildId}\`，或機器人目前不在該伺服器。`);
    return;
  }

  const guildName = guild.name;
  const memberCount = guild.memberCount;
  const isCurrentGuild = guild.id === interaction.guildId;

  try {
    if (isCurrentGuild) {
      await interaction.editReply(`已確認，機器人即將退出目前伺服器 **${guildName}** (${guild.id})。`);
    }

    await guild.leave();

    logger.warn(
      {
        userId: interaction.user.id,
        sourceGuildId: interaction.guildId,
        targetGuildId: guild.id,
        targetGuildName: guildName,
        targetMemberCount: memberCount,
      },
      "Bot left guild by owner command",
    );

    if (!isCurrentGuild) {
      await interaction.editReply(`已退出伺服器 **${guildName}** (${guild.id})。`);
    }
  } catch (err) {
    logger.error(
      {
        err,
        userId: interaction.user.id,
        sourceGuildId: interaction.guildId,
        targetGuildId: guild.id,
        targetGuildName: guildName,
      },
      "Failed to leave guild by owner command",
    );
    await interaction.editReply("退出伺服器失敗，請檢查 bot 是否仍在該伺服器與 Discord API 狀態。");
  }
}
