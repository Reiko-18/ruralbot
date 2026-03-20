import { useState, useEffect, useCallback } from "react";
import type { TicketConfig } from "../types";
import { fetchTicketConfig } from "../api/client";
import { TicketSettings } from "./TicketSettings";
import { TicketButtonTypes } from "./TicketButtonTypes";
import { TicketBlacklistView } from "./TicketBlacklist";
import { TicketOverview } from "./TicketOverview";

type SubTab = "settings" | "buttons" | "blacklist" | "overview";

export function TicketDashboard() {
  const [guildId, setGuildId] = useState(() => localStorage.getItem("ticket_guild_id") ?? "");
  const [inputGuildId, setInputGuildId] = useState(guildId);
  const [config, setConfig] = useState<TicketConfig | null>(null);
  const [subTab, setSubTab] = useState<SubTab>("settings");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadConfig = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTicketConfig(id);
      setConfig(data);
    } catch {
      setConfig(null);
      setError("尚未設定票口系統，請先在 Discord 使用 /ticket-setup");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (guildId) loadConfig(guildId);
  }, [guildId, loadConfig]);

  const handleConnect = () => {
    const id = inputGuildId.trim();
    if (!id) return;
    localStorage.setItem("ticket_guild_id", id);
    setGuildId(id);
  };

  const subTabClass = (t: SubTab) =>
    `px-3 py-1.5 rounded text-sm font-medium transition-colors ${
      subTab === t
        ? "bg-purple-500/20 text-purple-300"
        : "text-gray-400 hover:text-purple-300 hover:bg-purple-400/10"
    }`;

  return (
    <div className="max-w-6xl mx-auto">
      {/* Guild ID input */}
      <div className="glow-card p-4 mb-4">
        <label className="text-sm text-gray-400 block mb-1">伺服器 ID (Guild ID)</label>
        <div className="flex gap-2">
          <input
            className="glow-input flex-1"
            value={inputGuildId}
            onChange={(e) => setInputGuildId(e.target.value)}
            placeholder="輸入 Discord 伺服器 ID"
            onKeyDown={(e) => e.key === "Enter" && handleConnect()}
          />
          <button className="btn-accent" onClick={handleConnect}>連接</button>
        </div>
      </div>

      {loading && <div className="text-gray-400 text-center py-8">載入中...</div>}
      {error && <div className="text-yellow-400 text-center py-8">{error}</div>}

      {config && (
        <>
          <nav className="flex gap-1 mb-4">
            <button className={subTabClass("settings")} onClick={() => setSubTab("settings")}>設定</button>
            <button className={subTabClass("buttons")} onClick={() => setSubTab("buttons")}>按鈕類型</button>
            <button className={subTabClass("blacklist")} onClick={() => setSubTab("blacklist")}>黑名單</button>
            <button className={subTabClass("overview")} onClick={() => setSubTab("overview")}>總覽 & 分析</button>
          </nav>

          {subTab === "settings" && <TicketSettings config={config} onSave={() => loadConfig(guildId)} />}
          {subTab === "buttons" && <TicketButtonTypes configId={config.id} />}
          {subTab === "blacklist" && <TicketBlacklistView configId={config.id} />}
          {subTab === "overview" && <TicketOverview configId={config.id} />}
        </>
      )}
    </div>
  );
}
