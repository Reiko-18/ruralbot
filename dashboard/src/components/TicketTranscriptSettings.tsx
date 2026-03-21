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
  const [transcriptLogMessage, setTranscriptLogMessage] = useState(config.transcriptLogMessage ?? "");
  const [transcriptDmMessage, setTranscriptDmMessage] = useState(config.transcriptDmMessage ?? "");
  const [saving, setSaving] = useState(false);

  const textChannels = channels.filter((c) => c.type === "text");

  useEffect(() => {
    fetchGuildChannels(guildId).then(setChannels).catch(() => {});
  }, [guildId]);

  useEffect(() => {
    setLogChannelId(config.logChannelId ?? "");
    setTranscriptLogMessage(config.transcriptLogMessage ?? "");
    setTranscriptDmMessage(config.transcriptDmMessage ?? "");
  }, [config]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateTicketConfig(guildId, {
        logChannelId: logChannelId || null,
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
      <h2 className="text-lg font-semibold text-purple-300">存檔紀錄設定</h2>

      {/* Log channel selector */}
      <div className="glow-card p-4">
        <h3 className="text-purple-300 font-semibold mb-3">存檔發送頻道</h3>
        <select
          className="glow-input w-full"
          value={logChannelId}
          onChange={(e) => setLogChannelId(e.target.value)}
        >
          <option value="">— 選擇頻道 —</option>
          {textChannels.map((c) => (
            <option key={c.id} value={c.id}>#{c.name}</option>
          ))}
        </select>
        <p className="text-xs text-gray-500 mt-1">
          存檔紀錄會以 HTML 檔案發送到此頻道的 Thread 內
        </p>
      </div>

      {/* Log channel message */}
      <div className="glow-card p-4">
        <h3 className="text-purple-300 font-semibold mb-3">頻道存檔訊息</h3>
        <textarea
          className="glow-input w-full min-h-[80px]"
          value={transcriptLogMessage}
          onChange={(e) => setTranscriptLogMessage(e.target.value)}
          placeholder="留空則使用預設格式（僅顯示票口摘要資訊）"
        />
        <p className="text-xs text-gray-500 mt-1">
          發送到存檔頻道 Thread 時 Embed 中顯示的自訂訊息
        </p>
      </div>

      {/* DM message */}
      <div className="glow-card p-4">
        <h3 className="text-purple-300 font-semibold mb-3">客人私訊訊息</h3>
        <textarea
          className="glow-input w-full min-h-[80px]"
          value={transcriptDmMessage}
          onChange={(e) => setTranscriptDmMessage(e.target.value)}
          placeholder="留空則使用預設：「以下是您的票口對話紀錄，點擊下方按鈕即可在瀏覽器中查看完整內容（含圖片、貼圖、連結等）。」"
        />
        <p className="text-xs text-gray-500 mt-1">
          存檔紀錄 DM 給客人時 Embed 中顯示的自訂訊息
        </p>
      </div>

      <button className="btn-accent w-full" onClick={handleSave} disabled={saving}>
        {saving ? "儲存中..." : "儲存存檔設定"}
      </button>
    </div>
  );
}
