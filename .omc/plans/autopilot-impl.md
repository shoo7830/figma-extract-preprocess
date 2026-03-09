# Autopilot Implementation Plan: Figma Raw JSON Exporter Plugin

## Source
Spec: `.omc/specs/deep-interview-figma-json-plugin.md`
Ambiguity: 17.5% (PASSED)

## Technical Design

### Figma Plugin Architecture
Figma plugins have two separate execution contexts:
1. **Plugin sandbox** (`src/main.ts`) — runs in Figma's sandbox, has access to `figma` API
2. **UI iframe** (`src/ui/`) — React app running in an iframe, communicates via postMessage

### Build Strategy
- `vite.config.ts` with two build configs (or two scripts):
  - **UI build**: `vite-plugin-singlefile` to inline CSS+JS into a single `dist/index.html`
  - **Main build**: Vite with `lib` mode, format `iife`, output `dist/main.js`
- Single `pnpm build` command runs both

### Serialization Approach
`figma.currentPage.selection[0]` returns a Figma node object with:
- Circular references (parent ↔ child)
- Non-serializable values (functions, Symbols)
- Deep nesting (children arrays)

Custom `serializeNode(node)` function that:
1. Recursively walks the node tree
2. Extracts plain JS values (strings, numbers, arrays, plain objects)
3. Skips functions, symbols, and parent references
4. Preserves: id, name, type, x, y, width, height, fills, strokes, effects, opacity,
   layoutMode, children, fontSize, fontName, characters, etc.

### Communication Flow
```
Figma canvas (selection changes)
  → main.ts: figma.on('selectionchange', handler)
  → serializeNode(figma.currentPage.selection[0])
  → figma.ui.postMessage({ type: 'UPDATE', json: serialized })

UI iframe (App.tsx)
  → window.onmessage = (e) => { setJson(e.data.pluginMessage.json) }
  → render textarea with JSON.stringify(json, null, 2)
  → [Download] button → Blob + URL.createObjectURL → a.click()
```

## File Structure
```
/
├── manifest.json
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tsconfig.main.json      (for main.ts, no DOM lib)
├── src/
│   ├── main.ts             (Figma sandbox)
│   └── ui/
│       ├── index.html
│       ├── main.tsx
│       └── App.tsx
```

## Implementation Tasks (ordered)

### Task 1: package.json + tsconfig files
- `package.json`: pnpm, vite, react, @figma/plugin-typings, vite-plugin-singlefile
- `tsconfig.json`: for UI (DOM lib, JSX)
- `tsconfig.main.json`: for main.ts (no DOM, uses @figma/plugin-typings)

### Task 2: vite.config.ts
- Two build configs: UI (singlefile) and main (iife)
- `pnpm build` runs both sequentially

### Task 3: manifest.json
- name, id, api version, main, ui, editorType

### Task 4: src/main.ts
- `figma.showUI(__html__, { width: 400, height: 600 })`
- `figma.on('selectionchange', ...)` listener
- `serializeNode()` recursive function
- `figma.ui.postMessage()` on selection change and on initial load

### Task 5: src/ui/App.tsx
- State: `json: string | null`, `frameName: string | null`
- `window.onmessage` handler for plugin messages
- Textarea showing JSON string (pre-formatted)
- Download button: creates Blob, triggers download as `{frameName}.json`
- Empty state: "프레임을 선택해주세요" message

### Task 6: src/ui/main.tsx + index.html
- Standard React 18 entry point
- Minimal HTML shell

## Acceptance Criteria Mapping
- [x] Auto JSON update on selection → Task 4 (selectionchange listener)
- [x] Auto-refresh on change → Task 4 (always postMessage)
- [x] Empty state message → Task 5
- [x] Download button → Task 5
- [x] pretty-print 2-space indent → Task 5 (JSON.stringify null 2)
- [x] Scrollable textarea → Task 5 (CSS overflow-y: auto)
- [x] pnpm build works → Tasks 1+2

## Dependencies
- `vite` ^5
- `react` ^18, `react-dom` ^18
- `@types/react`, `@types/react-dom`
- `typescript` ^5
- `vite-plugin-singlefile` (inlines assets into one HTML)
- `@figma/plugin-typings` (Figma API types)
