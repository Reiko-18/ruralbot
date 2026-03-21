import { useState, useEffect, useCallback } from "react";
import type { PriceNode, PriceListConfig } from "./types";
import { fetchTree, fetchConfig } from "./api/client";
import { TreeView } from "./components/TreeView";
import { NodeEditor } from "./components/NodeEditor";
import { HomeEditor } from "./components/HomeEditor";
import { DiscordPreview } from "./components/DiscordPreview";
import { PresenceManager } from "./components/PresenceManager";
import { AccountingDashboard } from "./components/AccountingDashboard";
import { TicketDashboard } from "./components/TicketDashboard";
import { PaymentDashboard } from "./components/PaymentDashboard";

type Tab = "price" | "presence" | "accounting" | "ticket" | "payment";

export default function App() {
  const [tab, setTab] = useState<Tab>("price");
  const [tree, setTree] = useState<PriceNode[]>([]);
  const [config, setConfig] = useState<PriceListConfig | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingHome, setEditingHome] = useState(false);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const [treeData, configData] = await Promise.all([fetchTree(), fetchConfig()]);
      setTree(treeData);
      setConfig(configData);
    } catch (err) {
      console.error("Failed to load:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const findNode = (nodes: PriceNode[], id: string): PriceNode | null => {
    for (const node of nodes) {
      if (node.id === id) return node;
      const found = findNode(node.children, id);
      if (found) return found;
    }
    return null;
  };

  const selected = selectedId ? findNode(tree, selectedId) : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-400">
        載入中...
      </div>
    );
  }

  const tabClass = (t: Tab) =>
    `px-3 py-1.5 rounded text-sm font-medium transition-colors ${
      tab === t
        ? "btn-accent"
        : "text-gray-400 hover:text-purple-300 hover:bg-purple-400/10"
    }`;

  return (
    <div className="h-screen flex flex-col">
      <header className="bg-gray-900 border-b border-purple-500/20 px-6 py-3 flex items-center gap-6">
        <h1 className="text-xl font-bold">RuralBot 管理面板</h1>
        <nav className="flex gap-1">
          <button className={tabClass("price")} onClick={() => setTab("price")}>
            價目表
          </button>
          <button className={tabClass("accounting")} onClick={() => setTab("accounting")}>
            記帳
          </button>
          <button className={tabClass("presence")} onClick={() => setTab("presence")}>
            動態輪播
          </button>
          <button className={tabClass("ticket")} onClick={() => setTab("ticket")}>
            票口
          </button>
          <button className={tabClass("payment")} onClick={() => setTab("payment")}>
            金流
          </button>
        </nav>
      </header>

      {tab === "price" ? (
        <div className="flex flex-1 overflow-hidden">
          <div className="w-72 border-r border-purple-500/20 overflow-y-auto">
            <TreeView
              tree={tree}
              selectedId={selectedId}
              onSelect={(id) => { setSelectedId(id); setEditingHome(false); }}
              onReload={reload}
              onEditHome={() => { setSelectedId(null); setEditingHome(true); }}
            />
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            {editingHome && config ? (
              <HomeEditor config={config} onSave={reload} />
            ) : selected ? (
              <NodeEditor
                node={selected}
                onSave={reload}
                onDelete={() => {
                  setSelectedId(null);
                  reload();
                }}
              />
            ) : (
              <div className="text-gray-500 text-center mt-20">
                ← 從左側選擇一個節點開始編輯
              </div>
            )}
          </div>
          <div className="w-96 border-l border-purple-500/20 overflow-y-auto p-4">
            <DiscordPreview node={selected} roots={tree} config={config} editingHome={editingHome} />
          </div>
        </div>
      ) : tab === "accounting" ? (
        <div className="flex-1 overflow-y-auto p-6">
          <AccountingDashboard />
        </div>
      ) : tab === "ticket" ? (
        <div className="flex-1 overflow-y-auto p-6">
          <TicketDashboard />
        </div>
      ) : tab === "payment" ? (
        <div className="flex-1 overflow-y-auto p-6">
          <PaymentDashboard />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-6">
          <PresenceManager />
        </div>
      )}
    </div>
  );
}
