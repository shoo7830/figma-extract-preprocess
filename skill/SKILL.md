---
name: figma-extract
description: Figma REST API로 선택한 프레임의 JSON을 추출한다. 플러그인 없이 Figma URL만으로 structure/design JSON을 로컬에 저장한다. "figma extract", "피그마 JSON 추출", "figma-extract" 등의 요청 시 사용.
---

# Figma Extract

Figma REST API를 사용해 플러그인 없이 프레임 JSON을 추출합니다. `structure`와 `design` 두 가지 형식을 지원합니다.

## 사전 조건 (환경변수)

- `FIGMA_TOKEN` (필수): Figma Personal Access Token
  - Figma → 계정 설정 → Security → Personal access tokens

## 사용법

```bash
python3 ~/.claude/skills/figma-extract/scripts/figma_extract.py \
  --url "https://www.figma.com/design/ABC123/MyFile?node-id=1-23" \
  --output ./output
```

### 옵션

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `--url` | Figma 프레임 URL (필수) | - |
| `--output` | 저장 디렉토리 | 현재 디렉토리 |
| `--types` | 추출할 JSON 종류 (structure,design) | 전체 |

## 워크플로우

1. Figma에서 프레임 선택 → 우클릭 → **Copy link**
2. 링크를 `--url`에 전달
3. `{frameName}_structure.json`, `{frameName}_design.json` 생성

## 출력 파일

| 파일 | 내용 |
|------|------|
| `*_structure.json` | 레이아웃 뼈대 (크기, 위치, AutoLayout) |
| `*_design.json` | 시각 스타일 (색상, 폰트, 그림자, styledTextSegments) |

## 주의사항

- `styledTextSegments`는 Plugin API 전용 — REST API에서는 미지원
- 이미지 fill은 base64 대신 `imageSlot` 메타 객체로 대체됨
- Rate limit: 분당 약 60회 (단발성 호출이라 일반적으로 문제 없음)
