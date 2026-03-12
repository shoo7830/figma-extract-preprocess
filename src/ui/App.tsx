import { useEffect, useRef, useState } from "react";

type NodeData = Record<string, unknown>;
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

const STRUCTURE_KEYS = new Set([
  "name", "type", "visible",
  "x", "y", "width", "height", "rotation",
  "layoutMode", "layoutAlign", "layoutGrow", "layoutPositioning", "layoutWrap",
  "layoutSizingHorizontal", "layoutSizingVertical",
  "primaryAxisAlignItems", "primaryAxisSizingMode",
  "counterAxisAlignItems", "counterAxisAlignContent", "counterAxisSizingMode",
  "counterAxisSpacing", "itemSpacing",
  "paddingLeft", "paddingRight", "paddingTop", "paddingBottom",
  "minWidth", "minHeight", "maxWidth", "maxHeight",
  "constraints", "clipsContent", "overflowDirection",
  "characters", "styledTextSegments", "children",
]);

const DESIGN_KEYS = new Set([
  "name", "type",
  "fills", "backgroundColor",
  "strokes", "strokeWeight", "strokeAlign", "strokeCap", "strokeJoin",
  "strokeTopWeight", "strokeBottomWeight", "strokeLeftWeight", "strokeRightWeight",
  "strokesIncludedInLayout", "dashPattern",
  "effects", "opacity", "blendMode",
  "cornerRadius", "topLeftRadius", "topRightRadius",
  "bottomLeftRadius", "bottomRightRadius", "cornerSmoothing",
  "fontName", "fontSize", "fontWeight",
  "letterSpacing", "lineHeight",
  "textAlignHorizontal", "textAlignVertical",
  "textCase", "textDecoration", "textDecorationColor", "textDecorationStyle",
  "characters", "styledTextSegments", "svgData", "annotations", "children",
]);

function pickKeys(node: NodeData, keys: Set<string>): NodeData {
  const result: NodeData = {};
  for (const k of Object.keys(node)) {
    if (!keys.has(k)) continue;
    if (k === "children" && Array.isArray(node[k])) {
      result[k] = (node[k] as NodeData[]).map((child) => pickKeys(child, keys));
    } else {
      result[k] = node[k];
    }
  }
  return result;
}

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// imageHash → base64 매핑을 fills 안에 직접 주입
function injectImageData(node: NodeData, imageMap: Map<string, string>): NodeData {
  const result = { ...node };
  if (Array.isArray(result.fills)) {
    result.fills = (result.fills as NodeData[]).map((fill) => {
      if (fill.type === "IMAGE" && typeof fill.imageHash === "string") {
        const base64 = imageMap.get(fill.imageHash as string);
        if (base64) return { ...fill, imageData: `data:image/png;base64,${base64}` };
      }
      return fill;
    });
  }
  if (Array.isArray(result.children)) {
    result.children = (result.children as NodeData[]).map((child) =>
      injectImageData(child, imageMap)
    );
  }
  return result;
}

export default function App() {
  const [frameName, setFrameName] = useState<string | null>(null);
  const [json, setJson] = useState<NodeData | null>(null);
  const [assets, setAssets] = useState<Assets | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assetsOpen, setAssetsOpen] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const pendingDownload = useRef<"raw" | "structure" | "design" | null>(null);
  const slugRef = useRef<string>("frame");

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
      } else if (msg.type === "CLEAR") {
        setFrameName(null);
        setJson(null);
        setAssets(null);
        setError(null);
        pendingDownload.current = null;
      } else if (msg.type === "ERROR") {
        setError(msg.message);
        pendingDownload.current = null;
      } else if (msg.type === "ASSETS_EXPORTING") {
        setProgress({ done: 0, total: 0 });
      } else if (msg.type === "ASSET_PROGRESS") {
        setProgress({ done: msg.done, total: msg.total });
      } else if (msg.type === "ASSETS_EXPORTED") {
        setProgress(null);

        const type = pendingDownload.current;
        pendingDownload.current = null;
        if (!type) return;

        // 이미지 주입
        const imageMap = new Map(
          msg.images.map(({ hash, base64 }) => [hash, base64])
        );
        const injected = injectImageData(msg.json, imageMap);
        setJson(injected);

        const slug = slugRef.current;
        if (type === "raw") {
          downloadJson(injected, `${slug}.json`);
        } else if (type === "structure") {
          downloadJson(pickKeys(injected, STRUCTURE_KEYS), `${slug}_structure.json`);
        } else if (type === "design") {
          downloadJson(pickKeys(injected, DESIGN_KEYS), `${slug}_design.json`);
        }
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  function handleDownload(type: "raw" | "structure" | "design") {
    if (!json) return;
    pendingDownload.current = type;
    parent.postMessage({ pluginMessage: { type: "EXPORT_ASSETS" } }, "*");
  }

  const hasSvg = (assets?.svgNodes.length ?? 0) > 0;
  const hasImage = (assets?.imageNodes.length ?? 0) > 0;
  const totalAssets = (assets?.svgNodes.length ?? 0) + (assets?.imageNodes.length ?? 0);
  const isExtracting = progress !== null;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>
          {frameName ? `🖼 ${frameName}` : "JSON Exporter"}
        </span>
      </div>

      {json && (
        <div style={styles.buttonRow}>
          <button
            style={{ ...styles.btn, opacity: isExtracting ? 0.5 : 1 }}
            disabled={isExtracting}
            onClick={() => handleDownload("raw")}
          >
            Raw
          </button>
          <button
            style={{ ...styles.btn, ...styles.btnStructure, opacity: isExtracting ? 0.5 : 1 }}
            disabled={isExtracting}
            onClick={() => handleDownload("structure")}
          >
            Structure
          </button>
          <button
            style={{ ...styles.btn, ...styles.btnDesign, opacity: isExtracting ? 0.5 : 1 }}
            disabled={isExtracting}
            onClick={() => handleDownload("design")}
          >
            Design
          </button>
        </div>
      )}

      {isExtracting && (
        <div style={styles.progressBar}>
          {progress!.total > 0
            ? `이미지 추출 중... ${progress!.done}/${progress!.total}`
            : "에셋 추출 중..."}
        </div>
      )}

      {assets && totalAssets > 0 && (
        <div style={styles.assetsSection}>
          <button
            style={styles.assetsToggle}
            onClick={() => setAssetsOpen((o) => !o)}
          >
            <span>에셋 목록</span>
            <span style={styles.assetsBadge}>{totalAssets}</span>
            <span style={{ marginLeft: "auto" }}>{assetsOpen ? "▲" : "▼"}</span>
          </button>

          {assetsOpen && (
            <div style={styles.assetsList}>
              {hasSvg && (
                <>
                  <div style={styles.assetsLabel}>
                    <span style={{ color: "#98c379" }}>SVG 아이콘</span>
                    <span style={styles.assetsCount}>{assets.svgNodes.length}</span>
                    <span style={styles.assetsNote}>JSON 다운로드 시 svgData 자동 포함</span>
                  </div>
                  {assets.svgNodes.map((n, i) => (
                    <div key={i} style={styles.assetItem}>
                      <span style={styles.assetType}>{n.type}</span>
                      <span style={styles.assetName}>{n.name}</span>
                      {n.isIcon && n.iconVariant && n.iconVariant !== "unknown" && (
                        <span style={styles.iconVariantBadge}>{n.iconVariant}</span>
                      )}
                    </div>
                  ))}
                </>
              )}

              {hasImage && (
                <>
                  <div style={{ ...styles.assetsLabel, marginTop: hasSvg ? 8 : 0 }}>
                    <span style={{ color: "#e5c07b" }}>이미지</span>
                    <span style={styles.assetsCount}>{assets.imageNodes.length}</span>
                    <span style={styles.assetsNote}>JSON 다운로드 시 imageData 자동 포함</span>
                  </div>
                  {assets.imageNodes.map((n, i) => (
                    <div key={i} style={styles.assetItem}>
                      <span style={styles.assetType}>{n.type}</span>
                      <span style={styles.assetName}>{n.name}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {error && <div style={styles.error}>{error}</div>}

      {json ? (
        <textarea
          style={styles.textarea}
          readOnly
          value={JSON.stringify(json, null, 2)}
        />
      ) : (
        <div style={styles.empty}>피그마에서 프레임을 선택해주세요</div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    fontFamily: "Inter, sans-serif",
    fontSize: 12,
    background: "#1e1e1e",
    color: "#d4d4d4",
  },
  header: {
    padding: "8px 12px 4px",
    borderBottom: "1px solid #333",
    flexShrink: 0,
  },
  title: {
    fontWeight: 600,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  buttonRow: {
    display: "flex",
    gap: 6,
    padding: "8px 12px",
    borderBottom: "1px solid #333",
    flexShrink: 0,
  },
  btn: {
    flex: 1,
    padding: "5px 0",
    background: "#2d2d2d",
    color: "#d4d4d4",
    border: "1px solid #444",
    borderRadius: 4,
    cursor: "pointer",
    fontSize: 11,
    fontWeight: 600,
  },
  btnStructure: {
    background: "#1a3a52",
    borderColor: "#0d99ff",
    color: "#0d99ff",
  },
  btnDesign: {
    background: "#3a1a3a",
    borderColor: "#c678dd",
    color: "#c678dd",
  },
  progressBar: {
    padding: "4px 12px",
    background: "#2a2a1a",
    color: "#e5c07b",
    fontSize: 10,
    borderBottom: "1px solid #333",
    flexShrink: 0,
  },
  assetsSection: {
    borderBottom: "1px solid #333",
    flexShrink: 0,
  },
  assetsToggle: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 12px",
    background: "transparent",
    border: "none",
    color: "#d4d4d4",
    cursor: "pointer",
    fontSize: 11,
    fontWeight: 600,
    textAlign: "left",
  },
  assetsBadge: {
    background: "#444",
    borderRadius: 10,
    padding: "1px 6px",
    fontSize: 10,
  },
  assetsList: {
    padding: "4px 12px 10px",
  },
  assetsLabel: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 10,
    fontWeight: 700,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  assetsCount: {
    background: "#333",
    borderRadius: 8,
    padding: "1px 5px",
    fontSize: 10,
    color: "#888",
  },
  assetsNote: {
    marginLeft: "auto",
    fontSize: 9,
    color: "#666",
    fontWeight: 400,
    textTransform: "none",
    letterSpacing: 0,
  },
  assetItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "2px 0",
  },
  assetType: {
    fontSize: 9,
    color: "#666",
    background: "#2a2a2a",
    padding: "1px 4px",
    borderRadius: 2,
    flexShrink: 0,
  },
  assetName: {
    fontSize: 11,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  iconVariantBadge: {
    fontSize: 9,
    color: "#61afef",
    background: "#1a2a3a",
    padding: "1px 4px",
    borderRadius: 2,
    flexShrink: 0,
    marginLeft: "auto",
  },
  textarea: {
    flex: 1,
    resize: "none",
    background: "#1e1e1e",
    color: "#d4d4d4",
    border: "none",
    padding: "12px",
    fontFamily: "monospace",
    fontSize: 11,
    lineHeight: 1.5,
    outline: "none",
    overflowY: "auto",
  },
  empty: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#666",
    fontSize: 13,
  },
  error: {
    background: "#3b1212",
    color: "#f97171",
    padding: "6px 12px",
    fontSize: 11,
    flexShrink: 0,
  },
};
