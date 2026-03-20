import { useState } from "react";
import type { TicketConfig } from "../types";
import { updateTicketConfig } from "../api/client";
import { EmbedSettingsEditor } from "./EmbedSettingsEditor";

interface Props {
  config: TicketConfig;
  onSave: () => void;
}

export function TicketSettings({ config, onSave }: Props) {
  const [panelChannelId, setPanelChannelId] = useState(config.panelChannelId ?? "");
  const [categoryOpenId, setCategoryOpenId] = useState(config.categoryOpenId ?? "");
  const [categoryCloseId, setCategoryCloseId] = useState(config.categoryCloseId ?? "");
  const [logChannelId, setLogChannelId] = useState(config.logChannelId ?? "");
  const [defaultMessage, setDefaultMessage] = useState(config.defaultMessage ?? "");
  const [autoRemindHours, setAutoRemindHours] = useState(config.autoRemindHours?.toString() ?? "");
  const [autoCloseHours, setAutoCloseHours] = useState(config.autoCloseHours?.toString() ?? "");
  const [blacklistMode, setBlacklistMode] = useState(config.blacklistMode);
  const [blacklistMessage, setBlacklistMessage] = useState(config.blacklistMessage ?? "");
  const [transcriptTarget, setTranscriptTarget] = useState(config.transcriptTarget);
  const [panelEmbed, setPanelEmbed] = useState(config.panelEmbed ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateTicketConfig(config.guildId, {
        panelChannelId: panelChannelId || null,
        categoryOpenId: categoryOpenId || null,
        categoryCloseId: categoryCloseId || null,
        logChannelId: logChannelId || null,
        defaultMessage: defaultMessage || null,
        autoRemindHours: autoRemindHours ? parseInt(autoRemindHours, 10) : null,
        autoCloseHours: autoCloseHours ? parseInt(autoCloseHours, 10) : null,
        blacklistMode,
        blacklistMessage: blacklistMessage || null,
        transcriptTarget,
        panelEmbed: panelEmbed || null,
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
      <div className="glow-card p-4">
        <h3 className="text-purple-300 font-semibold mb-3">頻道設定</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-gray-400">面板頻道 ID</label>
            <input className="glow-input w-full" value={panelChannelId} onChange={(e) => setPanelChannelId(e.target.value)} />
          </div>
          <div>
            <label className="text-sm text-gray-400">存檔頻道 ID</label>
            <input className="glow-input w-full" value={logChannelId} onChange={(e) => setLogChannelId(e.target.value)} />
          </div>
          <div>
            <label className="text-sm text-gray-400">開啟票口分類 ID</label>
            <input className="glow-input w-full" value={categoryOpenId} onChange={(e) => setCategoryOpenId(e.target.value)} />
          </div>
          <div>
            <label className="text-sm text-gray-400">關閉票口分類 ID</label>
            <input className="glow-input w-full" value={categoryCloseId} onChange={(e) => setCategoryCloseId(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="glow-card p-4">
        <h3 className="text-purple-300 font-semibold mb-3">歡迎詞</h3>
        <textarea className="glow-input w-full h-24" value={defaultMessage} onChange={(e) => setDefaultMessage(e.target.value)} placeholder="票口開啟後的歡迎訊息..." />
      </div>

      <div className="glow-card p-4">
        <h3 className="text-purple-300 font-semibold mb-3">自動超時</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-gray-400">提醒時數（留空=不提醒）</label>
            <input className="glow-input w-full" type="number" value={autoRemindHours} onChange={(e) => setAutoRemindHours(e.target.value)} placeholder="48" />
          </div>
          <div>
            <label className="text-sm text-gray-400">自動關閉時數（留空=不關閉）</label>
            <input className="glow-input w-full" type="number" value={autoCloseHours} onChange={(e) => setAutoCloseHours(e.target.value)} placeholder="72" />
          </div>
        </div>
      </div>

      <div className="glow-card p-4">
        <h3 className="text-purple-300 font-semibold mb-3">黑名單設定</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-gray-400">回應方式</label>
            <select className="glow-input w-full" value={blacklistMode} onChange={(e) => setBlacklistMode(e.target.value)}>
              <option value="ephemeral">Ephemeral 回覆</option>
              <option value="dm">私訊通知</option>
              <option value="silent">靜默忽略</option>
            </select>
          </div>
          <div>
            <label className="text-sm text-gray-400">自訂訊息</label>
            <input className="glow-input w-full" value={blacklistMessage} onChange={(e) => setBlacklistMessage(e.target.value)} placeholder="您已被禁止使用票口功能。" />
          </div>
        </div>
      </div>

      <div className="glow-card p-4">
        <h3 className="text-purple-300 font-semibold mb-3">存檔目標</h3>
        <select className="glow-input w-full" value={transcriptTarget} onChange={(e) => setTranscriptTarget(e.target.value)}>
          <option value="both">本地 + 主伺服器</option>
          <option value="local">僅本地</option>
          <option value="primary">僅主伺服器</option>
        </select>
      </div>

      <div className="glow-card p-4">
        <h3 className="text-purple-300 font-semibold mb-3">面板 Embed 設定</h3>
        <EmbedSettingsEditor value={panelEmbed} onChange={setPanelEmbed} />
      </div>

      <button className="btn-accent w-full" onClick={handleSave} disabled={saving}>
        {saving ? "儲存中..." : "儲存設定"}
      </button>
    </div>
  );
}
