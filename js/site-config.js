/**
 * Site-wide parameters — edit here for copy, timing, and ticker credits.
 * Code in English; user-facing strings in Spanish (es-419).
 */

/** Viewport breakpoints — must match styles/tokens.css */
export const BREAKPOINT_DESKTOP_MIN_PX = 1024;
export const BREAKPOINT_TABLET_MIN_PX = 768;
/** Max viewport width for mobile nav (hamburger below tablet). */
export const NAV_MOBILE_MAX_PX = 767;

/**
 * WhatsApp Community invite link (Comunidades → enlace de invitación).
 * Leave empty to hide ticker line and contact CTA until the community is live.
 */
export const WHATSAPP_COMMUNITY_URL = 'https://chat.whatsapp.com/JDQqXwQoJ8V3YcD52zjZfR';

/** Label for floating WhatsApp button (es-419). */
export const WHATSAPP_COMMUNITY_LABEL = 'Únete al grupo';

export const AUDIO_UI = {
  hitFlashMs: 140,
  /** Same pad: min ms between hits (Roland Mask Time 0–64 ms). */
  retriggerMaskMs: 45,
  /**
   * Note repeat (MPC "Note Repeat") — off by default; user enables "Redoble" in UI.
   * One-shot: tap or hold = sample plays once (Akai SAMPLE PLAY = ONE SHOT).
   * Redoble on: retriggers at intervalMs while held (tempo ref: 1/16 @ 120 BPM ≈ 125 ms).
   */
  noteRepeat: {
    enabled: false,
    intervalMs: 125,
  },
};

/** @typedef {{ id: string, name: string, thanksFor: string, emoji?: string, pages?: string[] }} TickerContributor */

/** @type {TickerContributor[]} */
export const TICKER_CONTRIBUTORS = [
  {
    id: 'alekey-grabacion',
    name: 'Alekey',
    thanksFor: 'por la idea de grabar lo que tocás en la batería',
    emoji: '🎙️',
  },
  {
    id: 'cesar-mobile-iphone',
    name: 'Cesar Garay',
    thanksFor: 'por sugerir arreglar la vista móvil para usarla mejor en iPhone',
    emoji: '📱',
  },
];

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

  const thanks = TICKER_CONTRIBUTORS.filter(
    (c) => !c.pages || c.pages.includes(file)
  ).map((c) => ({
    html: `🎉 ¡Gracias <strong>${escapeHtml(c.name)}</strong> ${escapeHtml(c.thanksFor)}! ${c.emoji || ''}`.trim(),
  }));

  const statics = staticLines.map((line) => ({ html: line.html }));
  return [...thanks, ...statics];
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
