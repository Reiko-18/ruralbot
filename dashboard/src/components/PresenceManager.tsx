import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, RefreshCw, Radio } from "lucide-react";
import type { PresenceText } from "../types";
import {
  fetchPresenceTexts,
  createPresenceTextApi,
  deletePresenceTextApi,
  refreshPresence,
} from "../api/client";

export function PresenceManager() {
  const [texts, setTexts] = useState<PresenceText[]>([]);
  const [newText, setNewText] = useState("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const reload = useCallback(async () => {
    try {
      const data = await fetchPresenceTexts();
      setTexts(data);
    } catch (err: any) {
      console.error("Failed to load presence texts:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleAdd = async () => {
    if (!newText.trim()) return;
    setAdding(true);
    try {
      await createPresenceTextApi(newText.trim());
      setNewText("");
      await reload();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deletePresenceTextApi(id);
      await reload();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshPresence();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return <div className="text-gray-400 text-center mt-10">載入中...</div>;
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Radio size={18} className="text-green-400" />
          <h2 className="text-lg font-semibold">動態輪播管理</h2>
        </div>
        <button
          className="flex items-center gap-1 px-3 py-1.5 bg-yellow-600 hover:bg-yellow-500 rounded text-sm disabled:opacity-50"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} /> 立即刷新
        </button>
      </div>

      {/* Add new */}
      <div className="flex gap-2">
        <input
          className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          placeholder="輸入動態文字（支援 {users} 佔位符顯示使用者人數）"
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
        <button
          className="flex items-center gap-1 px-3 py-2 bg-green-600 hover:bg-green-500 rounded text-sm disabled:opacity-50"
          onClick={handleAdd}
          disabled={adding || !newText.trim()}
        >
          <Plus size={14} /> 新增
        </button>
      </div>

      {/* List */}
      {texts.length === 0 ? (
        <div className="text-gray-500 text-center py-8">
          尚未設定任何動態文字
        </div>
      ) : (
        <div className="space-y-2">
          {texts.map((item, index) => (
            <div
              key={item.id}
              className="flex items-center gap-3 bg-gray-700 rounded px-4 py-3"
            >
              <span className="text-gray-400 font-mono text-sm w-6 text-right shrink-0">
                {index + 1}.
              </span>
              <span className="flex-1 text-sm break-all">{item.text}</span>
              <button
                className="text-red-400 hover:text-red-300 p-1"
                onClick={() => handleDelete(item.id)}
                title="刪除"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="bg-gray-800 rounded p-4 text-sm text-gray-400">
        <p className="font-semibold text-gray-300 mb-2">使用說明</p>
        <ul className="list-disc list-inside space-y-1">
          <li>動態文字會每 15 秒自動輪播切換</li>
          <li>使用 <code className="bg-gray-700 px-1 rounded">{"{users}"}</code> 佔位符會自動替換為目前所有伺服器的使用者總數</li>
          <li>按「立即刷新」可強制重新讀取資料庫並重置計時器</li>
        </ul>
      </div>
    </div>
  );
}
