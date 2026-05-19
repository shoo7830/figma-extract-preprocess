#!/usr/bin/env node
/**
 * Figma JSON 파서 — structure + design 머지 후 섹션별 분할 출력
 *
 * 사용법:
 *   node skill/scripts/parse_figma.mjs                         # 현재 디렉토리 자동 탐색
 *   node skill/scripts/parse_figma.mjs --dir ./figma           # 디렉토리 지정
 *   node skill/scripts/parse_figma.mjs --prefix desktop_1920   # 특정 파일만
 *   node skill/scripts/parse_figma.mjs --section-prefix Sec    # 섹션 이름 prefix 필터
 *   node skill/scripts/parse_figma.mjs --out ./figma/parsed    # 출력 디렉토리 지정
 *   node skill/scripts/parse_figma.mjs --section Secton_00_Hero # 특정 섹션만
 *
 * 의존성: Node.js 내장 모듈만 사용 (별도 설치 불필요)
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── CLI 인자 파싱 ───────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      args[key] = argv[i + 1] ?? true;
      i++;
    }
  }
  return args;
}

const cliArgs = parseArgs(process.argv.slice(2));
const FIGMA_DIR = cliArgs.dir ? join(process.cwd(), cliArgs.dir) : __dirname;
const PARSED_DIR = cliArgs.out
  ? join(process.cwd(), cliArgs.out)
  : join(FIGMA_DIR, 'parsed');
const SEC_PREFIX = cliArgs['section-prefix'] ?? null; // 섹션 이름 필터 (없으면 큰 FRAME 자동 감지)
const ONLY_PREFIX = cliArgs.prefix ?? null; // 특정 파일 prefix만
const ONLY_SEC = cliArgs.section ?? null; // 특정 섹션만

mkdirSync(PARSED_DIR, { recursive: true });

// ─── 파일 탐색 (raw 우선, 없으면 structure+design 쌍) ──────────────────────

function discoverFiles(dir) {
  const files = readdirSync(dir);
  const filter = p => !ONLY_PREFIX || p === ONLY_PREFIX;

  const raw = files
    .filter(f => f.endsWith('_raw.json'))
    .map(f => basename(f, '_raw.json'))
    .filter(filter);

  const rawSet = new Set(raw);
  const pairs = files
    .filter(f => f.endsWith('_structure.json'))
    .map(f => basename(f, '_structure.json'))
    .filter(p => files.includes(`${p}_design.json`) && !rawSet.has(p))
    .filter(filter);

  return { raw, pairs };
}

// ─── 색상 변환 ───────────────────────────────────────────────────────────────

function rgbaToHex({ r = 0, g = 0, b = 0, a = 1 }) {
  const ri = Math.round(r * 255);
  const gi = Math.round(g * 255);
  const bi = Math.round(b * 255);
  if (a < 1) return `rgba(${ri},${gi},${bi},${a.toFixed(2)})`;
  return `#${ri.toString(16).padStart(2, '0')}${gi
    .toString(16)
    .padStart(2, '0')}${bi.toString(16).padStart(2, '0')}`;
}

function parseFills(fills = []) {
  return fills.flatMap(f => {
    if (f.type === 'SOLID') {
      return [
        { type: 'solid', color: rgbaToHex(f.color), opacity: f.opacity ?? 1 },
      ];
    }
    if (f.type === 'GRADIENT_LINEAR' || f.type === 'GRADIENT_RADIAL') {
      const stops = (f.gradientStops ?? []).map(s => ({
        color: rgbaToHex(s.color),
        position: s.position ?? 0,
      }));
      return [{ type: f.type.toLowerCase(), stops }];
    }
    if (f.type === 'IMAGE' && f.imageSlot) {
      return [{ type: 'image', imageSlot: f.imageSlot }];
    }
    return [];
  });
}

// ─── 트리 머지 ───────────────────────────────────────────────────────────────

function mergeNode(sNode, dNode = {}) {
  const node = {
    name: sNode.name ?? '',
    type: sNode.type ?? '',
  };

  for (const k of ['x', 'y', 'width', 'height']) {
    if (k in sNode) node[k] = sNode[k];
  }

  const chars = dNode.characters ?? sNode.characters ?? '';
  if (chars) node.text = chars;

  const style = dNode.style ?? sNode.style ?? {};
  if (Object.keys(style).length) {
    const font = {};
    const map = {
      fontSize: 'size',
      fontWeight: 'weight',
      lineHeightPx: 'lineHeight',
      letterSpacing: 'letterSpacing',
      textAlignHorizontal: 'align',
    };
    for (const [from, to] of Object.entries(map)) {
      if (from in style) font[to] = style[from];
    }
    if (Object.keys(font).length) node.font = font;
  }

  const fills = dNode.fills ?? sNode.fills ?? [];
  const parsedFills = parseFills(fills);
  if (parsedFills.length) node.fills = parsedFills;

  const strokes = dNode.strokes ?? sNode.strokes ?? [];
  const strokeColors = strokes
    .filter(s => s.color)
    .map(s => rgbaToHex(s.color));
  if (strokeColors.length) {
    node.strokes = strokeColors;
    node.strokeWeight = dNode.strokeWeight ?? sNode.strokeWeight;
  }

  const radius = dNode.cornerRadius ?? sNode.cornerRadius;
  if (radius != null) node.borderRadius = radius;

  const effects = (dNode.effects ?? sNode.effects ?? []).flatMap(eff => {
    if (eff.type === 'DROP_SHADOW') {
      return [
        {
          type: 'drop-shadow',
          color: eff.color ? rgbaToHex(eff.color) : null,
          offset: { x: eff.offset?.x ?? 0, y: eff.offset?.y ?? 0 },
          blur: eff.radius ?? 0,
        },
      ];
    }
    return [];
  });
  if (effects.length) node.effects = effects;

  const layoutMode = dNode.layoutMode ?? sNode.layoutMode;
  if (layoutMode) {
    node.layoutMode = layoutMode;
    for (const k of [
      'itemSpacing',
      'paddingTop',
      'paddingBottom',
      'paddingLeft',
      'paddingRight',
      'primaryAxisAlignItems',
      'counterAxisAlignItems',
    ]) {
      const v = dNode[k] ?? sNode[k];
      if (v != null) node[k] = v;
    }
  }

  const opacity = dNode.opacity ?? sNode.opacity;
  if (opacity != null && opacity !== 1) node.opacity = opacity;

  const sChildren = sNode.children ?? [];
  const dChildren = dNode.children ?? [];
  if (sChildren.length) {
    node.children = sChildren.map((sc, i) => mergeNode(sc, dChildren[i] ?? {}));
  }

  return node;
}

// ─── loose 요소 → 섹션 매핑 ─────────────────────────────────────────────────

function assignLooseToSections(loose, sections) {
  const buckets = Object.fromEntries(sections.map(s => [s.name, []]));
  buckets._unassigned = [];

  for (const elem of loose) {
    const center = (elem.y ?? 0) + (elem.height ?? 0) / 2;
    const sec = sections.find(
      s => (s.y ?? 0) <= center && center < (s.y ?? 0) + (s.height ?? 0),
    );
    (sec ? buckets[sec.name] : buckets._unassigned).push(elem);
  }
  return buckets;
}

// ─── 사람이 읽기 좋은 spec ──────────────────────────────────────────────────

function nodeToSpec(node, depth = 0) {
  const indent = '  '.repeat(depth);
  const { name, type, width: w, height: h, x, y } = node;
  const pos = x != null && y != null ? `  @(${x},${y})` : '';
  const size = w != null && h != null ? `  ${w}×${h}` : '';
  const lines = [`${indent}[${type}] ${name}${size}${pos}`];

  if (node.text) {
    lines.push(`${indent}  text: "${node.text.replace(/\n/g, '↵')}"`);
  }

  if (node.font) {
    const f = node.font;
    const parts = [];
    if (f.size != null) parts.push(`size=${f.size}px`);
    if (f.weight != null) parts.push(`w=${f.weight}`);
    if (f.lineHeight != null) parts.push(`lh=${f.lineHeight.toFixed(1)}px`);
    if (f.align != null) parts.push(`align=${f.align}`);
    lines.push(`${indent}  font: ${parts.join(' ')}`);
  }

  for (const fi of node.fills ?? []) {
    if (fi.type === 'solid') {
      lines.push(`${indent}  fill: ${fi.color}`);
    } else if (fi.type === 'image') {
      const slot = fi.imageSlot ?? {};
      const path = slot.actualPath ?? `./images/${slot.slotId}.png`;
      lines.push(`${indent}  fill: image  slot=${slot.slotId}  path=${path}`);
    } else {
      const stops = (fi.stops ?? []).map(s => s.color).join(' → ');
      lines.push(`${indent}  fill: ${fi.type} [${stops}]`);
    }
  }

  if (node.strokes?.length) {
    lines.push(
      `${indent}  stroke: ${node.strokes.join(', ')}  weight=${
        node.strokeWeight
      }px`,
    );
  }

  if (node.borderRadius != null) {
    lines.push(`${indent}  borderRadius: ${node.borderRadius}px`);
  }

  if (node.layoutMode) {
    const gap = node.itemSpacing ?? '';
    const pads = ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft']
      .filter(k => node[k] != null)
      .map(k => node[k]);
    const padStr = pads.length ? `  padding=[${pads.join(',')}]` : '';
    lines.push(`${indent}  layout: ${node.layoutMode}  gap=${gap}${padStr}`);
  }

  for (const eff of node.effects ?? []) {
    lines.push(
      `${indent}  shadow: ${eff.color} offset=(${eff.offset.x},${eff.offset.y}) blur=${eff.blur}`,
    );
  }

  for (const child of node.children ?? []) {
    lines.push(...nodeToSpec(child, depth + 1));
  }

  return lines;
}

// ─── 섹션 자동 감지 ─────────────────────────────────────────────────────────

function detectSections(topChildren, rootWidth) {
  return topChildren.filter(c => {
    if (c.type !== 'FRAME') return false;
    // --section-prefix 옵션이 있으면 prefix 일치만
    if (SEC_PREFIX) return c.name?.startsWith(SEC_PREFIX);
    // 없으면 루트 너비의 30% 이상인 FRAME을 섹션으로 간주
    return (c.width ?? 0) >= rootWidth * 0.3;
  });
}

// ─── 단일 prefix 처리 ───────────────────────────────────────────────────────

function parsePrefix(prefix, isRaw = false) {
  let merged;
  if (isRaw) {
    const rawData = JSON.parse(
      readFileSync(join(FIGMA_DIR, `${prefix}_raw.json`), 'utf8'),
    );
    console.log(`[${prefix}] raw 파싱 중...`);
    merged = mergeNode(rawData, rawData);
  } else {
    const structData = JSON.parse(
      readFileSync(join(FIGMA_DIR, `${prefix}_structure.json`), 'utf8'),
    );
    const designData = JSON.parse(
      readFileSync(join(FIGMA_DIR, `${prefix}_design.json`), 'utf8'),
    );
    console.log(`[${prefix}] structure + design 머지 중...`);
    merged = mergeNode(structData, designData);
  }

  const topChildren = merged.children ?? [];
  const rootWidth = merged.width ?? 1920;
  const sections = detectSections(topChildren, rootWidth);
  const loose = topChildren.filter(c =>
    ['TEXT', 'VECTOR', 'RECTANGLE', 'GROUP'].includes(c.type),
  );
  const buckets = assignLooseToSections(loose, sections);
  const targets = ONLY_SEC
    ? sections.filter(s => s.name === ONLY_SEC)
    : sections;

  for (const sec of targets) {
    const extraLoose = buckets[sec.name] ?? [];
    const output = {
      prefix,
      section: sec.name,
      bounds: {
        x: sec.x ?? 0,
        y: sec.y ?? 0,
        width: sec.width ?? 0,
        height: sec.height ?? 0,
      },
      tree: sec,
      loose_overlays: extraLoose,
    };

    const jsonPath = join(PARSED_DIR, `${prefix}_${sec.name}.json`);
    writeFileSync(jsonPath, JSON.stringify(output, null, 2));

    const specLines = [
      `# ${sec.name} — ${prefix} (${sec.width}×${sec.height})`,
      `# y=${sec.y}~${(sec.y ?? 0) + (sec.height ?? 0)}`,
      '',
      '## 섹션 트리',
      ...nodeToSpec(sec),
    ];

    if (extraLoose.length) {
      specLines.push(
        '',
        '## Loose 오버레이 요소 (섹션 프레임 밖, y좌표 기준 이 섹션에 속함)',
      );
      for (const elem of extraLoose) specLines.push(...nodeToSpec(elem, 1));
    }

    const specPath = join(PARSED_DIR, `${prefix}_${sec.name}.spec.txt`);
    writeFileSync(specPath, specLines.join('\n'));

    const jsonKb = Math.round(readFileSync(jsonPath).length / 1024);
    const specKb = Math.round(readFileSync(specPath).length / 1024);
    console.log(
      `  ✓ ${sec.name}: JSON ${jsonKb}KB / spec ${specKb}KB  (loose ${extraLoose.length}개)`,
    );
  }

  // 섹션 순서 인덱스 파일 생성
  const relDir = PARSED_DIR.replace(process.cwd() + '/', '');
  const indexLines = [
    `# ${prefix.toUpperCase()} 섹션 순서`,
    '',
    '> Claude에 아래 파일들을 @참조로 넘기면 섹션 순서가 전달됩니다.',
    '',
    '## 전체 구현 지시 템플릿',
    '```',
    ...targets.map((sec, i) =>
      `${i + 1}. @${relDir}/${prefix}_${sec.name}.json`
    ),
    '',
    '위 순서대로 Vue 컴포넌트를 구현해줘.',
    '이미지: figma/images/ 폴더 참고',
    '```',
    '',
    '## 섹션별 파일 목록',
    '',
    ...targets.map((sec, i) => {
      const jsonFile = `${relDir}/${prefix}_${sec.name}.json`;
      const specFile = `${relDir}/${prefix}_${sec.name}.spec.txt`;
      return `### ${i + 1}. ${sec.name}\n- JSON: \`${jsonFile}\`\n- Spec: \`${specFile}\`\n- 크기: ${sec.width}×${sec.height}  y=${sec.y ?? 0}~${(sec.y ?? 0) + (sec.height ?? 0)}\n`;
    }),
  ];
  const indexPath = join(PARSED_DIR, `${prefix}_index.md`);
  writeFileSync(indexPath, indexLines.join('\n'));
  console.log(`  ✓ index: ${indexPath}`);

  console.log(`[${prefix}] 완료 → ${PARSED_DIR}/`);

  const unassigned = buckets._unassigned ?? [];
  if (unassigned.length) {
    console.log(`  ⚠ 미배치 loose 요소 ${unassigned.length}개:`);
    for (const u of unassigned)
      console.log(`    [${u.type}] ${u.name}  y=${u.y}`);
  }
}

// ─── 진입점 ─────────────────────────────────────────────────────────────────

const { raw, pairs } = discoverFiles(FIGMA_DIR);
if (!raw.length && !pairs.length) {
  console.error(
    `❌ *_raw.json 또는 *_structure.json + *_design.json 쌍을 찾지 못했습니다: ${FIGMA_DIR}`,
  );
  process.exit(1);
}

if (raw.length) {
  console.log(`발견된 raw 파일: ${raw.join(', ')}\n`);
  for (const p of raw) parsePrefix(p, true);
}
if (pairs.length) {
  console.log(`발견된 파일 쌍: ${pairs.join(', ')}\n`);
  for (const p of pairs) parsePrefix(p, false);
}
