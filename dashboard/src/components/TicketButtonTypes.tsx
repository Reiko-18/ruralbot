import { useState, useEffect, useCallback } from "react";
import type { TicketButtonType } from "../types";
import {
  fetchButtonTypes,
  createButtonTypeApi,
  updateButtonTypeApi,
  deleteButtonTypeApi,
} from "../api/client";
import { Trash2, Edit2, Plus } from "lucide-react";

interface Props {
  configId: string;
}

const STYLE_COLORS: Record<string, string> = {
  PRIMARY: "#5865F2",
  SECONDARY: "#4f545c",
  SUCCESS: "#57F287",
  DANGER: "#ED4245",
};

export function TicketButtonTypes({ configId }: Props) {
  const [types, setTypes] = useState<TicketButtonType[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<TicketButtonType>>({});
  const [adding, setAdding] = useState(false);

  const reload = useCallback(async () => {
    const data = await fetchButtonTypes(configId);
    setTypes(data);
  }, [configId]);

  useEffect(() => { reload(); }, [reload]);

  const handleSave = async () => {
    try {
      if (editing) {
        await updateButtonTypeApi(editing, form);
        setEditing(null);
      } else {
        await createButtonTypeApi({ configId, label: form.label || "新按鈕", ...form });
        setAdding(false);
      }
      setForm({});
      await reload();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("確定刪除此按鈕類型？")) return;
    await deleteButtonTypeApi(id);
    await reload();
  };

  const startEdit = (bt: TicketButtonType) => {
    setEditing(bt.id);
    setAdding(false);
    setForm({
      label: bt.label,
      emoji: bt.emoji,
      style: bt.style,
      categoryOpenId: bt.categoryOpenId,
      welcomeMessage: bt.welcomeMessage,
      notifyRoleIds: bt.notifyRoleIds,
      autoRemindHours: bt.autoRemindHours,
      autoCloseHours: bt.autoCloseHours,
    });
  };

  const renderForm = () => (
    <div className="glow-card p-4 space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-sm text-gray-400">按鈕文字</label>
          <input className="glow-input w-full" value={form.label ?? ""} onChange={(e) => setForm({ ...form, label: e.target.value })} />
        </div>
        <div>
          <label className="text-sm text-gray-400">Emoji</label>
          <input className="glow-input w-full" value={form.emoji ?? ""} onChange={(e) => setForm({ ...form, emoji: e.target.value })} placeholder="📩" />
        </div>
        <div>
          <label className="text-sm text-gray-400">樣式</label>
          <select className="glow-input w-full" value={form.style ?? "PRIMARY"} onChange={(e) => setForm({ ...form, style: e.target.value })}>
            <option value="PRIMARY">Primary</option>
            <option value="SECONDARY">Secondary</option>
            <option value="SUCCESS">Success</option>
            <option value="DANGER">Danger</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm text-gray-400">專屬分類 ID（留空=用全局）</label>
          <input className="glow-input w-full" value={form.categoryOpenId ?? ""} onChange={(e) => setForm({ ...form, categoryOpenId: e.target.value || null })} />
        </div>
        <div>
          <label className="text-sm text-gray-400">通知角色 IDs (JSON array)</label>
          <input className="glow-input w-full" value={form.notifyRoleIds ?? ""} onChange={(e) => setForm({ ...form, notifyRoleIds: e.target.value || null })} placeholder='["role_id_1"]' />
        </div>
      </div>
      <div>
        <label className="text-sm text-gray-400">專屬歡迎詞（留空=用全局）</label>
        <textarea className="glow-input w-full h-16" value={form.welcomeMessage ?? ""} onChange={(e) => setForm({ ...form, welcomeMessage: e.target.value || null })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm text-gray-400">提醒時數（留空=用全局）</label>
          <input className="glow-input w-full" type="number" value={form.autoRemindHours ?? ""} onChange={(e) => setForm({ ...form, autoRemindHours: e.target.value ? parseInt(e.target.value, 10) : null })} />
        </div>
        <div>
          <label className="text-sm text-gray-400">自動關閉時數（留空=用全局）</label>
          <input className="glow-input w-full" type="number" value={form.autoCloseHours ?? ""} onChange={(e) => setForm({ ...form, autoCloseHours: e.target.value ? parseInt(e.target.value, 10) : null })} />
        </div>
      </div>
      <div className="flex gap-2">
        <button className="btn-accent" onClick={handleSave}>{editing ? "更新" : "新增"}</button>
        <button className="btn-accent-outline" onClick={() => { setEditing(null); setAdding(false); setForm({}); }}>取消</button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {types.map((bt) => (
        <div key={bt.id}>
          {editing === bt.id ? renderForm() : (
            <div className="glow-item flex items-center justify-between p-3" style={{ borderLeft: `3px solid ${STYLE_COLORS[bt.style] ?? "#5865F2"}` }}>
              <div>
                <div className="text-white font-medium">{bt.emoji ? `${bt.emoji} ` : ""}{bt.label}</div>
                <div className="text-sm text-gray-400">
                  分類: {bt.categoryOpenId ?? "全局"} · 提醒: {bt.autoRemindHours ?? "全局"}h · 關閉: {bt.autoCloseHours ?? "全局"}h
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => startEdit(bt)} className="text-purple-400 hover:text-purple-300"><Edit2 size={16} /></button>
                <button onClick={() => handleDelete(bt.id)} className="text-red-400 hover:text-red-300"><Trash2 size={16} /></button>
              </div>
            </div>
          )}
        </div>
      ))}

      {adding && renderForm()}

      {!adding && !editing && (
        <button className="btn-accent-outline w-full flex items-center justify-center gap-2" onClick={() => { setAdding(true); setForm({ style: "PRIMARY" }); }}>
          <Plus size={16} /> 新增按鈕類型
        </button>
      )}

      {/* Panel Preview */}
      {types.length > 0 && (
        <div className="glow-card p-4">
          <h3 className="text-purple-300 font-semibold mb-3">面板預覽</h3>
          <div className="bg-[#36393f] p-4 rounded-lg border-l-4 border-purple-400">
            <div className="text-white font-bold">🎫 客服中心</div>
            <div className="text-gray-300 text-sm mt-1">請選擇下方按鈕開啟票口</div>
            <div className="flex gap-2 mt-3 flex-wrap">
              {types.map((bt) => (
                <span
                  key={bt.id}
                  className="px-3 py-1 rounded text-sm text-white"
                  style={{ backgroundColor: STYLE_COLORS[bt.style] ?? "#5865F2" }}
                >
                  {bt.emoji ? `${bt.emoji} ` : ""}{bt.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
