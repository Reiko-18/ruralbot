import { useState, useEffect, useCallback } from "react";
import { Ticket } from "lucide-react";
import type { TicketConfig, DiscordGuild } from "../types";
import { fetchTicketConfig, fetchGuilds } from "../api/client";
import { TicketPanelSettings } from "./TicketPanelSettings";
import { TicketSubTickets } from "./TicketSubTickets";
import { TicketTranscriptSettings } from "./TicketTranscriptSettings";
import { BlurFade } from "./magicui/blur-fade";

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
    return <div className="flex justify-center py-12"><div className="spinner-lg" /></div>;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header + Guild selector */}
      <BlurFade delay={0} direction="down">
        <div className="glow-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Ticket size={18} className="text-violet-400" />
            <h2 className="text-lg font-semibold">票口系統</h2>
          </div>
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
      </BlurFade>

      {configLoading && (
        <div className="flex justify-center py-12"><div className="spinner-lg" /></div>
      )}

      {guildId && !configLoading && (
        <>
          <BlurFade delay={0.1} direction="up">
            <TicketPanelSettings
              guildId={guildId}
              config={config}
              onSave={() => loadConfig(guildId)}
            />
          </BlurFade>

          {config && (
            <BlurFade delay={0.15} direction="up">
              <TicketSubTickets configId={config.id} guildId={guildId} />
            </BlurFade>
          )}

          {config && (
            <BlurFade delay={0.2} direction="up">
              <TicketTranscriptSettings
                guildId={guildId}
                config={config}
                onSave={() => loadConfig(guildId)}
              />
            </BlurFade>
          )}

          {!config && (
            <div className="text-amber-400 text-center py-6 text-sm bg-amber-500/5 border border-amber-500/10 rounded-xl">
              請先儲存主面板設定以管理子票口
            </div>
          )}
        </>
      )}
    </div>
  );
}
