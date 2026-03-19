import { useState, useEffect } from "react";
import { Save, Trash2 } from "lucide-react";
import type { PriceNode, EmbedSettings } from "../types";
import { updateNode, deleteNode } from "../api/client";
import { PriceItemList } from "./PriceItemList";
import { EmbedSettingsEditor } from "./EmbedSettingsEditor";

interface NodeEditorProps {
  node: PriceNode;
  onSave: () => Promise<void>;
  onDelete: () => void;
}

function parseSettings(raw: string | null): EmbedSettings {
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

export function NodeEditor({ node, onSave, onDelete }: NodeEditorProps) {
  const [name, setName] = useState(node.name);
  const [content, setContent] = useState(node.content ?? "");
  const [imageUrl, setImageUrl] = useState(node.imageUrl ?? "");
  const [embedSettings, setEmbedSettings] = useState<EmbedSettings>(parseSettings(node.embedSettings));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(node.name);
    setContent(node.content ?? "");
    setImageUrl(node.imageUrl ?? "");
    setEmbedSettings(parseSettings(node.embedSettings));
  }, [node.id, node.name, node.content, node.imageUrl, node.embedSettings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateNode(node.id, {
        name: name.trim(),
        content: content || null,
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

  const handleDelete = async () => {
    if (!confirm(`確定要刪除「${node.name}」及其所有子項目嗎？`)) return;
    try {
      await deleteNode(node.id);
      onDelete();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">編輯節點</h2>
        <div className="flex gap-2">
          <button
            className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-sm disabled:opacity-50"
            onClick={handleSave}
            disabled={saving || !name.trim()}
          >
            <Save size={14} /> 儲存
          </button>
          <button
            className="flex items-center gap-1 px-3 py-1.5 bg-red-600 hover:bg-red-500 rounded text-sm"
            onClick={handleDelete}
          >
            <Trash2 size={14} /> 刪除
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm text-gray-400 mb-1">名稱 (Title)</label>
          <input
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">說明文字 (Description)</label>
          <textarea
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500 min-h-[80px]"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <p className="text-xs text-gray-500 mt-1">支援 Discord 自訂貼圖語法 &lt;:name:id&gt; 及一般 Emoji</p>
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

      <hr className="border-gray-700" />

      <div>
        <h3 className="text-sm font-semibold text-gray-400 mb-3">價目項目 (Fields)</h3>
        <PriceItemList nodeId={node.id} items={node.items} onReload={onSave} />
      </div>
    </div>
  );
}
