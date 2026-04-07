import { useEffect, useRef, useState } from "react";

/* =========================
   TYPES
========================= */

type NodeData = Record<string, any>;

type ImageSlot = {
  slotId: string;
  role: string;
  suggestedPath: string;
  expectedSize: { width: number; height: number };
  aspectRatio: number;
  objectFit: "cover" | "contain" | "none";
};

type PluginMessage =
  | { type: "UPDATE"; name: string; json: NodeData }
  | { type: "CLEAR" }
  | { type: "ERROR"; message: string };

/* =========================
   KEYS
========================= */

const LAYOUT_KEYS = new Set([
  "x","y","width","height","rotation","visible",
  "layoutMode","layoutAlign","layoutGrow","layoutPositioning","layoutWrap",
  "layoutSizingHorizontal","layoutSizingVertical",
  "primaryAxisAlignItems","primaryAxisSizingMode",
  "counterAxisAlignItems","counterAxisAlignContent","counterAxisSizingMode",
  "counterAxisSpacing","itemSpacing",
  "paddingLeft","paddingRight","paddingTop","paddingBottom",
  "minWidth","minHeight","maxWidth","maxHeight",
  "constraints","clipsContent","overflowDirection",
]);

const STYLE_KEYS = new Set([
  "strokes","strokeWeight","strokeAlign",
  "effects","opacity",
  "cornerRadius",
  "fontName","fontSize","fontWeight",
  "letterSpacing","lineHeight",
  "textAlignHorizontal","textAlignVertical",
]);

/* =========================
   IMAGE SLOT HELPERS
========================= */

function normalizeSlotId(node: NodeData): string {
  return (
    node.name
      ?.toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9\-]/g, "") || "image-slot"
  );
}

function inferImageRole(node: NodeData): string {
  const name = (node.name ?? "").toLowerCase();
  const w = node.width ?? 0;
  const h = node.height ?? 0;
  if (/hero|banner|cover/.test(name)) return "hero";
  if (/bg|background|backdrop/.test(name)) return "background";
  if (/thumb|thumbnail/.test(name)) return "thumbnail";
  if (/avatar|profile|user/.test(name)) return "avatar";
  if (/product|item|goods/.test(name)) return "product";
  if (/logo/.test(name)) return "logo";
  if (w > 800) return "hero";
  if (w === h && w <= 100) return "avatar";
  return "content";
}

function scaleModeToObjectFit(scaleMode?: string): "cover" | "contain" | "none" {
  if (scaleMode === "FIT") return "contain";
  if (scaleMode === "TILE") return "none";
  return "cover";
}

function buildImageSlot(fill: any, node: NodeData): ImageSlot {
  const width = Math.round(node.width ?? 0);
  const height = Math.round(node.height ?? 0);
  const slotId = normalizeSlotId(node);
  return {
    slotId,
    role: inferImageRole(node),
    suggestedPath: `./images/${slotId}.png`,
    expectedSize: { width, height },
    aspectRatio: width && height ? parseFloat((width / height).toFixed(2)) : 1,
    objectFit: scaleModeToObjectFit(fill?.scaleMode),
  };
}

function transformImageFill(fill: any, node: NodeData): any {
  return {
    type: "IMAGE",
    imageSlot: buildImageSlot(fill, node),
  };
}

/* =========================
   JSON BUILDERS
========================= */

function pickNode(node: NodeData, keys: Set<string>): NodeData {
  const result: NodeData = {
    name: node.name,
    type: node.type,
  };

  for (const k of keys) {
    if (k === "fills" && Array.isArray(node.fills) && node.fills.length > 0) {
      result.fills = node.fills.map((fill: any) =>
        fill.type === "IMAGE" ? transformImageFill(fill, node) : fill
      );
      continue;
    }
    if (node[k] !== undefined) {
      result[k] = node[k];
    }
  }

  if (Array.isArray(node.children)) {
    result.children = node.children.map((child: NodeData) => pickNode(child, keys));
  }

  return result;
}

function buildStructure(node: NodeData): NodeData {
  return pickNode(node, LAYOUT_KEYS);
}

function buildDesign(node: NodeData): NodeData {
  return pickNode(node, STYLE_KEYS);
}

/* =========================
   DOWNLOAD
========================= */

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* =========================
   APP
========================= */

export default function App() {
  const [frameName, setFrameName] = useState<string | null>(null);
  const [json, setJson] = useState<NodeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<"structure" | "design">("structure");

  const slugRef = useRef("frame");

  useEffect(() => {
    slugRef.current = frameName ?? "frame";
  }, [frameName]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const msg = event.data.pluginMessage as PluginMessage;
      if (!msg) return;

      if (msg.type === "UPDATE") {
        setFrameName(msg.name);
        setJson(msg.json);
        setError(null);
      }

      if (msg.type === "ERROR") {
        setError(msg.message);
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  if (!json) {
    return <div style={{ padding: 12 }}>피그마에서 프레임을 선택해주세요</div>;
  }

  const slug = slugRef.current;
  const previewJson = previewMode === "structure" ? buildStructure(json) : buildDesign(json);

  return (
    <div style={{ padding: 12, background: "#1e1e1e", color: "#d4d4d4" }}>
      <div style={{ marginBottom: 8, fontWeight: 700 }}>{frameName}</div>

      <button
        style={{ color: "#61afef" }}
        onClick={() => downloadJson(buildStructure(json), `${slug}_structure.json`)}
      >
        Structure
      </button>

      <button
        style={{ color: "#98c379", marginLeft: 8 }}
        onClick={() => downloadJson(buildDesign(json), `${slug}_design.json`)}
      >
        Design
      </button>

      <div style={{ marginTop: 8 }}>
        <button
          style={{ color: previewMode === "structure" ? "#61afef" : "#d4d4d4" }}
          onClick={() => setPreviewMode("structure")}
        >
          Preview Structure
        </button>
        <button
          style={{ color: previewMode === "design" ? "#98c379" : "#d4d4d4", marginLeft: 8 }}
          onClick={() => setPreviewMode("design")}
        >
          Preview Design
        </button>
      </div>

      <pre
        style={{
          background: "#111",
          padding: 8,
          marginTop: 8,
          maxHeight: 300,
          overflow: "auto",
        }}
      >
        {JSON.stringify(previewJson, null, 2)}
      </pre>

      {error && <div style={{ color: "red" }}>{error}</div>}
    </div>
  );
}
