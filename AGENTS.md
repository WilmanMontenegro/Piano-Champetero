# AGENTS.md

Context for **Cursor** agents and humans: **Batería Champetera Virtual** — static champeta drum kit on GitHub Pages ([bateriachampetera.com](https://bateriachampetera.com)).

## Development environment

| Tool | Role |
|------|------|
| **Cursor** | Primary IDE + AI pair programming (rules in `.cursor/rules/`) |
| **GitHub** | `main` branch → GitHub Pages deploy |
| **Search Console** | Organic traffic (~3K clicks/28d as of May 2026) |

Do **not** use or add `.claude/` or `.vscode/` config (legacy / local IDE). **Cursor only** — rules in `.cursor/rules/`, context in this file and `README.md`.

**Maintainer priorities:** desktop UX first, organize sampler catalog (DD14/SK5), piano view in progress, WhatsApp community (invite link in `site-config.js`).

## Tech stack

- Vanilla **HTML / CSS / JS** — no build step, no framework
- **ES modules** in the browser
- **Web Audio API** for playback
- **localStorage** for preferences and maps
- **GitHub Pages** from `main`
- **PWA:** `manifest.json`, `sw.js` (cache bust via `CACHE_NAME` version in `sw.js`)

## Repo layout

```
├── index.html, virtual.html, sobre-nosotros.html, contactanos.html, politicas-privacidad.html
├── header.html, nav.html              # Fetched by common.js
├── js/
│   ├── site-config.js                 # Parameters: ticker, AUDIO_UI, nav compact px
│   ├── common.js                      # initSiteChrome(), initNav, setYearFooter
│   ├── virtual.js                     # Battery + pads, audio, modals, storage
│   ├── pad-keyboard.js                # Default key layout (linear QWERTY rows)
│   ├── modal-utils.js
│   └── contactanos.js
├── styles/
│   ├── reset.css
│   ├── tokens.css                     # Design tokens (:root)
│   ├── common.css                     # @imports components + shared UI
│   ├── components/nav.css, ticker.css
│   ├── responsive.css                 # Viewport breakpoints (desktop-first)
│   └── virtual.css (+ page CSS per HTML)
├── manifest.json, sw.js
└── samplers/                          # WAV/MP3 samples
```

## Where to edit (single source of truth)

| Change | File |
|--------|------|
| Colors, spacing, shadows | `styles/tokens.css` |
| Header title size / padding | `styles/tokens.css` → `--header-title-size`, `--header-padding-top`, `--header-nav-margin-block` |
| Nav layout, active link style | `styles/components/nav.css` |
| Ticker / colaboradores | `js/site-config.js` → `CONTRIBUTORS` (append-only; cinta + Sobre nosotros), `TICKER_STATIC_LINES` |
| Espacio bajo cinta fija | `styles/tokens.css` → `--ticker-block-height`; `body { padding-top }` en `common.css` |
| WhatsApp community invite URL | `js/site-config.js` → `WHATSAPP_COMMUNITY_URL` (ticker, Contáctanos, botón flotante) |
| Hit flash duration on pads/toms | `js/site-config.js` → `AUDIO_UI.hitFlashMs` |
| Sampler velocidad | `js/site-config.js` → `AUDIO_UI.playbackRate`; slider + checkbox Fijo en `virtual.html` |
| Nav hamburger (móvil) | `js/common.js` → `initHamburgerMenu()` (delegación en `document`, clase `html.nav-open`); panel fijo en `nav.css` ≤767px |
| Desktop/tablet/mobile breakpoints | `styles/tokens.css` → `--bp-desktop-min` 1024, `--bp-tablet-min` 768, `--bp-mobile-max` 767; `responsive.css` |
| Battery / pads behavior | `js/virtual.js`, `styles/virtual.css` |

## Conventions (strict)

**Code in English; user-facing copy and HTML filenames in Spanish.**

- **CSS classes**: English, kebab-case  
- **JS**: camelCase functions/vars, `UPPER_SNAKE` constants  
- **UI strings**: Spanish (es-419)  
- **CSS load order**: `reset.css` → `common.css` → page CSS. `common.css` imports `tokens.css`, `components/nav.css`, `components/ticker.css`, `responsive.css`. Use `var(--token)` in page CSS; avoid duplicates and `!important` (except third-party).

**JS shell:** Each page calls `initSiteChrome()` on `DOMContentLoaded` (loads `header.html`, `nav.html`, builds ticker from `site-config.js`). Collaborators: edit only `CONTRIBUTORS` in `site-config.js` (**append-only** — never remove). Sobre nosotros renders the same list via `renderContributorsList()`. Names: **first name + first surname** (e.g. `Jiliar Silgado`).

**JS style:** ES modules, async/await, event delegation; no globals.

## Product: battery vs pads

Same **edit** flow: **Editar** → cell → modal **Sonido** / **Tecla** → **Guardar**. Layout differs (9 toms vs grid up to 4×6).

## Storage keys (localStorage)

| Key / pattern | Purpose |
|----------------|---------|
| `pianoChampeteroKeyMap` | Battery: `KeyboardEvent.code` → `tom-1` … `tom-9` |
| `pianoChampeteroSamplers` | Battery tom → sampler filename |
| `pianoChampeteroPads_${gridType}` | Pads: sampler filenames per grid |
| `pianoChampeteroPadKeys_${gridType}` | Pads: one canonical key per pad index |
| `pianoChampeteroViewMode` | `"bateria"` \| `"pads"` |
| `pianoChampeteroImmersionMode` | `"1"` \| `"0"` — oculta cinta/header/footer en virtual.html |
| `pianoChampeteroGridType` | `3x3`, `3x4`, `4x4`, `4x6` |
| `pianoChampeteroVolume` | Master volume 0–1 |
| `pianoChampeteroPlaybackRate` | Sampler speed (`AUDIO_UI.playbackRate`; 1 = normal) |
| `pianoChampeteroPlaybackRateFixed` | `"1"` \| `"0"` — velocidad fija (no vuelve al centro) |
| `pianoChampeteroNoteRepeat` | Redoble on/off |

**Edit modal save** (`virtual.js`): applies sampler and key independently when set — not gated on visible tab.

**Pads inheritance:** `12←9`, `16←12`, `24←16` for sounds and keys when no valid saved data for that grid. Saved data wins. `resetSettings` clears pads keys and reapplies chain.

## Audio / keyboard

- **Battery:** `activateTomSampler`, 9 toms.  
- **Pads:** `buildPadKeyIndexMap`, `resolvePadIndexFromKeyboard` in `pad-keyboard.js`.  
- **Default keys:** linear row order `q…p`, `a…l`, `z…m`; battery uses first 9.  
- **AudioContext:** resume on user gesture.

## UI / layout (current)

- **Ticker:** `#contributor-ticker` filled by `loadContributorTicker()` from `site-config.js` (loop duplicates segments in JS). Styles in `components/ticker.css`.
- **Nav:** Desktop-first — horizontal bar on desktop (≥1024) and tablet (768–1023); hamburger on mobile (≤767). Panel fijo + overlay (`html.nav-open`); toggle en `initHamburgerMenu()`. Active page: yellow text + underline (no box border).
- **Header:** tokens `--header-title-size`, `--header-padding-top`; sin `content-visibility` (recortaba dropdown). Mismo chrome en todas las páginas.
- **Pad/tom hit feedback:** Caribbean palette glow on press (`virtual.css` + `AUDIO_UI.hitFlashMs`); idle pads use brand gradient (not per-pad rainbow).
- **virtual.html:** mismo header/nav que el resto (`header.html` + estilos globales); botón **Inmersión** oculta cinta, header y footer.
- **Desktop-first product:** PC primary; mobile usable but secondary (touch/audio latency).

## Roadmap (not shipped)

- Sampler catalog UI: machine selects (DD14, SK5, …) — contributor idea (Jiliar Silgado).
- Piano champetero view — collaboration inquiry (Jair).

## Quick commands

- Local: `python -m http.server 8000` → `http://localhost:8000/virtual.html` 
- Deploy: push `main` → GitHub Pages (wait 1–3 min) 
- After CSS/JS changes: bump `CACHE_NAME` in `sw.js` 
- **PWA cache:** JS/CSS/HTML use network-first (avoid stale ES module graphs); samplers cache-on-success; never precache bare directories (`/samplers/` 404s on Pages) 
- SEO / ads: GTM `GTM-N5MRWRKL`, AdSense, PropellerAds, JSON-LD, `sitemap.xml`

## Git

- Do not commit unless the user asks.
- Do not commit `.claude/`, `.vscode/`, `.playwright-mcp/`, or secrets.
