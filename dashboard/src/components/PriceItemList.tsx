import { useState, useEffect } from "react";
import { Plus, Trash2, GripVertical } from "lucide-react";
import type { PriceItem } from "../types";
import { DiscordText } from "./DiscordText";
import {
  createItem,
  updateItem,
  deleteItem,
  reorderItems,
} from "../api/client";
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

interface PriceItemListProps {
  nodeId: string;
  items: PriceItem[];
  onReload: () => Promise<void>;
}

export function PriceItemList({ nodeId, items, onReload }: PriceItemListProps) {
  const [localItems, setLocalItems] = useState(items);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => {
    setLocalItems(items);
  }, [items]);

  const handleAdd = async () => {
    const label = prompt("項目名稱：");
    if (!label?.trim()) return;
    const price = prompt("價格：");
    if (!price?.trim()) return;
    try {
      await createItem({ label: label.trim(), price: price.trim(), nodeId });
      await onReload();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = localItems.findIndex((i) => i.id === active.id);
    const newIndex = localItems.findIndex((i) => i.id === over.id);
    const reordered = arrayMove(localItems, oldIndex, newIndex);
    setLocalItems(reordered);
    try {
      await reorderItems(nodeId, reordered.map((i) => i.id));
      await onReload();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={localItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-1">
            {localItems.map((item) => (
              <SortableItem key={item.id} item={item} onReload={onReload} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <button
        className="flex items-center gap-1 mt-3 px-3 py-1.5 text-sm text-green-400 hover:text-green-300 border border-gray-600 rounded hover:border-green-400"
        onClick={handleAdd}
      >
        <Plus size={14} /> 新增項目
      </button>
    </div>
  );
}

function SortableItem({
  item,
  onReload,
}: {
  item: PriceItem;
  onReload: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(item.label);
  const [price, setPrice] = useState(item.price);

  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: item.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleSave = async () => {
    try {
      await updateItem(item.id, { label: label.trim(), price: price.trim() });
      setEditing(false);
      await onReload();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteItem(item.id);
      await onReload();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 bg-gray-700 rounded px-2 py-1.5 group"
    >
      <span {...attributes} {...listeners} className="cursor-grab text-gray-500 hover:text-gray-300">
        <GripVertical size={14} />
      </span>
      {editing ? (
        <>
          <input
            className="flex-1 bg-gray-600 border border-gray-500 rounded px-2 py-1 text-sm"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
          />
          <input
            className="w-24 bg-gray-600 border border-gray-500 rounded px-2 py-1 text-sm"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
          />
          <button className="text-blue-400 text-sm hover:text-blue-300" onClick={handleSave}>
            保存
          </button>
          <button className="text-gray-400 text-sm hover:text-gray-300" onClick={() => setEditing(false)}>
            取消
          </button>
        </>
      ) : (
        <>
          <span
            className="flex-1 text-sm cursor-pointer hover:text-white"
            onClick={() => setEditing(true)}
          >
            <DiscordText text={item.label} />
          </span>
          <span className="text-sm text-green-400"><DiscordText text={item.price} /></span>
          <button
            className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300"
            onClick={handleDelete}
          >
            <Trash2 size={14} />
          </button>
        </>
      )}
    </div>
  );
}
