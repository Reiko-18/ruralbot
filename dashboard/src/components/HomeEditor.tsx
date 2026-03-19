import { useState, useEffect } from "react";
import { Save, Home } from "lucide-react";
import type { PriceListConfig, EmbedSettings } from "../types";
import { updateConfig } from "../api/client";
import { EmbedSettingsEditor } from "./EmbedSettingsEditor";

interface HomeEditorProps {
  config: PriceListConfig;
  onSave: () => Promise<void>;
}

function parseSettings(raw: string | null): EmbedSettings {
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

export function HomeEditor({ config, onSave }: HomeEditorProps) {
  const [title, setTitle] = useState(config.title);
  const [description, setDescription] = useState(config.description ?? "");
  const [imageUrl, setImageUrl] = useState(config.imageUrl ?? "");
  const [embedSettings, setEmbedSettings] = useState<EmbedSettings>(parseSettings(config.embedSettings));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTitle(config.title);
    setDescription(config.description ?? "");
    setImageUrl(config.imageUrl ?? "");
    setEmbedSettings(parseSettings(config.embedSettings));
  }, [config]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateConfig({
        title: title.trim(),
        description: description || null,
        imageUrl: imageUrl || null,
        embedSettings: JSON.stringify(embedSettings),
      });
      await onSave();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Home size={18} className="text-blue-400" />
          <h2 className="text-lg font-semibold">首頁設定</h2>
        </div>
        <button
          className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-sm disabled:opacity-50"
          onClick={handleSave}
          disabled={saving}
        >
          <Save size={14} /> 儲存
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm text-gray-400 mb-1">標題 (Title)</label>
          <input
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">說明文字 (Description)</label>
          <textarea
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500 min-h-[80px]"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="支援 Discord 自訂貼圖語法 <:name:id>"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">圖片 (Image)</label>
          <input
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://..."
          />
        </div>
      </div>

      <hr className="border-gray-700" />

      <EmbedSettingsEditor settings={embedSettings} onChange={setEmbedSettings} />

      <div className="bg-gray-800 rounded p-4 text-sm text-gray-400">
        <p className="font-semibold text-gray-300 mb-2">Discord 貼圖使用方式</p>
        <ul className="list-disc list-inside space-y-1">
          <li>自訂表情：<code className="bg-gray-700 px-1 rounded">&lt;:name:id&gt;</code></li>
          <li>動態表情：<code className="bg-gray-700 px-1 rounded">&lt;a:name:id&gt;</code></li>
          <li>一般 Emoji 直接貼上即可</li>
        </ul>
      </div>
    </div>
  );
}
