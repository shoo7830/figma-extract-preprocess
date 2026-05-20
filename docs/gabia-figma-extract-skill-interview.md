# /gabia-figma-extract 스킬 설계 인터뷰 보고서

**작성일:** 2026-05-19  
**작성자:** Evan(이정규)  
**방법론:** oh-my-claudecode Deep Interview (Socratic 소크라테스 방식, 수학적 모호도 측정)

---

## 개요

Figma 시안(PC/TB/MB)에서 raw JSON과 이미지 에셋을 자동 추출하고 섹션별 파싱까지 완료하는 대화형 스킬 설계를 위해 Claude Code와 딥 인터뷰를 진행했습니다.

총 **8라운드** 인터뷰를 통해 모호도를 **100% → 9%** 로 낮췄습니다.

---

## 딥 인터뷰 과정

### 시작 시 아이디어 (plan.md)

```
- 피그마 로우 파일 및 이미지 파일을 피그마로부터 가져오는 스킬 제작
- 대화형으로 노드 경로 입력받기
- 피그마 토큰 요청 (없으면 진행 기각)
- 피그마 파일은 .zshrc에 전역 저장
- 폴더명도 프롬프트로 받기
- node parse_figma.mjs 실행까지 하면 완료
```

### 모호도 변화 추이

| 라운드 | 질문 주제 | 모호도 | 핵심 발견 |
|--------|-----------|--------|-----------|
| 시작 | — | 100% | 아이디어만 있는 상태 |
| R1 | 노드 경로 형식 | 33% | 전체 Figma URL 입력 확정 |
| R2 | 다중 노드 입력 방식 | 26% | 한 번에 여러 URL, 안내 메시지 중요 |
| R3 | 추출 타입 결정 | 20% | raw + 이미지 항상 둘 다 |
| R4 | env var 이름 | 15% | FIGMA_TOKEN만 (.zshrc) |
| R5 | 스킬 저장 위치 | 13% | 현 프로젝트 → 추후 전역 배포 |
| R6 | 스킬 호출 이름 | — | /gabia-figma-extract 확정 |
| Confluence 검토 | 페이지 259092043 | — | **핵심 차이점 3가지 발견** |
| R7 | --image-node 여부 | — | 거의 없음 (선택 입력) |
| R7 | PC/TB/MB 구성 | — | 3개 필수, 없으면 경고 후 중단 |
| R8 | URL 저장 방식 | 9% | FIGMA_FILE 없음, 매번 직접 입력 |

---

## 핵심 의사결정 기록

### 결정 1. 노드 URL 형식: 전체 URL
- **선택:** `https://www.figma.com/design/...?node-id=137-800` 전체 URL
- **이유:** 기존 figma_extract.py의 `--url` 인자와 동일, 별도 파싱 불필요

### 결정 2. 추출 타입: raw,images 고정
- **선택:** `--types raw,images` 항상 실행 (선택 없음)
- **이유:** 항상 JSON과 이미지 에셋이 모두 필요함. 선택지를 주면 오히려 번거로움
- **주의:** 초기 인터뷰에서 `--types raw png` 로 잘못 파악 → Confluence 확인 후 `raw,images` 로 수정

### 결정 3. FIGMA_TOKEN만 .zshrc 저장
- **선택:** FIGMA_TOKEN 하나만 env var로 관리
- **이유:** Figma 파일 URL은 프로젝트마다 달라서 매번 직접 입력이 맞음
- **오해 해소:** plan.md의 "피그마 파일은 .zshrc에 전역 저장" = FIGMA_TOKEN을 의미

### 결정 4. PC/TB/MB 3개 필수
- **선택:** URL 3개 모두 없으면 경고 후 중단
- **이유:** 반응형 구현이 목적이므로 3개 시안이 항상 필요함

### 결정 5. --image-node 선택 입력
- **선택:** 입력 안 해도 됨 (없으면 `--image-node` 인자 생략)
- **이유:** 실제로 이미지 모음 프레임을 따로 만들어두는 경우가 거의 없음

### 결정 6. 스킬 저장 위치 및 배포 전략
- **현재:** `skill/gabia-figma-extract.md` (현 프로젝트 로컬)
- **처음부터 전역으로 만들까?** 라는 선택지를 검토했으나 **로컬 먼저**로 결정
- **이유:** `figma_extract.py`, `parse_figma.mjs` 가 아직 개선 중이라 전역 스킬에 복사하면 두 곳을 따로 관리해야 하는 동기화 부담이 생김
- **미래 계획:** 스크립트가 안정화된 후 별도 저장소(`gabia-figma-extract-skill`)로 이전, `~/.claude/skills/` 에 설치하는 전역 스킬로 배포

| | 로컬 먼저 (선택) | 처음부터 전역 |
|---|---|---|
| 스크립트 관리 | figma-json-exporter 한 곳 | 두 곳 동기화 필요 |
| 나중에 이전 작업 | 필요 (파일 2개 복사, 경로 수정 불필요) | 없음 |
| 개발 편의성 | 높음 | 보통 |
| 다른 프로젝트 사용 | 가능 (readlink 절대 경로 방식) | 가능 |

### 결정 7. parse_figma.mjs 위치: 루트 → skill/scripts/ 이동
- **변경:** 최초 스펙에서 `parse_figma.mjs`는 프로젝트 루트에 위치
- **문제 발견:** `figma_extract.py`는 `skill/scripts/`에 있는데 `parse_figma.mjs`만 루트에 있어 전역 배포 시 따로 챙겨야 하는 불일치
- **결정:** `skill/scripts/parse_figma.mjs`로 이동 — 스킬 관련 파일을 한 곳에 모아 폴더째로 이동 가능하게 구조화

### 결정 8. 스크립트 경로: 상대 경로 → readlink 절대 경로
- **문제:** 스킬 파일에 `python3 skill/scripts/figma_extract.py`처럼 상대 경로 사용 시 CWD가 figma-json-exporter 루트일 때만 동작 → 다른 프로젝트에서 호출하면 즉시 실패
- **해결:** `readlink -f ~/.claude/skills/gabia-figma-extract/SKILL.md` 로 심링크를 따라 절대 경로 계산
  ```bash
  SKILL_DIR=$(dirname "$(readlink -f ~/.claude/skills/gabia-figma-extract/SKILL.md)")
  SCRIPTS_DIR="$SKILL_DIR/scripts"
  ```
- **장점:** 어느 디렉토리에서 호출해도 동작, 전역 배포 후에도 경로 수정 불필요

---

## Confluence 검토에서 발견한 핵심 사항

> **페이지:** [Figma Raw데이터 추출 SKILL 개선안](https://confluence.gabia.com/spaces/o2cplaform/pages/259092043)

인터뷰 중반에 plan.md에 명시된 Confluence 페이지를 확인하지 않고 진행하다가, Evan의 지적으로 뒤늦게 확인함. 그 결과 **스펙에서 3가지 중요한 오류**를 수정했습니다:

| 항목 | 인터뷰 중 추정 | Confluence 확인 후 수정 |
|------|---------------|----------------------|
| 추출 타입 | `--types raw png` | `--types raw,images` |
| 이미지 처리 | 따로 없음 | `--image-node` 옵션으로 이미지 모음 프레임 지정 |
| URL 전달 방식 | 줄바꿈으로 여러 개 | `--url` 플래그 반복 (PC/TB/MB 각각) |

**교훈:** 스킬 설계 전에 관련 문서(Confluence 등)를 먼저 확인해야 인터뷰 효율이 높아짐.

---

## 최종 스펙 요약

### 스킬 정보
- **이름:** gabia-figma-extract
- **호출:** `/gabia-figma-extract`
- **위치:** `skill/gabia-figma-extract.md`

### 실행 흐름

```
1. 스크립트 경로 확인 (readlink로 절대 경로 계산)

2. FIGMA_TOKEN 확인 (.zshrc)
   └─ grep -E '^export FIGMA_TOKEN=' 으로 정확히 파싱
   └─ 없으면: 프롬프트로 입력 요청 → .zshrc에 저장 → 거부하면 중단

3. 폴더명 입력 (필수, 기본값 없음)
   └─ 특수문자 validation (공백, /, \ 불가)
   └─ 이미 존재하는 폴더면 덮어쓰기 경고 + y/n 확인

4. PC URL 입력 (필수)
5. TB URL 입력 (필수)
6. MB URL 입력 (필수)
   └─ 3개 중 하나라도 비어있으면: 경고 메시지 출력 후 중단

7. 이미지 모음 프레임 URL 입력 (선택, 없으면 엔터)

8. 실행 전 요약 확인 (y/n)
   └─ 폴더명, PC/TB/MB URL, 이미지 프레임, 스크립트 경로 표시

9. 실행:
   FIGMA_TOKEN="..." python3 "$SCRIPTS_DIR/figma_extract.py" \
     --url "{PC_URL}" --url "{TB_URL}" --url "{MB_URL}" \
     [--image-node "{IMG_URL}"] \
     --types raw,images --output ./{folder}

10. raw JSON 생성 확인
    └─ *_raw.json 파일 없으면: 실패 원인 힌트 출력 후 중단
    └─ (주요 원인: 토큰 만료 / node-id 오류 / 네트워크 오류)

11. 실행:
    node "$SCRIPTS_DIR/parse_figma.mjs" --dir ./{folder} --out ./{folder}/parsed

12. 완료 메시지 출력
```

### 출력 구조
```
{folder}/
├── pc_raw.json
├── tb_raw.json
├── mb_raw.json
├── images/          ← 이미지 에셋 (--image-node 사용 시)
└── parsed/
    ├── pc_index.md  ← Claude에 @참조로 전달
    ├── tb_index.md
    ├── mb_index.md
    ├── pc_Intro.json + .spec.txt
    └── ...
```

---

## 전체 파이프라인에서의 위치

```
[이 스킬]                    [다음 단계]
/gabia-figma-extract   →   Claude에 @figma/parsed/pc_index.md 참조
                            → "세 시안을 반응형으로 구현해줘."
                            → 반응형 Vue 페이지 자동 생성
```

---

## 스킬 구현 후 개선 이력

### 2026-05-19 — 초기 구현 후 5가지 문제 발견 및 개선

스킬 파일 초안 작성 후 코드 리뷰를 통해 아래 문제를 발견하고 즉시 개선했습니다.

| 우선순위 | 문제 | 개선 내용 |
|----------|------|-----------|
| P1 🔴 | 스크립트 경로가 CWD에 묶여 다른 프로젝트에서 호출 시 즉시 실패 | `readlink -f`로 절대 경로 계산 (Phase 1 추가) |
| P2 🟠 | `grep FIGMA_TOKEN`이 주석·유사 변수명도 매칭 | `grep -E '^export FIGMA_TOKEN='` + `sed` 파싱으로 교체 |
| P3 🟠 | 6개 입력 후 바로 실행 — URL 오타 확인 불가 | 실행 전 요약 + y/n 확인 단계 추가 (Phase 6) |
| P4 🟡 | 기존 폴더 덮어쓰기 경고 없음 | 폴더 존재 확인 + 덮어쓰기 경고 + y/n (Phase 3) |
| P5 🟡 | Phase 5 실패 시 Phase 6(parse)로 진입 가능 | raw JSON 생성 확인 단계 추가 (Phase 8) |

**부가 변경:** `parse_figma.mjs`를 프로젝트 루트에서 `skill/scripts/`로 이동 — 스킬 관련 파일 일원화 및 전역 배포 시 경로 수정 불필요.

---

## 다음 단계

### 단기 (로컬 스킬 완성)
- [x] `skill/gabia-figma-extract.md` 스킬 파일 작성
- [x] 5가지 문제 개선 (경로 절대화, TOKEN 파싱, 실행 전 확인, 폴더 중복 경고, Phase guard)
- [x] `parse_figma.mjs` → `skill/scripts/` 이동
- [ ] 실제 프로젝트에서 동작 검증

### 장기 (전역 배포)
스크립트 안정화 후 아래 구조로 별도 저장소 생성:

```
gabia-figma-extract-skill/       ← 새 git 저장소
├── SKILL.md
└── scripts/
    ├── figma_extract.py         ← skill/scripts/figma_extract.py 복사
    └── parse_figma.mjs          ← skill/scripts/parse_figma.mjs 복사
```

- [ ] `git clone <repo> ~/.claude/skills/gabia-figma-extract` 설치 검증
- [ ] 심링크 제거 (readlink 방식으로 경로 수정 불필요)
- [ ] 팀 공유 또는 omc 배포 검토

---

## 참고 자료

- [Confluence: Figma Raw데이터 추출 SKILL 개선안](https://confluence.gabia.com/spaces/o2cplaform/pages/259092043)
- [스펙 파일](.omc/specs/deep-interview-figma-skill.md)
- `skill/scripts/figma_extract.py`
- `skill/scripts/parse_figma.mjs`
