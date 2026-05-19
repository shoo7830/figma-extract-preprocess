# Figma JSON Exporter — 워크플로우 가이드

> 작성일: 2026-05-12  
> 대상: VESSL-AI 이벤트 페이지 구축 작업 기준

---

## 1. 전체 파이프라인 요약

```
Figma 시안 (PC/TB/MB)
        ↓
figma_extract.py --types raw,images --image-node {이미지모음URL}
        ↓
figma/{시안}_raw.json  +  figma/images/*.png
        ↓
parse_figma.mjs --dir ./figma --out ./figma/parsed
        ↓
figma/parsed/{시안}_{섹션}.json
figma/parsed/{시안}_{섹션}.spec.txt
figma/parsed/{시안}_index.md   ← 섹션 순서 인덱스
        ↓
Claude에 @{시안}_index.md 하나만 넘기면 순서 포함 전달 완료
        ↓
이미지 manual_mapping 작성 (image-mapping.json, 최초 1회)
        ↓
완성된 반응형 페이지
```

---

## 2. 커맨드 레퍼런스

### 환경 설정 (최초 1회)

```bash
# ~/.zshrc 에 추가
export FIGMA_TOKEN="figd_xxxx"

# 적용 (또는 터미널 재시작)
source ~/.zshrc
```

### 추출 커맨드

```bash
# 프로젝트 루트에서 실행
python3 skill/scripts/figma_extract.py \
  --url "PC 프레임 URL" \
  --url "TB 프레임 URL" \
  --url "MB 프레임 URL" \
  --image-node "이미지 모음 프레임 URL" \
  --types raw,images \
  --output ./figma
```

**VESSL-AI 프로젝트 고정 커맨드:**

```bash
FIGMA_TOKEN=$(grep FIGMA_TOKEN ~/.zshrc | tail -1 | sed 's/.*="\(.*\)"/\1/') \
python3 skill/scripts/figma_extract.py \
  --url "https://www.figma.com/design/ilCLRjyByTdXm5GOMtVXGN/VESSL-AI?node-id=301-1658" \
  --url "https://www.figma.com/design/ilCLRjyByTdXm5GOMtVXGN/VESSL-AI?node-id=195-1374" \
  --url "https://www.figma.com/design/ilCLRjyByTdXm5GOMtVXGN/VESSL-AI?node-id=195-1373" \
  --image-node "https://www.figma.com/design/ilCLRjyByTdXm5GOMtVXGN/VESSL-AI?node-id=183-3577" \
  --types raw,images \
  --output ./figma
```

### 섹션 분할 커맨드

```bash
node skill/scripts/parse_figma.mjs --dir ./figma --out ./figma/parsed
```

실행 결과:
```
figma/parsed/
  pc_Intro.json + pc_Intro.spec.txt
  pc_Problem.json + pc_Problem.spec.txt
  pc_Solution.json + ...
  pc_index.md        ← 섹션 순서 인덱스 (신규)
  tb_index.md
  mb_index.md
```

---

## 3. figma_extract.py 개선 내역

### 추가된 기능

| 항목 | 설명 |
|------|------|
| `imageRef` 수집 | image fill의 Figma 내부 해시를 `imageSlot.imageRef`에 포함. 이미지 추적 가능 |
| `--image-node URL` | 이미지 모음 프레임 자식 노드를 개별 PNG로 일괄 내보내기 → `figma/images/` 저장 |
| `--types images` | `raw,images` 조합으로 JSON + 이미지를 한 번에 추출 |
| `actualPath` 자동 주입 | slotId = 파일명인 경우 `imageSlot.actualPath` 자동 기입 |

### 이미지 다운로드 방식 선택 이유

피그마 공유 라이브러리에서 가져온 image fill은 `/v1/files/{key}/images` API가 URL을 반환하지 않는다.  
따라서 **이미지 모음 프레임**(디자이너가 따로 모아둔 노드)을 렌더 API로 개별 PNG 내보내는 우회 방식을 사용.

### 주의: 이미지 자동 매핑 한계

design fill 노드명("img", "intro")과 이미지 에셋 파일명("img01.png", "mainbanner.png")이 다를 경우  
자동 매핑이 되지 않음 → `figma/image-mapping.json`의 `manual_mapping`을 직접 채울 것.

```json
"manual_mapping": {
  "intro":      "mainbanner.png",
  "img":        "img01.png",
  "contact-us": "contact-usbg-1.png"
}
```

---

## 4. parse_figma.mjs 개선 내역

### 버그 수정

| 항목 | 이전 | 이후 |
|------|------|------|
| IMAGE fill 처리 | `parseFills()`에서 미처리 → 유실 | `{ type: 'image', imageSlot: {...} }` 형태로 보존 |
| spec.txt 이미지 출력 | `fi.stops` 접근 → 크래시 가능 | `fill: image  slot=xxx  path=xxx` 형태로 출력 |

### 신규 기능: 섹션 순서 인덱스 (`{prefix}_index.md`)

매 실행 시 섹션 순서가 담긴 인덱스 파일이 자동 생성됨.

```markdown
# PC 섹션 순서

## 전체 구현 지시 템플릿
1. @figma/parsed/pc_Intro.json
2. @figma/parsed/pc_Problem.json
3. @figma/parsed/pc_Solution.json
4. @figma/parsed/pc_Featured .json
5. @figma/parsed/pc_Workflows.json
6. @figma/parsed/pc_Contact us.json

위 순서대로 Vue 컴포넌트를 구현해줘.

## 섹션별 파일 목록
### 1. Intro
- JSON: figma/parsed/pc_Intro.json
- 크기: 1920×1080  y=80~1160
...
```

---

## 5. 다른 프로젝트에 넘길 때 작업 지시 방법

### 전달 파일 구조

```
figma/
  parsed/
    pc_index.md          ← Claude에 이것만 넘기면 됨
    pc_Intro.json + .spec.txt
    pc_Problem.json + .spec.txt
    ...
    tb_index.md
    mb_index.md
  images/
    mainbanner.png
    img01.png  ...
  image-mapping.json
```

### Claude 작업 지시 템플릿

#### 전체 섹션 순서대로 구현

```
@figma/parsed/pc_index.md 참고해서
PC 시안을 섹션 순서대로 전부 Vue로 구현해줘.
이미지는 figma/images/ 폴더 참고.
```

#### 반응형 (PC + TB + MB 동시)

```
PC: @figma/parsed/pc_index.md
TB: @figma/parsed/tb_index.md
MB: @figma/parsed/mb_index.md

세 시안을 반응형으로 구현해줘.
브레이크포인트: 768px(TB), 1280px(PC)
이미지: figma/images/ 폴더 참고
```

#### 특정 섹션만

```
@figma/parsed/pc_Intro.json
@figma/parsed/pc_Intro.spec.txt

위 섹션만 Vue 컴포넌트로 구현해줘.
```

#### 텍스트 누락 검수

```
@figma/parsed/pc_index.md 의 모든 섹션 JSON text 필드와
@pages/event/vessl/index.vue 의 텍스트를 비교해서
누락된 텍스트 리포트만 해줘. 수정은 하지 마.
```

### 공통 구현 규칙 (매번 포함 권장)

```
규칙:
- px 수치 그대로 사용 (rem 변환 금지)
- 기준 너비: PC 1920px / TB 768px / MB 390px
- 한국어 텍스트 word-break: keep-all
- 이미지는 figma/images/ 폴더 참고
```

---

## 6. 알려진 한계 및 향후 개선 포인트

| 이슈 | 원인 | 해결 방향 |
|------|------|-----------|
| 이미지 자동 매핑 실패 | 디자인 레이어명 ≠ 에셋 파일명 | 명명 컨벤션 통일 (디자이너 협의 필요) |
| F-top(네비게이션) 미배치 | 섹션 감지 로직이 최상단 GROUP 제외 | `--section-prefix` 또는 수동 지정 |
| styledTextSegments 미지원 | REST API 한계 (Plugin API 전용) | Figma Plugin으로 추출 후 병합 |
