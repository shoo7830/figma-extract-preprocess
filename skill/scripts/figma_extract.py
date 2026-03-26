#!/usr/bin/env python3
"""
Figma Extract — REST API 기반 JSON 추출 스크립트
플러그인 없이 Figma URL로 structure/design/qa JSON을 추출합니다.
"""

import argparse
import json
import os
import re
import sys
import urllib.request
import urllib.error
from pathlib import Path


# ─── KEY SETS (App.tsx와 동일) ────────────────────────────────────────────────

STRUCTURE_KEYS = {
    "name", "type", "visible",
    "x", "y", "width", "height", "rotation",
    "layoutMode", "layoutAlign", "layoutGrow", "layoutPositioning", "layoutWrap",
    "layoutSizingHorizontal", "layoutSizingVertical",
    "primaryAxisAlignItems", "primaryAxisSizingMode",
    "counterAxisAlignItems", "counterAxisAlignContent", "counterAxisSizingMode",
    "counterAxisSpacing", "itemSpacing",
    "paddingLeft", "paddingRight", "paddingTop", "paddingBottom",
    "minWidth", "minHeight", "maxWidth", "maxHeight",
    "constraints", "clipsContent", "overflowDirection",
    "children", "fills",
}

DESIGN_KEYS = {
    "name", "type",
    "fills",
    "strokes", "strokeWeight", "strokeAlign",
    "effects", "opacity",
    "cornerRadius",
    "fontName", "fontSize", "fontWeight",
    "letterSpacing", "lineHeight",
    "textAlignHorizontal", "textAlignVertical",
    "characters",
    "children",
}

QA_KEYS = {
    "name", "type",
    "width", "height",
    "fills",
    "children",
}


# ─── URL 파싱 ──────────────────────────────────────────────────────────────────

def parse_figma_url(url: str) -> tuple[str, str]:
    """
    Figma URL에서 fileKey와 nodeId 추출.
    node-id는 URL에서 1-23 형식 → API용 1:23 형식으로 변환.
    """
    # fileKey 추출
    match = re.search(r"/(?:design|file)/([A-Za-z0-9]+)", url)
    if not match:
        raise ValueError(f"Figma URL에서 fileKey를 찾을 수 없습니다: {url}")
    file_key = match.group(1)

    # nodeId 추출
    match = re.search(r"node-id=([^&]+)", url)
    if not match:
        raise ValueError("URL에 node-id가 없습니다. Figma에서 프레임을 선택 후 Copy link 하세요.")
    node_id = match.group(1).replace("-", ":")

    return file_key, node_id


# ─── API 호출 ──────────────────────────────────────────────────────────────────

def figma_get(path: str, token: str) -> dict:
    url = f"https://api.figma.com/v1{path}"
    req = urllib.request.Request(url, headers={"X-Figma-Token": token})
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        raise RuntimeError(f"Figma API 오류 {e.code}: {body}")


def fetch_node(file_key: str, node_id: str, token: str) -> dict:
    encoded = urllib.parse.quote(node_id, safe="")
    data = figma_get(f"/files/{file_key}/nodes?ids={encoded}", token)
    nodes = data.get("nodes", {})

    # node_id 키 탐색 (1:23 또는 I1:23 형식 대응)
    for key in [node_id, node_id.replace(":", "-")]:
        if key in nodes:
            return nodes[key]["document"]

    raise RuntimeError(f"노드를 찾을 수 없습니다: {node_id}\n사용 가능한 키: {list(nodes.keys())}")


# ─── 변환 함수 (App.tsx 로직 재현) ────────────────────────────────────────────

def normalize_slot_id(node: dict) -> str:
    name = node.get("name", "") or ""
    return re.sub(r"[^a-z0-9\-]", "", name.lower().replace(" ", "-")) or "image-slot"


def transform_image_fill(node: dict) -> dict:
    width = round(node.get("width") or 0)
    height = round(node.get("height") or 0)
    return {
        "type": "IMAGE",
        "imageSlot": {
            "slotId": normalize_slot_id(node),
            "role": "unknown",
            "expectedSize": {"width": width, "height": height},
            "aspectRatio": round(width / height, 4) if height else 1,
        },
    }


def pick_keys(node: dict, keys: set) -> dict:
    result = {}
    for k, v in node.items():
        if k not in keys:
            continue
        if k == "fills" and isinstance(v, list):
            result["fills"] = [
                transform_image_fill(node) if f.get("type") == "IMAGE" else f
                for f in v
            ]
        elif k == "children" and isinstance(v, list):
            result["children"] = [pick_keys(child, keys) for child in v]
        else:
            result[k] = v
    return result


def pick_qa_keys(node: dict) -> dict:
    result = {}
    for k, v in node.items():
        if k not in QA_KEYS:
            continue
        if k == "fills" and isinstance(v, list):
            slots = [
                transform_image_fill(node)["imageSlot"]
                for f in v if f.get("type") == "IMAGE"
            ]
            if slots:
                result["fills"] = slots
        elif k == "children" and isinstance(v, list):
            result["children"] = [pick_qa_keys(child) for child in v]
        else:
            result[k] = v
    return result


# ─── 저장 ─────────────────────────────────────────────────────────────────────

def save_json(data: dict, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    size_kb = path.stat().st_size / 1024
    print(f"  저장: {path}  ({size_kb:.1f} KB)")


# ─── 메인 ─────────────────────────────────────────────────────────────────────

def main():
    import urllib.parse  # fetch_node에서 사용

    parser = argparse.ArgumentParser(description="Figma REST API JSON 추출기")
    parser.add_argument("--url", required=True, help="Figma 프레임 URL")
    parser.add_argument("--output", default=".", help="저장 디렉토리 (기본: 현재 디렉토리)")
    parser.add_argument(
        "--types",
        default="structure,design,qa",
        help="추출할 JSON 종류 (쉼표 구분, 기본: structure,design,qa)",
    )
    args = parser.parse_args()

    token = os.environ.get("FIGMA_TOKEN")
    if not token:
        print("오류: FIGMA_TOKEN 환경변수가 설정되지 않았습니다.", file=sys.stderr)
        print("  export FIGMA_TOKEN=figd_xxxx", file=sys.stderr)
        sys.exit(1)

    types = {t.strip() for t in args.types.split(",")}
    output_dir = Path(args.output)

    print(f"URL 파싱 중...")
    file_key, node_id = parse_figma_url(args.url)
    print(f"  fileKey: {file_key}")
    print(f"  nodeId:  {node_id}")

    print(f"Figma API 호출 중...")
    node = fetch_node(file_key, node_id, token)
    frame_name = node.get("name", "frame")
    slug = re.sub(r"[^a-zA-Z0-9가-힣_\-]", "_", frame_name)
    print(f"  프레임: {frame_name}")

    print(f"JSON 생성 중...")
    if "structure" in types:
        save_json(pick_keys(node, STRUCTURE_KEYS), output_dir / f"{slug}_structure.json")
    if "design" in types:
        save_json(pick_keys(node, DESIGN_KEYS), output_dir / f"{slug}_design.json")
    if "qa" in types:
        save_json(pick_qa_keys(node), output_dir / f"{slug}_qa.json")

    print(f"\n완료!")


if __name__ == "__main__":
    main()
