import { useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  Plus,
  FolderOpen,
  File,
  GripVertical,
  Home,
} from "lucide-react";
import type { PriceNode } from "../types";
import { DiscordText } from "./DiscordText";
import { createNode, reorderNodes } from "../api/client";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface TreeViewProps {
  tree: PriceNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReload: () => Promise<void>;
  onEditHome: () => void;
}

export function TreeView({ tree, selectedId, onSelect, onReload, onEditHome }: TreeViewProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = tree.findIndex((n) => n.id === active.id);
    const newIndex = tree.findIndex((n) => n.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(tree, oldIndex, newIndex);
    try {
      await reorderNodes(null, reordered.map((n) => n.id));
      await onReload();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
          分類
        </span>
        <AddNodeButton parentId={undefined} onReload={onReload} />
      </div>
      <button
        className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-gray-300 hover:bg-purple-400/10 mb-2 text-sm"
        onClick={onEditHome}
      >
        <Home size={14} className="text-purple-400" />
        首頁設定
      </button>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={tree.map((n) => n.id)} strategy={verticalListSortingStrategy}>
          {tree.map((node) => (
            <SortableTreeNode
              key={node.id}
              node={node}
              depth={0}
              selectedId={selectedId}
              onSelect={onSelect}
              onReload={onReload}
            />
          ))}
        </SortableContext>
      </DndContext>
      {tree.length === 0 && (
        <p className="text-gray-500 text-sm text-center mt-4">尚無分類</p>
      )}
    </div>
  );
}

function SortableTreeNode({
  node,
  depth,
  selectedId,
  onSelect,
  onReload,
}: {
  node: PriceNode;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReload: () => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;
  const isSelected = node.id === selectedId;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: node.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleChildDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = node.children.findIndex((c) => c.id === active.id);
    const newIndex = node.children.findIndex((c) => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(node.children, oldIndex, newIndex);
    try {
      await reorderNodes(node.id, reordered.map((c) => c.id));
      await onReload();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div
        className={`flex items-center gap-1 px-2 py-1.5 rounded cursor-pointer group hover:bg-purple-400/10 ${
          isSelected ? "bg-purple-400 text-accent-dark shadow-glow-btn" : "text-gray-300"
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => onSelect(node.id)}
      >
        <span {...attributes} {...listeners} className="cursor-grab text-gray-500 hover:text-gray-300">
          <GripVertical size={14} />
        </span>
        {hasChildren ? (
          <button
            className="p-0.5 hover:text-white"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : (
          <span className="w-5" />
        )}
        {hasChildren ? (
          <FolderOpen size={14} className="text-purple-400" />
        ) : (
          <File size={14} className="text-purple-400" />
        )}
        <span className="flex-1 text-sm truncate"><DiscordText text={node.name} /></span>
        <span className="opacity-0 group-hover:opacity-100">
          <AddNodeButton parentId={node.id} onReload={onReload} />
        </span>
      </div>
      {expanded && hasChildren && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleChildDragEnd}>
          <SortableContext items={node.children.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            {node.children.map((child) => (
              <SortableTreeNode
                key={child.id}
                node={child}
                depth={depth + 1}
                selectedId={selectedId}
                onSelect={onSelect}
                onReload={onReload}
              />
            ))}
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

function AddNodeButton({
  parentId,
  onReload,
}: {
  parentId: string | undefined;
  onReload: () => Promise<void>;
}) {
  const handleAdd = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const name = prompt("輸入名稱：");
    if (!name?.trim()) return;
    try {
      await createNode({ name: name.trim(), parentId });
      await onReload();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <button
      className="p-0.5 hover:text-purple-400 text-gray-500"
      onClick={handleAdd}
      title="新增子項目"
    >
      <Plus size={14} />
    </button>
  );
}
