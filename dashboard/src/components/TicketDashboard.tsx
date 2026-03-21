import { useState, useEffect, useCallback } from "react";
import type { TicketConfig, DiscordGuild } from "../types";
import { fetchTicketConfig, fetchGuilds } from "../api/client";
import { TicketPanelSettings } from "./TicketPanelSettings";
import { TicketSubTickets } from "./TicketSubTickets";
import { TicketTranscriptSettings } from "./TicketTranscriptSettings";

export function TicketDashboard() {
  const [guilds, setGuilds] = useState<DiscordGuild[]>([]);
  const [guildId, setGuildId] = useState(() => localStorage.getItem("ticket_guild_id") ?? "");
  const [config, setConfig] = useState<TicketConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [configLoading, setConfigLoading] = useState(false);

  useEffect(() => {
    fetchGuilds()
      .then((data) => {
        setGuilds(data);
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
    localStorage.setItem("ticket_guild_id", id);
  };

  if (loading) {
    return <div className="text-gray-400 text-center py-8">載入中...</div>;
  }

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
          <TicketPanelSettings
            guildId={guildId}
            config={config}
            onSave={() => loadConfig(guildId)}
          />

          {config && (
            <div className="mt-6">
              <TicketSubTickets configId={config.id} guildId={guildId} />
            </div>
          )}

          {config && (
            <div className="mt-6">
              <TicketTranscriptSettings
                guildId={guildId}
                config={config}
                onSave={() => loadConfig(guildId)}
              />
            </div>
          )}

          {!config && (
            <div className="text-yellow-400 text-center py-4 text-sm mt-4">
              請先儲存主面板設定以管理子票口
            </div>
          )}
        </>
      )}
    </div>
  );
}
