// 台北曆日工具。
//
// 台灣全年固定使用 UTC+8，不存在日光節約時間，因此不需要依賴 tz database
// （例如 Intl 或第三方時區套件），直接以「加減 8 小時」換算即可保證正確。
// 全系統（sales-overview、order-lookup、repo_order 的 EXTRACT 分桶、
// thread_logger/thread_backfill 的討論串分桶）都應統一呼叫這裡的工具，
// 避免各處各自用 UTC 曆日或台北曆日，造成「同一天」的定義不一致。

const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;

/**
 * 計算台北曆日 (year, month, day) 對應的 UTC 起訖區間。
 * start = 該台北日 00:00 對應的 UTC 瞬間；end = 次一台北日 00:00 對應的 UTC 瞬間（不含）。
 * month 為 1-12（非 0-based）。
 */
export function taipeiDayRangeUtc(
  year: number,
  month: number,
  day: number,
): { start: Date; end: Date } {
  const start = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0) - TAIPEI_OFFSET_MS);
  const end = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0, 0) - TAIPEI_OFFSET_MS);
  return { start, end };
}

/**
 * 計算台北曆月 (year, month) 對應的 UTC 起訖區間（該月 1 日 00:00 至次月 1 日 00:00，皆為台北時間換算後的 UTC 瞬間）。
 * month 為 1-12。
 */
export function taipeiMonthRangeUtc(
  year: number,
  month: number,
): { start: Date; end: Date } {
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0) - TAIPEI_OFFSET_MS);
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0) - TAIPEI_OFFSET_MS);
  return { start, end };
}

/**
 * 計算台北曆年 (year) 對應的 UTC 起訖區間（該年 1/1 00:00 至次年 1/1 00:00，皆為台北時間換算後的 UTC 瞬間）。
 */
export function taipeiYearRangeUtc(year: number): { start: Date; end: Date } {
  const start = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0) - TAIPEI_OFFSET_MS);
  const end = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0, 0) - TAIPEI_OFFSET_MS);
  return { start, end };
}

/**
 * 將一個 UTC 瞬間換算成該瞬間在台北時區的曆日字串 "YYYY-MM-DD"。
 * 用於顯示與依日分桶（例如訊息討論串命名），避免直接用 toISOString()（UTC 曆日）
 * 導致台北 00:00–08:00 建立的資料被歸到前一天。
 */
export function taipeiDateString(date: Date): string {
  const taipei = new Date(date.getTime() + TAIPEI_OFFSET_MS);
  const y = taipei.getUTCFullYear();
  const m = String(taipei.getUTCMonth() + 1).padStart(2, "0");
  const d = String(taipei.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
