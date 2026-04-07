# Figma JSON → AI 프롬프트 가이드

피그마 익스포터로 추출한 JSON을 AI에게 전달할 때 바로 쓸 수 있는 프롬프트 모음이다.
아래 프롬프트들은 해석 규칙이 이미 포함되어 있으므로 **JSON만 붙여넣고 그대로 전송**하면 된다.

---

## 기본 흐름

```
1번 요청: structure.json으로 구조 먼저
2번 요청: design.json으로 디테일 보강 (필요할 때만)
3번 요청: 어긋난 섹션만 부분 수정
```

---

## 1번 프롬프트 — 구조 구현 (항상 여기서 시작)

> `structure.json` 전체 또는 섹션 일부를 붙여넣는다.

```text
피그마 구조 JSON을 기준으로 React 마크업과 레이아웃을 구현해줘.

## structure.json
[여기에 붙여넣기]

---

### 레이아웃 해석 규칙
- layoutMode: HORIZONTAL → flex-direction: row
- layoutMode: VERTICAL → flex-direction: column
- itemSpacing → gap
- paddingLeft / paddingRight / paddingTop / paddingBottom → padding 그대로 반영
- layoutSizingHorizontal: FILL → flex: 1 또는 width: 100%
- layoutSizingHorizontal: FIXED → 고정 width 값 사용
- layoutSizingHorizontal: HUG → fit-content 또는 width: auto
- children 계층 → DOM 계층 구조 그대로 유지

### 텍스트 규칙
- JSON에 있는 텍스트는 임의로 수정하거나 줄이지 말 것
- Title, Description, Text 같은 placeholder는 교체하지 말고 그대로 유지
- 내가 별도로 원문을 주는 경우에만 교체할 것

### 이미지 규칙
- 이미지 파일은 개발자가 프로젝트에 미리 받아둘 예정
- 아래 경로를 기준으로 연결만 할 것: /images/
- 이미지가 없으면 임의 URL을 만들지 말고 placeholder로 남길 것
- 콘텐츠 이미지는 <img src="..."> 우선
- 배경/장식용 이미지는 background-image: url(...) 고려

### 이 단계에서 제외할 것
- 색상, 폰트, border, radius, shadow, gradient는 이 단계에서 맞추지 않아도 됨
- 구조와 간격 정합도를 우선

### 출력 방식
- 전체 레이아웃 구조를 먼저 구현
- 컴포넌트로 분리하기 좋은 위치가 있으면 나눠서 구현
- 구조적으로 애매한 부분이 있으면 짧게 메모 후 구현
```

---

## 2번 프롬프트 — 디자인 디테일 보강 (필요할 때만)

> 1번 결과를 보고 색상·폰트·그림자 등이 아쉬울 때만 사용한다.  
> `design.json` 전체 또는 필요한 섹션만 붙여넣는다.

```text
방금 만든 코드의 구조는 유지하고 디자인 디테일을 보강해줘.

## design.json
[여기에 붙여넣기]

---

### 디자인 해석 규칙
- fills[].color → background-color 또는 color
- effects → box-shadow 또는 filter: drop-shadow
- cornerRadius → border-radius
- strokes / strokeWeight → border
- fontName / fontSize / fontWeight / lineHeight → 텍스트 스타일 그대로 반영
- fills[].type === "IMAGE" → img src 또는 background-image 처리
- styledTextSegments가 있으면 span 분리 고려

### 이미지 규칙
- 이미지 파일은 개발자가 프로젝트에 미리 받아둘 예정
- 아래 경로를 기준으로 연결만 할 것: /images/
- 새 이미지 주소를 임의로 만들거나 추정하지 말 것
- 콘텐츠 이미지는 <img src="..."> 우선
- 배경/장식용 이미지는 background-image: url(...) 고려

### 우선 반영할 것
- 색상
- 폰트 (크기, 굵기, 행간)
- border / border-radius
- shadow
- gradient
- 이미지 연결 방식

### 지킬 것
- 기존 DOM 구조는 불필요하게 바꾸지 말 것
- 텍스트 내용은 임의 수정 금지
- JSON에 없는 값은 추정해서 넣지 말 것

### 출력 방식
- 어떤 디테일을 반영했는지 짧게 정리
- 이어서 수정된 코드 전체 출력
```

---

## 3번 프롬프트 — 부분 수정

> 전체를 다시 보내지 말고, 어긋난 부분만 지목해서 수정한다.

```text
전체를 다시 만들지 말고 아래 항목만 수정해줘.

## 수정 요청
- [수정 내용 1]
- [수정 내용 2]
- [수정 내용 3]

---

### 지킬 것
- 기존 구조는 최대한 유지
- 텍스트 내용은 임의 수정 금지
- 요청한 항목 외에는 건드리지 말 것

### 출력 방식
- 수정한 이유를 한 줄로 설명
- 변경된 컴포넌트 또는 전체 코드 출력
```

---

## 큰 페이지는 섹션별로 나눠서 요청

페이지 전체를 한 번에 보내면 토큰이 무거워진다. 섹션 단위로 잘라서 반복한다.

```text
피그마 구조 JSON에서 [히어로 섹션]만 먼저 구현해줘.

## structure.json (히어로 섹션만)
[여기에 붙여넣기]

--- 위의 1번 프롬프트 규칙 그대로 포함 ---
```

순서 예시:
1. 히어로 섹션
2. 상품 리스트 섹션
3. 푸터 섹션
4. 전체 합치기

---

## 이미지 경로를 직접 지정할 때

`/images/` 대신 다른 경로를 써야 할 때는 프롬프트에 경로를 명시한다.

```text
이미지는 아래 경로 규칙에 맞게 연결해줘:
- 콘텐츠 이미지: /assets/images/파일명.png
- 배경 이미지: /assets/bg/파일명.png
파일이 없으면 임의로 만들지 말고 <!-- TODO: 이미지 경로 확인 --> 주석으로 표시해줘.
```

---

## 텍스트 검수가 필요할 때 (선택)

문구 누락이 의심될 때만 마지막에 manifest를 추가한다.

```text
아래 체크리스트를 기준으로 현재 코드에 텍스트 누락이 있는지 확인해줘.
수정은 하지 말고, 누락 항목만 목록으로 정리해줘.

## manifest.json
[여기에 붙여넣기]
```
