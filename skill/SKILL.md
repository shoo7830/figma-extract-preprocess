---
name: figma-extract
description: Figma REST API로 선택한 프레임의 JSON을 추출한다. 플러그인 없이 Figma URL만으로 raw/structure/design/tokens/manifest JSON을 로컬에 저장한다. "figma extract", "피그마 JSON 추출", "피그마 raw json", "figma-extract" 등의 요청 시 사용.
---

# Figma Extract

Figma REST API를 사용해 플러그인 없이 프레임 JSON을 추출합니다.
`structure`, `design`, `tokens`, `manifest` 네 가지 형식을 지원합니다.

## 사전 조건 (환경변수)

- `FIGMA_TOKEN` (필수): Figma Personal Access Token
  - Figma → 계정 설정 → Security → Personal access tokens

## 사용법

```bash
python3 ~/.claude/skills/figma-extract/scripts/figma_extract.py \
  --url "https://www.figma.com/design/ABC123/MyFile?node-id=1-23" \
  --types raw \
  --output ./figma
```

### 옵션

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `--url` | Figma 프레임 URL (여러 번 사용 가능) | - |
| `--output` | JSON 저장 디렉토리 | `./figma` |
| `--img-output` | 이미지(PNG) 저장 디렉토리 | `./output` |
| `--types` | 추출할 종류 (raw,structure,design,tokens,manifest,png) | raw |
| `--component-map` | 컴포넌트 이름 → 프로덕션 코드 매핑 JSON 파일 경로 | - |

## 워크플로우

1. Figma에서 프레임 선택 → 우클릭 → **Copy link**
2. 링크를 `--url`에 전달
3. 출력 파일이 `--output` 디렉토리에 생성됨

## 출력 파일

| 파일 | `--types` 값 | 내용 |
|------|-------------|------|
| `*_raw.json` | `raw` | structure + design 합집합 (레이아웃·스타일 통합 단일 파일) |
| `*_structure.json` | `structure` | 레이아웃 뼈대 (크기, 위치, AutoLayout) |
| `*_design.json` | `design` | 시각 스타일 (색상, 폰트, 그림자, styledTextSegments) |
| `*_tokens.json` | `tokens` | 프레임에서 사용된 디자인 토큰 목록 (색상·타이포·이펙트) |
| `*_manifest.json` | `manifest` | 모든 텍스트 콘텐츠 목록 (텍스트 누락 검수용) |
| `*.png` | `png` | Figma 프레임 PNG (시각 QA용, @2x 해상도) |

### 반응형 (MB + PC 동시 추출)

```bash
python3 ~/.claude/skills/figma-extract/scripts/figma_extract.py \
  --url "https://www.figma.com/design/ABC123/MyFile?node-id=1-23" \
  --url "https://www.figma.com/design/ABC123/MyFile?node-id=4-56" \
  --types raw
```

프레임 이름이 `event_mb`, `event_pc`이면 자동으로:

```
figma/
  event_mb_raw.json
  event_pc_raw.json
```

### 전체 추출 예시

```bash
python3 ~/.claude/skills/figma-extract/scripts/figma_extract.py \
  --url "https://www.figma.com/design/ABC123/MyFile?node-id=1-23" \
  --types raw,tokens,manifest,png
```

기본 경로로 실행하면 프로젝트 루트에 아래 구조로 저장됩니다:

```
./figma/
  CardList_raw.json
  CardList_tokens.json
  CardList_manifest.json
./output/
  CardList.png
```

---

## 토큰 어노테이션

파일에 로컬 스타일이 정의되어 있으면, `structure.json`과 `design.json`의 fills에
`_tokenName` 필드가 자동으로 주입됩니다.

```json
{
  "type": "SOLID",
  "color": { "r": 0.1, "g": 0.2, "b": 0.8, "a": 1 },
  "_tokenName": "Primary/Blue-500"
}
```

텍스트 노드에는 `_textToken` 필드가 추가됩니다:

```json
{
  "type": "TEXT",
  "characters": "제목",
  "_textToken": "Typography/Heading-1"
}
```

`tokens` 타입을 추가하면 프레임 전체에서 사용된 토큰을 한눈에 볼 수 있습니다:

```json
{
  "colors": {
    "Primary/Blue-500": { "type": "SOLID", "color": { "r": 0.1, "g": 0.2, "b": 0.8 } }
  },
  "typography": {
    "Typography/Heading-1": { "fontName": { "family": "Inter" }, "fontSize": 32, "fontWeight": 700 }
  },
  "effects": {}
}
```

---

## Code Connect 매핑 (`--component-map`)

Figma 컴포넌트 이름과 실제 프로덕션 컴포넌트를 연결합니다.
AI가 임시 HTML 대신 팀의 실제 컴포넌트를 재사용하도록 유도합니다.

### 매핑 파일 형식 (`component-map.json`)

```json
{
  "Button/Primary": {
    "import": "import { Button } from '@/components/Button'",
    "usage": "<Button variant='primary'>{label}</Button>",
    "props": ["variant", "size", "disabled"]
  },
  "Card/Default": {
    "import": "import { Card } from '@/components/Card'",
    "usage": "<Card>{children}</Card>",
    "props": ["elevation", "padding"]
  }
}
```

### 사용 예시

```bash
python3 ~/.claude/skills/figma-extract/scripts/figma_extract.py \
  --url "https://www.figma.com/design/ABC123/MyFile?node-id=1-23" \
  --output ./output \
  --component-map ./component-map.json
```

매핑이 적용되면 JSON에 `_codeConnect` 필드가 주입됩니다:

```json
{
  "name": "Button/Primary",
  "type": "INSTANCE",
  "_codeConnect": {
    "import": "import { Button } from '@/components/Button'",
    "usage": "<Button variant='primary'>{label}</Button>",
    "props": ["variant", "size", "disabled"]
  }
}
```

---

## manifest (텍스트 검수)

`manifest` 타입은 프레임 내 모든 텍스트 콘텐츠를 평면 목록으로 추출합니다.
`ai-prompt-guide.md`의 텍스트 누락 검수 프롬프트에 그대로 사용합니다.

```json
[
  { "name": "Hero/Title", "characters": "디자인 시스템으로 AI 업무 흐름 강화" },
  { "name": "Hero/Subtitle", "characters": "더 빠르게, 더 일관되게" }
]
```

---

## AI 구현 프롬프트

### 단일 (모바일)

```
@figma/{slug}_raw.json 으로 HTML 구조와 CSS를 만들어줘
@pages/event/{slug}/index.vue 에 작업

규칙:
- px 수치 그대로 사용 (rem 변환 금지)
- 기준 프레임 너비: 390px (모바일)
- 한국어 텍스트에 word-break: keep-all 적용
- 배경 이미지는 플레이스홀더로 처리
```

### 반응형 (MB + PC)

```
MB: @figma/{slug}_mb_raw.json
PC: @figma/{slug}_pc_raw.json
@pages/event/{slug}/index.vue 에 반응형으로 구현해줘.

규칙:
- 모바일 우선, 브레이크포인트: @media (min-width: 768px)
- px 수치 그대로, word-break: keep-all
- 배경 이미지는 플레이스홀더로 처리
```

### 텍스트 누락 검수

```
@figma/{slug}_manifest.json 대조해서
@pages/event/{slug}/index.vue 의 텍스트 누락 여부 확인해줘.
수정은 하지 말고 리포트만.
```

---

## 시각 QA 파이프라인 (이벤트 페이지)

PNG를 함께 추출하면 코드 생성 후 시각적 일치 여부를 자동으로 검수할 수 있습니다.

```
figma_extract.py --types raw,png
        ↓
executor 에이전트 → HTML/CSS 생성
        ↓
chrome-cdp → 브라우저 렌더 + 스크린샷
        ↓
AI가 {slug}.png ↔ screenshot.png 비교 → 피드백
        ↓
executor 수정 → 반복
```

Claude Code에서 실행 예시:

```
아래 두 이미지를 비교해서 레이아웃·색상·폰트 크기 기준으로
차이점을 목록으로 정리해줘. 수정은 하지 말고 리포트만.

- Figma 원본: ./output/CardList.png
- 렌더 결과: ./output/screenshot.png
```

---

## 주의사항

- `styledTextSegments`는 Plugin API 전용 — REST API에서는 미지원
- 이미지 fill은 base64 대신 `imageSlot` 메타 객체로 대체됨
- `_tokenName`, `_textToken`, `_codeConnect`는 추출 전용 메타 필드 (Figma 원본 아님)
- 토큰 어노테이션은 파일에 로컬 스타일이 정의된 경우에만 동작
- Rate limit: 분당 약 60회 (단발성 호출이라 일반적으로 문제 없음)
