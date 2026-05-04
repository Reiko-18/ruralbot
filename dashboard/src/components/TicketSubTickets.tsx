import { useState, useEffect, useCallback } from "react";
import type { TicketButtonType, DiscordChannel } from "../types";
import {
  fetchButtonTypes,
  createButtonTypeApi,
  updateButtonTypeApi,
  deleteButtonTypeApi,
  fetchGuildChannels,
} from "../api/client";
import { Trash2, Edit2, Plus, GripVertical } from "lucide-react";
import { normalizeDiscordEmojiText } from "../utils/discordEmoji";

interface Props {
  configId: string;
  guildId: string;
}

const STYLE_COLORS: Record<string, string> = {
  PRIMARY: "#5865F2",
  SECONDARY: "#4f545c",
  SUCCESS: "#57F287",
  DANGER: "#ED4245",
};

interface SubTicketForm {
  label: string;
  emoji: string;
  style: string;
  categoryOpenId: string;
  categoryCloseId: string;
  welcomeMessage: string;
  notifyRoleIds: string;
  maxOpenPerUser: string;
  cooldownSeconds: string;
  questions: string;
}

const emptyForm: SubTicketForm = {
  label: "",
  emoji: "",
  style: "PRIMARY",
  categoryOpenId: "",
  categoryCloseId: "",
  welcomeMessage: "",
  notifyRoleIds: "",
  maxOpenPerUser: "",
  cooldownSeconds: "",
  questions: "",
};

export function TicketSubTickets({ configId, guildId }: Props) {
  const [types, setTypes] = useState<TicketButtonType[]>([]);
  const [channels, setChannels] = useState<DiscordChannel[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SubTicketForm>(emptyForm);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  const categories = channels.filter((c) => c.type === "category");

  const reload = useCallback(async () => {
    const data = await fetchButtonTypes(configId);
    setTypes(data);
  }, [configId]);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    fetchGuildChannels(guildId).then(setChannels).catch(() => {});
  }, [guildId]);

  const getCategoryName = (id: string | null) => {
    if (!id) return "未設定";
    return categories.find((c) => c.id === id)?.name ?? id;
  };

  const startAdd = () => {
    setAdding(true);
    setEditingId(null);
    setForm(emptyForm);
  };

  const startEdit = (bt: TicketButtonType) => {
    setEditingId(bt.id);
    setAdding(false);
    setForm({
      label: bt.label,
      emoji: bt.emoji ?? "",
      style: bt.style,
      categoryOpenId: bt.categoryOpenId ?? "",
      categoryCloseId: bt.categoryCloseId ?? "",
      welcomeMessage: bt.welcomeMessage ?? "",
      notifyRoleIds: bt.notifyRoleIds ?? "",
      maxOpenPerUser: bt.maxOpenPerUser?.toString() ?? "",
      cooldownSeconds: bt.cooldownSeconds?.toString() ?? "",
      questions: bt.questions ?? "",
    });
  };

  const cancel = () => {
    setEditingId(null);
    setAdding(false);
    setForm(emptyForm);
  };

  const handleSave = async () => {
    if (!form.label.trim()) {
      alert("請輸入按鈕名稱");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        label: form.label.trim(),
        emoji: normalizeDiscordEmojiText(form.emoji).trim() || null,
        style: form.style,
        categoryOpenId: form.categoryOpenId || null,
        categoryCloseId: form.categoryCloseId || null,
        welcomeMessage: normalizeDiscordEmojiText(form.welcomeMessage).trim() || null,
        notifyRoleIds: form.notifyRoleIds.trim() || null,
        maxOpenPerUser: form.maxOpenPerUser ? parseInt(form.maxOpenPerUser, 10) : null,
        cooldownSeconds: form.cooldownSeconds ? parseInt(form.cooldownSeconds, 10) : null,
        questions: form.questions.trim() || null,
      };
      if (editingId) {
        await updateButtonTypeApi(editingId, payload);
      } else {
        await createButtonTypeApi({ configId, ...payload });
      }
      cancel();
      await reload();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("確定刪除此子票口？")) return;
    await deleteButtonTypeApi(id);
    await reload();
  };

  const renderForm = () => (
    <div className="glow-card p-4 space-y-4">
      <h4 className="text-purple-300 font-medium">{editingId ? "編輯子票口" : "新增子票口"}</h4>

      {/* Button appearance */}
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-1">
          <label className="text-sm text-gray-400 block mb-1">Emoji</label>
          <input
            className="glow-input w-full"
            value={form.emoji}
            onChange={(e) => setForm({ ...form, emoji: normalizeDiscordEmojiText(e.target.value) })}
            placeholder="📩 或 <:name:id>"
          />
        </div>
        <div className="col-span-2">
          <label className="text-sm text-gray-400 block mb-1">按鈕名稱</label>
          <input
            className="glow-input w-full"
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
            placeholder="例: 一般客服"
          />
        </div>
      </div>

      {/* Button style */}
      <div>
        <label className="text-sm text-gray-400 block mb-1">按鈕樣式</label>
        <div className="flex gap-2">
          {(["PRIMARY", "SECONDARY", "SUCCESS", "DANGER"] as const).map((s) => (
            <button
              key={s}
              type="button"
              className={`px-4 py-1.5 rounded text-sm text-white transition-all ${
                form.style === s ? "ring-2 ring-white/50 scale-105" : "opacity-60 hover:opacity-90"
              }`}
              style={{ backgroundColor: STYLE_COLORS[s] }}
              onClick={() => setForm({ ...form, style: s })}
            >
              {form.emoji ? `${form.emoji} ` : ""}{form.label || s}
            </button>
          ))}
        </div>
      </div>

      {/* Category settings */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm text-gray-400 block mb-1">開啟票口時的分類</label>
          <select
            className="glow-input w-full"
            value={form.categoryOpenId}
            onChange={(e) => setForm({ ...form, categoryOpenId: e.target.value })}
          >
            <option value="">— 選擇分類 —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">票口頻道會建立在此分類下</p>
        </div>
        <div>
          <label className="text-sm text-gray-400 block mb-1">關閉票口後的分類</label>
          <select
            className="glow-input w-full"
            value={form.categoryCloseId}
            onChange={(e) => setForm({ ...form, categoryCloseId: e.target.value })}
          >
            <option value="">— 選擇分類 —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">關閉後頻道會移至此分類</p>
        </div>
      </div>

      {/* Welcome message */}
      <div>
        <label className="text-sm text-gray-400 block mb-1">票口開啟後的默認訊息</label>
        <textarea
          className="glow-input w-full min-h-[80px]"
          value={form.welcomeMessage}
          onChange={(e) => setForm({ ...form, welcomeMessage: normalizeDiscordEmojiText(e.target.value) })}
          placeholder="感謝您的來信！請描述您的問題，我們會盡快為您處理。"
        />
        <p className="text-xs text-gray-500 mt-1">留空則使用預設歡迎詞</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="text-sm text-gray-400 block mb-1">通知/可見角色 IDs</label>
          <input
            className="glow-input w-full"
            value={form.notifyRoleIds}
            onChange={(e) => setForm({ ...form, notifyRoleIds: e.target.value })}
            placeholder='["role_id_1"]'
          />
        </div>
        <div>
          <label className="text-sm text-gray-400 block mb-1">每人同時開啟上限</label>
          <input
            className="glow-input w-full"
            type="number"
            min="0"
            value={form.maxOpenPerUser}
            onChange={(e) => setForm({ ...form, maxOpenPerUser: e.target.value })}
            placeholder="留空=用全局"
          />
        </div>
        <div>
          <label className="text-sm text-gray-400 block mb-1">冷卻秒數</label>
          <input
            className="glow-input w-full"
            type="number"
            min="0"
            value={form.cooldownSeconds}
            onChange={(e) => setForm({ ...form, cooldownSeconds: e.target.value })}
            placeholder="留空=用全局"
          />
        </div>
      </div>

      <div>
        <label className="text-sm text-gray-400 block mb-1">開票表單問題 JSON</label>
        <textarea
          className="glow-input w-full min-h-[120px] font-mono text-xs"
          value={form.questions}
          onChange={(e) => setForm({ ...form, questions: e.target.value })}
          placeholder='[{"label":"請描述問題","style":"paragraph","required":true},{"label":"訂單編號","placeholder":"可留空","required":false}]'
        />
        <p className="text-xs text-gray-500 mt-1">最多 5 題；style 可用 short 或 paragraph。</p>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button className="btn-accent" onClick={handleSave} disabled={saving}>
          {saving ? "儲存中..." : editingId ? "更新" : "新增"}
        </button>
        <button className="btn-accent-outline" onClick={cancel}>取消</button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-purple-300">子票口管理</h2>
        <span className="text-sm text-gray-500">{types.length} 個子票口</span>
      </div>

      {/* Sub-ticket list */}
      {types.map((bt) => (
        <div key={bt.id}>
          {editingId === bt.id ? renderForm() : (
            <div
              className="glow-card p-4 flex items-center justify-between hover:border-purple-500/30 transition-colors"
              style={{ borderLeft: `3px solid ${STYLE_COLORS[bt.style] ?? "#5865F2"}` }}
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <GripVertical size={16} className="text-gray-600 shrink-0" />
                <div className="min-w-0">
                  <div className="text-white font-medium truncate">
                    {bt.emoji ? `${bt.emoji} ` : ""}{bt.label}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5 space-x-2">
                    <span>開啟 → {getCategoryName(bt.categoryOpenId)}</span>
                    <span>·</span>
                    <span>關閉 → {getCategoryName(bt.categoryCloseId)}</span>
                  </div>
                  {bt.welcomeMessage && (
                    <div className="text-xs text-gray-500 mt-0.5 truncate">
                      歡迎詞: {bt.welcomeMessage}
                    </div>
                  )}
                  {(bt.maxOpenPerUser || bt.cooldownSeconds || bt.questions) && (
                    <div className="text-xs text-gray-500 mt-0.5 truncate">
                      上限: {bt.maxOpenPerUser ?? "全局"} · 冷卻: {bt.cooldownSeconds ?? "全局"} 秒 · 表單: {bt.questions ? "已啟用" : "未啟用"}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-2 shrink-0 ml-3">
                <button
                  onClick={() => startEdit(bt)}
                  className="text-purple-400 hover:text-purple-300 p-1"
                  title="編輯"
                >
                  <Edit2 size={16} />
                </button>
                <button
                  onClick={() => handleDelete(bt.id)}
                  className="text-red-400 hover:text-red-300 p-1"
                  title="刪除"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Add form */}
      {adding && renderForm()}

      {/* Add button */}
      {!adding && !editingId && (
        <button
          className="btn-accent-outline w-full flex items-center justify-center gap-2"
          onClick={startAdd}
        >
          <Plus size={16} /> 新增子票口
        </button>
      )}

      {types.length === 0 && !adding && (
        <div className="text-gray-500 text-center py-4 text-sm">
          尚未新增任何子票口，請點擊上方按鈕新增
        </div>
      )}
    </div>
  );
}
