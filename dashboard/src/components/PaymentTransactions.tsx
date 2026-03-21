import { useState, useEffect, useCallback } from "react";
import type { PaymentTransaction } from "../types";
import { fetchPaymentTransactions } from "../api/client";

interface Props {
  guildId: string;
  refreshKey: number;
}

const STATUS_STYLES: Record<string, { label: string; color: string }> = {
  PENDING: { label: "待付款", color: "text-yellow-400" },
  COMPLETED: { label: "已完成", color: "text-green-400" },
  FAILED: { label: "失敗", color: "text-red-400" },
  EXPIRED: { label: "已過期", color: "text-gray-500" },
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
            className={`px-3 py-1 rounded text-sm ${statusFilter === s ? "btn-accent" : "text-gray-400 hover:text-white"}`}
            onClick={() => { setStatusFilter(s); setPage(1); }}
          >
            {s ? (STATUS_STYLES[s]?.label ?? s) : "全部"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-gray-400">載入中...</div>
      ) : transactions.length === 0 ? (
        <div className="text-gray-500">尚無交易紀錄</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 border-b border-gray-700">
                <th className="text-left py-2 px-3">訂單編號</th>
                <th className="text-left py-2 px-3">金額</th>
                <th className="text-left py-2 px-3">狀態</th>
                <th className="text-left py-2 px-3">付款人</th>
                <th className="text-left py-2 px-3">繳費代碼</th>
                <th className="text-left py-2 px-3">建立時間</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => {
                const style = STATUS_STYLES[t.status] ?? { label: t.status, color: "text-gray-400" };
                return (
                  <tr key={t.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                    <td className="py-2 px-3 font-mono text-xs">{t.orderId}</td>
                    <td className="py-2 px-3">${t.amount.toLocaleString()}</td>
                    <td className={`py-2 px-3 ${style.color}`}>{style.label}</td>
                    <td className="py-2 px-3">{t.payerName ?? "-"}</td>
                    <td className="py-2 px-3 font-mono text-xs">{t.paymentCode ?? "-"}</td>
                    <td className="py-2 px-3 text-gray-400">{new Date(t.createdAt).toLocaleString("zh-TW")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button className="px-3 py-1 rounded text-sm text-gray-400 hover:text-white disabled:opacity-30" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一頁</button>
          <span className="text-sm text-gray-400">{page} / {totalPages}</span>
          <button className="px-3 py-1 rounded text-sm text-gray-400 hover:text-white disabled:opacity-30" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>下一頁</button>
        </div>
      )}
    </div>
  );
}
