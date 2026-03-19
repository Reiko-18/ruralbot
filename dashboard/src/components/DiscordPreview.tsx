import type { PriceNode, PriceListConfig, EmbedSettings } from "../types";
import { DiscordText } from "./DiscordText";

interface DiscordPreviewProps {
  node: PriceNode | null;
  roots: PriceNode[];
  config: PriceListConfig | null;
  editingHome?: boolean;
}

function parseSettings(raw: string | null | undefined): EmbedSettings {
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
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

  const settings = showHome
    ? parseSettings(config?.embedSettings)
    : parseSettings(node?.embedSettings);

  const borderColor = settings.color || "#f9b4fe";

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-400 mb-3">Discord 預覽</h3>

      {/* Embed */}
      <div
        className="bg-[#2b2d31] rounded-lg overflow-hidden border-l-4 shadow-glow-md"
        style={{ borderLeftColor: borderColor }}
      >
        <div className="p-4 space-y-2">
          {/* Author */}
          {settings.authorName && (
            <div className="flex items-center gap-1.5">
              {settings.authorIconUrl && (
                <img src={settings.authorIconUrl} alt="" className="w-5 h-5 rounded-full"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              )}
              <DiscordText text={settings.authorName} className="text-xs text-[#dbdee1]" />
            </div>
          )}

          {/* Title */}
          <div className="font-semibold text-white">
            <DiscordText text={title} />
          </div>

          {/* Description */}
          {description && (
            <div className="text-sm text-[#dbdee1] whitespace-pre-wrap">
              <DiscordText text={description} />
            </div>
          )}

          {/* Fields */}
          {items.length > 0 && (
            <div className="grid grid-cols-3 gap-2 mt-2">
              {items.map((item) => (
                <div key={item.id}>
                  <div className="text-xs font-semibold text-white">
                    <DiscordText text={item.label} />
                  </div>
                  <div className="text-xs text-[#dbdee1]">
                    <DiscordText text={item.price} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Image */}
          {imageUrl && (
            <img src={imageUrl} alt="preview" className="rounded mt-2 max-w-full"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          )}

          {/* Thumbnail */}
          {settings.thumbnailUrl && (
            <img src={settings.thumbnailUrl} alt="thumbnail"
              className="absolute top-4 right-4 w-20 h-20 rounded object-cover"
              style={{ position: "relative", float: "right", marginTop: "-80px" }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          )}

          {/* Footer */}
          {(settings.footerText || settings.showTimestamp) && (
            <div className="flex items-center gap-1.5 pt-1 border-t border-[#3f4147]">
              {settings.footerIconUrl && (
                <img src={settings.footerIconUrl} alt="" className="w-4 h-4 rounded-full"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              )}
              <span className="text-xs text-[#949ba4]">
                {settings.footerText && <DiscordText text={settings.footerText} />}
                {settings.footerText && settings.showTimestamp && " • "}
                {settings.showTimestamp && new Date().toLocaleString("zh-TW")}
              </span>
            </div>
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
              <div key={child.id} className="text-xs text-[#dbdee1] bg-[#2b2d31] rounded px-3 py-1.5 flex items-center gap-1">
                <DiscordText text={child.name} />
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
