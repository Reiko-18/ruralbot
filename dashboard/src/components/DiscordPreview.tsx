import type { PriceNode, PriceListConfig } from "../types";

interface DiscordPreviewProps {
  node: PriceNode | null;
  roots: PriceNode[];
  config: PriceListConfig | null;
  editingHome?: boolean;
}

export function DiscordPreview({ node, roots, config, editingHome }: DiscordPreviewProps) {
  const showHome = editingHome || (!node);

  const title = showHome ? (config?.title || "📋 價目表") : node!.name;
  const description = showHome
    ? (config?.description || (roots.length > 0 ? "請從下方選單選擇分類：" : "目前沒有任何價目表，請至管理面板新增。"))
    : (node!.content || undefined);
  const imageUrl = showHome ? (config?.imageUrl || undefined) : (node?.imageUrl || undefined);
  const items = node && !showHome ? node.items : [];
  const children = showHome ? roots : (node ? node.children : []);
  const hasMenu = children.length > 0 || (node !== null && !showHome);

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-400 mb-3">Discord 預覽</h3>

      {/* Embed */}
      <div className="bg-[#2b2d31] rounded-lg overflow-hidden border-l-4 border-[#5865f2]">
        <div className="p-4 space-y-2">
          <div className="font-semibold text-white">{title}</div>
          {description && (
            <div className="text-sm text-[#dbdee1]">{description}</div>
          )}
          {items.length > 0 && (
            <div className="grid grid-cols-3 gap-2 mt-2">
              {items.map((item) => (
                <div key={item.id}>
                  <div className="text-xs font-semibold text-white">{item.label}</div>
                  <div className="text-xs text-[#dbdee1]">{item.price}</div>
                </div>
              ))}
            </div>
          )}
          {imageUrl && (
            <img
              src={imageUrl}
              alt="preview"
              className="rounded mt-2 max-w-full"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          )}
        </div>
      </div>

      {/* Select Menu */}
      {hasMenu && (
        <div className="mt-2">
          <div className="bg-[#1e1f22] border border-[#3f4147] rounded px-3 py-2 text-sm text-[#949ba4]">
            {children.length > 0 ? "選擇項目..." : "操作..."}
          </div>
          <div className="mt-1 space-y-0.5">
            {children.map((child) => (
              <div
                key={child.id}
                className="text-xs text-[#dbdee1] bg-[#2b2d31] rounded px-3 py-1.5"
              >
                {child.name}
              </div>
            ))}
            {node && !showHome && (
              <div className="text-xs text-[#dbdee1] bg-[#2b2d31] rounded px-3 py-1.5">
                ⬅ 返回
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
