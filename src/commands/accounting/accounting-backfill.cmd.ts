import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import { backfillAccountingThreads } from "../../services/accounting/thread_backfill.js";
import { logger } from "../../services/logger/logger.js";

function parseTaipeiDate(value: string) {
  const normalized = value.replace(/\//g, "-");
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return new Date(`${normalized}T00:00:00+08:00`);
  }
  return new Date(value);
}

function formatSummaryLine(target: {
  channelId: string;
  dates: number;
  missing: number;
  sent: number;
  skipped: number;
}) {
  return [
    `頻道 <#${target.channelId}>`,
    `日期 ${target.dates} 天`,
    `待補 ${target.missing} 筆`,
    `已補 ${target.sent} 筆`,
    `略過 ${target.skipped} 筆`,
  ].join("｜");
}

export const data = new SlashCommandBuilder()
  .setName("accounting-backfill")
  .setDescription("Backfill missing accounting order thread logs")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addChannelOption((o) =>
    o
      .setName("channel")
      .setDescription("訂單紀錄頻道")
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true),
  )
  .addStringOption((o) =>
    o
      .setName("start")
      .setDescription("起始日期 YYYY-MM-DD，例如 2026-05-01")
      .setRequired(true),
  )
  .addStringOption((o) =>
    o
      .setName("end")
      .setDescription("結束日期 YYYY-MM-DD（不含），例如 2026-06-01")
      .setRequired(true),
  )
  .addBooleanOption((o) =>
    o
      .setName("dry_run")
      .setDescription("只檢查不發送，預設 true"),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const channel = interaction.options.getChannel("channel", true);
  const start = parseTaipeiDate(interaction.options.getString("start", true));
  const end = parseTaipeiDate(interaction.options.getString("end", true));
  const dryRun = interaction.options.getBoolean("dry_run") ?? true;

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
    await interaction.editReply("日期格式錯誤，請使用 `YYYY-MM-DD`，且 start 必須早於 end。");
    return;
  }

  try {
    const progress: string[] = [];
    const summary = await backfillAccountingThreads(
      interaction.client,
      {
        start,
        end,
        channelId: channel.id,
        guildId: interaction.guildId ?? undefined,
        dryRun,
      },
      (message) => {
        if (progress.length < 12) progress.push(message);
      },
    );

    const lines = [
      dryRun ? "dry-run 完成，尚未發送訊息。" : "補發完成。",
      `候選訂單：${summary.candidateOrders} 筆`,
      ...summary.targets.map(formatSummaryLine),
      "",
      "近期明細：",
      progress.length > 0 ? progress.join("\n") : "無",
    ];

    logger.info(
      {
        userId: interaction.user.id,
        channelId: channel.id,
        start,
        end,
        dryRun,
        summary,
      },
      "Accounting thread backfill command completed",
    );

    await interaction.editReply(lines.join("\n").slice(0, 1900));
  } catch (err) {
    logger.error({ err, channelId: channel.id, start, end, dryRun }, "Accounting thread backfill command failed");
    await interaction.editReply("補發失敗，請檢查 bot log、頻道權限與日期範圍。");
  }
}
