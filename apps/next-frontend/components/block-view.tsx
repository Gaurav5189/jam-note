import type { Block } from "@/lib/types";

// Read-only block rendering. The Phase 3 editor renders its own editable
// blocks, but this stays the canonical read-only view: the editor falls
// back to it for block types it cannot edit (e.g. Phase 4 canvas nodes),
// and the Phase 5 public publishing pages will reuse it wholesale.

export function BlockContent({ block }: { block: Block }) {
  const text = block.properties.text ?? "";

  switch (block.type) {
    case "header-1":
      return <h1 className="text-2xl text-text-primary font-semibold mt-6 mb-2 break-words">{text}</h1>;
    case "header-2":
      return <h2 className="text-xl text-text-primary font-semibold mt-5 mb-2 break-words">{text}</h2>;
    case "header-3":
      return <h3 className="text-lg text-text-primary font-semibold mt-4 mb-2 break-words">{text}</h3>;
    case "code":
      return (
        <div className="bg-background-panel border border-border-thin rounded-sm overflow-hidden my-2">
          <div className="px-3 py-1.5 border-b border-border-thin text-[10px] font-mono uppercase tracking-widest text-text-muted">
            {block.properties.language ?? "code"}
          </div>
          <pre className="p-3 text-[13px] font-mono text-text-primary whitespace-pre-wrap break-words">
            {text}
          </pre>
        </div>
      );
    case "todo":
      return (
        <div className="flex items-start gap-2.5 py-1">
          <span
            className={`shrink-0 w-4 h-4 mt-0.5 border rounded-sm flex items-center justify-center text-[10px] font-mono ${
              block.properties.checked
                ? "border-accent-neon bg-accent-neon/10 text-accent-neon"
                : "border-border-thin text-transparent"
            }`}
            aria-label={block.properties.checked ? "Completed" : "Pending"}
          >
            {block.properties.checked ? "✓" : ""}
          </span>
          <p
            className={`text-[15px] text-text-primary break-words ${
              block.properties.checked ? "line-through text-text-muted" : ""
            }`}
          >
            {text}
          </p>
        </div>
      );
    case "list-item":
      return (
        <div className="flex items-start gap-2.5 py-0.5">
          <span className="text-accent-neon shrink-0 mt-0.5 leading-6">▸</span>
          <p className="text-[15px] text-text-primary break-words">{text}</p>
        </div>
      );
    case "image":
      return block.properties.src ? (
        // eslint-disable-next-line @next/next/no-img-element -- user asset URLs come from S3/MinIO, not the Next image pipeline (Phase 3+)
        <img
          src={block.properties.src}
          alt={text || "Image block"}
          className="max-w-full border border-border-thin rounded-sm my-2"
        />
      ) : (
        <p className="text-[13px] font-mono text-text-muted py-1">image block missing src</p>
      );
    case "drawing":
      return block.properties.src ? (
        <div className="relative my-2 inline-block max-w-full">
          {/* eslint-disable-next-line @next/next/no-img-element -- drawings are canvas dataURLs, not the Next image pipeline */}
          <img
            src={block.properties.src}
            alt={text || "Drawing block"}
            className="max-w-full border border-border-thin rounded-sm block"
          />
          <span className="absolute top-2 left-2 text-[9px] font-mono uppercase tracking-widest text-text-muted bg-background-panel/80 border border-border-thin rounded-sm px-1.5 py-0.5">
            Sketch
          </span>
        </div>
      ) : (
        <p className="text-[13px] font-mono text-text-muted py-1">empty drawing block</p>
      );
    case "canvas-node":
      return (
        <div className="inline-flex items-center gap-2 border border-accent-amber/40 bg-accent-amber/5 rounded-sm px-3 py-1.5 my-1">
          <span className="w-2 h-2 rounded-full bg-accent-amber shrink-0" />
          <p className="text-[13px] font-mono text-accent-amber">{text || "canvas node"}</p>
        </div>
      );
    case "divider":
      return <div className="h-px w-full bg-border-thin my-3" role="separator" />;
    case "text":
    default:
      if (!text) return null;
      return <p className="text-[15px] text-text-primary leading-7 break-words whitespace-pre-wrap">{text}</p>;
  }
}

export function BlockList({ blocks }: { blocks: Block[] }) {
  if (blocks.length === 0) {
    return (
      <div className="mt-8 border border-dashed border-border-thin rounded-md p-8 text-center">
        <p className="text-xs font-mono uppercase tracking-widest text-text-muted">
          Empty document
        </p>
        <p className="mt-2 text-sm text-text-muted">
          This note has no content yet. The slash-command block editor ships in Phase 3 —
          content created through the API renders here in the meantime.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-1 max-w-[75ch]">
      {blocks.map((block) => (
        <BlockContent key={block.id} block={block} />
      ))}
    </div>
  );
}
