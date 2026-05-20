# 작업 결정 로그 — VESSL-AI 피그마 추출 파이프라인

> 작성일: 2026-05-12  
> 배경: Claude와의 딥 인터뷰 + 구현 작업 요약

---

## 왜 이 작업을 시작했나

피그마 시안(PC/TB/MB)을 바탕으로 이벤트 페이지를 만드는데, 시안 전체를 한 덩어리 JSON으로 AI에 넘기면 **토큰 소비가 너무 많아** 작업 효율이 떨어졌다.

그래서 `parse_figma.mjs`로 섹션별로 쪼개는 방식을 직접 만들었다.  
핵심 워크플로우:
```
Figma 시안 → raw JSON → 섹션별 JSON + spec.txt → Claude에 섹션 단위로 구현 요청
```

목표는 Claude가 섹션 JSON 하나(또는 인덱스 파일 하나)만 받아도 해당 영역을 바로 Vue/React로 구현할 수 있는 상태로 만드는 것.

---

## 어떤 문제가 있었나

### 문제 1. 이미지 파일명 불일치 (핵심 불편함)

- JSON에 `imageSlot.suggestedPath: ./images/img.png`로 기록됨
- 피그마에서 직접 다운로드한 실제 파일명은 `img01.png`, `img02.png` 등으로 달랐음
- 결과적으로 JSON이 가리키는 경로에 파일이 없어서 수동으로 일일이 연결해야 했음

**원인 분석:**  
피그마 image fill 노드의 이름("img", "intro")은 레이어 이름이고, 실제 이미지 에셋 이름("img01", "mainbanner")은 별도로 관리되기 때문.  
두 이름이 같은 컨벤션을 따르지 않으면 자동 매핑이 불가능하다.

**추가로 발견된 원인:**  
피그마 공유 라이브러리에서 가져온 image fill은 `/v1/files/{key}/images` REST API가 URL을 반환하지 않음.  
이미지 모음 전용 프레임(183:3577)을 렌더 API로 따로 내보내야 한다.

### 문제 2. IMAGE fill이 파싱 과정에서 사라지는 버그

`parse_figma.mjs`의 `parseFills()` 함수가 SOLID, GRADIENT 타입만 처리하고  
`type: IMAGE`는 빈 배열 `[]`로 반환하고 있었다.  
즉, 섹션 JSON에 **이미지 정보가 아예 포함되지 않고** 있던 것.  
이 버그가 이미지 연결 문제보다 더 근본적이었다.

### 문제 3. 이미지 다운로드를 완전히 수동으로 해야 했다

`figma_extract.py`에 이미지 다운로드 기능이 없는 줄 알고 피그마 UI에서 직접 내보내고 있었다.  
스크립트에 `--types png` 옵션이 있었으나 **프레임 전체를 단일 PNG**로 내보내는 기능이라 에셋 개별 추출과는 달랐다.

### 문제 4. 섹션 순서가 Claude에 전달되지 않음

섹션 JSON 파일이 `pc_Intro.json`, `pc_Problem.json` 형태로 생성되지만,  
"순서대로 다 만들어" 라고 지시할 방법이 없었다.  
Claude에 파일을 하나씩 @참조로 넘겨야 했고, 순서를 별도로 설명해야 했다.

---

## 어떤 결정을 했나

### 결정 1. 섹션 분할 방식 유지 (Contrarian 검증)

"raw JSON 하나에 '섹션 N만 봐'라고 지시해도 되지 않나?"라는 반론을 검토했다.  
→ **섹션 분할 방식 유지**로 결론.  
이유: 실제로 써보니 토큰 절약 효과가 있고, 섹션별 spec.txt가 AI 지시에 도움이 된다.

### 결정 2. 이미지 다운로드 방식은 AI 판단에 위임

이미지를 어떻게 받을지 특정 방식을 고집하지 않기로 했다.  
`figma_extract.py`가 `--image-node` 옵션으로 처리.

### 결정 3. 섹션 순서는 인덱스 파일로 해결, 파일명 변경 없이

파일명에 번호를 붙이는 방식(`pc_01_Intro.json`) 대신  
`{prefix}_index.md` 인덱스 파일 생성 방식을 선택.  
이유: 파일명 변경은 기존 스크립트나 다른 참조에 영향을 줄 수 있고, 인덱스 파일 하나로 @참조 전달이 더 직관적.

### 결정 4. 타겟 프로젝트는 Vue 우선, React 호환

넘기는 JSON/spec 포맷 자체는 Vue/React 무관하게 동일.  
구현 요청 시 "Vue로 만들어줘" 또는 "React로 만들어줘"만 바꾸면 된다.

---

## 코드를 어떻게 개선했나

### figma_extract.py

| 개선 항목 | 이전 | 이후 |
|-----------|------|------|
| imageRef 수집 | image fill의 Figma 내부 해시 미포함 | `imageSlot.imageRef` 필드 추가 |
| 이미지 에셋 다운로드 | 없음 | `--image-node URL`로 이미지 모음 프레임 자식을 개별 PNG 내보내기 |
| actualPath 주입 | 없음 | 다운로드 파일명 = slotId인 경우 `imageSlot.actualPath` 자동 기입 |
| --types 옵션 | structure, design, tokens, manifest, png | 위에 `images` 추가 |

**`--image-node`가 필요한 기술적 이유:**  
Figma shared library 이미지는 `/v1/files/{key}/images` API에서 URL을 반환하지 않는다.  
이미지 모음 프레임의 자식 노드 ID를 렌더 API(`/v1/images/{key}?ids=...`)에 요청하는 우회 방식으로 해결.

### parse_figma.mjs

| 개선 항목 | 이전 | 이후 |
|-----------|------|------|
| IMAGE fill 처리 | 미처리 → 유실 | `{ type: 'image', imageSlot: {...} }` 보존 |
| spec.txt 이미지 출력 | `fi.stops` 접근 → 크래시 가능 | `fill: image  slot=xxx  path=xxx` 출력 |
| 섹션 순서 인덱스 | 없음 | `{prefix}_index.md` 자동 생성 (매 실행마다) |

---

## 아직 해결 안 된 것

### 이미지 slotId ↔ 파일명 자동 매핑

근본 원인은 **피그마 레이어 명명 컨벤션**이다.

- 디자인 레이어: "img", "li", "intro" (범용적인 이름)
- 이미지 에셋: "img01", "img02", "mainbanner" (설명적인 이름)

둘이 같은 이름을 쓰지 않으면 자동 연결은 불가능하다.  
→ **단기 해결책:** `figma/image-mapping.json`의 `manual_mapping`을 1회 직접 작성.  
→ **근본 해결:** 디자이너와 레이어 명명 컨벤션 합의 필요.

---

## 다음 프로젝트에서 달라지는 점

| 항목 | 이전 | 이후 |
|------|------|------|
| 이미지 다운로드 | 피그마 UI에서 수동 내보내기 | `--image-node` 옵션으로 자동 다운로드 |
| 섹션 순서 전달 | 파일을 하나씩 @참조, 순서 별도 설명 | `@{시안}_index.md` 하나로 순서 포함 전달 |
| 이미지 연결 | 완전 수동 | `image-mapping.json`에 1회 작성 후 재사용 |
| 추출 커맨드 | 여러 단계 수동 | 2줄 커맨드로 표준화 |
