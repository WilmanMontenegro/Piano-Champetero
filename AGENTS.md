# AGENTS.md

Context for coding agents and humans: **Batería Champetera Virtual** — static champeta drum kit on GitHub Pages ([bateriachampetera.com](https://bateriachampetera.com)).

## Tech stack

- Vanilla **HTML / CSS / JS** — no build step, no framework
- **ES modules** in the browser
- **Web Audio API** for playback
- **localStorage** for preferences and maps
- **GitHub Pages** from `main`

## Repo layout

```
├── index.html, virtual.html, sobre-nosotros.html, contactanos.html, politicas-privacidad.html
├── header.html, nav.html          # Fetched into pages
├── js/
│   ├── site-config.js             # Parameters: ticker credits, AUDIO_UI, nav compact px (single source)
│   ├── common.js                  # initSiteChrome (header+nav+ticker), setYearFooter
│   ├── virtual.js                 # Battery + pads grid, audio, edit modals, storage maps
│   ├── pad-keyboard.js            # Linear row-by-row default keys (battery + pads), buildPadKeyIndexMap, resolvePadIndexFromKeyboard
│   ├── modal-utils.js             # initModal
│   └── contactanos.js
├── styles/
│   ├── reset.css
│   ├── tokens.css                 # Design tokens (:root variables)
│   ├── common.css                 # Imports tokens + components + responsive; shared UI
│   ├── components/nav.css, ticker.css
│   ├── responsive.css             # Viewport breakpoints (desktop-first)
│   └── virtual.css (+ page CSS per HTML file)
├── manifest.json, sw.js           # PWA
└── samplers/                      # WAV/MP3 samples
```

## Conventions (strict)

**Code in English; user-facing copy and HTML filenames in Spanish.**

- **CSS classes**: English, kebab-case  
- **JS**: camelCase functions/vars, `UPPER_SNAKE` constants  
- **UI strings**: Spanish (es-419)  
- **CSS load order**: `reset.css` → `common.css` → page CSS (`virtual.css`, etc.). `common.css` imports `tokens.css`, `components/nav.css`, `components/ticker.css`, `responsive.css`. **Edit one place**: palette/spacing in `tokens.css`; nav in `components/nav.css` (container query at 620px = `NAV_COMPACT_MAX_PX` in `site-config.js`); ticker styles in `components/ticker.css`; viewport rules in `responsive.css`. Use `var(--token)` in page CSS; avoid duplicates and `!important` (except third-party).
- **JS shell**: Each page calls `initSiteChrome()` (loads `header.html`, `nav.html`, builds ticker from `site-config.js`). New contributor → add to `TICKER_CONTRIBUTORS` in `site-config.js` only.

**JS style**: ES modules, async/await, event delegation; no globals; no DOM work before `DOMContentLoaded` where the app already follows that pattern.

## Product: battery vs pads

Same **edit** flow everywhere: **Editar** → pick a cell → modal **Sonido** / **Tecla** → **Guardar**. Only the **layout** changes (9 toms vs grid up to 4×6) and pads expose more sampler slots per grid.

## Storage keys (localStorage)

| Key / pattern | Purpose |
|----------------|---------|
| `pianoChampeteroKeyMap` | Battery: `KeyboardEvent.code` → `tom-1` … `tom-9` |
| `pianoChampeteroSamplers` | Battery tom → sampler filename |
| `pianoChampeteroPads_${gridType}` | Pads view: array of sampler filenames for that grid |
| `pianoChampeteroPadKeys_${gridType}` | Pads: canonical codes only → pad index `{ "KeyQ": 0, … }`; **one key per pad**, normalized on load/save |
| `pianoChampeteroViewMode` | `"bateria"` \| `"pads"` |
| `pianoChampeteroGridType` | e.g. `3x3`, `3x4`, `4x4`, `4x6` |

**Edit modal save** (`virtual.js`): applies **sampler** when `samplerSeleccionado` / `padSamplerSeleccionado` is set and **key** when `lastCapturedCode` is set — **not** gated on which tab is visible.

**Reset** (`resetSettings`): clears battery samplers map, `pianoChampeteroKeyMap`, and every `pianoChampeteroPadKeys_*` for grids in `gridConfigs`.

**Pads inheritance (current behavior)** (`virtual.js`):
- Grid order is fixed by size: `3x3` (9) → `3x4` (12) → `4x4` (16) → `4x6` (24).
- If `pianoChampeteroPads_${gridType}` is missing/invalid, sounds inherit from the immediate predecessor for shared indexes (`12←9`, `16←12`, `24←16`), and new indexes are filled with defaults.
- If `pianoChampeteroPadKeys_${gridType}` is missing/empty, key mapping also inherits predecessor assignments for shared indexes, then normalizes one canonical key per pad.
- If the grid has valid saved data, saved data wins (no inheritance override).
- `resetSettings` also clears all `pianoChampeteroPads_*` keys, so inheritance chain is reapplied after reset.

## Audio / keyboard

- **Battery**: `keyToTomId`, `activateTomSampler`, 9 pads.  
- **Pads**: `keyToPadIndex` built from `buildPadKeyIndexMap` + saved overrides; `resolvePadIndexFromKeyboard` in `pad-keyboard.js`.  
- **Default keys (no saved pad keys / fresh battery map)**: one **linear** order for everyone — physical rows top to bottom: `q…p`, then `a…l`, then `z…m`. Battery uses the first 9 (`q,w,e,r,t,y,u,i,o` → tom-1…9); pads use the first N for grid size. `keyToTomIdDefaults` and `buildPadKeyIndexMap` both use `pad-keyboard.js` (`PAD_KEY_LAYOUT` / `BATTERY_DEFAULT_PAD_CHARS`).  
- **AudioContext**: resume on user gesture (browser policy).

## UI / layout notes (current)

- **Ticker loop**: pages with the "pads available" message duplicate ticker content blocks so `ticker-scroll` (`translateX(-50%)`) loops without visible cut.
- **Pads are square** in view mode (`aspect-ratio: 1 / 1`).
- **Desktop-first pads sizing** (`styles/virtual.css`):
  - Uses a shared pad size variable constrained by both viewport width and height to avoid vertical clipping while still using available width.
  - 24-pad view keeps 6 columns on desktop; smaller grids center with fewer columns but the same square pad size logic.
- **Desktop-first product**: PC is the primary target (lowest audio/latency expectations on mobile). Layout, nav, and pads sizing optimize for wide screens first; mobile stays usable but secondary.
- **Mobile remains secondary**: breakpoint rules reduce columns only when needed to avoid overflow and keep playability.

## Quick commands

- Local: `python -m http.server 8000` (HTTP required for modules)  
- Deploy: push `main` → GitHub Pages  
- SEO / analytics: GTM `GTM-N5MRWRKL`, AdSense, JSON-LD, `sitemap.xml`
