import { type ReactNode } from "react";

// Parse Discord custom emoji <:name:id> and <a:name:id> into img tags
// Also renders standard Unicode emoji as-is
export function DiscordText({ text, className }: { text: string; className?: string }) {
  const parts: ReactNode[] = [];
  const regex = /<(a)?:(\w+):(\d+)>/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // Add text before the emoji
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const animated = match[1] === "a";
    const name = match[2];
    const id = match[3];
    const ext = animated ? "gif" : "webp";
    const url = `https://cdn.discordapp.com/emojis/${id}.${ext}?size=48`;

    parts.push(
      <img
        key={`${id}-${match.index}`}
        src={url}
        alt={`:${name}:`}
        title={`:${name}:`}
        className="inline-block align-middle"
        style={{ width: "1.375em", height: "1.375em", margin: "0 0.05em" }}
        draggable={false}
      />
    );

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return <span className={className}>{parts}</span>;
}
