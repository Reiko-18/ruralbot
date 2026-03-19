import type { EmbedSettings } from "../types";

interface EmbedSettingsEditorProps {
  settings: EmbedSettings;
  onChange: (settings: EmbedSettings) => void;
}

const inputClass = "w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500";

export function EmbedSettingsEditor({ settings, onChange }: EmbedSettingsEditorProps) {
  const update = (key: keyof EmbedSettings, value: any) => {
    onChange({ ...settings, [key]: value || undefined });
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-400">Embed 設定</h3>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-gray-400 mb-1">顏色 (Hex)</label>
          <div className="flex gap-2">
            <input
              type="color"
              className="w-10 h-9 bg-gray-700 border border-gray-600 rounded cursor-pointer"
              value={settings.color || "#5865f2"}
              onChange={(e) => update("color", e.target.value)}
            />
            <input
              className={inputClass}
              value={settings.color || ""}
              onChange={(e) => update("color", e.target.value)}
              placeholder="#5865f2"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">時間戳記</label>
          <label className="flex items-center gap-2 mt-2 cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 rounded bg-gray-700 border-gray-600"
              checked={settings.showTimestamp || false}
              onChange={(e) => update("showTimestamp", e.target.checked)}
            />
            <span className="text-sm text-gray-300">顯示時間戳記</span>
          </label>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-gray-400 mb-1">Author 名稱</label>
          <input
            className={inputClass}
            value={settings.authorName || ""}
            onChange={(e) => update("authorName", e.target.value)}
            placeholder="作者名稱"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">Author 圖示</label>
          <input
            className={inputClass}
            value={settings.authorIconUrl || ""}
            onChange={(e) => update("authorIconUrl", e.target.value)}
            placeholder="https://..."
          />
        </div>
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-1">縮圖 (Thumbnail)</label>
        <input
          className={inputClass}
          value={settings.thumbnailUrl || ""}
          onChange={(e) => update("thumbnailUrl", e.target.value)}
          placeholder="https://..."
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-gray-400 mb-1">Footer 文字</label>
          <input
            className={inputClass}
            value={settings.footerText || ""}
            onChange={(e) => update("footerText", e.target.value)}
            placeholder="頁尾文字"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">Footer 圖示</label>
          <input
            className={inputClass}
            value={settings.footerIconUrl || ""}
            onChange={(e) => update("footerIconUrl", e.target.value)}
            placeholder="https://..."
          />
        </div>
      </div>
    </div>
  );
}
