# Deep Interview Spec: Figma Raw JSON Exporter Plugin

## Metadata
- Interview ID: di-figma-plugin-001
- Rounds: 7
- Final Ambiguity Score: 17.5%
- Type: greenfield
- Generated: 2026-03-06
- Threshold: 20%
- Status: PASSED

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.90 | 40% | 0.36 |
| Constraint Clarity | 0.80 | 30% | 0.24 |
| Success Criteria | 0.75 | 30% | 0.225 |
| **Total Clarity** | | | **0.825** |
| **Ambiguity** | | | **17.5%** |

## Goal
Figma 플러그인에서 현재 선택된 단일 프레임의 Figma Plugin API 노드 트리를 JSON으로 추출하여, 플러그인 UI에 자동으로 표시하고 로컬 .json 파일로 다운로드할 수 있게 한다. 추출된 JSON은 AI 코딩 도구(Claude, Cursor 등)에 입력할 목적으로 사용된다.

## Tech Stack
- **Framework**: Vite + React + TypeScript
- **Package Manager**: pnpm
- **Target**: Figma Desktop Plugin (Plugin API)

## Constraints
- 단일 프레임만 처리 (다중 선택 불필요)
- JSON 형식: Figma Plugin API 노드 트리 그대로 (fills, strokes, layoutMode, children 등 모든 속성 포함)
- UI 표시: pretty-print JSON 문자열을 스크롤 가능한 텍스트 영역에 표시
- 저장: 로컬 .json 파일 다운로드 (브라우저 download API 활용)
- 자동 갱신: Figma에서 노드 선택 변경 시 플러그인 UI 자동 업데이트

## Non-Goals
- 여러 프레임 동시 선택 처리 없음
- 외부 서버 전송 없음
- JSON 트리 뷰어/파싱/필터링 없음
- REST API 연동 없음
- 코드 하이라이팅 없음

## Acceptance Criteria
- [ ] Figma에서 프레임을 선택하면 플러그인 UI가 자동으로 해당 프레임의 JSON을 표시한다
- [ ] 프레임 선택을 변경하면 UI의 JSON이 즉시 갱신된다
- [ ] 프레임이 선택되지 않은 경우 적절한 안내 메시지가 표시된다
- [ ] [다운로드] 버튼 클릭 시 `{frameName}.json` 파일이 로컬에 저장된다
- [ ] JSON은 2-space indent로 pretty-print된다
- [ ] 텍스트 영역은 스크롤 가능하다
- [ ] pnpm으로 설치, `pnpm dev`로 개발 빌드, `pnpm build`로 프로덕션 빌드가 된다

## Technical Architecture

### Figma Plugin 구조
```
plugin/
├── manifest.json          # Figma 플러그인 메타데이터
├── src/
│   ├── main.ts            # 플러그인 메인 코드 (Figma sandbox)
│   │   └── figma.ui.postMessage / figma.on('selectionchange')
│   └── ui/
│       ├── main.tsx       # React 진입점
│       ├── App.tsx        # 메인 컴포넌트 (JSON 표시 + 다운로드 버튼)
│       └── index.html
├── vite.config.ts
├── tsconfig.json
└── package.json
```

### 데이터 흐름
```
Figma 캔버스 (선택 변경)
  → main.ts: figma.on('selectionchange')
  → 선택된 노드 직렬화 (JSON.stringify 가능한 형태로)
  → figma.ui.postMessage({ type: 'selection', data: nodeJson })
  → ui/App.tsx: window.onmessage 수신
  → useState로 JSON 문자열 저장
  → <textarea> 렌더링
  → [다운로드] 버튼 → Blob + createObjectURL → a.click()
```

### 핵심 구현 포인트
- `figma.currentPage.selection[0]` 으로 선택된 노드 접근
- Figma 노드는 순환참조가 있으므로 직렬화 전 안전한 변환 필요
- `JSON.stringify(node, null, 2)` 직접 사용 불가 → Figma Plugin API의 `figma.clientStorage` 또는 커스텀 직렬화 함수 필요
- postMessage로 sandbox(main.ts) ↔ iframe(ui) 통신

## Assumptions Exposed & Resolved
| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| "raw data" = 모든 속성 | "어떤 속성이 필요한가?" | Figma Plugin API 노드 트리 전체 (AI 코딩 도구 입력용이라 최대한 많이) |
| 다중 선택 가능 | "여러 프레임 선택 시?" | 단일 프레임만 처리 |
| 수동 버튼으로 추출 | "언제 JSON이 갱신되나?" | 선택 변경 시 자동 갱신 |
| 복잡한 UI 필요 | "UI 어떻게?" | simple textarea + 다운로드 버튼 |

## Interview Transcript
<details>
<summary>Full Q&A (7 rounds)</summary>

### Round 1
**Q:** "raw data json을 저장해온다"고 하셨는데, 저장 대상이 정확히 무엇인가요?
**A:** 선택한 프레임
**Ambiguity:** ~85%

### Round 2
**Q:** 추출한 JSON을 어디에 "저장"하나요?
**A:** 플러그인 UI에 표시하고 로컬 다운로드 제공
**Ambiguity:** ~72%

### Round 3
**Q:** "raw data"가 구체적으로 어떤 형태인가요?
**A:** 어떤 방향이 좋은지 모르겠다
**Ambiguity:** ~68%

### Round 4
**Q:** 저장한 JSON을 궁극적으로 어디에 쓰나요?
**A:** AI 코딩 도구에 입력 (→ Figma Plugin API 노드 트리 형태 결정)
**Ambiguity:** ~52%

### Round 5
**Q:** 플러그인 사용 흐름을 구체적으로 거령해주세요.
**A:** 선택 시 자동으로 JSON 갱신 + [다운로드] 버튼
**Ambiguity:** ~28%

### Round 6
**Q:** 피그마에서 여러 프레임을 동시에 선택하면 어떻게 처리할까요?
**A:** 여러 프레임 동시 선택은 없음 (단일만)
**Ambiguity:** ~23%

### Round 7
**Q:** UI에서 JSON을 어떻게 표시할까요?
**A:** 텍스트 영역에 raw JSON
**Ambiguity:** 17.5% ✅

</details>
