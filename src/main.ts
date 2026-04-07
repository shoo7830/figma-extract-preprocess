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
    figma.ui.postMessage({
      type: "UPDATE",
      name: node.name,
      json: serialized,
    });
  } catch (err) {
    figma.ui.postMessage({ type: "ERROR", message: String(err) });
  }
}

sendSelection();
figma.on("selectionchange", sendSelection);
