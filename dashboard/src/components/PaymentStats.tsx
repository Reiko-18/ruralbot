import { useState, useEffect } from "react";
import { DollarSign, Hash, TrendingUp, CheckCircle, Clock, XCircle } from "lucide-react";
import type { PaymentStats as PaymentStatsType } from "../types";
import { fetchPaymentStats } from "../api/client";
import { NumberTicker } from "./magicui/number-ticker";
import { BlurFade } from "./magicui/blur-fade";

interface Props {
  guildId: string;
}

const STAT_CARDS: { key: string; label: string; icon: typeof DollarSign; color: string; prefix?: string; suffix?: string; isCurrency?: boolean }[] = [
  { key: "totalAmount", label: "總收款金額", icon: DollarSign, color: "text-violet-400", prefix: "$", isCurrency: true },
  { key: "totalCount", label: "總交易筆數", icon: Hash, color: "text-blue-400" },
  { key: "completionRate", label: "完成率", icon: TrendingUp, color: "text-cyan-400", suffix: "%" },
  { key: "completedCount", label: "已完成", icon: CheckCircle, color: "text-emerald-400" },
  { key: "pendingCount", label: "待付款", icon: Clock, color: "text-amber-400" },
  { key: "failedCount", label: "失敗/過期", icon: XCircle, color: "text-red-400" },
];

export function PaymentStats({ guildId }: Props) {
  const [stats, setStats] = useState<PaymentStatsType | null>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const start = new Date();
    start.setDate(start.getDate() - days);
    fetchPaymentStats(guildId, start.toISOString())
      .then(setStats)
      .catch((err) => console.error("Failed to load payment stats:", err))
      .finally(() => setLoading(false));
  }, [guildId, days]);

  if (loading) return <div className="flex justify-center py-12"><div className="spinner-lg" /></div>;
  if (!stats) return <div className="text-gray-500 text-center py-8">無法載入統計</div>;

  const completionRate = stats.totalCount > 0
    ? parseFloat(((stats.completedCount / stats.totalCount) * 100).toFixed(1))
    : 0;

  const values: Record<string, number> = {
    totalAmount: stats.totalAmount,
    totalCount: stats.totalCount,
    completionRate,
    completedCount: stats.completedCount,
    pendingCount: stats.pendingCount,
    failedCount: stats.failedCount + stats.expiredCount,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-400">統計區間：</span>
        {[7, 30, 90].map((d) => (
          <button
            key={d}
            className={`px-3 py-1 rounded-lg text-sm transition-all ${days === d ? "btn-accent" : "text-gray-400 hover:text-white hover:bg-violet-500/10"}`}
            onClick={() => setDays(d)}
          >
            {d} 天
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {STAT_CARDS.map((card, i) => {
          const Icon = card.icon;
          const val = values[card.key];
          const isHighlight = card.key === "totalAmount";

          return (
            <BlurFade key={card.key} delay={0.05 * i} direction="up">
              <div className={`stat-card relative ${isHighlight ? "border-violet-400/25 bg-violet-500/[0.03]" : ""}`}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-gray-400 text-xs font-medium uppercase tracking-wider">{card.label}</span>
                  <Icon size={16} className={card.color} />
                </div>
                <div className="text-2xl font-bold">
                  {card.prefix ?? ""}
                  {isHighlight ? (
                    <span>{card.isCurrency ? val.toLocaleString("zh-TW") : val}</span>
                  ) : (
                    <NumberTicker
                      value={val}
                      decimalPlaces={card.key === "completionRate" ? 1 : 0}
                      delay={0.1 * i}
                      formatter={card.isCurrency ? (n) => n.toLocaleString("zh-TW") : undefined}
                    />
                  )}
                  {card.suffix ?? ""}
                </div>
              </div>
            </BlurFade>
          );
        })}
      </div>
    </div>
  );
}
