import { useState, useEffect, useCallback } from "react";
import type { PaymentTransaction } from "../types";
import { fetchPaymentTransactions } from "../api/client";
import { BlurFade } from "./magicui/blur-fade";

interface Props {
  guildId: string;
  refreshKey: number;
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "待付款", cls: "badge-yellow" },
  COMPLETED: { label: "已完成", cls: "badge-green" },
  FAILED: { label: "失敗", cls: "badge-red" },
  EXPIRED: { label: "已過期", cls: "badge bg-gray-500/15 text-gray-500" },
};

export function PaymentTransactions({ guildId, refreshKey }: Props) {
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchPaymentTransactions(guildId, {
        status: statusFilter || undefined,
        page,
        limit: 15,
      });
      setTransactions(result.transactions);
      setTotal(result.total);
    } catch (err) {
      console.error("Failed to load transactions:", err);
    } finally {
      setLoading(false);
    }
  }, [guildId, page, statusFilter, refreshKey]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.ceil(total / 15);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-400">篩選：</span>
        {["", "PENDING", "COMPLETED", "FAILED", "EXPIRED"].map((s) => (
          <button
            key={s}
            className={`px-3 py-1 rounded-lg text-sm transition-all ${statusFilter === s ? "btn-accent" : "text-gray-400 hover:text-white hover:bg-violet-500/10"}`}
            onClick={() => { setStatusFilter(s); setPage(1); }}
          >
            {s ? (STATUS_BADGE[s]?.label ?? s) : "全部"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="spinner-lg" /></div>
      ) : transactions.length === 0 ? (
        <div className="text-gray-500 text-center py-8">尚無交易紀錄</div>
      ) : (
        <BlurFade delay={0.1} direction="up">
          <div className="glow-card overflow-hidden">
            <table className="data-table">
              <thead>
                <tr>
                  <th>訂單編號</th>
                  <th>訂單售價</th>
                  <th>代收手續費</th>
                  <th>客人應繳</th>
                  <th>狀態</th>
                  <th>付款人</th>
                  <th>繳費代碼</th>
                  <th>建立時間</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => {
                  const badge = STATUS_BADGE[t.status] ?? { label: t.status, cls: "badge bg-gray-500/15 text-gray-400" };
                  return (
                    <tr key={t.id}>
                      <td className="font-mono text-xs text-violet-400">{t.orderId}</td>
                      <td>${(t.originalAmount ?? t.amount).toLocaleString()}</td>
                      <td>${(t.feeAmount ?? 0).toLocaleString()}</td>
                      <td className="font-semibold text-violet-200">${t.amount.toLocaleString()}</td>
                      <td><span className={badge.cls}>{badge.label}</span></td>
                      <td>{t.payerName ?? "-"}</td>
                      <td className="font-mono text-xs">{t.paymentCode ?? "-"}</td>
                      <td className="text-gray-400">{new Date(t.createdAt).toLocaleString("zh-TW")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </BlurFade>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            className="px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-violet-500/10 transition-all disabled:opacity-30 disabled:hover:bg-transparent"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            上一頁
          </button>
          <span className="text-sm text-gray-500 tabular-nums">{page} / {totalPages}</span>
          <button
            className="px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-violet-500/10 transition-all disabled:opacity-30 disabled:hover:bg-transparent"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            下一頁
          </button>
        </div>
      )}
    </div>
  );
}
