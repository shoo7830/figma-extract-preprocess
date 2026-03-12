# figma-parser 분석 기반 개선 계획

> 참고 레포: https://gitlab.gabia.com/gabia/services/figma-parser.git
> 분석 브랜치: master, feature/improvements
> 작성일: 2026-03-10

---

## 1. 아이콘 감지 로직 강화

**현재 문제**
`src/main.ts`의 `collectAssets`는 노드 타입이 `VECTOR`, `BOOLEAN_OPERATION` 등인 경우만 SVG 대상으로 분류함.
→ INSTANCE 타입 아이콘, FRAME/GROUP 안에 벡터가 들어간 합성 아이콘을 놓침.

**적용 내용 (`figma-parser/packages/plugin/src/code.ts:35-105`)**

```typescript
// 표준 아이콘 크기 목록
const STANDARD_ICON_SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 56, 64];

// 이름 패턴
const ICON_NAME_PATTERNS = [
  /^icon[_\-\/\s]/i,
  /[_\-\/\s]icon$/i,
  /^ic[_\-]/i,
  /^ico[_\-]/i,
  /\/icon\//i,
  /^icons?\//i,
];

// variant 패턴
const ICON_VARIANT_PATTERNS = [
  { pattern: /filled|fill|solid/i, variant: 'filled' },
  { pattern: /outlined|outline|line/i, variant: 'outlined' },
  { pattern: /rounded|round/i, variant: 'rounded' },
  { pattern: /sharp/i, variant: 'sharp' },
  { pattern: /two[_\-]?tone|twotone/i, variant: 'two-tone' },
];

function isLikelyIcon(node: SceneNode): boolean {
  const { width, height, name, type } = node;
  const isSquare = Math.abs(width - height) <= 2;
  const isStandardSize = STANDARD_ICON_SIZES.some(
    size => Math.abs(width - size) <= 2 && Math.abs(height - size) <= 2
  );
  const hasIconName = ICON_NAME_PATTERNS.some(p => p.test(name));
  const isVectorType = ['VECTOR', 'STAR', 'POLYGON', 'LINE', 'BOOLEAN_OPERATION'].includes(type);

  if (hasIconName) return true;
  if (isSquare && isStandardSize && isVectorType) return true;
  if (type === 'INSTANCE' && isSquare && isStandardSize) return true;

  // FRAME/GROUP 내부가 전부 벡터인 경우
  if ((type === 'FRAME' || type === 'GROUP') && isSquare && isStandardSize && 'children' in node) {
    const allVectors = node.children.every(child =>
      ['VECTOR', 'STAR', 'POLYGON', 'LINE', 'ELLIPSE', 'RECTANGLE', 'BOOLEAN_OPERATION'].includes(child.type)
    );
    if (allVectors && node.children.length > 0 && node.children.length <= 10) return true;
  }

  return false;
}
```

**적용 위치**: `src/main.ts`의 `collectAssets` 함수 내부 SVG 감지 로직 교체
**기대 효과**: 디자인 시스템 아이콘 컴포넌트(INSTANCE)까지 자동 감지

---

## 2. SVG 실제 추출 (파일 다운로드)

**현재 문제**
에셋 목록에 이름만 표시. 실제 SVG 내용은 디자이너가 Figma에서 별도로 내보내야 함.

**적용 내용 (`figma-parser/packages/plugin/src/code.ts:111-118`)**

```typescript
async function exportNodeSvg(node: SceneNode): Promise<string> {
  try {
    const svg = await node.exportAsync({ format: 'SVG_STRING' });
    return svg;
  } catch {
    return '';
  }
}
```

**UI 측 변경**
- 현재: SVG 노드 이름 목록만 표시
- 변경 후: "SVG 다운로드" 버튼 클릭 시 각 아이콘 SVG를 개별 파일로 다운로드
  (또는 zip으로 묶어서 일괄 다운로드)

**주의사항**
`exportAsync`는 async이므로 `figma.ui.onmessage` 핸들러에서 처리해야 함.
현재 `selectionchange` 이벤트에서 동기로 처리 중인 구조를 부분 변경 필요.

---

## 3. 이미지 실제 추출 (base64)

**현재 문제**
IMAGE fill이 있는 노드를 목록으로 표시만 함. 실제 이미지 데이터 없음.

**적용 내용 (`figma-parser/packages/plugin/src/code.ts:150-203`)**

```typescript
// Figma 환경에는 btoa 없음 → 직접 구현
const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let result = '';
  const len = bytes.length;
  let i = 0;
  while (i < len) {
    const a = bytes[i++] || 0;
    const b = bytes[i++] || 0;
    const c = bytes[i++] || 0;
    const triplet = (a << 16) | (b << 8) | c;
    result += BASE64_CHARS[(triplet >> 18) & 63];
    result += BASE64_CHARS[(triplet >> 12) & 63];
    result += i - 2 <= len ? BASE64_CHARS[(triplet >> 6) & 63] : '=';
    result += i - 1 <= len ? BASE64_CHARS[triplet & 63] : '=';
  }
  return result;
}

function collectImageHashes(node: SceneNode, hashes: Set<string>): void {
  if ('fills' in node && Array.isArray(node.fills)) {
    for (const fill of node.fills) {
      if (fill.type === 'IMAGE' && 'imageHash' in fill && fill.imageHash) {
        hashes.add(fill.imageHash);
      }
    }
  }
  if ('children' in node) {
    for (const child of node.children) collectImageHashes(child, hashes);
  }
}

async function exportImageByHash(hash: string): Promise<string> {
  const image = figma.getImageByHash(hash);
  if (!image) return '';
  const bytes = await image.getBytesAsync();
  return uint8ArrayToBase64(bytes);
}
```

**UI 측 변경**
- "이미지 포함 내보내기" 체크박스 추가 (큰 프레임은 느릴 수 있으므로 옵션으로)
- 추출된 이미지를 `{imageHash}.png` 파일로 다운로드

**주의사항**
이미지가 많은 프레임은 시간이 걸릴 수 있음. progress 메시지 표시 권장.

---

## 4. 혼합 텍스트 스타일 처리

**현재 문제**
텍스트 노드 전체에 단일 폰트/색상만 추출함.
→ 한 텍스트 안에 굵기/색상이 다른 부분(예: 강조 텍스트)이 있으면 정보 손실.

**적용 내용 (`figma-parser/packages/plugin/src/extractors/nodes/textExtractor.ts:103-151`)**

```typescript
function extractStyledTextSegments(textNode: TextNode) {
  if (textNode.fontName === figma.mixed || textNode.fontSize === figma.mixed) {
    try {
      const segments = textNode.getStyledTextSegments([
        'fontName', 'fontSize', 'fontWeight',
        'letterSpacing', 'lineHeight', 'textDecoration', 'textCase', 'fills',
      ]);
      return segments.map(segment => ({
        start: segment.start,
        end: segment.end,
        text: textNode.characters.slice(segment.start, segment.end),
        fontName: segment.fontName,
        fontSize: segment.fontSize,
        fontWeight: segment.fontWeight,
        fills: segment.fills, // 구간별 텍스트 색상
      }));
    } catch {
      return undefined;
    }
  }
  return undefined;
}
```

**JSON 출력 예시**
```json
{
  "type": "TEXT",
  "characters": "지금 바로 신청하기",
  "styledTextSegments": [
    { "start": 0, "end": 4, "text": "지금 바로", "fontSize": 16, "fontWeight": 400 },
    { "start": 5, "end": 9, "text": "신청하기", "fontSize": 16, "fontWeight": 700, "fills": [{"type": "SOLID", "color": {"r": 1, "g": 0.2, "b": 0}}] }
  ]
}
```

**적용 위치**: `src/main.ts` → Design JSON 구성 시 TEXT 노드에 `styledTextSegments` 추가
**기대 효과**: AI가 `<span>` 태그로 부분 스타일 재현 가능

---

## 5. cornerRadius 4각 개별값 처리

**현재 문제**
`cornerRadius`가 `figma.mixed`(4각이 다른 경우)이면 무시됨.

**적용 내용 (`figma-parser/packages/plugin/src/extractors/nodes/containerExtractor.ts:34-53`)**

```typescript
function extractCornerRadius(node: FrameNode | RectangleNode) {
  if (!('cornerRadius' in node)) return undefined;
  if (node.cornerRadius !== figma.mixed) return node.cornerRadius;
  if ('topLeftRadius' in node) {
    return [
      node.topLeftRadius,
      node.topRightRadius,
      node.bottomRightRadius,
      node.bottomLeftRadius,
    ];
  }
  return undefined;
}
```

**JSON 출력 예시**
```json
{ "cornerRadius": [8, 8, 0, 0] }
```
→ AI가 `border-radius: 8px 8px 0 0` 으로 변환 가능

---

## 6. 누락된 레이아웃 속성 추가

**현재 Design JSON에 없는 auto-layout 관련 값들**

| 속성 | 의미 | CSS 매핑 |
|------|------|----------|
| `layoutWrap` | 줄 바꿈 여부 | `flex-wrap` |
| `layoutSizingHorizontal` | 가로 크기 동작 (FIXED/FILL/HUG) | 자식 width 결정 |
| `layoutSizingVertical` | 세로 크기 동작 | 자식 height 결정 |
| `counterAxisSpacing` | 교차축 간격 (wrap 시) | `gap` 세로값 |

**적용 위치**: `src/main.ts` Structure JSON 구성 시 FRAME/COMPONENT 노드에 추가

---

## 작업 순서 제안

1. **1단계** (임팩트 큼, 난이도 낮음)
   - [ ] 아이콘 감지 로직 강화 (`isLikelyIcon`)
   - [ ] cornerRadius 4각 처리
   - [ ] 누락 레이아웃 속성 추가

2. **2단계** (async 처리 필요)
   - [ ] SVG 실제 추출 + 다운로드 버튼
   - [ ] 혼합 텍스트 스타일 (`styledTextSegments`)

3. **3단계** (UI 변경 포함)
   - [ ] 이미지 base64 추출 (옵션 체크박스)
   - [ ] progress 표시 UI

---

## 참고 파일 위치 (로컬 클론)

```
/tmp/figma-parser/packages/plugin/src/code.ts              ← 아이콘 감지, SVG/이미지 추출
/tmp/figma-parser/packages/plugin/src/extractors/nodes/
  containerExtractor.ts                                      ← cornerRadius
  textExtractor.ts                                           ← 혼합 텍스트
/tmp/figma-parser/packages/plugin/src/extractors/styles/
  layoutExtractor.ts                                         ← 누락 레이아웃 속성
  paintExtractor.ts                                          ← 색상/그라디언트
  typographyExtractor.ts                                     ← 폰트 상세
```
