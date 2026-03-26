# Figma JSON → AI 개발 가이드

피그마에서 추출한 세 가지 JSON 파일을 AI에게 효과적으로 전달하는 방법과 프롬프트 예시.

---

## 세 파일의 역할

| 파일 | 역할 | AI가 이 파일로 하는 일 |
|------|------|----------------------|
| `*_structure.json` | 레이아웃 뼈대 (크기, 위치, AutoLayout, padding, 정렬) | HTML/CSS 구조 잡기 |
| `*_design.json` | 시각 스타일 (색상, 폰트, 그림자, 테두리) | 스타일 적용 |
| `*_manifest.json` | 전체 컴포넌트 목록 + 이미지 슬롯 체크리스트 | 누락 없이 구현됐는지 검증 |

---

## 권장 워크플로우 (2단계)

구현과 검증을 **분리**하는 게 핵심이다.
한 요청에서 구현+검증을 동시에 시키면 AI가 둘 다 부실하게 처리한다.

```
1번 요청: structure.json + design.json → 구현에만 집중
2번 요청: manifest.json → 누락 검증에만 집중
```

---

## 1번 요청 — 구현

```
피그마 디자인을 React로 구현해줘.

## 레이아웃 구조 (structure.json)
[붙여넣기]

## 시각 스타일 (design.json)
[붙여넣기]
[이미지폴더경로]

규칙:
- layoutMode: HORIZONTAL/VERTICAL → flexbox direction
- itemSpacing → gap
- paddingLeft/Right/Top/Bottom → padding
- layoutSizingHorizontal: FILL → flex: 1 / FIXED → 고정 width / HUG → fit-content
- fills[].color → background-color 또는 color (rgba 변환)
- effects → box-shadow 또는 filter: drop-shadow
- cornerRadius → border-radius (배열이면 모서리 개별 적용)
- strokes → border
- styledTextSegments가 있으면 단일 fontName 대신 이 세그먼트 기준으로 span 분리
- 중요: 텍스트는 임의판단 금지!
```

---

## 2번 요청 — 누락 검증

```
방금 작성한 코드를 아래 체크리스트와 대조해서 빠진 항목을 찾아 보완해줘.

[manifest.json 붙여넣기]

확인 방법:
1. manifest의 totalComponents({{N}}개)만큼 구현됐는지 카운트해
2. components 배열을 순서대로 읽으면서 name/type 기준으로 대응 요소가 있는지 확인해
3. hasImage: true인 항목 → imageSlot.slotId 기준 <img>가 있는지 확인해
4. hasText: true인 항목 → textContent 값과 구현된 텍스트가 일치하는지 확인해 (임의 수정 금지)
5. 주요 컴포넌트(depth 0~1)의 width/height가 manifest 기준값과 10% 이상 차이나면 지적해
6. childCount가 있는 항목은 실제 자식 요소 개수와 일치하는지 확인해
7. 누락/불일치 목록을 먼저 나열하고, 보완된 전체 코드를 출력해
```

---

---

## 3번 요청 — 디자인 디테일 요청 , 컴포넌트 분할

```
(시안과 다른 부분을 개발자가 요청할것)
**예시**
- 프로젝트를 참고해서 컴포넌트화 시킬 수 있는것은 분할해줘
- 반응형 고려해서 개선해줘 (전역설정이 있다면 쓸것)
- 주요!
  - 버튼에 그라이데이션 효과가 들어간 테두리가 있고 이미지들도 테두리가 들어간 것이 있는데 전혀 반영되지 않았어 체크해서 반영해
  - 3개월 무료 이용하기 -> 서비스 신청하기 (텍스트는 임의판단금지)

```

---


## 소규모 페이지는 1번 요청에 manifest 포함 가능

페이지가 단순하면(컴포넌트 20개 이하) 한 번에 전달해도 되지만,
이 경우에도 **manifest는 마지막에** 두고 카운트 검증을 명시해야 한다.

```
피그마 디자인을 React로 구현해줘.

## structure.json
[붙여넣기]

## design.json
[붙여넣기]

## manifest.json (체크리스트)
[붙여넣기]

코드 작성 후, manifest의 totalComponents({{N}}개)가 모두 구현됐는지
스스로 카운트해서 누락이 있으면 바로 추가해줘.
이미지: imageSlot.slotId → src="./images/{slotId}.png"
```

---

## 대규모 페이지 분할 전략

페이지가 커서 한 번에 넘기기 어려울 때.

### 방법: manifest 기반 섹션 분할

```
# 1단계: 섹션 목록 확인
manifest.json을 보면 depth: 0인 항목이 최상위 섹션들이야.
각 섹션을 독립적으로 구현한 뒤 합칠 거야.

# 2단계: 섹션별 구현 (반복)
"[섹션명] 섹션만 구현해줘" 라고 하면서
해당 섹션에 해당하는 structure/design 일부만 잘라서 전달

# 3단계: 합치기
"지금까지 만든 섹션들을 하나의 페이지로 합쳐줘"
```

---

## manifest.json 구조 참고

```json
{
  "page": "MainPage",
  "totalComponents": 42,
  "imageSlotCount": 5,
  "textNodeCount": 18,
  "components": [
    {
      "id": "1",
      "name": "Header",
      "type": "FRAME",
      "depth": 0,
      "width": 1440,
      "height": 80,
      "childCount": 3,
      "hasText": false,
      "hasImage": false
    },
    {
      "id": "1.1",
      "name": "cta-label",
      "type": "TEXT",
      "depth": 1,
      "width": 160,
      "height": 24,
      "childCount": 0,
      "hasText": true,
      "hasImage": false,
      "textContent": "서비스 신청하기"
    },
    {
      "id": "1.2",
      "name": "hero-banner",
      "type": "RECTANGLE",
      "depth": 1,
      "width": 1440,
      "height": 600,
      "childCount": 0,
      "hasText": false,
      "hasImage": true,
      "imageSlot": {
        "slotId": "hero-banner",
        "role": "unknown",
        "expectedSize": { "width": 1440, "height": 600 },
        "aspectRatio": 2.4
      }
    }
  ]
}
```

- `id`: 계층 경로 (1.2.3 = 1번의 2번째 자식의 3번째 자식)
- `depth`: 0이 최상위 섹션
- `hasImage: true` + `imageSlot`: 이미지 파일 연결 필요한 슬롯
- `hasText: true` + `textContent`: 구현 텍스트와 대조할 기준값 (임의 수정 금지)
- `width` / `height`: depth 0~1 컴포넌트의 크기 검증 기준
- `childCount`: 자식 요소 개수 검증 기준
- `totalComponents`를 AI에게 명시하면 누락 체크에 활용 가능
