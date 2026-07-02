// Inline SVG icons (16x16, currentColor stroke) — one coherent set, no icon fonts.
// Each helper returns an <svg> element.

function svg(body: string): SVGElement {
  const el = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  el.setAttribute("width", "16");
  el.setAttribute("height", "16");
  el.setAttribute("viewBox", "0 0 24 24");
  el.setAttribute("fill", "none");
  el.setAttribute("stroke", "currentColor");
  el.setAttribute("stroke-width", "2");
  el.setAttribute("stroke-linecap", "round");
  el.setAttribute("stroke-linejoin", "round");
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = body;
  return el;
}

// Brand mark: a 2×2 cue rack with one live firing tile.
// Matches assets/logo.svg. Kept inline so the top-bar brand renders without
// an extra network request.
export function logo(): SVGElement {
  const el = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  el.setAttribute("width", "26");
  el.setAttribute("height", "26");
  el.setAttribute("viewBox", "0 0 48 48");
  el.setAttribute("fill", "none");
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = `
    <rect x="3" y="3" width="20" height="20" rx="4" fill="#e6edf3" />
    <rect x="25" y="3" width="20" height="20" rx="4" fill="#e6edf3" />
    <rect x="25" y="25" width="20" height="20" rx="4" fill="#e6edf3" />
    <rect x="3" y="25" width="20" height="20" rx="4" fill="#4fd1c5" />
    <circle cx="19" cy="28" r="2.5" fill="#6a45e6" />
  `;
  return el;
}

export const icon = {
  logo: () => logo(),
  play: () =>
    svg(
      '<polygon points="6 4 20 12 6 20 6 4" fill="currentColor" stroke="none" />',
    ),
  pause: () =>
    svg(
      '<rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/>',
    ),
  stop: () =>
    svg(
      '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/>',
    ),
  mute: () =>
    svg(
      '<path d="M11 5 6 9H3v6h3l5 4V5z"/><line x1="22" y1="9" x2="16" y2="15"/><line x1="16" y1="9" x2="22" y2="15"/>',
    ),
  mic: () =>
    svg(
      '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><line x1="12" y1="18" x2="12" y2="21"/>',
    ),
  headphones: () =>
    svg(
      '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><path d="M4 14a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2 1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1z"/><path d="M20 14a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2 1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1z"/>',
    ),
  search: () =>
    svg(
      '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    ),
  plus: () =>
    svg(
      '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    ),
  home: () =>
    svg('<path d="m3 11 9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/>'),
  grid: () =>
    svg(
      '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
    ),
  waves: () =>
    svg(
      '<path d="M3 8c3 0 3-4 6-4s3 4 6 4 3-4 6-4"/><path d="M3 16c3 0 3-4 6-4s3 4 6 4 3-4 6-4"/><path d="M3 22c3 0 3-4 6-4s3 4 6 4 3-4 6-4"/>',
    ),
  burst: () =>
    svg(
      '<path d="m12 2 2.1 6.2 6.4-1.4-4.3 5 4.3 5-6.4-1.4L12 22l-2.1-6.2-6.4 1.4 4.3-5-4.3-5 6.4 1.4L12 2z"/>',
    ),
  zap: () => svg('<path d="M13 2 4 14h7l-1 8 10-13h-7l1-7z"/>'),
  smile: () =>
    svg(
      '<circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>',
    ),
  music: () =>
    svg(
      '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    ),
  sparkles: () =>
    svg(
      '<path d="m12 3 1.7 5.1L19 10l-5.3 1.9L12 17l-1.7-5.1L5 10l5.3-1.9L12 3z"/><path d="m5 16 .8 2.2L8 19l-2.2.8L5 22l-.8-2.2L2 19l2.2-.8L5 16z"/><path d="m19 3 .8 2.2L22 6l-2.2.8L19 9l-.8-2.2L16 6l2.2-.8L19 3z"/>',
    ),
  loop: () =>
    svg(
      '<path d="M17 2v5h-5"/><path d="M7 22v-5h5"/><path d="M20 11a8 8 0 0 0-13.7-5.6L4 7.7"/><path d="M4 13a8 8 0 0 0 13.7 5.6L20 16.3"/>',
    ),
  trash: () =>
    svg(
      '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
    ),
  more: () =>
    svg(
      '<circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
    ),
  gear: () =>
    svg(
      '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3h0a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 1 1.5h0a1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v0a1.6 1.6 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
    ),
  close: () =>
    svg(
      '<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>',
    ),
  chevron: () => svg('<polyline points="9 6 15 12 9 18"/>'),
  refresh: () =>
    svg(
      '<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>',
    ),
  star: () =>
    svg(
      '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3z"/>',
    ),
  bolt: () =>
    svg(
      '<polygon points="13 2 4 14 11 14 10 22 20 9 13 9 13 2" fill="currentColor" stroke="none"/>',
    ),
};
