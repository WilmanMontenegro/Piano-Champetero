/**
 * Site-wide parameters — edit here for copy, timing, and ticker credits.
 * Code in English; user-facing strings in Spanish (es-419).
 */

/** Must match --nav-compact-max in styles/tokens.css (container query uses px literal). */
export const NAV_COMPACT_MAX_PX = 620;

/**
 * WhatsApp Community invite link (Comunidades → enlace de invitación).
 * Leave empty to hide ticker line and contact CTA until the community is live.
 */
export const WHATSAPP_COMMUNITY_URL = 'https://chat.whatsapp.com/JDQqXwQoJ8V3YcD52zjZfR';

/** Label for floating WhatsApp button (es-419). */
export const WHATSAPP_COMMUNITY_LABEL = 'Únete al grupo';

export const AUDIO_UI = {
  hitFlashMs: 140,
};

/** @typedef {{ id: string, name: string, thanksFor: string, emoji?: string, pages?: string[] }} TickerContributor */

/** @type {TickerContributor[]} */
export const TICKER_CONTRIBUTORS = [
  {
    id: 'jiliar',
    name: 'Jiliar Silgado',
    thanksFor: 'por sugerir el efecto de luz al tocar los pads',
    emoji: '✨',
  },
  {
    id: 'jhon-karo',
    name: 'Jhon Karo',
    thanksFor: 'por sugerir más pads para la batería champeta',
    emoji: '🥁',
  },
  {
    id: 'jorge-mercado',
    name: 'Jorge Mercado',
    thanksFor: 'por tu sugerencia sobre la edición de samplers',
    emoji: '🥁',
    pages: ['sobre-nosotros.html', 'politicas-privacidad.html'],
  },
];

/**
 * Static ticker lines (HTML allowed for links).
 * @type {{ id: string, html: string }[]}
 */
export const TICKER_STATIC_LINES = [
  {
    id: 'pads-promo',
    html: '¡Nueva vista de Pads disponible! Prueba rejillas de 9, 12, 16 o hasta 24 pads <a href="virtual.html">aquí</a>',
  },
  {
    id: 'contact-cta',
    html: '¿Tienes ideas o mejoras? <a href="contactanos.html">Repórtalas aquí</a> y te mencionaremos',
  },
];

/** virtual.html uses the same copy without the “aquí” link on pads line */
export const TICKER_STATIC_LINES_VIRTUAL = [
  {
    id: 'pads-promo',
    html: '¡Nueva vista de Pads disponible! Prueba rejillas de 9, 12, 16 o hasta 24 pads',
  },
  TICKER_STATIC_LINES[1],
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
      html: `Únete a nuestra comunidad en <a href="${href}" target="_blank" rel="noopener noreferrer">WhatsApp</a> — ideas, ritmos y soporte`,
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
