export interface LogConfigCache {
  channelId: string;
  webhookUrl: string;
  minLevel: number;
  label: string | null;
}

export const LEVEL_LABELS: Record<number, string> = {
  10: "TRACE",
  20: "DEBUG",
  30: "INFO",
  40: "WARN",
  50: "ERROR",
  60: "FATAL",
};

export const LEVEL_COLORS: Record<number, number> = {
  10: 0x808080, // grey
  20: 0x00bfff, // blue
  30: 0x00ff7f, // green
  40: 0xffa500, // orange
  50: 0xff4500, // red-orange
  60: 0xff0000, // red
};

export const LEVEL_CHOICES = [
  { name: "TRACE (10)", value: 10 },
  { name: "DEBUG (20)", value: 20 },
  { name: "INFO (30)", value: 30 },
  { name: "WARN (40)", value: 40 },
  { name: "ERROR (50)", value: 50 },
  { name: "FATAL (60)", value: 60 },
];
