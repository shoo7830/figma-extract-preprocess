import { useEffect, useState } from "react";

type NodeData = Record<string, unknown>;
type AssetInfo = { name: string; type: string };
type Assets = { svgNodes: AssetInfo[]; imageNodes: AssetInfo[] };

type PluginMessage =
  | { type: "UPDATE"; name: string; json: NodeData; assets: Assets }
  | { type: "CLEAR" }
  | { type: "ERROR"; message: string };

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
  "characters", "children",
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
  "characters", "annotations", "children",
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

function download(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [frameName, setFrameName] = useState<string | null>(null);
  const [json, setJson] = useState<NodeData | null>(null);
  const [assets, setAssets] = useState<Assets | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assetsOpen, setAssetsOpen] = useState(false);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const msg = event.data.pluginMessage as PluginMessage;
      if (!msg) return;
      if (msg.type === "UPDATE") {
        setFrameName(msg.name);
        setJson(msg.json);
        setAssets(msg.assets);
        setError(null);
      } else if (msg.type === "CLEAR") {
        setFrameName(null);
        setJson(null);
        setAssets(null);
        setError(null);
      } else if (msg.type === "ERROR") {
        setError(msg.message);
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const slug = frameName ?? "frame";
  const hasSvg = (assets?.svgNodes.length ?? 0) > 0;
  const hasImage = (assets?.imageNodes.length ?? 0) > 0;
  const totalAssets = (assets?.svgNodes.length ?? 0) + (assets?.imageNodes.length ?? 0);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>
          {frameName ? `🖼 ${frameName}` : "JSON Exporter"}
        </span>
      </div>

      {json && (
        <div style={styles.buttonRow}>
          <button style={styles.btn} onClick={() => download(json, `${slug}.json`)}>
            Raw
          </button>
          <button
            style={{ ...styles.btn, ...styles.btnStructure }}
            onClick={() => download(pickKeys(json, STRUCTURE_KEYS), `${slug}_structure.json`)}
          >
            Structure
          </button>
          <button
            style={{ ...styles.btn, ...styles.btnDesign }}
            onClick={() => download(pickKeys(json, DESIGN_KEYS), `${slug}_design.json`)}
          >
            Design
          </button>
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
                    <span style={{ color: "#98c379" }}>SVG 내보내기 대상</span>
                    <span style={styles.assetsCount}>{assets.svgNodes.length}</span>
                  </div>
                  {assets.svgNodes.map((n, i) => (
                    <div key={i} style={styles.assetItem}>
                      <span style={styles.assetType}>{n.type}</span>
                      <span style={styles.assetName}>{n.name}</span>
                    </div>
                  ))}
                </>
              )}

              {hasImage && (
                <>
                  <div style={{ ...styles.assetsLabel, marginTop: hasSvg ? 8 : 0 }}>
                    <span style={{ color: "#e5c07b" }}>이미지 플레이스홀더 대상</span>
                    <span style={styles.assetsCount}>{assets.imageNodes.length}</span>
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
