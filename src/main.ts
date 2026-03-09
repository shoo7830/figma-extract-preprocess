figma.showUI(__html__, { width: 420, height: 640, title: "JSON Exporter" });

type SerializedNode = Record<string, unknown>;

const SKIP_KEYS = new Set(["parent", "removed"]);

function serializeNode(node: SceneNode): SerializedNode {
  const result: SerializedNode = {};

  for (const key of Object.keys(Object.getPrototypeOf(node)) as Array<
    keyof SceneNode
  >) {
    if (SKIP_KEYS.has(key as string)) continue;

    try {
      const value = (node as Record<string, unknown>)[key as string];

      if (typeof value === "function" || typeof value === "symbol") continue;
      if (value === undefined) continue;

      if (key === "children" && "children" in node) {
        result["children"] = (node as ChildrenMixin).children.map(
          serializeNode
        );
      } else {
        result[key as string] = structuredCloneValue(value);
      }
    } catch (_e) {
      // some props throw when accessed; skip them
    }
  }

  return result;
}

function structuredCloneValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(structuredCloneValue);

  const obj = value as Record<string, unknown>;
  const cloned: Record<string, unknown> = {};
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (typeof v === "function" || typeof v === "symbol") continue;
    cloned[k] = structuredCloneValue(v);
  }
  return cloned;
}

type AssetInfo = { name: string; type: string };

function collectAssets(
  node: SceneNode,
  svgNodes: AssetInfo[],
  imageNodes: AssetInfo[]
): void {
  const SVG_TYPES = new Set([
    "VECTOR",
    "BOOLEAN_OPERATION",
    "STAR",
    "POLYGON",
    "LINE",
    "ARROW",
  ]);

  if (SVG_TYPES.has(node.type)) {
    svgNodes.push({ name: node.name, type: node.type });
  }

  if ("fills" in node) {
    const fills = node.fills as ReadonlyArray<Paint>;
    if (Array.isArray(fills) && fills.some((f) => f.type === "IMAGE")) {
      imageNodes.push({ name: node.name, type: node.type });
    }
  }

  if ("children" in node) {
    for (const child of (node as ChildrenMixin).children) {
      collectAssets(child, svgNodes, imageNodes);
    }
  }
}

function sendSelection(): void {
  const sel = figma.currentPage.selection;
  if (sel.length === 0) {
    figma.ui.postMessage({ type: "CLEAR" });
    return;
  }

  const node = sel[0];
  try {
    const serialized = serializeNode(node);

    const svgNodes: AssetInfo[] = [];
    const imageNodes: AssetInfo[] = [];
    collectAssets(node, svgNodes, imageNodes);

    figma.ui.postMessage({
      type: "UPDATE",
      name: node.name,
      json: serialized,
      assets: { svgNodes, imageNodes },
    });
  } catch (err) {
    figma.ui.postMessage({
      type: "ERROR",
      message: String(err),
    });
  }
}

sendSelection();

figma.on("selectionchange", sendSelection);
