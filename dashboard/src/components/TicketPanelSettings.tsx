import { useState, useEffect } from "react";
import type { TicketConfig, TicketButtonType, EmbedSettings, DiscordChannel } from "../types";
import { updateTicketConfig, fetchGuildChannels, deployTicketPanel, fetchButtonTypes } from "../api/client";
import { EmbedSettingsEditor } from "./EmbedSettingsEditor";
import { DiscordText } from "./DiscordText";

/** Panel embed data stored as JSON in panelEmbed field */
interface PanelEmbedData extends EmbedSettings {
  title?: string;
  description?: string;
  imageUrl?: string;
}

function parsePanelEmbed(json: string | null): PanelEmbedData {
  if (!json) return {};
  try { return JSON.parse(json); } catch { return {}; }
}

interface Props {
  guildId: string;
  config: TicketConfig | null;
  onSave: () => void;
}

const STYLE_COLORS: Record<string, string> = {
  PRIMARY: "#5865F2",
  SECONDARY: "#4f545c",
  SUCCESS: "#57F287",
  DANGER: "#ED4245",
};

export function TicketPanelSettings({ guildId, config, onSave }: Props) {
  const [channels, setChannels] = useState<DiscordChannel[]>([]);
  const [subTickets, setSubTickets] = useState<TicketButtonType[]>([]);
  const [panelChannelId, setPanelChannelId] = useState(config?.panelChannelId ?? "");
  const [panelData, setPanelData] = useState<PanelEmbedData>(parsePanelEmbed(config?.panelEmbed ?? null));
  const [saving, setSaving] = useState(false);
  const [deploying, setDeploying] = useState(false);

  const textChannels = channels.filter((c) => c.type === "text");

  useEffect(() => {
    fetchGuildChannels(guildId)
      .then(setChannels)
      .catch((err) => console.error("Failed to load channels:", err));
  }, [guildId]);

  // Load sub-tickets for preview
  useEffect(() => {
    if (config?.id) {
      fetchButtonTypes(config.id).then(setSubTickets).catch(() => {});
    } else {
      setSubTickets([]);
    }
  }, [config?.id]);

  // Sync form when config changes (e.g., guild switch)
  useEffect(() => {
    setPanelChannelId(config?.panelChannelId ?? "");
    setPanelData(parsePanelEmbed(config?.panelEmbed ?? null));
  }, [config]);

  const updateField = (key: keyof PanelEmbedData, value: any) => {
    setPanelData((prev) => ({ ...prev, [key]: value || undefined }));
  };

  // Extract embed settings for EmbedSettingsEditor
  const embedSettings: EmbedSettings = {
    color: panelData.color,
    authorName: panelData.authorName,
    authorIconUrl: panelData.authorIconUrl,
    thumbnailUrl: panelData.thumbnailUrl,
    showTimestamp: panelData.showTimestamp,
    footerText: panelData.footerText,
    footerIconUrl: panelData.footerIconUrl,
  };

  const handleEmbedChange = (settings: EmbedSettings) => {
    setPanelData((prev) => ({ ...prev, ...settings }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateTicketConfig(guildId, {
        panelChannelId: panelChannelId || null,
        panelEmbed: Object.keys(panelData).length > 0 ? JSON.stringify(panelData) : null,
      });
      onSave();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeploy = async () => {
    setDeploying(true);
    try {
      const result = await deployTicketPanel(guildId);
      alert(result.action === "updated" ? "面板已更新！" : "面板已部署！");
      onSave();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setDeploying(false);
    }
  };

  const borderColor = panelData.color || "#f9b4fe";

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-purple-300">主面板設定</h2>

      {/* Channel selector */}
      <div className="glow-card p-4">
        <h3 className="text-purple-300 font-semibold mb-3">發送頻道</h3>
        <select
          className="glow-input w-full"
          value={panelChannelId}
          onChange={(e) => setPanelChannelId(e.target.value)}
        >
          <option value="">— 選擇頻道 —</option>
          {textChannels.map((c) => (
            <option key={c.id} value={c.id}>#{c.name}</option>
          ))}
        </select>
      </div>

      {/* Embed content */}
      <div className="glow-card p-4 space-y-4">
        <h3 className="text-purple-300 font-semibold mb-3">面板內容</h3>
        <div>
          <label className="block text-sm text-gray-400 mb-1">標題 (Title)</label>
          <input
            className="w-full glow-input"
            value={panelData.title || ""}
            onChange={(e) => updateField("title", e.target.value)}
            placeholder="🎫 客服票口"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">說明文字 (Description)</label>
          <textarea
            className="w-full glow-input min-h-[100px]"
            value={panelData.description || ""}
            onChange={(e) => updateField("description", e.target.value)}
            placeholder="點擊下方按鈕以建立票口，支援 Discord 自訂貼圖語法 <:name:id>"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">圖片 (Image)</label>
          <input
            className="w-full glow-input"
            value={panelData.imageUrl || ""}
            onChange={(e) => updateField("imageUrl", e.target.value)}
            placeholder="https://..."
          />
        </div>
      </div>

      {/* Embed visual settings */}
      <div className="glow-card p-4">
        <EmbedSettingsEditor settings={embedSettings} onChange={handleEmbedChange} />
      </div>

      {/* Discord preview */}
      <div className="glow-card p-4">
        <h3 className="text-sm font-semibold text-gray-400 mb-3">Discord 預覽</h3>
        <div
          className="bg-[#2b2d31] rounded-lg overflow-hidden border-l-4 shadow-glow-md"
          style={{ borderLeftColor: borderColor }}
        >
          <div className="p-4 space-y-2">
            {/* Author */}
            {panelData.authorName && (
              <div className="flex items-center gap-1.5">
                {panelData.authorIconUrl && (
                  <img
                    src={panelData.authorIconUrl}
                    alt=""
                    className="w-5 h-5 rounded-full"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                )}
                <DiscordText text={panelData.authorName} className="text-xs text-[#dbdee1]" />
              </div>
            )}

            {/* Title */}
            {panelData.title && (
              <div className="font-semibold text-white">
                <DiscordText text={panelData.title} />
              </div>
            )}

            {/* Description */}
            {panelData.description && (
              <div className="text-sm text-[#dbdee1] whitespace-pre-wrap">
                <DiscordText text={panelData.description} />
              </div>
            )}

            {/* Image */}
            {panelData.imageUrl && (
              <img
                src={panelData.imageUrl}
                alt="preview"
                className="rounded mt-2 max-w-full"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            )}

            {/* Thumbnail */}
            {panelData.thumbnailUrl && (
              <img
                src={panelData.thumbnailUrl}
                alt="thumbnail"
                className="absolute top-4 right-4 w-20 h-20 rounded object-cover"
                style={{ position: "relative", float: "right", marginTop: "-80px" }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            )}

            {/* Footer */}
            {(panelData.footerText || panelData.showTimestamp) && (
              <div className="flex items-center gap-1.5 pt-1 border-t border-[#3f4147]">
                {panelData.footerIconUrl && (
                  <img
                    src={panelData.footerIconUrl}
                    alt=""
                    className="w-4 h-4 rounded-full"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                )}
                <span className="text-xs text-[#949ba4]">
                  {panelData.footerText && <DiscordText text={panelData.footerText} />}
                  {panelData.footerText && panelData.showTimestamp && " • "}
                  {panelData.showTimestamp && new Date().toLocaleString("zh-TW")}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Sub-ticket buttons preview */}
        <div className="mt-2 flex gap-2 flex-wrap">
          {subTickets.length > 0 ? subTickets.map((bt) => (
            <span
              key={bt.id}
              className="px-3 py-1.5 rounded text-sm text-white"
              style={{ backgroundColor: STYLE_COLORS[bt.style] ?? "#5865F2" }}
            >
              {bt.emoji ? `${bt.emoji} ` : ""}{bt.label}
            </span>
          )) : (
            <span className="px-3 py-1.5 rounded text-sm text-white bg-[#5865F2]">
              🎫 開啟票口
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button className="btn-accent flex-1" onClick={handleSave} disabled={saving}>
          {saving ? "儲存中..." : "儲存設定"}
        </button>
        <button
          className="btn-accent-outline flex-1"
          onClick={handleDeploy}
          disabled={deploying || !config}
          title={!config ? "請先儲存設定" : ""}
        >
          {deploying ? "部署中..." : "部署 / 更新面板"}
        </button>
      </div>
    </div>
  );
}
