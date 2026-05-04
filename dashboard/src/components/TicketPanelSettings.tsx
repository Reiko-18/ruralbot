import { useState, useEffect } from "react";
import type { TicketConfig, TicketButtonType, EmbedSettings, DiscordChannel } from "../types";
import { updateTicketConfig, fetchGuildChannels, deployTicketPanel, fetchButtonTypes } from "../api/client";
import { EmbedSettingsEditor } from "./EmbedSettingsEditor";
import { DiscordText } from "./DiscordText";
import { normalizeDiscordEmojiObject, normalizeDiscordEmojiText } from "../utils/discordEmoji";

interface PanelEmbedData extends EmbedSettings {
  title?: string;
  description?: string;
  imageUrl?: string;
}

function parsePanelEmbed(json: string | null): PanelEmbedData {
  if (!json) return {};
  try { return normalizeDiscordEmojiObject(JSON.parse(json)); } catch { return {}; }
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
  const [categoryOpenId, setCategoryOpenId] = useState(config?.categoryOpenId ?? "");
  const [categoryCloseId, setCategoryCloseId] = useState(config?.categoryCloseId ?? "");
  const [panelComponentType, setPanelComponentType] = useState(config?.panelComponentType ?? "buttons");
  const [maxOpenPerUser, setMaxOpenPerUser] = useState(config?.maxOpenPerUser?.toString() ?? "");
  const [openCooldownSeconds, setOpenCooldownSeconds] = useState(config?.openCooldownSeconds?.toString() ?? "");
  const [channelNameFormat, setChannelNameFormat] = useState(config?.channelNameFormat ?? "{type}➤{number}｜{date}");
  const [supportRoleIds, setSupportRoleIds] = useState(config?.supportRoleIds ?? "");
  const [panelData, setPanelData] = useState<PanelEmbedData>(parsePanelEmbed(config?.panelEmbed ?? null));
  const [saving, setSaving] = useState(false);
  const [deploying, setDeploying] = useState(false);

  const textChannels = channels.filter((c) => c.type === "text");
  const categories = channels.filter((c) => c.type === "category");

  useEffect(() => {
    fetchGuildChannels(guildId)
      .then(setChannels)
      .catch((err) => console.error("Failed to load channels:", err));
  }, [guildId]);

  useEffect(() => {
    if (config?.id) {
      fetchButtonTypes(config.id).then(setSubTickets).catch(() => {});
    } else {
      setSubTickets([]);
    }
  }, [config?.id]);

  useEffect(() => {
    setPanelChannelId(config?.panelChannelId ?? "");
    setCategoryOpenId(config?.categoryOpenId ?? "");
    setCategoryCloseId(config?.categoryCloseId ?? "");
    setPanelComponentType(config?.panelComponentType ?? "buttons");
    setMaxOpenPerUser(config?.maxOpenPerUser?.toString() ?? "");
    setOpenCooldownSeconds(config?.openCooldownSeconds?.toString() ?? "");
    setChannelNameFormat(config?.channelNameFormat ?? "{type}➤{number}｜{date}");
    setSupportRoleIds(config?.supportRoleIds ?? "");
    setPanelData(parsePanelEmbed(config?.panelEmbed ?? null));
  }, [config]);

  const updateField = (key: keyof PanelEmbedData, value: any) => {
    setPanelData((prev) => ({ ...prev, [key]: typeof value === "string" ? normalizeDiscordEmojiText(value) || undefined : value || undefined }));
  };

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
    setPanelData((prev) => ({ ...prev, ...normalizeDiscordEmojiObject(settings as Record<string, unknown>) }));
  };

  const savePayload = async () => {
    await updateTicketConfig(guildId, {
      panelChannelId: panelChannelId || null,
      categoryOpenId: categoryOpenId || null,
      categoryCloseId: categoryCloseId || null,
      panelComponentType,
      maxOpenPerUser: maxOpenPerUser ? parseInt(maxOpenPerUser, 10) : null,
      openCooldownSeconds: openCooldownSeconds ? parseInt(openCooldownSeconds, 10) : null,
      channelNameFormat: channelNameFormat.trim() || null,
      supportRoleIds: supportRoleIds.trim() || null,
      panelEmbed: Object.keys(panelData).length > 0 ? JSON.stringify(normalizeDiscordEmojiObject({ ...panelData })) : null,
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await savePayload();
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
      await savePayload();
      const result = await deployTicketPanel(guildId);
      alert(result.action === "updated" ? "面板已更新。" : "面板已部署。");
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

      <div className="glow-card p-4">
        <h3 className="text-purple-300 font-semibold mb-3">票口發送與分類</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-sm text-gray-400 mb-1">主面板發送頻道</label>
            <select className="glow-input w-full" value={panelChannelId} onChange={(e) => setPanelChannelId(e.target.value)}>
              <option value="">-- 選擇文字頻道 --</option>
              {textChannels.map((c) => (
                <option key={c.id} value={c.id}>#{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">預設建立分類</label>
            <select className="glow-input w-full" value={categoryOpenId} onChange={(e) => setCategoryOpenId(e.target.value)}>
              <option value="">-- 選擇分類 --</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">預設關閉後分類</label>
            <select className="glow-input w-full" value={categoryCloseId} onChange={(e) => setCategoryCloseId(e.target.value)}>
              <option value="">-- 選擇分類 --</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-2">子票口若有自己的分類設定會優先使用；未設定時使用這裡的預設分類。</p>
      </div>

      <div className="glow-card p-4">
        <h3 className="text-purple-300 font-semibold mb-3">面板互動元件</h3>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={panelComponentType === "buttons" ? "btn-accent" : "btn-accent-outline"} onClick={() => setPanelComponentType("buttons")}>按鈕</button>
          <button type="button" className={panelComponentType === "select" ? "btn-accent" : "btn-accent-outline"} onClick={() => setPanelComponentType("select")}>下拉式選單</button>
        </div>
        <p className="text-xs text-gray-500 mt-2">按鈕會依 Discord 限制分列顯示；下拉式選單最多顯示前 25 個子票口。</p>
      </div>

      <div className="glow-card p-4 space-y-3">
        <h3 className="text-purple-300 font-semibold">Ticket Tool 風格進階限制</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-gray-400 mb-1">每人同時開啟上限</label>
            <input className="glow-input w-full" type="number" min="0" value={maxOpenPerUser} onChange={(e) => setMaxOpenPerUser(e.target.value)} placeholder="留空=不限" />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">開票冷卻秒數</label>
            <input className="glow-input w-full" type="number" min="0" value={openCooldownSeconds} onChange={(e) => setOpenCooldownSeconds(e.target.value)} placeholder="留空=不冷卻" />
          </div>
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">頻道命名格式</label>
          <input className="glow-input w-full" value={channelNameFormat} onChange={(e) => setChannelNameFormat(e.target.value)} placeholder="{type}➤{number}｜{date}" />
          <p className="text-xs text-gray-500 mt-1">可用變數：{"{type}"}、{"{number}"}、{"{username}"}、{"{userId}"}、{"{date}"}</p>
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">支援角色 IDs</label>
          <input className="glow-input w-full" value={supportRoleIds} onChange={(e) => setSupportRoleIds(e.target.value)} placeholder='["role_id_1"] 或以空白分隔' />
          <p className="text-xs text-gray-500 mt-1">這些角色可管理票口，並會被加入票口頻道權限。</p>
        </div>
      </div>

      <div className="glow-card p-4 space-y-4">
        <h3 className="text-purple-300 font-semibold mb-3">面板內容</h3>
        <div>
          <label className="block text-sm text-gray-400 mb-1">標題</label>
          <input className="w-full glow-input" value={panelData.title || ""} onChange={(e) => updateField("title", e.target.value)} placeholder="客服票口" />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">說明文字</label>
          <textarea className="w-full glow-input min-h-[100px]" value={panelData.description || ""} onChange={(e) => updateField("description", e.target.value)} placeholder="點擊下方按鈕或選單建立票口。" />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">圖片</label>
          <input className="w-full glow-input" value={panelData.imageUrl || ""} onChange={(e) => updateField("imageUrl", e.target.value)} placeholder="https://..." />
        </div>
      </div>

      <div className="glow-card p-4">
        <EmbedSettingsEditor settings={embedSettings} onChange={handleEmbedChange} />
      </div>

      <div className="glow-card p-4">
        <h3 className="text-sm font-semibold text-gray-400 mb-3">Discord 預覽</h3>
        <div className="bg-[#2b2d31] rounded-lg overflow-hidden border-l-4 shadow-glow-md" style={{ borderLeftColor: borderColor }}>
          <div className="p-4 space-y-2">
            {panelData.authorName && (
              <div className="flex items-center gap-1.5">
                {panelData.authorIconUrl && <img src={panelData.authorIconUrl} alt="" className="w-5 h-5 rounded-full" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />}
                <DiscordText text={panelData.authorName} className="text-xs text-[#dbdee1]" />
              </div>
            )}
            {panelData.title && <div className="font-semibold text-white"><DiscordText text={panelData.title} /></div>}
            {panelData.description && <div className="text-sm text-[#dbdee1] whitespace-pre-wrap"><DiscordText text={panelData.description} /></div>}
            {panelData.imageUrl && <img src={panelData.imageUrl} alt="preview" className="rounded mt-2 max-w-full" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />}
            {panelData.thumbnailUrl && <img src={panelData.thumbnailUrl} alt="thumbnail" className="absolute top-4 right-4 w-20 h-20 rounded object-cover" style={{ position: "relative", float: "right", marginTop: "-80px" }} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />}
            {(panelData.footerText || panelData.showTimestamp) && (
              <div className="flex items-center gap-1.5 pt-1 border-t border-[#3f4147]">
                {panelData.footerIconUrl && <img src={panelData.footerIconUrl} alt="" className="w-4 h-4 rounded-full" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />}
                <span className="text-xs text-[#949ba4]">
                  {panelData.footerText && <DiscordText text={panelData.footerText} />}
                  {panelData.footerText && panelData.showTimestamp && " / "}
                  {panelData.showTimestamp && new Date().toLocaleString("zh-TW")}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="mt-2 flex gap-2 flex-wrap">
          {panelComponentType === "select" ? (
            <span className="px-3 py-1.5 rounded text-sm text-white bg-[#4f545c]">請選擇票口類型 ({subTickets.length || 1})</span>
          ) : subTickets.length > 0 ? subTickets.map((bt) => (
            <span key={bt.id} className="px-3 py-1.5 rounded text-sm text-white" style={{ backgroundColor: STYLE_COLORS[bt.style] ?? "#5865F2" }}>
              {bt.emoji ? `${bt.emoji} ` : ""}{bt.label}
            </span>
          )) : (
            <span className="px-3 py-1.5 rounded text-sm text-white bg-[#5865F2]">開啟票口</span>
          )}
        </div>
      </div>

      <div className="flex gap-3">
        <button className="btn-accent flex-1" onClick={handleSave} disabled={saving}>{saving ? "儲存中..." : "儲存設定"}</button>
        <button className="btn-accent-outline flex-1" onClick={handleDeploy} disabled={deploying || !config} title={!config ? "請先儲存設定" : ""}>{deploying ? "部署中..." : "部署 / 更新面板"}</button>
      </div>
    </div>
  );
}
