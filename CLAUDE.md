# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm build          # Production build (UI then main)
pnpm dev            # Watch mode for UI only (vite.config.ui.ts)
```

After any build, load the plugin in Figma Desktop via **Plugins → Development → Import plugin from manifest** pointing to `manifest.json`.

## Architecture

This is a **Figma plugin** with two separate build targets that are wired together by `manifest.json`:

### Two-process model

| Process | Entry | Output | Environment |
|---------|-------|--------|-------------|
| Plugin backend | `src/main.ts` | `dist/main.js` (IIFE) | Figma sandbox — Figma API available, no DOM/network |
| Plugin UI | `src/ui/` (React) | `dist/index.html` (single file) | Browser iframe — DOM available, no Figma API |

**Communication is message-passing only:**
- Backend → UI: `figma.ui.postMessage({ type, ... })`
- UI → Backend: `parent.postMessage({ pluginMessage: ... }, "*")`

`vite-plugin-singlefile` inlines all JS/CSS into one HTML file so Figma can inject it via `__html__` template literal.

### Data flow

1. `src/main.ts` listens to `selectionchange`, serializes the selected node tree with `serializeNode()`, and posts it to the UI.
2. `src/ui/App.tsx` receives the raw node data and applies two filters:
   - **Structure** (`LAYOUT_KEYS`): layout, sizing, auto-layout properties
   - **Design** (`STYLE_KEYS`): fills, strokes, effects, typography
3. User clicks a download button → `downloadJson()` saves the filtered JSON.

### Key logic in `src/main.ts`

- `serializeNode()` — reflects Figma node prototype keys, skips `parent`/`removed`, recurses into `children`
- `isLikelyIcon()` — heuristic to detect icon nodes by name pattern, square size, and child vector types
- `extractCornerRadius()` — handles `figma.mixed` for per-corner radii
- `extractStyledTextSegments()` — extracts mixed-style text runs (Plugin API only, not available in REST API)

### Skill scripts (`skill/gabia-figma-extract/scripts/`)

- `figma_extract.py` — standalone Python CLI using the Figma REST API. Requires `FIGMA_TOKEN` env var. Outputs `raw`, `structure`, `design`, `tokens`, `manifest`, or `png`. See `skill/gabia-figma-extract/SKILL.md` for full usage.
- `parse_figma.mjs` — post-processes raw JSON into per-section files. Usage: `node skill/gabia-figma-extract/scripts/parse_figma.mjs --dir ./<folder> --out ./<folder>/parsed`
