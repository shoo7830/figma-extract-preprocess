---
name: gabia-figma-extract
description: PC/TB/MB Figma 시안 URL을 대화형으로 입력받아 figma_extract.py로 raw JSON + 이미지를 추출하고, parse_figma.mjs로 섹션별 파싱까지 자동 완료하는 스킬. "피그마 추출", "figma extract", "피그마 시안 가져와", "/gabia-figma-extract" 등의 요청 시 사용.
---

# Gabia Figma Extract

PC/TB/MB Figma 시안에서 raw JSON과 이미지 에셋을 추출하고, 섹션별 파싱까지 한 번에 완료합니다.
어느 디렉토리에서 호출해도 동작합니다.

## 워크플로우

```
1. 스크립트 경로 확인
2. FIGMA_TOKEN 확인 (.zshrc)
3. 폴더명 입력 (필수, 중복 경고 포함)
4. PC / TB / MB URL 입력 (각각 필수)
5. 이미지 모음 프레임 URL 입력 (선택)
6. 실행 전 요약 확인
7. figma_extract.py 실행
8. raw JSON 생성 확인
9. parse_figma.mjs 실행
10. 완료 메시지 출력
```

---

## Phase 1: 스크립트 경로 확인

심링크를 따라 스크립트의 절대 경로를 계산한다.

```bash
readlink -f ~/.claude/skills/gabia-figma-extract/SKILL.md
```

결과 경로에서 `SKILL_DIR`(SKILL.md가 위치한 디렉토리)과 `SCRIPTS_DIR`을 도출한다:

```
SKILL_DIR  = $(dirname 위 결과)
SCRIPTS_DIR = $SKILL_DIR/scripts
```

예시:
```
readlink 결과: /Users/evan/figma-json-exporter/skill/gabia-figma-extract.md
SKILL_DIR:     /Users/evan/figma-json-exporter/skill
SCRIPTS_DIR:   /Users/evan/figma-json-exporter/skill/scripts
```

이후 모든 스크립트 호출은 `$SCRIPTS_DIR` 절대 경로를 사용한다.
CWD는 사용자의 현재 작업 디렉토리 그대로 유지한다.

---

## Phase 2: FIGMA_TOKEN 확인

```bash
grep -E '^export FIGMA_TOKEN=' ~/.zshrc | tail -1 | sed 's/export FIGMA_TOKEN=["'"'"']\(.*\)["'"'"']/\1/'
```

- 값이 정상적으로 추출되면 이후 단계에서 `FIGMA_TOKEN` 환경변수로 사용한다.
- 빈 문자열이 반환되면(없거나 파싱 실패) 사용자에게 입력을 요청한다:

  > `FIGMA_TOKEN`이 `.zshrc`에 없습니다. Figma Personal Access Token을 입력해주세요.
  > (Figma → 계정 설정 → Security → Personal access tokens)

  - 입력하면: `echo 'export FIGMA_TOKEN="<입력값>"' >> ~/.zshrc` 로 저장 후 계속 진행
  - 입력 거부(빈 값 또는 취소)하면: "FIGMA_TOKEN이 없어 실행을 중단합니다." 출력 후 종료

---

## Phase 3: 폴더명 입력

사용자에게 출력 폴더명을 묻는다.

> 출력 폴더명을 입력해주세요. (예: figma, vessl, my-project)

- 기본값 없음 — 빈 값이면 다시 묻는다.
- 폴더명에 공백, `/`, `\` 등 특수문자가 포함되면 경고 후 다시 묻는다:
  > 폴더명에 공백이나 특수문자는 사용할 수 없습니다. 다시 입력해주세요.
- 입력값을 `FOLDER` 변수로 저장한다.

**폴더 중복 확인:**

```bash
test -d "./<FOLDER>"
```

이미 존재하면:

> `./<FOLDER>` 폴더가 이미 존재합니다. 계속하면 기존 파일이 덮어씌워질 수 있습니다.
> 계속하시겠습니까? (y/n)

- `y`: 계속 진행
- `n` 또는 기타: 종료

---

## Phase 4: PC / TB / MB URL 입력

아래 순서로 각각 프롬프트한다:

> PC 시안 URL을 입력해주세요.
> (예: https://www.figma.com/design/ABC123/MyFile?node-id=1-23)

> TB 시안 URL을 입력해주세요.

> MB 시안 URL을 입력해주세요.

**3개 중 하나라도 빈 값이면:**

> PC/TB/MB URL은 모두 필수입니다. 입력되지 않은 항목이 있어 실행을 중단합니다.

출력 후 종료한다.

---

## Phase 5: 이미지 모음 프레임 URL 입력 (선택)

> 이미지 모음 프레임 URL이 있으면 입력해주세요. (없으면 엔터)

- 입력하면 `IMAGE_NODE` 변수로 저장하고 `--image-node` 인자에 추가한다.
- 빈 값이면 `--image-node` 인자를 생략한다.

---

## Phase 6: 실행 전 요약 확인

수집한 값을 요약해 보여주고 확인을 받는다:

```
─────────────────────────────────────
실행 전 확인
─────────────────────────────────────
출력 폴더  : ./<FOLDER>
PC URL     : <PC_URL>
TB URL     : <TB_URL>
MB URL     : <MB_URL>
이미지 프레임: <IMAGE_NODE | "없음">
스크립트   : <SCRIPTS_DIR>
─────────────────────────────────────
위 내용으로 실행하시겠습니까? (y/n)
```

- `y`: Phase 7로 진행
- `n` 또는 기타: "실행을 취소했습니다." 출력 후 종료

---

## Phase 7: figma_extract.py 실행

```bash
FIGMA_TOKEN="<Phase 2에서 읽은 값>" python3 "$SCRIPTS_DIR/figma_extract.py" \
  --url "<PC_URL>" \
  --url "<TB_URL>" \
  --url "<MB_URL>" \
  [--image-node "<IMAGE_NODE>"] \
  --types raw,images \
  --output ./<FOLDER>
```

- `--image-node` 인자는 Phase 5에서 값을 입력했을 때만 추가한다.
- 실행 중 오류가 발생하면 에러 메시지를 그대로 출력하고 Phase 8로 넘어가지 않고 종료한다.

---

## Phase 8: raw JSON 생성 확인

```bash
ls ./<FOLDER>/*_raw.json 2>/dev/null
```

파일이 하나도 없으면:

> figma_extract.py가 raw JSON을 생성하지 못했습니다. 위 에러를 확인해주세요.
> (주요 원인: 토큰 만료 / node-id 오류 / 네트워크 오류)

출력 후 종료한다. 파일이 존재하면 Phase 9로 진행한다.

---

## Phase 9: parse_figma.mjs 실행

```bash
node "$SCRIPTS_DIR/parse_figma.mjs" --dir ./<FOLDER> --out ./<FOLDER>/parsed
```

- 실행 중 오류가 발생하면 에러 메시지를 그대로 출력하고 중단한다.

---

## Phase 10: 완료 메시지 출력

```
완료되었습니다.

출력 구조:
  ./<FOLDER>/
  ├── *_raw.json          ← PC/TB/MB raw JSON
  ├── images/             ← 이미지 에셋 (--image-node 사용 시)
  └── parsed/
      ├── pc_index.md     ← Claude에 @참조로 전달
      ├── tb_index.md
      ├── mb_index.md
      └── *.json / *.spec.txt

다음 단계:
  @<FOLDER>/parsed/pc_index.md 등을 참조해 반응형 구현을 요청하세요.
  예: "세 시안을 반응형으로 구현해줘."
```

---

## 출력 구조 참고

```
{folder}/
├── pc_raw.json
├── tb_raw.json
├── mb_raw.json
├── images/              ← --image-node 사용 시
└── parsed/
    ├── pc_index.md
    ├── tb_index.md
    ├── mb_index.md
    ├── pc_Intro.json + .spec.txt
    └── ...
```

---

## 실제 커맨드 예시 (VESSL-AI 프로젝트)

```bash
FIGMA_TOKEN="figd_xxxx" python3 /path/to/skill/scripts/figma_extract.py \
  --url "https://www.figma.com/design/ilCLRjyByTdXm5GOMtVXGN/VESSL-AI?node-id=301-1658" \
  --url "https://www.figma.com/design/ilCLRjyByTdXm5GOMtVXGN/VESSL-AI?node-id=195-1374" \
  --url "https://www.figma.com/design/ilCLRjyByTdXm5GOMtVXGN/VESSL-AI?node-id=195-1373" \
  --types raw,images \
  --output ./figma

node /path/to/skill/scripts/parse_figma.mjs --dir ./figma --out ./figma/parsed
```

---

## 전역 배포 전환 계획

스크립트(`figma_extract.py`, `parse_figma.mjs`)가 안정화된 후 아래 구조로 별도 저장소를 만들어 전역 스킬로 배포:

```
gabia-figma-extract-skill/
├── SKILL.md
└── scripts/
    ├── figma_extract.py    ← skill/scripts/figma_extract.py 복사
    └── parse_figma.mjs     ← skill/scripts/parse_figma.mjs 복사
```

설치: `git clone <repo> ~/.claude/skills/gabia-figma-extract`

Phase 1의 `readlink` 방식을 그대로 사용하므로 경로 수정 불필요.
