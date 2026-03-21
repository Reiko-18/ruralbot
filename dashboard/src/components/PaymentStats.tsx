import { useState, useEffect } from "react";
import type { PaymentStats as PaymentStatsType } from "../types";
import { fetchPaymentStats } from "../api/client";

interface Props {
  guildId: string;
}

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

  if (loading) return <div className="text-gray-400">載入中...</div>;
  if (!stats) return <div className="text-gray-500">無法載入統計</div>;

  const completionRate = stats.totalCount > 0
    ? ((stats.completedCount / stats.totalCount) * 100).toFixed(1)
    : "0";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-400">統計區間：</span>
        {[7, 30, 90].map((d) => (
          <button
            key={d}
            className={`px-3 py-1 rounded text-sm ${days === d ? "btn-accent" : "text-gray-400 hover:text-white"}`}
            onClick={() => setDays(d)}
          >
            {d} 天
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="glow-card p-4">
          <div className="text-gray-400 text-xs mb-1">總收款金額</div>
          <div className="text-xl font-bold">${stats.totalAmount.toLocaleString()}</div>
        </div>
        <div className="glow-card p-4">
          <div className="text-gray-400 text-xs mb-1">總交易筆數</div>
          <div className="text-xl font-bold">{stats.totalCount}</div>
        </div>
        <div className="glow-card p-4">
          <div className="text-gray-400 text-xs mb-1">完成率</div>
          <div className="text-xl font-bold">{completionRate}%</div>
        </div>
        <div className="glow-card p-4">
          <div className="text-gray-400 text-xs mb-1">已完成</div>
          <div className="text-xl font-bold text-green-400">{stats.completedCount}</div>
        </div>
        <div className="glow-card p-4">
          <div className="text-gray-400 text-xs mb-1">待付款</div>
          <div className="text-xl font-bold text-yellow-400">{stats.pendingCount}</div>
        </div>
        <div className="glow-card p-4">
          <div className="text-gray-400 text-xs mb-1">失敗/過期</div>
          <div className="text-xl font-bold text-red-400">{stats.failedCount + stats.expiredCount}</div>
        </div>
      </div>
    </div>
  );
}
