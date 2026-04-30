import { useState, useEffect } from "react";
import type { TicketConfig, DiscordChannel } from "../types";
import { updateTicketConfig, fetchGuildChannels } from "../api/client";

interface Props {
  guildId: string;
  config: TicketConfig;
  onSave: () => void;
}

export function TicketTranscriptSettings({ guildId, config, onSave }: Props) {
  const [channels, setChannels] = useState<DiscordChannel[]>([]);
  const [logChannelId, setLogChannelId] = useState(config.logChannelId ?? "");
  const [transcriptTarget, setTranscriptTarget] = useState(config.transcriptTarget ?? "local");
  const [transcriptLogMessage, setTranscriptLogMessage] = useState(config.transcriptLogMessage ?? "");
  const [transcriptDmMessage, setTranscriptDmMessage] = useState(config.transcriptDmMessage ?? "");
  const [saving, setSaving] = useState(false);

  const textChannels = channels.filter((c) => c.type === "text");

  useEffect(() => {
    fetchGuildChannels(guildId).then(setChannels).catch(() => {});
  }, [guildId]);

  useEffect(() => {
    setLogChannelId(config.logChannelId ?? "");
    setTranscriptTarget(config.transcriptTarget ?? "local");
    setTranscriptLogMessage(config.transcriptLogMessage ?? "");
    setTranscriptDmMessage(config.transcriptDmMessage ?? "");
  }, [config]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateTicketConfig(guildId, {
        logChannelId: logChannelId || null,
        transcriptTarget,
        transcriptLogMessage: transcriptLogMessage.trim() || null,
        transcriptDmMessage: transcriptDmMessage.trim() || null,
      });
      onSave();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-purple-300">票口紀錄設定</h2>

      <div className="glow-card p-4">
        <h3 className="text-purple-300 font-semibold mb-3">紀錄發送位置</h3>
        <label className="block text-sm text-gray-400 mb-1">發送範圍</label>
        <select className="glow-input w-full mb-3" value={transcriptTarget} onChange={(e) => setTranscriptTarget(e.target.value)}>
          <option value="local">指定票口紀錄頻道</option>
          <option value="primary">主伺服器集中紀錄頻道</option>
          <option value="both">兩者都發送</option>
        </select>

        <label className="block text-sm text-gray-400 mb-1">指定票口紀錄頻道</label>
        <select className="glow-input w-full" value={logChannelId} onChange={(e) => setLogChannelId(e.target.value)}>
          <option value="">-- 選擇文字頻道 --</option>
          {textChannels.map((c) => (
            <option key={c.id} value={c.id}>#{c.name}</option>
          ))}
        </select>
        <p className="text-xs text-gray-500 mt-1">票口紀錄會以 HTML 附件發送到頻道內的月份 thread。</p>
      </div>

      <div className="glow-card p-4">
        <h3 className="text-purple-300 font-semibold mb-3">頻道紀錄訊息</h3>
        <textarea
          className="glow-input w-full min-h-[80px]"
          value={transcriptLogMessage}
          onChange={(e) => setTranscriptLogMessage(e.target.value)}
          placeholder="留空則使用預設摘要。"
        />
      </div>

      <div className="glow-card p-4">
        <h3 className="text-purple-300 font-semibold mb-3">客人私訊訊息</h3>
        <textarea
          className="glow-input w-full min-h-[80px]"
          value={transcriptDmMessage}
          onChange={(e) => setTranscriptDmMessage(e.target.value)}
          placeholder="留空則使用預設私訊內容。"
        />
      </div>

      <button className="btn-accent w-full" onClick={handleSave} disabled={saving}>
        {saving ? "儲存中..." : "儲存紀錄設定"}
      </button>
    </div>
  );
}
