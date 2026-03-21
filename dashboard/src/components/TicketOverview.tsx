import { useState, useEffect, useCallback } from "react";
import { Inbox, XCircle, Archive, Clock } from "lucide-react";
import type { TicketInstance, TicketStats } from "../types";
import {
  fetchTicketInstances,
  fetchTicketStats,
  closeTicketApi,
  reopenTicketApi,
  deleteTicketApi,
} from "../api/client";
import { BlurFade } from "./magicui/blur-fade";
import { NumberTicker } from "./magicui/number-ticker";

interface Props {
  configId: string;
}

const KPI_CARDS = [
  { key: "openCount", label: "開啟中", icon: Inbox, color: "text-emerald-400" },
  { key: "closedCount", label: "已關閉", icon: XCircle, color: "text-amber-400" },
  { key: "archivedCount", label: "已存檔", icon: Archive, color: "text-blue-400" },
  { key: "avgResolutionHours", label: "平均處理", icon: Clock, color: "text-violet-400", suffix: "h" },
] as { key: string; label: string; icon: typeof Inbox; color: string; suffix?: string }[];

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

  const statusBadge = (s: string) => {
    if (s === "OPEN") return "badge-green";
    if (s === "CLOSED") return "badge-yellow";
    return "badge-purple";
  };

  const maxTrend = stats ? Math.max(...stats.dailyTrend.map((d) => d.count), 1) : 1;

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {KPI_CARDS.map((card, i) => {
            const Icon = card.icon;
            const val = (stats as any)[card.key] as number;
            return (
              <BlurFade key={card.key} delay={0.05 * i} direction="up">
                <div className="stat-card text-center">
                  <div className="flex items-center justify-center gap-1.5 mb-2">
                    <Icon size={14} className={card.color} />
                    <span className="text-gray-400 text-xs">{card.label}</span>
                  </div>
                  <div className={`text-2xl font-bold ${card.color}`}>
                    <NumberTicker value={val} delay={0.1 * i} />
                    {card.suffix ?? ""}
                  </div>
                </div>
              </BlurFade>
            );
          })}
        </div>
      )}

      {/* Charts */}
      {stats && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <BlurFade delay={0.2} direction="up">
            <div className="glow-card p-5">
              <h4 className="text-gray-400 text-xs uppercase tracking-wider mb-4">按類型分布</h4>
              <div className="space-y-2.5">
                {stats.byType.map((t) => {
                  const pct = (t.count / Math.max(...stats.byType.map((x) => x.count), 1)) * 100;
                  return (
                    <div key={t.label} className="flex items-center gap-3">
                      <div className="flex-1 bg-surface rounded-full h-2 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-violet-600 to-purple-500 transition-all duration-500"
                          style={{ width: `${pct}%`, minWidth: "4px" }}
                        />
                      </div>
                      <span className="text-sm text-gray-300 whitespace-nowrap min-w-[80px] text-right">{t.label} ({t.count})</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </BlurFade>
          <BlurFade delay={0.25} direction="up">
            <div className="glow-card p-5">
              <h4 className="text-gray-400 text-xs uppercase tracking-wider mb-4">每日開單量 (14天)</h4>
              <div className="flex items-end gap-1 h-20">
                {stats.dailyTrend.map((d) => (
                  <div
                    key={d.date}
                    className="flex-1 bg-gradient-to-t from-violet-600 to-purple-400 rounded-sm transition-all duration-300 hover:from-violet-500 hover:to-purple-300"
                    style={{ height: `${(d.count / maxTrend) * 100}%`, minHeight: d.count > 0 ? "4px" : "0" }}
                    title={`${d.date}: ${d.count}`}
                  />
                ))}
              </div>
            </div>
          </BlurFade>
        </div>
      )}

      {/* Ticket List */}
      <BlurFade delay={0.3} direction="up">
        <div className="glow-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-violet-300 font-semibold">票口列表</h3>
            <div className="flex gap-1">
              {["", "OPEN", "CLOSED", "ARCHIVED"].map((s) => (
                <button
                  key={s}
                  className={`px-2.5 py-1 rounded-lg text-xs transition-all ${statusFilter === s ? "bg-violet-500/20 text-violet-300 border border-violet-500/25" : "text-gray-400 hover:text-violet-300 hover:bg-violet-500/10"}`}
                  onClick={() => setStatusFilter(s)}
                >
                  {s || "全部"}
                </button>
              ))}
            </div>
          </div>

          <input
            className="glow-input w-full mb-4"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜尋票口編號、使用者 ID..."
          />

          <div className="space-y-1.5">
            {instances.map((inst) => (
              <div key={inst.id} className="glow-item flex items-center justify-between p-3 text-sm">
                <div className="flex items-center gap-4">
                  <span className={statusBadge(inst.status)}>
                    {inst.status === "OPEN" ? "OPEN" : inst.status === "CLOSED" ? "CLOSED" : "ARCHIVED"}
                  </span>
                  <span className="font-mono text-xs text-gray-300">ticket-{String(inst.ticketNum).padStart(4, "0")}</span>
                  <span className="text-gray-500 text-xs">{inst.creatorId}</span>
                  <span className="text-gray-600 text-xs">{inst.buttonType?.label ?? ""}</span>
                  {inst.order && <span className="badge-green text-xs">{inst.order.id}</span>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-gray-600 text-xs">{new Date(inst.createdAt).toLocaleString("zh-TW")}</span>
                  <div className="flex gap-1">
                    {inst.status === "OPEN" && (
                      <button className="text-amber-400 hover:text-amber-300 text-xs px-1.5 py-0.5 rounded hover:bg-amber-500/10 transition-colors" onClick={() => handleAction(inst.id, "close")}>關閉</button>
                    )}
                    {inst.status === "CLOSED" && (
                      <button className="text-emerald-400 hover:text-emerald-300 text-xs px-1.5 py-0.5 rounded hover:bg-emerald-500/10 transition-colors" onClick={() => handleAction(inst.id, "reopen")}>重開</button>
                    )}
                    <button className="text-red-400 hover:text-red-300 text-xs px-1.5 py-0.5 rounded hover:bg-red-500/10 transition-colors" onClick={() => handleAction(inst.id, "delete")}>刪除</button>
                  </div>
                </div>
              </div>
            ))}
            {instances.length === 0 && (
              <div className="text-gray-500 text-center py-6">無票口紀錄</div>
            )}
          </div>
        </div>
      </BlurFade>
    </div>
  );
}
