/**
 * Site-wide parameters — edit here for copy, timing, and ticker credits.
 * Code in English; user-facing strings in Spanish (es-419).
 */

/** Viewport breakpoints — must match styles/tokens.css */
export const BREAKPOINT_DESKTOP_MIN_PX = 1024;
export const BREAKPOINT_TABLET_MIN_PX = 768;
/** Max viewport width for mobile nav (hamburger below tablet). */
export const NAV_MOBILE_MAX_PX = 767;
/* Play UI / pads: ONLY width tiers — ≤767 mobile | 768–1023 tablet | ≥1024 desktop.
 * No height/landscape MQs for pad layout or kit chrome. */

/**
 * WhatsApp Community invite link (Comunidades → enlace de invitación).
 * Leave empty to hide ticker line and contact CTA until the community is live.
 */
export const WHATSAPP_COMMUNITY_URL = 'https://chat.whatsapp.com/JDQqXwQoJ8V3YcD52zjZfR';

/** Label for floating WhatsApp button (es-419). */
export const WHATSAPP_COMMUNITY_LABEL = 'Únete al grupo';

/** localStorage: `light` | `dark` — theme toggle (Claro / Oscuro). */
export const THEME_STORAGE_KEY = 'pianoChampeteroTheme';

export const AUDIO_UI = {
  hitFlashMs: 140,
  /** Same pad: min ms between hits (ghost-tap shield). Lower = tighter rolls on mobile. */
  retriggerMaskMs: 28,
  /**
   * Note repeat (MPC "Note Repeat") — off by default; user enables "Redoble" in UI.
   * Speed dial maps slider 0..100 → maxMs..minMs (0=lento, 100=rápido).
   * Anchors @ 120 BPM: 1/32=62.5, 1/16=125, 1/8=250.
   */
  noteRepeat: {
    enabled: false,
    intervalMs: 125,
    minMs: 62.5,
    maxMs: 250,
  },
  /**
   * Sampler speed (Web Audio playbackRate).
   * Default UI: spring slider (hold + drag; release → 1). Checkbox "Fijo" locks value.
   */
  playbackRate: {
    min: 0.5,
    max: 2,
    default: 1,
  },
};

/**
 * Site collaborators — single source for ticker + Sobre nosotros.
 * APPEND ONLY: never remove entries; only add new ones.
 *
 * @typedef {{
 *   id: string,
 *   name: string,
 *   credit: string,
 *   thanksFor: string,
 *   emoji?: string,
 *   pages?: string[],
 * }} Contributor
 */

/** @type {Contributor[]} */
export const CONTRIBUTORS = [
  {
    id: 'dominick-sonidos',
    name: 'Dominick',
    credit: 'sonidos de la batería',
    thanksFor: 'por los sonidos de la batería',
    emoji: '🥁',
  },
  {
    id: 'alekey-grabacion',
    name: 'Alekey',
    credit: 'idea de grabar lo que tocás en la batería',
    thanksFor: 'por la idea de grabar lo que tocás en la batería',
    emoji: '🎙️',
  },
  {
    id: 'cesar-mobile-iphone',
    name: 'Cesar Garay',
    credit: 'sugerencia para mejorar la vista móvil en iPhone',
    thanksFor: 'por sugerir arreglar la vista móvil para usarla mejor en iPhone',
    emoji: '📱',
  },
  {
    id: 'marvin-barraz-mejoras',
    name: 'Marvin Barraz',
    credit: 'gracias por estas mejoras',
    thanksFor: 'por estas mejoras',
    emoji: '⚡',
  },
];

/** @deprecated Use CONTRIBUTORS — kept for older docs/imports. */
export const TICKER_CONTRIBUTORS = CONTRIBUTORS;

/**
 * Static ticker lines (HTML allowed for links).
 * @type {{ id: string, html: string }[]}
 */
export const TICKER_STATIC_LINES = [
  {
    id: 'mobile-iphone-update',
    html: 'Mejoramos la vista móvil: pads más grandes, controles completos y exportar/importar kits por WhatsApp <a href="virtual.html">aquí</a>',
  },
];

/** virtual.html uses the same copy without the “aquí” link on pads line */
export const TICKER_STATIC_LINES_VIRTUAL = [
  {
    id: 'mobile-iphone-update',
    html: 'Mejoramos la vista móvil: pads más grandes, controles completos y exportar/importar kits por WhatsApp',
  },
];

/**
 * @param {string} [pageFile] e.g. "index.html"
 * @returns {{ html: string }[]}
 */
function buildStaticTickerLines(baseLines) {
  if (!WHATSAPP_COMMUNITY_URL) return baseLines;
  const href = escapeHtml(WHATSAPP_COMMUNITY_URL);
  return [
    {
      id: 'whatsapp-community',
      html: `¡Únete al <a href="${href}" target="_blank" rel="noopener noreferrer">grupo de WhatsApp</a>! Comparte ritmos, ideas y vacila con la comunidad champetera 🥁`,
    },
    ...baseLines,
  ];
}

export function getTickerSegments(pageFile = '') {
  const file = pageFile || 'index.html';
  const base = file === 'virtual.html' ? TICKER_STATIC_LINES_VIRTUAL : TICKER_STATIC_LINES;
  const staticLines = buildStaticTickerLines(base);

  // ponytail: ticker shows only newest thanks; full list stays on Sobre nosotros
  const eligible = CONTRIBUTORS.filter((c) => !c.pages || c.pages.includes(file));
  const latest = eligible[eligible.length - 1];
  const thanks = latest
    ? [
        {
          html: `🎉 ¡Gracias <strong>${escapeHtml(latest.name)}</strong> ${escapeHtml(latest.thanksFor)}! ${latest.emoji || ''}`.trim(),
        },
      ]
    : [];

  const statics = staticLines.map((line) => ({ html: line.html }));
  return [...thanks, ...statics];
}

/**
 * Fill Sobre nosotros `#contributors .contributors-list` from CONTRIBUTORS.
 * @param {ParentNode} [root=document]
 */
export function renderContributorsList(root = document) {
  const list = root.querySelector('#contributors .contributors-list');
  if (!list) return;
  list.replaceChildren(
    ...CONTRIBUTORS.map((c) => {
      const li = document.createElement('li');
      const strong = document.createElement('strong');
      strong.textContent = c.name;
      li.append(strong, document.createTextNode(` — ${c.credit}${c.emoji ? ` ${c.emoji}` : ''}`));
      return li;
    })
  );
}

/**
 * @param {string} [pageFile]
 * @returns {string}
 */
export function buildTickerInnerHtml(pageFile) {
  const segments = getTickerSegments(pageFile);
  const loop = [...segments, ...segments];
  return loop
    .map((seg, i) => {
      const item = `<span class="ticker-item">${seg.html}</span>`;
      const sep = i < loop.length - 1 ? '<span class="ticker-separator">•</span>' : '';
      return item + sep;
    })
    .join('\n      ');
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
