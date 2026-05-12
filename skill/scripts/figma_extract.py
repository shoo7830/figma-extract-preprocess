#!/usr/bin/env python3
"""
Figma Extract — REST API 기반 JSON 추출 스크립트
플러그인 없이 Figma URL로 structure/design/tokens/manifest JSON을 추출합니다.
"""

import argparse
import json
import os
import re
import ssl
import sys
import urllib.request
import urllib.error
import urllib.parse
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Union


# ─── KEY SETS (App.tsx와 동일) ────────────────────────────────────────────────

STRUCTURE_KEYS = {
    "name", "type", "visible", "description",
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
    "name", "type", "description",
    "fills",
    "strokes", "strokeWeight", "strokeAlign",
    "effects", "opacity",
    "cornerRadius",
    "fontName", "fontSize", "fontWeight",
    "letterSpacing", "lineHeight",
    "textAlignHorizontal", "textAlignVertical",
    "characters", "styledTextSegments",
    "style",  # TEXT 노드 타이포그래피 (fontSize, fontWeight, lineHeightPx 등)
    "children",
}

RAW_KEYS = STRUCTURE_KEYS | DESIGN_KEYS


# ─── URL 파싱 ──────────────────────────────────────────────────────────────────

def parse_figma_url(url: str) -> Tuple[str, str]:
    """
    Figma URL에서 fileKey와 nodeId 추출.
    node-id는 URL에서 1-23 형식 → API용 1:23 형식으로 변환.
    """
    match = re.search(r"/(?:design|file)/([A-Za-z0-9]+)", url)
    if not match:
        raise ValueError(f"Figma URL에서 fileKey를 찾을 수 없습니다: {url}")
    file_key = match.group(1)

    match = re.search(r"node-id=([^&]+)", url)
    if not match:
        raise ValueError("URL에 node-id가 없습니다. Figma에서 프레임을 선택 후 Copy link 하세요.")
    node_id = match.group(1).replace("-", ":")

    return file_key, node_id


# ─── API 호출 ──────────────────────────────────────────────────────────────────

def figma_get(path: str, token: str) -> dict:
    url = f"https://api.figma.com/v1{path}"
    req = urllib.request.Request(url, headers={"X-Figma-Token": token})
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    try:
        with urllib.request.urlopen(req, context=ctx) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        raise RuntimeError(f"Figma API 오류 {e.code}: {body}")


def fetch_image_url(file_key: str, node_id: str, token: str, scale: int = 2) -> str:
    """Figma 이미지 export API로 프레임 PNG URL 조회."""
    encoded = urllib.parse.quote(node_id, safe="")
    data = figma_get(f"/images/{file_key}?ids={encoded}&format=png&scale={scale}", token)
    if data.get("err"):
        raise RuntimeError(f"Figma 이미지 export 오류: {data['err']}")
    images = data.get("images", {})
    url = images.get(node_id) or images.get(node_id.replace(":", "-"))
    if not url:
        raise RuntimeError(f"이미지 URL을 찾을 수 없습니다. 응답 키: {list(images.keys())}")
    return url


def download_file(url: str, path: Path) -> None:
    """URL에서 바이너리 파일 다운로드."""
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    with urllib.request.urlopen(url, context=ctx) as resp:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(resp.read())
    size_kb = path.stat().st_size / 1024
    print(f"  저장: {path}  ({size_kb:.1f} KB)")


def fetch_node(file_key: str, node_id: str, token: str) -> Tuple[dict, dict]:
    """
    노드 문서와 스타일 맵을 함께 반환.
    styles_map: {styleId → {name, styleType, ...}}
    """
    encoded = urllib.parse.quote(node_id, safe="")
    data = figma_get(f"/files/{file_key}/nodes?ids={encoded}&geometry=paths", token)
    nodes = data.get("nodes", {})

    node_data = None
    for key in [node_id, node_id.replace(":", "-")]:
        if key in nodes:
            node_data = nodes[key]
            break

    if not node_data:
        raise RuntimeError(f"노드를 찾을 수 없습니다: {node_id}\n사용 가능한 키: {list(nodes.keys())}")

    # styles는 노드 응답 내 스타일 레지스트리 (styleId → {name, styleType, ...})
    styles_map = node_data.get("styles", {})
    return node_data["document"], styles_map


# ─── 컴포넌트 맵 ──────────────────────────────────────────────────────────────

def load_component_map(path: str) -> dict:
    """
    컴포넌트 이름 → 프로덕션 코드 매핑 JSON 로드.
    형식 예시:
    {
      "Button/Primary": {
        "import": "import { Button } from '@/components/Button'",
        "usage": "<Button variant='primary'>{label}</Button>",
        "props": ["variant", "size", "disabled"]
      }
    }
    """
    with open(path, encoding="utf-8") as f:
        return json.load(f)


# ─── 변환 함수 ────────────────────────────────────────────────────────────────

def normalize_slot_id(node: dict) -> str:
    name = node.get("name", "") or ""
    return re.sub(r"[^a-z0-9\-]", "", name.lower().replace(" ", "-")) or "image-slot"


def transform_image_fill(fill: dict, node: dict) -> dict:
    bbox = node.get("absoluteBoundingBox") or {}
    width = round(bbox.get("width") or 0)
    height = round(bbox.get("height") or 0)
    slot: dict = {
        "slotId": normalize_slot_id(node),
        "role": "unknown",
        "expectedSize": {"width": width, "height": height},
        "aspectRatio": round(width / height, 4) if height else 1,
    }
    if fill.get("imageRef"):
        slot["imageRef"] = fill["imageRef"]
    return {"type": "IMAGE", "imageSlot": slot}


def collect_image_refs(node: dict) -> dict:
    """노드 트리를 순회해 {imageRef: slotId} 매핑을 반환."""
    refs: dict = {}

    def walk(n: dict) -> None:
        for f in n.get("fills", []):
            if f.get("type") == "IMAGE" and f.get("imageRef"):
                refs[f["imageRef"]] = normalize_slot_id(n)
        for child in n.get("children", []):
            walk(child)

    walk(node)
    return refs


def fetch_figma_image_urls(file_key: str, token: str) -> dict:
    """GET /v1/files/{fileKey}/images → {imageRef: cdn_url}"""
    data = figma_get(f"/files/{file_key}/images", token)
    if data.get("error"):
        raise RuntimeError(f"Figma Images API 오류: {data}")
    return data.get("images", {})


def download_image_assets(
    file_key: str,
    image_refs: dict,
    output_dir: Path,
    token: str,
) -> dict:
    """
    image_refs: {imageRef: slotId}
    Figma Files Images API로 URL 조회 후 {output_dir}/images/{slotId}.png 저장.
    반환: {imageRef: actualPath}
    """
    if not image_refs:
        return {}

    print(f"  이미지 에셋 {len(image_refs)}개 다운로드 중...")
    all_urls = fetch_figma_image_urls(file_key, token)
    images_dir = output_dir / "images"
    images_dir.mkdir(parents=True, exist_ok=True)

    ref_to_path: dict = {}
    used_names: set = set()

    for ref, slot_id in image_refs.items():
        url = all_urls.get(ref)
        if not url:
            print(f"  경고: {slot_id} ({ref[:8]}...) — CDN URL 없음, 건너뜀")
            continue

        name = slot_id
        counter = 1
        while name in used_names:
            name = f"{slot_id}_{counter}"
            counter += 1
        used_names.add(name)

        path = images_dir / f"{name}.png"
        download_file(url, path)
        ref_to_path[ref] = str(path)

    return ref_to_path


def export_image_node_children(
    file_key: str,
    image_node_id: str,
    output_dir: Path,
    token: str,
) -> dict:
    """
    이미지 모음 프레임의 자식 노드를 개별 PNG로 내보냄.
    Figma 렌더 API (GET /v1/images/{fileKey}?ids=...) 사용.
    반환: {slotId: actualPath}
    """
    print(f"  이미지 모음 노드 조회 중: {image_node_id}")
    doc, _ = fetch_node(file_key, image_node_id, token)
    children = doc.get("children", [])
    if not children:
        print("  경고: 이미지 모음 노드에 자식이 없습니다.")
        return {}

    print(f"  자식 노드 {len(children)}개 발견, PNG 내보내기 중...")
    images_dir = output_dir / "images"
    images_dir.mkdir(parents=True, exist_ok=True)

    # 노드ID → slotId 매핑 구성
    id_to_slot: dict = {}
    for child in children:
        node_id = child.get("id", "")
        slot_id = normalize_slot_id(child)
        id_to_slot[node_id] = slot_id

    # 한 번에 모든 노드 렌더 URL 요청
    ids_param = urllib.parse.quote(",".join(id_to_slot.keys()), safe="")
    data = figma_get(f"/images/{file_key}?ids={ids_param}&format=png&scale=2", token)
    if data.get("err"):
        raise RuntimeError(f"이미지 렌더 오류: {data['err']}")

    render_urls: dict = data.get("images", {})
    slot_to_path: dict = {}
    used_names: set = set()

    for node_id, slot_id in id_to_slot.items():
        url = render_urls.get(node_id) or render_urls.get(node_id.replace(":", "-"))
        if not url:
            print(f"  경고: {slot_id} — 렌더 URL 없음, 건너뜀")
            continue

        name = slot_id
        counter = 1
        while name in used_names:
            name = f"{slot_id}_{counter}"
            counter += 1
        used_names.add(name)

        path = images_dir / f"{name}.png"
        download_file(url, path)
        slot_to_path[slot_id] = str(path)

    return slot_to_path


def inject_actual_paths_by_slot(data: object, slot_to_path: dict) -> None:
    """slotId 기반으로 imageSlot.actualPath 주입 (in-place)."""
    if isinstance(data, dict):
        if data.get("type") == "IMAGE" and "imageSlot" in data:
            slot = data["imageSlot"]
            actual = slot_to_path.get(slot.get("slotId", ""))
            if actual:
                slot["actualPath"] = actual
        for v in data.values():
            inject_actual_paths_by_slot(v, slot_to_path)
    elif isinstance(data, list):
        for item in data:
            inject_actual_paths_by_slot(item, slot_to_path)


def inject_actual_paths(data: object, ref_to_path: dict) -> None:
    """JSON 트리에서 imageSlot.imageRef를 찾아 actualPath 필드를 주입 (in-place)."""
    if isinstance(data, dict):
        if data.get("type") == "IMAGE" and "imageSlot" in data:
            slot = data["imageSlot"]
            actual = ref_to_path.get(slot.get("imageRef", ""))
            if actual:
                slot["actualPath"] = actual
        for v in data.values():
            inject_actual_paths(v, ref_to_path)
    elif isinstance(data, list):
        for item in data:
            inject_actual_paths(item, ref_to_path)


def resolve_token_name(style_key: str, node_styles: dict, styles_map: dict) -> Optional[str]:
    """노드의 styles 필드에서 특정 속성(fill, text, effect)에 해당하는 토큰 이름 반환."""
    style_id = node_styles.get(style_key)
    if style_id and style_id in styles_map:
        return styles_map[style_id].get("name")
    return None


def pick_keys(
    node: dict,
    keys: set,
    root_bbox: dict = None,
    styles_map: dict = None,
    component_map: dict = None,
) -> dict:
    result = {}
    node_styles = node.get("styles", {})  # 이 노드에 적용된 스타일 참조 (styleKey → styleId)

    # Code Connect: 컴포넌트 이름이 맵에 있으면 프로덕션 코드 참조 주입
    if component_map:
        name = node.get("name", "")
        if name in component_map:
            result["_codeConnect"] = component_map[name]

    # absoluteBoundingBox → 상대 좌표(x/y) + 크기(width/height) 매핑
    bbox = node.get("absoluteBoundingBox")
    if bbox:
        if root_bbox is None:
            root_bbox = bbox
        if "x" in keys:
            result["x"] = round(bbox["x"] - root_bbox["x"])
        if "y" in keys:
            result["y"] = round(bbox["y"] - root_bbox["y"])
        if "width" in keys:
            result["width"] = round(bbox["width"])
        if "height" in keys:
            result["height"] = round(bbox["height"])

    for k, v in node.items():
        if k not in keys:
            continue
        if k in ("x", "y", "width", "height"):
            continue  # 위에서 bbox로 처리
        if k == "fills" and isinstance(v, list):
            fill_token = resolve_token_name("fill", node_styles, styles_map) if styles_map else None
            processed = []
            for f in v:
                if f.get("type") == "IMAGE":
                    processed.append(transform_image_fill(f, node))
                else:
                    fill = dict(f)
                    if fill_token:
                        fill["_tokenName"] = fill_token
                    processed.append(fill)
            result["fills"] = processed
        elif k == "children" and isinstance(v, list):
            result["children"] = [
                pick_keys(child, keys, root_bbox, styles_map, component_map)
                for child in v
            ]
        else:
            result[k] = v

    # 텍스트 스타일 토큰 이름 주입 (design JSON에서 유용)
    if styles_map and node.get("type") == "TEXT":
        text_token = resolve_token_name("text", node_styles, styles_map)
        if text_token:
            result["_textToken"] = text_token

    return result


# ─── 토큰 요약 ────────────────────────────────────────────────────────────────

def collect_tokens(node: dict, styles_map: dict) -> dict:
    """
    노드 트리에서 사용된 스타일 토큰을 수집해 요약 반환.
    AI에게 "이 프레임에서 사용된 토큰 목록"을 제공하는 용도.
    반환: {colors: {tokenName: fill}, typography: {tokenName: props}, effects: {tokenName: []}}
    """
    tokens: dict = {"colors": {}, "typography": {}, "effects": {}}

    def walk(n: dict) -> None:
        node_styles = n.get("styles", {})
        for style_key, style_id in node_styles.items():
            if style_id not in styles_map:
                continue
            info = styles_map[style_id]
            name = info.get("name", style_id)
            style_type = info.get("styleType", "")

            if style_type == "FILL" and name not in tokens["colors"]:
                solid_fills = [f for f in n.get("fills", []) if f.get("type") == "SOLID"]
                if solid_fills:
                    tokens["colors"][name] = solid_fills[0]

            elif style_type == "TEXT" and name not in tokens["typography"]:
                tokens["typography"][name] = {
                    k: n[k]
                    for k in ("fontName", "fontSize", "fontWeight", "lineHeight", "letterSpacing")
                    if k in n
                }

            elif style_type == "EFFECT" and name not in tokens["effects"]:
                tokens["effects"][name] = n.get("effects", [])

        for child in n.get("children", []):
            walk(child)

    walk(node)
    return tokens


# ─── manifest (텍스트 추출) ───────────────────────────────────────────────────

def collect_manifest(node: dict) -> List[dict]:
    """
    모든 TEXT 노드의 텍스트 콘텐츠를 수집.
    ai-prompt-guide.md의 텍스트 누락 검수 프롬프트에 사용.
    반환: [{name, characters}]
    """
    results = []

    def walk(n: dict) -> None:
        if n.get("type") == "TEXT" and n.get("characters"):
            results.append({"name": n.get("name", ""), "characters": n["characters"]})
        for child in n.get("children", []):
            walk(child)

    walk(node)
    return results


# ─── 저장 ─────────────────────────────────────────────────────────────────────

def save_json(data: Union[dict, list], path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    size_kb = path.stat().st_size / 1024
    print(f"  저장: {path}  ({size_kb:.1f} KB)")


# ─── 메인 ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Figma REST API JSON 추출기")
    parser.add_argument("--url", required=True, action="append", help="Figma 프레임 URL (여러 번 사용 가능)")
    parser.add_argument("--output", default="./figma", help="JSON 저장 디렉토리 (기본: ./figma)")
    parser.add_argument("--img-output", default="./output", help="이미지 저장 디렉토리 (기본: ./output)")
    parser.add_argument(
        "--types",
        default="structure,design",
        help="추출할 종류 (쉼표 구분: structure,design,tokens,manifest,png,images)",
    )
    parser.add_argument(
        "--component-map",
        metavar="FILE",
        help="컴포넌트 이름 → 프로덕션 코드 매핑 JSON 파일 경로 (Code Connect 대용)",
    )
    parser.add_argument(
        "--image-node",
        metavar="URL",
        help="이미지 모음 Figma 프레임 URL. 자식 노드를 PNG로 내보내 images/ 폴더에 저장.",
    )
    args = parser.parse_args()

    token = os.environ.get("FIGMA_TOKEN")
    if not token:
        print("오류: FIGMA_TOKEN 환경변수가 설정되지 않았습니다.", file=sys.stderr)
        print("  export FIGMA_TOKEN=figd_xxxx", file=sys.stderr)
        sys.exit(1)

    types = {t.strip() for t in args.types.split(",")}
    output_dir = Path(args.output)
    img_output_dir = Path(args.img_output)

    component_map = {}
    if args.component_map:
        component_map = load_component_map(args.component_map)
        print(f"  컴포넌트 맵 로드: {len(component_map)}개 항목")

    # --image-node: 이미지 모음 프레임을 한 번만 내보내 모든 시안에 재사용
    slot_to_path: dict = {}
    if args.image_node:
        print("이미지 모음 노드 처리 중...")
        img_file_key, img_node_id = parse_figma_url(args.image_node)
        slot_to_path = export_image_node_children(img_file_key, img_node_id, output_dir, token)
        print(f"  이미지 {len(slot_to_path)}개 저장 완료\n")

    for i, url in enumerate(args.url, 1):
        if len(args.url) > 1:
            print(f"\n[{i}/{len(args.url)}] {url}")

        print("URL 파싱 중...")
        file_key, node_id = parse_figma_url(url)
        print(f"  fileKey: {file_key}")
        print(f"  nodeId:  {node_id}")

        print("Figma API 호출 중...")
        node, styles_map = fetch_node(file_key, node_id, token)
        frame_name = node.get("name", "frame")
        slug = re.sub(r"[^a-zA-Z0-9가-힣_\-]", "_", frame_name)
        print(f"  프레임: {frame_name}")
        if styles_map:
            print(f"  스타일 토큰: {len(styles_map)}개 감지")

        # 이미지 에셋 다운로드 (JSON 생성 전에 실행해야 actualPath 주입 가능)
        ref_to_path: dict = {}
        if "images" in types:
            image_refs = collect_image_refs(node)
            if image_refs:
                ref_to_path = download_image_assets(file_key, image_refs, output_dir, token)
            else:
                print("  이미지 fill 없음, 다운로드 건너뜀")

        def _inject(d: dict) -> None:
            if ref_to_path:
                inject_actual_paths(d, ref_to_path)
            if slot_to_path:
                inject_actual_paths_by_slot(d, slot_to_path)

        print("JSON 생성 중...")
        if "raw" in types:
            data = pick_keys(node, RAW_KEYS, styles_map=styles_map, component_map=component_map)
            _inject(data)
            save_json(data, output_dir / f"{slug}_raw.json")

        if "structure" in types:
            data = pick_keys(node, STRUCTURE_KEYS, styles_map=styles_map, component_map=component_map)
            _inject(data)
            save_json(data, output_dir / f"{slug}_structure.json")

        if "design" in types:
            data = pick_keys(node, DESIGN_KEYS, styles_map=styles_map, component_map=component_map)
            _inject(data)
            save_json(data, output_dir / f"{slug}_design.json")

        if "tokens" in types:
            if styles_map:
                token_data = collect_tokens(node, styles_map)
                save_json(token_data, output_dir / f"{slug}_tokens.json")
            else:
                print("  경고: 스타일 토큰 없음 (로컬 스타일 미사용 파일).")

        if "manifest" in types:
            manifest = collect_manifest(node)
            save_json(manifest, output_dir / f"{slug}_manifest.json")

        if "png" in types:
            print("Figma 이미지 export 중...")
            img_url = fetch_image_url(file_key, node_id, token)
            download_file(img_url, img_output_dir / f"{slug}.png")

    print("\n완료!")


if __name__ == "__main__":
    main()
