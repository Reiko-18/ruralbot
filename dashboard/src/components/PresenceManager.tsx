import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, RefreshCw, Radio } from "lucide-react";
import type { PresenceText } from "../types";
import {
  fetchPresenceTexts,
  createPresenceTextApi,
  deletePresenceTextApi,
  refreshPresence,
} from "../api/client";
import { BlurFade } from "./magicui/blur-fade";
import { NumberTicker } from "./magicui/number-ticker";

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
    return <div className="flex justify-center py-12"><div className="spinner-lg" /></div>;
  }

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <BlurFade delay={0} direction="down">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio size={18} className="text-violet-400" />
            <h2 className="text-lg font-semibold">動態輪播管理</h2>
          </div>
          <button
            className="flex items-center gap-1.5 btn-accent-outline disabled:opacity-50"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} /> 立即刷新
          </button>
        </div>
      </BlurFade>

      {/* Add new */}
      <BlurFade delay={0.05} direction="up">
        <div className="flex gap-2">
          <input
            className="flex-1 glow-input"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="輸入動態文字（支援 {users} 佔位符顯示使用者人數）"
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
          <button
            className="flex items-center gap-1.5 btn-accent disabled:opacity-50"
            onClick={handleAdd}
            disabled={adding || !newText.trim()}
          >
            <Plus size={14} /> 新增
          </button>
        </div>
      </BlurFade>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* List */}
        <div className="lg:col-span-2">
          <BlurFade delay={0.1} direction="up">
            {texts.length === 0 ? (
              <div className="text-gray-500 text-center py-8 glow-card">
                尚未設定任何動態文字
              </div>
            ) : (
              <div className="glow-card overflow-hidden">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th className="w-12">#</th>
                      <th>動態文字內容</th>
                      <th className="w-16 text-center">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {texts.map((item, index) => (
                      <tr key={item.id}>
                        <td className="text-gray-500 font-mono">{index + 1}</td>
                        <td className="break-all">{item.text}</td>
                        <td className="text-center">
                          <button
                            className="text-red-400 hover:text-red-300 p-1 rounded-lg hover:bg-red-500/10 transition-colors"
                            onClick={() => handleDelete(item.id)}
                            title="刪除"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </BlurFade>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <BlurFade delay={0.15} direction="up">
            <div className="stat-card">
              <p className="text-gray-400 text-xs uppercase tracking-wider mb-2">目前輪播數量</p>
              <p className="text-3xl font-bold text-violet-300">
                <NumberTicker value={texts.length} />
              </p>
              <p className="text-gray-500 text-xs mt-1">每 15 秒自動切換一則</p>
            </div>
          </BlurFade>

          {texts.length > 0 && (
            <BlurFade delay={0.2} direction="up">
              <div className="glow-card p-5">
                <p className="text-gray-400 text-xs uppercase tracking-wider mb-3">輪播預覽</p>
                <div className="space-y-2">
                  {texts.map((item, index) => (
                    <div
                      key={item.id}
                      className={`text-xs px-3 py-2 rounded-lg transition-colors ${
                        index === 0
                          ? "bg-violet-500/15 text-violet-300 border border-violet-500/25"
                          : "bg-surface text-gray-500"
                      }`}
                    >
                      {item.text.replace("{users}", "1,234")}
                    </div>
                  ))}
                </div>
              </div>
            </BlurFade>
          )}

          <BlurFade delay={0.25} direction="up">
            <div className="glow-card p-5 text-sm text-gray-400">
              <p className="font-semibold text-gray-300 mb-2">使用說明</p>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>動態文字會每 15 秒自動輪播切換</li>
                <li>使用 <code className="bg-violet-500/15 text-violet-300 px-1.5 py-0.5 rounded">{"{users}"}</code> 佔位符會自動替換為目前所有伺服器的使用者總數</li>
                <li>按「立即刷新」可強制重新讀取資料庫並重置計時器</li>
              </ul>
            </div>
          </BlurFade>
        </div>
      </div>
    </div>
  );
}
