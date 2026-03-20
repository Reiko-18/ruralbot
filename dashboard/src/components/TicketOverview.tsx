import { useState, useEffect, useCallback } from "react";
import type { TicketInstance, TicketStats } from "../types";
import {
  fetchTicketInstances,
  fetchTicketStats,
  closeTicketApi,
  reopenTicketApi,
  deleteTicketApi,
} from "../api/client";

interface Props {
  configId: string;
}

export function TicketOverview({ configId }: Props) {
  const [stats, setStats] = useState<TicketStats | null>(null);
  const [instances, setInstances] = useState<TicketInstance[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [search, setSearch] = useState("");

  const loadStats = useCallback(async () => {
    const data = await fetchTicketStats(configId);
    setStats(data);
  }, [configId]);

  const loadInstances = useCallback(async () => {
    const data = await fetchTicketInstances({
      configId,
      status: statusFilter || undefined,
      search: search || undefined,
    });
    setInstances(data);
  }, [configId, statusFilter, search]);

  useEffect(() => { loadStats(); loadInstances(); }, [loadStats, loadInstances]);

  const handleAction = async (id: string, action: "close" | "reopen" | "delete") => {
    if (action === "delete" && !confirm("確定刪除此票口紀錄？")) return;
    if (action === "close") await closeTicketApi(id);
    else if (action === "reopen") await reopenTicketApi(id);
    else await deleteTicketApi(id);
    await Promise.all([loadStats(), loadInstances()]);
  };

  const statusColor = (s: string) => {
    if (s === "OPEN") return "text-green-400";
    if (s === "CLOSED") return "text-yellow-400";
    return "text-blue-400";
  };

  const maxTrend = stats ? Math.max(...stats.dailyTrend.map((d) => d.count), 1) : 1;

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      {stats && (
        <div className="grid grid-cols-4 gap-3">
          <div className="glow-card p-4 text-center">
            <div className="text-gray-400 text-xs">開啟中</div>
            <div className="text-green-400 text-2xl font-bold">{stats.openCount}</div>
          </div>
          <div className="glow-card p-4 text-center">
            <div className="text-gray-400 text-xs">已關閉</div>
            <div className="text-yellow-400 text-2xl font-bold">{stats.closedCount}</div>
          </div>
          <div className="glow-card p-4 text-center">
            <div className="text-gray-400 text-xs">已存檔</div>
            <div className="text-blue-400 text-2xl font-bold">{stats.archivedCount}</div>
          </div>
          <div className="glow-card p-4 text-center">
            <div className="text-gray-400 text-xs">平均處理</div>
            <div className="text-purple-400 text-2xl font-bold">{stats.avgResolutionHours}h</div>
          </div>
        </div>
      )}

      {/* Charts */}
      {stats && (
        <div className="grid grid-cols-2 gap-3">
          <div className="glow-card p-4">
            <h4 className="text-gray-400 text-sm mb-3">按類型分布</h4>
            {stats.byType.map((t) => (
              <div key={t.label} className="flex items-center gap-2 mb-2">
                <div
                  className="h-3 rounded bg-purple-400"
                  style={{ width: `${(t.count / Math.max(...stats.byType.map((x) => x.count), 1)) * 100}%`, minWidth: "8px" }}
                />
                <span className="text-sm text-gray-300">{t.label} ({t.count})</span>
              </div>
            ))}
          </div>
          <div className="glow-card p-4">
            <h4 className="text-gray-400 text-sm mb-3">每日開單量 (14天)</h4>
            <div className="flex items-end gap-1 h-16">
              {stats.dailyTrend.map((d) => (
                <div
                  key={d.date}
                  className="flex-1 bg-purple-400 rounded-sm"
                  style={{ height: `${(d.count / maxTrend) * 100}%`, minHeight: d.count > 0 ? "4px" : "0" }}
                  title={`${d.date}: ${d.count}`}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Ticket List */}
      <div className="glow-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-purple-300 font-semibold">票口列表</h3>
          <div className="flex gap-2">
            {["", "OPEN", "CLOSED", "ARCHIVED"].map((s) => (
              <button
                key={s}
                className={`px-2 py-1 rounded text-xs ${statusFilter === s ? "bg-purple-500/30 text-purple-300" : "text-gray-400 hover:text-purple-300"}`}
                onClick={() => setStatusFilter(s)}
              >
                {s || "全部"}
              </button>
            ))}
          </div>
        </div>

        <input
          className="glow-input w-full mb-3"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜尋票口編號、使用者 ID..."
        />

        <div className="space-y-1">
          {instances.map((inst) => (
            <div key={inst.id} className="glow-item flex items-center justify-between p-3 text-sm">
              <div className="flex items-center gap-4">
                <span className={statusColor(inst.status)}>
                  {inst.status === "OPEN" ? "●" : "○"} ticket-{String(inst.ticketNum).padStart(4, "0")}
                </span>
                <span className="text-gray-400">{inst.creatorId}</span>
                <span className="text-gray-500">{inst.buttonType?.label ?? "—"}</span>
                {inst.order && (
                  <span className="text-green-400 text-xs">🛒 {inst.order.id}</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-gray-500 text-xs">
                  {new Date(inst.createdAt).toLocaleString("zh-TW")}
                </span>
                <div className="flex gap-1">
                  {inst.status === "OPEN" && (
                    <button className="text-yellow-400 hover:text-yellow-300 text-xs" onClick={() => handleAction(inst.id, "close")}>關閉</button>
                  )}
                  {inst.status === "CLOSED" && (
                    <button className="text-green-400 hover:text-green-300 text-xs" onClick={() => handleAction(inst.id, "reopen")}>重開</button>
                  )}
                  <button className="text-red-400 hover:text-red-300 text-xs" onClick={() => handleAction(inst.id, "delete")}>刪除</button>
                </div>
              </div>
            </div>
          ))}
          {instances.length === 0 && (
            <div className="text-gray-500 text-center py-4">無票口紀錄</div>
          )}
        </div>
      </div>
    </div>
  );
}
