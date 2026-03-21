import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import type { PriceNode, PriceListConfig } from "./types";
import { fetchTree, fetchConfig } from "./api/client";
import {
  ListTree,
  BarChart3,
  Radio,
  Ticket,
  CreditCard,
} from "lucide-react";

// Lazy-load tab content for faster initial render
const TreeView = lazy(() => import("./components/TreeView").then(m => ({ default: m.TreeView })));
const NodeEditor = lazy(() => import("./components/NodeEditor").then(m => ({ default: m.NodeEditor })));
const HomeEditor = lazy(() => import("./components/HomeEditor").then(m => ({ default: m.HomeEditor })));
const DiscordPreview = lazy(() => import("./components/DiscordPreview").then(m => ({ default: m.DiscordPreview })));
const PresenceManager = lazy(() => import("./components/PresenceManager").then(m => ({ default: m.PresenceManager })));
const AccountingDashboard = lazy(() => import("./components/AccountingDashboard").then(m => ({ default: m.AccountingDashboard })));
const TicketDashboard = lazy(() => import("./components/TicketDashboard").then(m => ({ default: m.TicketDashboard })));
const PaymentDashboard = lazy(() => import("./components/PaymentDashboard").then(m => ({ default: m.PaymentDashboard })));

type Tab = "price" | "presence" | "accounting" | "ticket" | "payment";

const TABS: { key: Tab; label: string; icon: typeof ListTree }[] = [
  { key: "price", label: "價目表", icon: ListTree },
  { key: "accounting", label: "記帳", icon: BarChart3 },
  { key: "presence", label: "動態輪播", icon: Radio },
  { key: "ticket", label: "票口", icon: Ticket },
  { key: "payment", label: "金流", icon: CreditCard },
];

function TabSkeleton() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <div className="spinner-lg" />
        <span className="text-gray-500 text-sm">載入模組中...</span>
      </div>
    </div>
  );
}

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
      <div className="flex items-center justify-center h-screen">
        <div className="flex flex-col items-center gap-4">
          <div className="spinner-lg" />
          <div className="text-gray-400 text-sm animate-pulse">RuralBot 管理面板載入中...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="relative bg-surface-raised/80 backdrop-blur-md border-b border-violet-500/10 px-6 py-3 flex items-center gap-8 z-10">
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-violet-500/20 to-transparent" />

        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center shadow-glow">
            <span className="text-white font-bold text-sm">R</span>
          </div>
          <h1 className="text-lg font-semibold text-gray-100 tracking-tight">
            RuralBot
            <span className="text-violet-400 ml-1.5 font-normal text-sm hidden sm:inline">管理面板</span>
          </h1>
        </div>

        <nav className="flex gap-1">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              className={`tab-btn ${tab === key ? "active" : ""}`}
              onClick={() => setTab(key)}
            >
              <Icon size={16} />
              <span className="hidden md:inline">{label}</span>
            </button>
          ))}
        </nav>
      </header>

      {/* Content */}
      <Suspense fallback={<TabSkeleton />}>
        {tab === "price" ? (
          <div className="flex flex-1 overflow-hidden">
            <div className="w-72 border-r border-violet-500/10 overflow-y-auto bg-surface/50">
              <TreeView
                tree={tree}
                selectedId={selectedId}
                onSelect={(id) => { setSelectedId(id); setEditingHome(false); }}
                onReload={reload}
                onEditHome={() => { setSelectedId(null); setEditingHome(true); }}
              />
            </div>
            <div className="flex-1 overflow-y-auto p-6 animate-fade-in">
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
                <div className="text-gray-500 text-center mt-20 space-y-2">
                  <ListTree size={32} className="mx-auto text-gray-600" />
                  <p>從左側選擇一個節點開始編輯</p>
                </div>
              )}
            </div>
            <div className="w-96 border-l border-violet-500/10 overflow-y-auto p-4 bg-surface/50">
              <DiscordPreview node={selected} roots={tree} config={config} editingHome={editingHome} />
            </div>
          </div>
        ) : tab === "accounting" ? (
          <div className="flex-1 overflow-y-auto p-6 animate-fade-in">
            <AccountingDashboard />
          </div>
        ) : tab === "ticket" ? (
          <div className="flex-1 overflow-y-auto p-6 animate-fade-in">
            <TicketDashboard />
          </div>
        ) : tab === "payment" ? (
          <div className="flex-1 overflow-y-auto p-6 animate-fade-in">
            <PaymentDashboard />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 animate-fade-in">
            <PresenceManager />
          </div>
        )}
      </Suspense>
    </div>
  );
}
