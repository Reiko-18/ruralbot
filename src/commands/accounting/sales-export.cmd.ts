import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  AttachmentBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import {
  aggregateSales,
  getOrders,
  countOrders,
} from "../../services/accounting/repo_order.js";
import {
  taipeiDayRangeUtc,
  taipeiMonthRangeUtc,
  taipeiDateString,
} from "../../services/accounting/tz_date.js";
import { logger } from "../../services/logger/logger.js";

// 單次匯出上限：超過此筆數僅匯出最新的 EXPORT_LIMIT 筆（getOrders 依 createdAt desc 排序），
// 並在回覆中明確註明已截斷，避免無上限查詢造成記憶體/延遲問題。
const EXPORT_LIMIT = 5000;

export const data = new SlashCommandBuilder()
  .setName("sales-export")
  .setDescription("Export sales orders in a date range as CSV")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption((o) =>
    o
      .setName("start")
      .setDescription("起始日期 YYYY-MM-DD（台北曆日，選填，預設本月）"),
  )
  .addStringOption((o) =>
    o
      .setName("end")
      .setDescription("結束日期 YYYY-MM-DD（台北曆日，含當日，選填，預設本月）"),
  );

type CalendarDay = { y: number; m: number; d: number };

// regex 只驗證「4 位數字-2 位數字-2 位數字」格式，曆法合法性另由 isValidCalendarDate 檢查
// （比照 order-lookup.cmd.ts 的作法：Date.UTC 對超出範圍的月/日會自動進位而非報錯，
// 例如 2026-02-30 會被算成 2026-03-02，故不能只靠 Date.UTC 判斷是否合法）。
function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

function parseInputDate(value: string): CalendarDay | null {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (!isValidCalendarDate(y, m, d)) return null;
  return { y, m, d };
}

function dayKey(day: CalendarDay): number {
  return day.y * 10000 + day.m * 100 + day.d;
}

function formatDay(day: CalendarDay): string {
  return `${day.y}-${String(day.m).padStart(2, "0")}-${String(day.d).padStart(2, "0")}`;
}

// RFC 4180 跳脫：值含逗號、雙引號或換行時，以雙引號包住並將內部雙引號轉為兩個雙引號。
function csvEscapeField(raw: string): string {
  if (/[",\r\n]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

function toCsvRow(fields: (string | number)[]): string {
  return fields.map((v) => csvEscapeField(String(v))).join(",");
}

const CSV_HEADER = [
  "訂單ID",
  "日期(台北 YYYY-MM-DD)",
  "商品名稱",
  "數量",
  "單價",
  "單位成本",
  "總利潤",
  "是否自訂單",
  "記帳人ID",
  "建立時間(ISO)",
];

type ExportOrderRow = {
  id: string;
  productName: string;
  quantity: number;
  actualPrice: number;
  actualCost: number;
  profit: number;
  isCustom: boolean;
  createdBy: string | null;
  createdAt: Date;
};

function buildCsvBuffer(orders: ExportOrderRow[]): Buffer {
  const lines = [toCsvRow(CSV_HEADER)];
  for (const o of orders) {
    lines.push(
      toCsvRow([
        o.id,
        taipeiDateString(o.createdAt),
        o.productName,
        o.quantity,
        o.actualPrice,
        o.actualCost,
        o.profit,
        o.isCustom ? "是" : "否",
        o.createdBy ?? "",
        o.createdAt.toISOString(),
      ]),
    );
  }
  // UTF-8 BOM（U+FEFF），確保 Excel 開啟時中文欄位不會顯示亂碼。
  // 用 String.fromCharCode(0xfeff) 而非原始碼內夾帶不可見字元，避免日後編輯/編碼工具誤判或誤刪。
  const bom = String.fromCharCode(0xfeff);
  return Buffer.from(bom + lines.join("\r\n"), "utf8");
}

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const startOpt = interaction.options.getString("start");
  const endOpt = interaction.options.getString("end");

  try {
    let rangeStart: Date;
    let rangeEnd: Date;
    let label: string;

    if (!startOpt && !endOpt) {
      // 都未提供 → 預設「台北時間本月」（整月，而非月初至今日）。
      const todayStr = taipeiDateString(new Date());
      const [todayY, todayM] = todayStr.split("-").map(Number);
      const range = taipeiMonthRangeUtc(todayY, todayM);
      rangeStart = range.start;
      rangeEnd = range.end;
      label = `${todayY} 年 ${todayM} 月`;
    } else {
      // 至少提供一邊：先驗證有提供的一邊，缺的一邊再取預設值。
      let startDay: CalendarDay | null = null;
      let endDay: CalendarDay | null = null;

      if (startOpt) {
        startDay = parseInputDate(startOpt);
        if (!startDay) {
          await interaction.editReply(
            "start 日期格式無效，請使用 YYYY-MM-DD 格式（例如 2026-07-01）。",
          );
          return;
        }
      }

      if (endOpt) {
        endDay = parseInputDate(endOpt);
        if (!endDay) {
          await interaction.editReply(
            "end 日期格式無效，請使用 YYYY-MM-DD 格式（例如 2026-07-31）。",
          );
          return;
        }
      }

      const todayStr = taipeiDateString(new Date());
      const [todayY, todayM, todayD] = todayStr.split("-").map(Number);

      // 只給 start：end 預設為今天（台北曆日），即「start 至今」。
      if (!endDay) {
        endDay = { y: todayY, m: todayM, d: todayD };
      }
      // 只給 end：start 預設為 end 所在月份的 1 號，即「end 所在月份 1 號至 end」。
      if (!startDay) {
        startDay = { y: endDay.y, m: endDay.m, d: 1 };
      }

      if (dayKey(startDay) > dayKey(endDay)) {
        await interaction.editReply("start 不可晚於 end，請確認日期區間。");
        return;
      }

      rangeStart = taipeiDayRangeUtc(startDay.y, startDay.m, startDay.d).start;
      // end 為「含當日」，需取該日 UTC 區間的 end（即次日台北 00:00）才會包含 end 當天全部訂單。
      rangeEnd = taipeiDayRangeUtc(endDay.y, endDay.m, endDay.d).end;
      label = `${formatDay(startDay)} ~ ${formatDay(endDay)}`;
    }

    const [stats, totalCount, orders] = await Promise.all([
      aggregateSales(rangeStart, rangeEnd),
      countOrders(rangeStart, rangeEnd),
      getOrders(rangeStart, rangeEnd, EXPORT_LIMIT) as Promise<ExportOrderRow[]>,
    ]);

    const truncated = totalCount > EXPORT_LIMIT;
    const buffer = buildCsvBuffer(orders);

    const filenameStart = taipeiDateString(rangeStart);
    // rangeEnd 為不含的次日 00:00（UTC 瞬間），減 1ms 換算回「含當日」的最後一天供檔名使用。
    const filenameEndInclusive = taipeiDateString(new Date(rangeEnd.getTime() - 1));
    const filename = `sales-export_${filenameStart}_${filenameEndInclusive}.csv`;
    const attachment = new AttachmentBuilder(buffer, { name: filename });

    const profitColor = stats.totalProfit >= 0 ? 0x00c853 : 0xff1744;
    const embed = new EmbedBuilder()
      .setTitle("📤 帳目 CSV 匯出")
      .setColor(profitColor)
      .addFields(
        { name: "期間", value: label, inline: true },
        {
          name: "匯出筆數",
          value: truncated ? `${orders.length}（共 ${totalCount} 筆，已截斷）` : `${orders.length}`,
          inline: true,
        },
        { name: "​", value: "​", inline: true },
        { name: "總營收", value: `$${stats.totalRevenue.toFixed(2)}`, inline: true },
        { name: "總成本", value: `$${stats.totalCost.toFixed(2)}`, inline: true },
        { name: "總利潤", value: `$${stats.totalProfit.toFixed(2)}`, inline: true },
      )
      .setTimestamp();

    if (truncated) {
      embed.setFooter({
        text: `⚠️ 此區間共 ${totalCount} 筆訂單，超過單次匯出上限 ${EXPORT_LIMIT} 筆，僅匯出依建立時間排序最新的 ${EXPORT_LIMIT} 筆。請縮小日期區間以取得完整資料。`,
      });
    }

    await interaction.editReply({ embeds: [embed], files: [attachment] });

    logger.info(
      { userId: interaction.user.id, start: rangeStart, end: rangeEnd, count: orders.length, truncated },
      "Sales export executed",
    );
  } catch (err) {
    logger.error({ err, start: startOpt, end: endOpt }, "Failed to export sales CSV");
    await interaction.editReply("匯出帳目 CSV 失敗，請稍後再試。");
  }
}
