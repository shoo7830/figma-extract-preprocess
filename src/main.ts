/// <reference types="@figma/plugin-typings" />

figma.showUI(__html__, { width: 420, height: 640, title: "JSON Exporter" });

type SerializedNode = Record<string, unknown>;

const SKIP_KEYS = new Set(["parent", "removed"]);

// --- 아이콘 감지 ---

const STANDARD_ICON_SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 56, 64];

const ICON_NAME_PATTERNS = [
  /^icon[_\-\/\s]/i,
  /[_\-\/\s]icon$/i,
  /^ic[_\-]/i,
  /^ico[_\-]/i,
  /\/icon\//i,
  /^icons?\//i,
];

const ICON_VARIANT_PATTERNS: { pattern: RegExp; variant: string }[] = [
  { pattern: /filled|fill|solid/i, variant: "filled" },
  { pattern: /outlined|outline|line/i, variant: "outlined" },
  { pattern: /rounded|round/i, variant: "rounded" },
  { pattern: /sharp/i, variant: "sharp" },
  { pattern: /two[_\-]?tone|twotone/i, variant: "two-tone" },
];

function isLikelyIcon(node: SceneNode): boolean {
  const { width, height, name, type } = node;
  const isSquare = Math.abs(width - height) <= 2;
  const isStandardSize = STANDARD_ICON_SIZES.some(
    (size) => Math.abs(width - size) <= 2 && Math.abs(height - size) <= 2
  );
  const hasIconName = ICON_NAME_PATTERNS.some((p) => p.test(name));
  const isVectorType = [
    "VECTOR", "STAR", "POLYGON", "LINE", "BOOLEAN_OPERATION",
  ].includes(type);

  if (hasIconName) return true;
  if (isSquare && isStandardSize && isVectorType) return true;
  if (type === "INSTANCE" && isSquare && isStandardSize) return true;

  if (
    (type === "FRAME" || type === "GROUP") &&
    isSquare &&
    isStandardSize &&
    "children" in node
  ) {
    const children = (node as ChildrenMixin).children;
    const allVectors = children.every((child: SceneNode) =>
      ["VECTOR", "STAR", "POLYGON", "LINE", "ELLIPSE", "RECTANGLE", "BOOLEAN_OPERATION"].includes(child.type)
    );
    if (allVectors && children.length > 0 && children.length <= 10) return true;
  }

  return false;
}

function extractIconVariant(name: string): string {
  for (const { pattern, variant } of ICON_VARIANT_PATTERNS) {
    if (pattern.test(name)) return variant;
  }
  return "unknown";
}

function extractIconName(name: string): string {
  const clean = name
    .replace(/^(icon|ic|ico)[_\-\/\s]*/i, "")
    .replace(/[_\-\s]*(filled|outline|outlined|rounded|sharp|two[_\-]?tone)$/i, "")
    .replace(/[_\-\s]*\d+(px|dp|pt)?$/i, "")
    .replace(/[_\-]+/g, "-")
    .replace(/^-|-$/g, "");
  return clean.toLowerCase() || name.toLowerCase();
}

// --- cornerRadius ---

function extractCornerRadius(node: SceneNode): number | number[] | undefined {
  if (!("cornerRadius" in node)) return undefined;
  const n = node as FrameNode | RectangleNode;
  if (n.cornerRadius !== figma.mixed) return n.cornerRadius;
  if ("topLeftRadius" in n) {
    return [n.topLeftRadius, n.topRightRadius, n.bottomRightRadius, n.bottomLeftRadius];
  }
  return undefined;
}

// --- 혼합 텍스트 스타일 ---

function extractStyledTextSegments(node: TextNode) {
  if (node.fontName !== figma.mixed && node.fontSize !== figma.mixed) {
    return undefined;
  }
  try {
    const segments = node.getStyledTextSegments([
      "fontName", "fontSize", "fontWeight",
      "letterSpacing", "lineHeight", "textDecoration", "textCase", "fills",
    ]);
    return segments.map((seg) => {
      const item: Record<string, unknown> = {
        start: seg.start,
        end: seg.end,
        text: node.characters.slice(seg.start, seg.end),
        fontName: seg.fontName,
        fontSize: seg.fontSize,
        fills: seg.fills,
      };
      if (seg.letterSpacing !== undefined) {
        item.letterSpacing = seg.letterSpacing;
      }
      if (seg.lineHeight !== undefined) {
        const lh = seg.lineHeight as { unit: string; value?: number };
        item.lineHeight = lh.unit === "AUTO"
          ? { unit: "AUTO" }
          : { value: lh.value, unit: lh.unit };
      }
      return item;
    });
  } catch (_e) {
    return undefined;
  }
}

// --- 이미지 추출 ---

// Figma 플러그인 sandbox에는 btoa 없음 → 직접 구현
const BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let result = "";
  const len = bytes.length;
  let i = 0;
  while (i < len) {
    const a = bytes[i++] || 0;
    const b = bytes[i++] || 0;
    const c = bytes[i++] || 0;
    const triplet = (a << 16) | (b << 8) | c;
    result += BASE64_CHARS[(triplet >> 18) & 63];
    result += BASE64_CHARS[(triplet >> 12) & 63];
    result += i - 2 <= len ? BASE64_CHARS[(triplet >> 6) & 63] : "=";
    result += i - 1 <= len ? BASE64_CHARS[triplet & 63] : "=";
  }
  return result;
}

function collectImageHashes(
  node: SceneNode,
  hashes: Map<string, string> // hash → node name
): void {
  if ("fills" in node && Array.isArray(node.fills)) {
    for (const fill of node.fills as ReadonlyArray<Paint>) {
      if (fill.type === "IMAGE" && "imageHash" in fill && fill.imageHash) {
        if (!hashes.has(fill.imageHash)) {
          hashes.set(fill.imageHash, node.name);
        }
      }
    }
  }
  if ("children" in node) {
    for (const child of (node as ChildrenMixin).children) {
      collectImageHashes(child, hashes);
    }
  }
}

async function exportImageByHash(hash: string): Promise<string> {
  try {
    const image = figma.getImageByHash(hash);
    if (!image) return "";
    const bytes = await image.getBytesAsync();
    return uint8ArrayToBase64(bytes);
  } catch (_e) {
    return "";
  }
}

// --- SVG 추출 ---

async function exportNodeSvg(node: SceneNode): Promise<string> {
  try {
    return await node.exportAsync({ format: "SVG_STRING" });
  } catch (_e) {
    return "";
  }
}

const SVG_EXPORT_TYPES = new Set([
  "VECTOR", "BOOLEAN_OPERATION", "STAR", "POLYGON", "LINE", "ARROW",
]);

async function collectAndExportSvgs(
  node: SceneNode,
  results: { name: string; iconName: string; svg: string }[]
): Promise<void> {
  if (isLikelyIcon(node)) {
    const svg = await exportNodeSvg(node);
    if (svg) results.push({ name: node.name, iconName: extractIconName(node.name), svg });
    return; // 아이콘 내부는 재귀 안 함
  }

  if (SVG_EXPORT_TYPES.has(node.type)) {
    const svg = await exportNodeSvg(node);
    if (svg) results.push({ name: node.name, iconName: extractIconName(node.name), svg });
    return;
  }

  if ("children" in node) {
    for (const child of (node as ChildrenMixin).children) {
      await collectAndExportSvgs(child, results);
    }
  }
}

// --- 직렬화 ---

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

function serializeNode(node: SceneNode): SerializedNode {
  const result: SerializedNode = {};

  for (const key of Object.keys(Object.getPrototypeOf(node)) as Array<keyof SceneNode>) {
    if (SKIP_KEYS.has(key as string)) continue;

    try {
      const value = (node as unknown as Record<string, unknown>)[key as string];

      if (typeof value === "function" || typeof value === "symbol") continue;
      if (value === undefined) continue;

      if ((key as string) === "children" && "children" in node) {
        result["children"] = (node as ChildrenMixin).children.map(serializeNode);
      } else if ((key as string) === "cornerRadius") {
        const cr = extractCornerRadius(node);
        if (cr !== undefined) result["cornerRadius"] = cr;
      } else {
        result[key as string] = structuredCloneValue(value);
      }
    } catch (_e) {
      // 일부 프로퍼티는 접근 시 throw; 스킵
    }
  }

  // auto-layout 추가 속성
  if ("layoutWrap" in node) result["layoutWrap"] = (node as FrameNode).layoutWrap;
  if ("counterAxisSpacing" in node) {
    const v = (node as FrameNode).counterAxisSpacing;
    if (v != null) result["counterAxisSpacing"] = v;
  }
  if ("layoutSizingHorizontal" in node) result["layoutSizingHorizontal"] = (node as FrameNode).layoutSizingHorizontal;
  if ("layoutSizingVertical" in node) result["layoutSizingVertical"] = (node as FrameNode).layoutSizingVertical;

  // 혼합 텍스트 스타일
  if (node.type === "TEXT") {
    const segments = extractStyledTextSegments(node as TextNode);
    if (segments) result["styledTextSegments"] = segments;
  }

  return result;
}

// --- 에셋 수집 ---

type AssetInfo = {
  name: string;
  type: string;
  isIcon?: boolean;
  iconName?: string;
  iconVariant?: string;
};

function collectAssets(
  node: SceneNode,
  svgNodes: AssetInfo[],
  imageNodes: AssetInfo[]
): void {
  if (isLikelyIcon(node)) {
    svgNodes.push({
      name: node.name,
      type: node.type,
      isIcon: true,
      iconName: extractIconName(node.name),
      iconVariant: extractIconVariant(node.name),
    });
  } else if (SVG_EXPORT_TYPES.has(node.type)) {
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

// --- 선택 전송 ---

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
    figma.ui.postMessage({ type: "ERROR", message: String(err) });
  }
}

sendSelection();
figma.on("selectionchange", sendSelection);

// SVG 데이터를 직렬화된 노드 트리에 임베드 (figma-parser 방식)
async function embedSvgData(
  sceneNode: SceneNode,
  serialized: SerializedNode
): Promise<void> {
  if (isLikelyIcon(sceneNode) || SVG_EXPORT_TYPES.has(sceneNode.type)) {
    const svg = await exportNodeSvg(sceneNode);
    if (svg) serialized["svgData"] = svg;
    return; // 아이콘 내부 재귀 안 함
  }
  if ("children" in sceneNode && Array.isArray(serialized["children"])) {
    const children = (sceneNode as ChildrenMixin).children;
    const serializedChildren = serialized["children"] as SerializedNode[];
    for (let i = 0; i < children.length && i < serializedChildren.length; i++) {
      await embedSvgData(children[i], serializedChildren[i]);
    }
  }
}

// --- UI 메시지 핸들러 ---

figma.ui.onmessage = async (msg: { type: string }) => {
  if (msg.type === "EXPORT_ASSETS") {
    const sel = figma.currentPage.selection;
    if (sel.length === 0) return;

    figma.ui.postMessage({ type: "ASSETS_EXPORTING" });

    const node = sel[0];

    // 1. 재직렬화
    const json = serializeNode(node);

    // 2. 이미지 해시 수집 + 추출
    const hashes: Map<string, string> = new Map();
    collectImageHashes(node, hashes);

    const images: { hash: string; base64: string }[] = [];
    const total = hashes.size;
    let done = 0;
    for (const [hash] of hashes) {
      const base64 = await exportImageByHash(hash);
      done++;
      figma.ui.postMessage({ type: "ASSET_PROGRESS", done, total });
      if (base64) images.push({ hash, base64 });
    }

    // 3. 아이콘/벡터 노드에 svgData 임베드
    await embedSvgData(node, json);

    figma.ui.postMessage({ type: "ASSETS_EXPORTED", json, images });
  }
};
