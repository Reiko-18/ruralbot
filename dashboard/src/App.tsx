import { useState, useEffect, useCallback } from "react";
import type { PriceNode } from "./types";
import { fetchTree } from "./api/client";
import { TreeView } from "./components/TreeView";
import { NodeEditor } from "./components/NodeEditor";
import { DiscordPreview } from "./components/DiscordPreview";

export default function App() {
  const [tree, setTree] = useState<PriceNode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const data = await fetchTree();
      setTree(data);
    } catch (err) {
      console.error("Failed to load tree:", err);
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

  return (
    <div className="h-screen flex flex-col">
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-3">
        <h1 className="text-xl font-bold">RuralBot 價目表管理</h1>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <div className="w-72 border-r border-gray-700 overflow-y-auto bg-gray-850">
          <TreeView
            tree={tree}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onReload={reload}
          />
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {selected ? (
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
        <div className="w-96 border-l border-gray-700 overflow-y-auto p-4 bg-gray-800">
          <DiscordPreview node={selected} roots={tree} />
        </div>
      </div>
    </div>
  );
}
