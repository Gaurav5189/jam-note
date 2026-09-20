import type { Block } from "@/lib/types";

// Read-only block rendering. The Phase 3 editor renders its own editable
// blocks, but this stays the canonical read-only view: the editor falls
// back to it for block types it cannot edit (e.g. Phase 4 canvas nodes),
// and the Phase 5 public publishing pages will reuse it wholesale.
// Foreground inks come from --bv-fg / --bv-muted so the same classes
// render paper-on-ink on the desk and ink-on-paper inside canvas cards
// (and, later, on public paper pages).

export function BlockContent({ block }: { block: Block }) {
  const text = block.properties.text ?? "";

  switch (block.type) {
    case "header-1":
      return <h1 className="bv-h1">{text}</h1>;
    case "header-2":
      return <h2 className="bv-h2">{text}</h2>;
    case "header-3":
      return <h3 className="bv-h3">{text}</h3>;
    case "code":
      return (
        <div className="bv-code">
          <div className="bv-code-lang">
            {block.properties.language ?? "code"}
          </div>
          <pre className="bv-pre">{text}</pre>
        </div>
      );
    case "todo":
      return (
        <div className="bv-todo">
          <span
            className={`bv-check${block.properties.checked ? " on" : ""}`}
            aria-label={block.properties.checked ? "Completed" : "Pending"}
          >
            {block.properties.checked ? "✓" : ""}
          </span>
          <p className={`bv-p ${block.properties.checked ? "bv-done" : ""}`}>{text}</p>
        </div>
      );
    case "list-item":
      return (
        <div className="bv-list">
          <span className="bv-marker" aria-hidden>▸</span>
          <p className="bv-p">{text}</p>
        </div>
      );
    case "image":
      return block.properties.src ? (
        // eslint-disable-next-line @next/next/no-img-element -- user asset URLs come from S3/MinIO, not the Next image pipeline (Phase 3+)
        <img
          src={block.properties.src}
          alt={text || "Image block"}
          className="bv-img"
        />
      ) : (
        <p className="bv-p" style={{ opacity: 0.6, fontSize: 13 }}>image block missing src</p>
      );
    case "drawing":
      return block.properties.src ? (
        <div className="embed-frame">
          {/* eslint-disable-next-line @next/next/no-img-element -- drawings are canvas dataURLs, not the Next image pipeline */}
          <img
            src={block.properties.src}
            alt={text || "Drawing block"}
          />
        </div>
      ) : (
        <p className="bv-p" style={{ opacity: 0.6, fontSize: 13 }}>empty drawing block</p>
      );
    case "canvas-node":
      return (
        <div className="bv-tag">
          <span className="bv-tag-dot" aria-hidden />
          <p className="bv-p" style={{ fontSize: 13 }}>{text || "canvas node"}</p>
        </div>
      );
    case "divider":
      return <div className="bv-div" role="separator" />;
    case "text":
    default:
      if (!text) return null;
      return <p className="bv-p">{text}</p>;
  }
}

export function BlockList({ blocks }: { blocks: Block[] }) {
  if (blocks.length === 0) {
    return (
      <div className="bv-empty">
        <p className="kicker">EMPTY DOCUMENT</p>
        <p style={{ marginTop: 10, fontSize: 13, opacity: 0.65 }}>
          This note has no content yet.
        </p>
      </div>
    );
  }

  return (
    <div className="bv-list-wrap">
      {blocks.map((block) => (
        <BlockContent key={block.id} block={block} />
      ))}
    </div>
  );
}
