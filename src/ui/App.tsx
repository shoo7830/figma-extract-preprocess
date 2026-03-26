import { useEffect, useRef, useState } from "react";

/* =========================
   TYPES
========================= */

type NodeData = Record<string, any>;

type ImageSlot = {
  slotId: string;
  role?: string;
  expectedSize: {
    width: number;
    height: number;
  };
  aspectRatio: number;
};

type Assets = {
  svgNodes: any[];
  imageNodes: any[];
};

type PluginMessage =
  | { type: "UPDATE"; name: string; json: NodeData; assets: Assets }
  | { type: "CLEAR" }
  | { type: "ERROR"; message: string };

/* =========================
   KEYS
========================= */

const STRUCTURE_KEYS = new Set([
  "name","type","visible",
  "x","y","width","height","rotation",
  "layoutMode","layoutAlign","layoutGrow","layoutPositioning","layoutWrap",
  "layoutSizingHorizontal","layoutSizingVertical",
  "primaryAxisAlignItems","primaryAxisSizingMode",
  "counterAxisAlignItems","counterAxisAlignContent","counterAxisSizingMode",
  "counterAxisSpacing","itemSpacing",
  "paddingLeft","paddingRight","paddingTop","paddingBottom",
  "minWidth","minHeight","maxWidth","maxHeight",
  "constraints","clipsContent","overflowDirection",
  "children","fills",
]);

const DESIGN_KEYS = new Set([
  "name","type",
  "fills",
  "strokes","strokeWeight","strokeAlign",
  "effects","opacity",
  "cornerRadius",
  "fontName","fontSize","fontWeight",
  "letterSpacing","lineHeight",
  "textAlignHorizontal","textAlignVertical",
  "characters","styledTextSegments",
  "children",
]);


/* =========================
   IMAGE SLOT HELPERS
========================= */

function normalizeSlotId(node: NodeData) {
  return (
    node.name
      ?.toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9\-]/g, "") || "image-slot"
  );
}

function transformImageFill(node: NodeData): any {
  const width = Math.round(node.width ?? 0);
  const height = Math.round(node.height ?? 0);

  return {
    type: "IMAGE",
    imageSlot: {
      slotId: normalizeSlotId(node),
      role: "unknown",
      expectedSize: { width, height },
      aspectRatio: width && height ? width / height : 1,
    } satisfies ImageSlot,
  };
}

/* =========================
   PICK FUNCTIONS
========================= */

function pickKeys(node: NodeData, keys: Set<string>): NodeData {
  const result: NodeData = {};

  for (const k of Object.keys(node)) {
    if (!keys.has(k)) continue;

    if (k === "fills" && Array.isArray(node.fills)) {
      result.fills = node.fills.map((fill: any) =>
        fill.type === "IMAGE" ? transformImageFill(node) : fill
      );
      continue;
    }

    if (k === "children" && Array.isArray(node.children)) {
      result.children = node.children.map((child: NodeData) =>
        pickKeys(child, keys)
      );
      continue;
    }

    result[k] = node[k];
  }

  return result;
}

/* =========================
   MANIFEST
========================= */

type ManifestItem = {
  id: string;
  name: string;
  type: string;
  depth: number;
  width: number;
  height: number;
  childCount: number;
  hasText: boolean;
  hasImage: boolean;
  textContent?: string;
  imageSlot?: ImageSlot;
};

function buildManifestItems(
  node: NodeData,
  depth: number,
  parentId: string,
  index: number,
  items: ManifestItem[]
): void {
  const id = parentId ? `${parentId}.${index + 1}` : `${index + 1}`;

  const imageFill = Array.isArray(node.fills)
    ? node.fills.find((f: any) => f.type === "IMAGE")
    : undefined;

  const item: ManifestItem = {
    id,
    name: node.name ?? "",
    type: node.type ?? "",
    depth,
    width: Math.round(node.width ?? 0),
    height: Math.round(node.height ?? 0),
    childCount: Array.isArray(node.children) ? node.children.length : 0,
    hasText: node.type === "TEXT",
    hasImage: !!imageFill,
    ...(node.type === "TEXT" && { textContent: node.characters ?? "" }),
  };

  if (imageFill) {
    item.imageSlot = {
      slotId: normalizeSlotId(node),
      role: "unknown",
      expectedSize: { width: item.width, height: item.height },
      aspectRatio: item.width && item.height ? item.width / item.height : 1,
    };
  }

  items.push(item);

  if (Array.isArray(node.children)) {
    node.children.forEach((child: NodeData, i: number) =>
      buildManifestItems(child, depth + 1, id, i, items)
    );
  }
}

function buildManifest(root: NodeData) {
  const items: ManifestItem[] = [];
  buildManifestItems(root, 0, "", 0, items);
  return {
    page: root.name ?? "unknown",
    totalComponents: items.length,
    imageSlotCount: items.filter((i) => i.hasImage).length,
    textNodeCount: items.filter((i) => i.hasText).length,
    components: items,
  };
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
   PLACEHOLDER
========================= */

function ImagePlaceholder({ slot }: { slot: ImageSlot }) {
  return (
    <div
      style={{
        width: slot.expectedSize.width,
        height: slot.expectedSize.height,
        background: "#2a2a2a",
        border: "1px dashed #555",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 11,
        color: "#999",
      }}
    >
      {slot.slotId}
    </div>
  );
}

/* =========================
   APP
========================= */

export default function App() {
  const [frameName, setFrameName] = useState<string | null>(null);
  const [json, setJson] = useState<NodeData | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div style={{ padding: 12, background: "#1e1e1e", color: "#d4d4d4" }}>
      <div style={{ marginBottom: 8, fontWeight: 700 }}>{frameName}</div>

      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <button onClick={() => downloadJson(json, `${slug}.json`)}>Raw</button>
        <button
          onClick={() =>
            downloadJson(pickKeys(json, STRUCTURE_KEYS), `${slug}_structure.json`)
          }
        >
          Structure
        </button>
        <button
          onClick={() =>
            downloadJson(pickKeys(json, DESIGN_KEYS), `${slug}_design.json`)
          }
        >
          Design
        </button>
        <button
          style={{ color: "#e5c07b" }}
          onClick={() =>
            downloadJson(buildManifest(json), `${slug}_manifest.json`)
          }
        >
          Manifest
        </button>
      </div>

      <pre
        style={{
          background: "#111",
          padding: 8,
          maxHeight: 300,
          overflow: "auto",
        }}
      >
        {JSON.stringify(json, null, 2)}
      </pre>

      {json.fills?.map((fill: any, i: number) =>
        fill.type === "IMAGE" ? (
          <ImagePlaceholder key={i} slot={fill.imageSlot} />
        ) : null
      )}

      {error && <div style={{ color: "red" }}>{error}</div>}
    </div>
  );
}