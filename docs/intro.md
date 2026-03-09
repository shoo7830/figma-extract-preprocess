# Figma JSON Exporter — 팀 내부 소개

## 배경 / 영감

Clair(방소현)의 [Figma 디자인 JSON 추출](https://confluence.gabia.com/spaces/o2cplaform/pages/246410991) 리서치를 보고 시작됐습니다.

해당 글의 핵심 발견은 두 가지였습니다.

### 1. Figma API rate limit 문제

Cursor, Claude Code 같은 AI 도구는 작업 중 파일을 반복적으로 읽고 분석 요청을 반복합니다.
Figma API는 분당 요청 제한이 있어, 자동화 툴이 polling을 많이 하면 빠르게 429 에러가 납니다.

### 2. 해결 방향: API를 딱 한 번만 호출해서 로컬 JSON으로 저장

> API는 딱 한 번만 호출해서 파일 저장 → 이후에는 로컬 JSON만 사용 → 변경 생길 때만 다시 export

Clair의 글 하단에는 이미 **"Figma에서 플러그인 만들기(JSON 추출) - 작성중"** 섹션이 있었습니다.
바닐라 JS로 선택한 Frame을 JSON으로 다운로드하는 기본 구조까지 제시된 상태였고,
우리는 이를 출발점 삼아 AI 코드 생성 워크플로우에 맞게 발전시켰습니다.

| 항목 | Figma REST API | 플러그인 (현재 방식) |
| --- | --- | --- |
| Rate limit | 있음 (429 에러 위험) | 없음 |
| 토큰 | 필요 | 불필요 |
| 접근 범위 | 파일 전체 | 선택한 Frame만 |

---

## 왜 만들었나

디자인을 코드로 옮기는 과정에서 반복되는 문제가 있었습니다.

- 디자이너가 Figma를 완성해도 개발자가 수치를 일일이 확인해야 함
- AI 코딩 도구에 디자인을 설명하려면 말로 번역해야 함
- 그 과정에서 폰트 크기, 간격, 색상이 조금씩 틀리게 전달됨

Figma는 내부적으로 모든 디자인 정보를 JSON으로 갖고 있습니다.
이걸 그대로 꺼낼 수 있다면, AI에게 디자인을 설명하는 대신 데이터로 전달할 수 있습니다.

---

## 어떻게 작동하나

Figma 플러그인으로 동작합니다. 프레임을 선택하면 자동으로 JSON이 생성됩니다.

```text
Figma에서 프레임 선택
  → 플러그인이 노드 트리 자동 파싱
  → Structure / Design JSON 분리 생성
  → 다운로드
```

### 다운로드 가능한 JSON 세 가지

| 파일 | 용도 |
| --- | --- |
| `{name}.json` | 전체 원본 |
| `{name}_structure.json` | 레이아웃/계층 구조 → AI에게 HTML 뼈대 생성 요청 시 |
| `{name}_design.json` | 시각 스타일 → AI에게 CSS 생성 요청 시 |

### 에셋 목록 자동 감지

플러그인이 선택한 프레임 안의 에셋을 자동으로 분류합니다.

- **SVG 내보내기 대상** — 벡터 노드 (아이콘, 로고 등)
- **이미지 플레이스홀더 대상** — 이미지 fill이 있는 노드

개발자가 어떤 에셋을 별도로 받아야 하는지 한눈에 파악할 수 있습니다.

---

## 어떻게 활용하나

### Cursor / Claude에 전달하는 프롬프트 예시

```text
@figma/Mb_structure.json 으로 HTML 구조를
@figma/Mb_design.json 으로 CSS를 만들어줘
@pages/event/test/index.vue 에 작업

규칙:
- fontSize 등 모든 수치는 px 단위 그대로 사용
- 기준 프레임 너비는 390px (모바일)
- 한국어 텍스트에 word-break: keep-all 적용
- 배경 이미지는 플레이스홀더로 처리
```

### 프로젝트 내 저장 위치

```text
React  → src/figma/
Nuxt2  → assets/figma/
```

```text
figma/
├── {페이지명}_structure.json
├── {페이지명}_design.json
└── assets/
    ├── ic_arrow.svg
    └── hero_image.png
```

JSON은 git에 커밋해두면 디자인 변경 이력도 추적됩니다.

---

## 실제로 얼마나 재현되나

이벤트 페이지 기준으로 테스트한 결과입니다.

| 조건 | 재현율 |
| --- | --- |
| 텍스트 + 단색 위주 | 85~90% |
| 이미지/아이콘 많음 (에셋 미제공) | 45~60% |
| 이미지 플레이스홀더 + SVG 에셋 별도 제공 | 85~90% |

구조와 레이아웃은 거의 정확하게 나옵니다. 나머지 차이는 주로 배경 이미지, 장식용 SVG 등 에셋 영역입니다.

### 잘 나오는 것

- Auto Layout (padding, gap, 정렬)
- 텍스트 스타일 (폰트, 크기, 행간)
- 단색 배경 및 색상
- 테두리, 그림자, 둥근 모서리

### 에셋 정책 (팀 합의)

- **이미지** — 디자이너가 PNG/WebP 별도 제공, 개발자는 플레이스홀더로 위치만 잡기
- **아이콘** — SVG 파일로 제공

---

## 현재 한계와 앞으로

### 현재 한계

- AI가 생성한 코드에서 fontSize를 rem으로 해석하는 경우 → 프롬프트 규칙으로 보정
- 이미지/벡터 에셋은 JSON에 포함 불가 → 별도 제공 방식으로 해결

### 향후 확장 방향

- 컴포넌트/디자인 시스템 단계로 가면 → 별도 `figma-tokens` 레포 + git submodule
- 디자인 시스템 성숙 시 → Style Dictionary 포맷 토큰 npm 패키지로 배포

---

## 설치 방법

1. Figma Desktop 실행
2. 메뉴 → Plugins → Development → Import plugin from manifest
3. 이 레포의 `manifest.json` 선택
4. 프레임 선택 후 플러그인 실행
