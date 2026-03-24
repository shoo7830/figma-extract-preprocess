import { useEffect, useRef, useState } from "react";

type NodeData = Record<string, any>;
type AssetInfo = {
  name: string;
  type: string;
  isIcon?: boolean;
  iconName?: string;
  iconVariant?: string;
};
type Assets = { svgNodes: AssetInfo[]; imageNodes: AssetInfo[] };

type PluginMessage =
  | { type: "UPDATE"; name: string; json: NodeData; assets: Assets }
  | { type: "CLEAR" }
  | { type: "ERROR"; message: string }
  | { type: "ASSETS_EXPORTING" }
  | { type: "ASSET_PROGRESS"; done: number; total: number }
  | { type: "ASSETS_EXPORTED"; json: NodeData; images: { hash: string; base64: string }[] };

/* =========================
   STRUCTURE / DESIGN KEYS
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
  "characters","styledTextSegments","children",
]);

const DESIGN_KEYS = new Set([
  "name","type",
  "fills","backgroundColor",
  "strokes","strokeWeight","strokeAlign","strokeCap","strokeJoin",
  "strokeTopWeight","strokeBottomWeight","strokeLeftWeight","strokeRightWeight",
  "strokesIncludedInLayout","dashPattern",
  "effects","opacity","blendMode",
  "cornerRadius","topLeftRadius","topRightRadius",
  "bottomLeftRadius","bottomRightRadius","cornerSmoothing",
  "fontName","fontSize","fontWeight",
  "letterSpacing","lineHeight",
  "textAlignHorizontal","textAlignVertical",
  "textCase","textDecoration","textDecorationColor","textDecorationStyle",
  "characters","styledTextSegments","svgData","annotations","children",
]);

/* =========================
   QA KEYS (검증 전용)
========================= */

const QA_KEYS = new Set([
  "id","name","type",
  "layoutMode","layoutAlign","layoutGrow",
  "primaryAxisAlignItems","counterAxisAlignItems",
  "textAlignHorizontal","textAlignVertical",
  "paddingTop","paddingBottom","paddingLeft","paddingRight",
  "itemSpacing",
  "width","height","minWidth","maxWidth",
  "fills",
  "children",
]);

/* =========================
   PICK FUNCTIONS
========================= */

function pickKeys(node: NodeData, keys: Set<string>): NodeData {
  const result: NodeData = {};
  for (const k of Object.keys(node)) {
    if (!keys.has(k)) continue;
    if (k === "children" && Array.isArray(node[k])) {
      result[k] = node[k].map((child: NodeData) => pickKeys(child, keys));
    } else {
      result[k] = node[k];
    }
  }
  return result;
}

function pickQAKeys(node: NodeData): NodeData {
  const result: NodeData = {};
  for (const k of Object.keys(node)) {
    if (!QA_KEYS.has(k)) continue;

    if (k === "fills" && Array.isArray(node.fills)) {
      result.fills = node.fills
        .filter((f: any) => f.type === "IMAGE")
        .map((f: any) => ({
          type: f.type,
          imageHash: f.imageHash,
        }));
      continue;
    }

    if (k === "children" && Array.isArray(node.children)) {
      result.children = node.children.map(pickQAKeys);
      continue;
    }

    result[k] = node[k];
  }
  return result;
}

/* =========================
   IMAGE INJECTION
========================= */

function injectImageData(node: NodeData, imageMap: Map<string, string>): NodeData {
  const result = { ...node };

  if (Array.isArray(result.fills)) {
    result.fills = result.fills.map((fill: any) => {
      if (fill.type === "IMAGE" && typeof fill.imageHash === "string") {
        const base64 = imageMap.get(fill.imageHash);
        if (base64) {
          return { ...fill, imageData: `data:image/png;base64,${base64}` };
        }
      }
      return fill;
    });
  }

  if (Array.isArray(result.children)) {
    result.children = result.children.map((child: NodeData) =>
      injectImageData(child, imageMap)
    );
  }

  return result;
}

/* =========================
   DOWNLOAD
========================= */

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
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
  const [assets, setAssets] = useState<Assets | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const pendingDownload = useRef<"raw" | "structure" | "design" | "qa" | null>(null);
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
        setAssets(msg.assets);
        setError(null);
        pendingDownload.current = null;
      }

      if (msg.type === "ASSETS_EXPORTED") {
        const type = pendingDownload.current;
        pendingDownload.current = null;

        const originalJson = msg.json;
        const imageMap = new Map(msg.images.map(i => [i.hash, i.base64]));
        const injected = injectImageData(originalJson, imageMap);

        setJson(injected);

        const slug = slugRef.current;
        if (type === "raw") downloadJson(injected, `${slug}.json`);
        if (type === "structure") downloadJson(pickKeys(injected, STRUCTURE_KEYS), `${slug}_structure.json`);
        if (type === "design") downloadJson(pickKeys(injected, DESIGN_KEYS), `${slug}_design.json`);
        if (type === "qa") downloadJson(pickQAKeys(originalJson), `${slug}_qa.json`);
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  function handleDownload(type: "raw" | "structure" | "design" | "qa") {
    if (!json) return;
    pendingDownload.current = type;
    parent.postMessage({ pluginMessage: { type: "EXPORT_ASSETS" } }, "*");
  }

  return (
    <div style={{ padding: 12, background: "#1e1e1e", color: "#d4d4d4", height: "100vh" }}>
      <div style={{ marginBottom: 8, fontWeight: 700 }}>
        {frameName ?? "JSON Exporter"}
      </div>

      {json && (
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <button onClick={() => handleDownload("raw")}>Raw</button>
          <button onClick={() => handleDownload("structure")}>Structure</button>
          <button onClick={() => handleDownload("design")}>Design</button>
          <button onClick={() => handleDownload("qa")} style={{ color: "#e06c75" }}>
            QA
          </button>
        </div>
      )}

      {progress && <div>에셋 추출 중...</div>}
      {error && <div style={{ color: "red" }}>{error}</div>}

      {json ? (
        <textarea
          readOnly
          value={JSON.stringify(json, null, 2)}
          style={{ width: "100%", height: "80%", background: "#111", color: "#ccc" }}
        />
      ) : (
        <div>피그마에서 프레임을 선택해주세요</div>
      )}
    </div>
  );
}