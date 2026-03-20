import { useState, useEffect, useCallback } from "react";
import type { TicketBlacklistEntry } from "../types";
import { fetchBlacklist, addToBlacklistApi, removeFromBlacklistApi } from "../api/client";
import { Trash2, Plus } from "lucide-react";

interface Props {
  configId: string;
}

export function TicketBlacklistView({ configId }: Props) {
  const [list, setList] = useState<TicketBlacklistEntry[]>([]);
  const [userId, setUserId] = useState("");
  const [reason, setReason] = useState("");
  const [adding, setAdding] = useState(false);

  const reload = useCallback(async () => {
    const data = await fetchBlacklist(configId);
    setList(data);
  }, [configId]);

  useEffect(() => { reload(); }, [reload]);

  const handleAdd = async () => {
    if (!userId.trim()) return;
    try {
      await addToBlacklistApi({
        configId,
        userId: userId.trim(),
        reason: reason.trim() || undefined,
        addedBy: "dashboard",
      });
      setUserId("");
      setReason("");
      setAdding(false);
      await reload();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleRemove = async (id: string) => {
    if (!confirm("確定移除此使用者？")) return;
    await removeFromBlacklistApi(id);
    await reload();
  };

  return (
    <div className="space-y-4">
      <div className="glow-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-purple-300 font-semibold">黑名單 ({list.length})</h3>
          <button className="btn-accent-outline text-sm flex items-center gap-1" onClick={() => setAdding(!adding)}>
            <Plus size={14} /> 新增
          </button>
        </div>

        {adding && (
          <div className="mb-4 p-3 bg-gray-800/50 rounded-lg space-y-2">
            <input className="glow-input w-full" value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="Discord 使用者 ID" />
            <input className="glow-input w-full" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="原因（選填）" />
            <div className="flex gap-2">
              <button className="btn-accent text-sm" onClick={handleAdd}>加入黑名單</button>
              <button className="btn-accent-outline text-sm" onClick={() => setAdding(false)}>取消</button>
            </div>
          </div>
        )}

        {list.length === 0 ? (
          <div className="text-gray-500 text-center py-4">尚無黑名單使用者</div>
        ) : (
          <div className="space-y-1">
            {list.map((entry) => (
              <div key={entry.id} className="glow-item flex items-center justify-between p-3">
                <div>
                  <span className="text-white font-mono">{entry.userId}</span>
                  {entry.reason && <span className="text-gray-400 text-sm ml-2">— {entry.reason}</span>}
                  <div className="text-gray-500 text-xs">
                    加入者: {entry.addedBy} · {new Date(entry.createdAt).toLocaleString("zh-TW")}
                  </div>
                </div>
                <button onClick={() => handleRemove(entry.id)} className="text-red-400 hover:text-red-300">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
