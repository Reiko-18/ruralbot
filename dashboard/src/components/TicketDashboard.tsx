import { useState, useEffect, useCallback } from "react";
import type { TicketConfig, DiscordGuild } from "../types";
import { fetchTicketConfig, fetchGuilds } from "../api/client";
import { TicketSettings } from "./TicketSettings";
import { TicketButtonTypes } from "./TicketButtonTypes";
import { TicketBlacklistView } from "./TicketBlacklist";
import { TicketOverview } from "./TicketOverview";

type SubTab = "settings" | "buttons" | "blacklist" | "overview";

export function TicketDashboard() {
  const [guilds, setGuilds] = useState<DiscordGuild[]>([]);
  const [guildId, setGuildId] = useState(() => localStorage.getItem("ticket_guild_id") ?? "");
  const [config, setConfig] = useState<TicketConfig | null>(null);
  const [subTab, setSubTab] = useState<SubTab>("settings");
  const [loading, setLoading] = useState(true);
  const [configLoading, setConfigLoading] = useState(false);

  // Load guilds on mount
  useEffect(() => {
    fetchGuilds()
      .then((data) => {
        setGuilds(data);
        // Auto-select first guild if none saved
        if (!guildId && data.length > 0) {
          setGuildId(data[0].id);
          localStorage.setItem("ticket_guild_id", data[0].id);
        }
      })
      .catch((err) => console.error("Failed to load guilds:", err))
      .finally(() => setLoading(false));
  }, []);

  const loadConfig = useCallback(async (id: string) => {
    if (!id) return;
    setConfigLoading(true);
    try {
      const data = await fetchTicketConfig(id);
      setConfig(data);
    } catch {
      // No config yet — that's OK, user can create from settings
      setConfig(null);
    } finally {
      setConfigLoading(false);
    }
  }, []);

  useEffect(() => {
    if (guildId) loadConfig(guildId);
  }, [guildId, loadConfig]);

  const handleGuildChange = (id: string) => {
    setGuildId(id);
    setConfig(null);
    setSubTab("settings");
    localStorage.setItem("ticket_guild_id", id);
  };

  const subTabClass = (t: SubTab) =>
    `px-3 py-1.5 rounded text-sm font-medium transition-colors ${
      subTab === t
        ? "bg-purple-500/20 text-purple-300"
        : "text-gray-400 hover:text-purple-300 hover:bg-purple-400/10"
    }`;

  if (loading) {
    return <div className="text-gray-400 text-center py-8">載入中...</div>;
  }

  const selectedGuild = guilds.find((g) => g.id === guildId);

  return (
    <div className="max-w-6xl mx-auto">
      {/* Guild selector */}
      <div className="glow-card p-4 mb-4">
        <label className="text-sm text-gray-400 block mb-1">選擇伺服器</label>
        <select
          className="glow-input w-full"
          value={guildId}
          onChange={(e) => handleGuildChange(e.target.value)}
        >
          {guilds.length === 0 && <option value="">機器人尚未加入任何伺服器</option>}
          {guilds.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name} ({g.memberCount} 成員)
            </option>
          ))}
        </select>
      </div>

      {configLoading && <div className="text-gray-400 text-center py-8">載入設定中...</div>}

      {guildId && !configLoading && (
        <>
          <nav className="flex gap-1 mb-4">
            <button className={subTabClass("settings")} onClick={() => setSubTab("settings")}>設定</button>
            <button className={subTabClass("buttons")} onClick={() => setSubTab("buttons")}>按鈕類型</button>
            <button className={subTabClass("blacklist")} onClick={() => setSubTab("blacklist")}>黑名單</button>
            <button className={subTabClass("overview")} onClick={() => setSubTab("overview")}>總覽 & 分析</button>
          </nav>

          {subTab === "settings" && (
            <TicketSettings
              guildId={guildId}
              config={config}
              onSave={() => loadConfig(guildId)}
            />
          )}
          {subTab === "buttons" && config && <TicketButtonTypes configId={config.id} />}
          {subTab === "blacklist" && config && <TicketBlacklistView configId={config.id} />}
          {subTab === "overview" && config && <TicketOverview configId={config.id} />}

          {subTab !== "settings" && !config && (
            <div className="text-yellow-400 text-center py-8">
              請先在「設定」分頁儲存票口設定
            </div>
          )}
        </>
      )}
    </div>
  );
}
