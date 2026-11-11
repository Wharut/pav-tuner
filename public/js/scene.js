// Builds the SVG scenery: the tail-fan meter, the headstock and the win fan.

const NS = 'http://www.w3.org/2000/svg';

function el(name, attrs = {}, parent) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
}

export const FAN = { cx: 200, cy: 262, steps: 10, degPerStep: 7.6, centsPerStep: 5, maxNeedleDeg: 72 };

/** 21 feathers, 5 cents apart. Returns them ordered from -10 (flat) to +10 (sharp). */
export function buildFan(group) {
  const feathers = [];
  for (let i = -FAN.steps; i <= FAN.steps; i++) {
    const center = i === 0;
    const len = center ? 182 : i % 2 === 0 ? 172 : 150;
    const s = center ? 1.3 : 1;
    const y = FAN.cy - len;
    const g = el('g', {
      class: `feather${center ? ' is-center' : ''}`,
      transform: `rotate(${(i * FAN.degPerStep).toFixed(2)} ${FAN.cx} ${FAN.cy})`,
      style: `--i:${Math.abs(i)}`,
    }, group);
    el('line', { class: 'f-stem', x1: FAN.cx, y1: FAN.cy - 30, x2: FAN.cx, y2: y + 10 }, g);
    el('ellipse', { class: 'f-plume', cx: FAN.cx, cy: y, rx: 11 * s, ry: 17 * s }, g);
    el('ellipse', { class: 'f-ring', cx: FAN.cx, cy: y + 1, rx: 8 * s, ry: 12.5 * s }, g);
    el('ellipse', { class: 'f-mid', cx: FAN.cx, cy: y + 2, rx: 5.6 * s, ry: 8.6 * s }, g);
    el('ellipse', { class: 'f-core', cx: FAN.cx, cy: y + 4, rx: 3.4 * s, ry: 4.8 * s }, g);
    feathers.push(g);
  }
  return feathers;
}

/**
 * Draws a headstock for any string count. Lower strings go on the left,
 * nearest the nut first, the way a real 3+3 (or 2+2) headstock is strung.
 * @returns {{pegs: SVGGElement[], strings: SVGPolylineElement[], rings: SVGCircleElement[]}}
 */
export function buildHeadstock(svg, notes) {
  svg.replaceChildren();
  const n = notes.length;
  const left = Math.ceil(n / 2);
  const rows = Math.max(left, n - left);
  const rowY = (k) => (rows >= 3 ? 70 + k * (160 / (rows - 1)) : 104 + k * 100);
  const gap = n > 4 ? 13 : 18;
  const POST_L = 174, POST_R = 226, PEG_L = 56, PEG_R = 344, NUT_Y = 304;

  el('rect', { class: 'hs-neck', x: 156, y: 308, width: 88, height: 40 }, svg);
  el('line', { class: 'hs-fret', x1: 157, y1: 336, x2: 243, y2: 336 }, svg);

  const layout = notes.map((_, i) => {
    const onLeft = i < left;
    const row = onLeft ? left - 1 - i : i - left;
    return { onLeft, y: rowY(row), postX: onLeft ? POST_L : POST_R, pegX: onLeft ? PEG_L : PEG_R, nutX: 200 + (i - (n - 1) / 2) * gap };
  });

  for (const p of layout) {
    el('line', { class: 'hs-shaft-out', x1: p.pegX, y1: p.y, x2: p.postX, y2: p.y }, svg);
    el('line', { class: 'hs-shaft-in', x1: p.pegX, y1: p.y, x2: p.postX, y2: p.y }, svg);
  }
  el('path', { class: 'hs-body', d: 'M152 306 L139 54 C138 24 172 14 200 31 C228 14 262 24 261 54 L248 306 Z' }, svg);
  el('path', { class: 'hs-inlay', d: 'M160 296 L149 58 C149 36 174 28 200 44 C226 28 251 36 251 58 L240 296' }, svg);
  el('use', { href: '#eye', x: 189, y: 50, width: 22, height: 31 }, svg);

  const strings = layout.map((p, i) =>
    el('polyline', {
      class: 'string',
      points: `${p.postX},${p.y} ${p.nutX},${NUT_Y} ${p.nutX},348`,
      fill: 'none',
      'stroke-width': (3.4 - (i / Math.max(1, n - 1)) * 1.9).toFixed(2),
    }, svg));

  for (const p of layout) {
    el('circle', { class: 'hs-post', cx: p.postX, cy: p.y, r: 8 }, svg);
    el('circle', { class: 'hs-post-dot', cx: p.postX, cy: p.y, r: 2.5 }, svg);
  }
  el('rect', { class: 'hs-nut', x: 150, y: 299, width: 100, height: 11, rx: 3 }, svg);

  const pegs = [];
  const rings = [];
  const R = 40;
  const circumference = 2 * Math.PI * R;
  layout.forEach((p, i) => {
    const note = notes[i];
    const g = el('g', {
      class: 'peg', role: 'button', tabindex: 0, transform: `translate(${p.pegX} ${p.y})`,
      'aria-label': `String ${n - i}, ${note.label}${note.octave}`, 'aria-pressed': 'false', 'data-index': i,
    }, svg);
    const pop = el('g', { class: 'peg-pop' }, g);
    el('circle', { class: 'peg-track', r: R }, pop);
    const ring = el('circle', { class: 'peg-progress', r: R, 'stroke-dasharray': circumference.toFixed(1), 'stroke-dashoffset': circumference.toFixed(1) }, pop);
    ring.dataset.c = circumference;
    el('circle', { class: 'peg-face', r: 34 }, pop);
    el('circle', { class: 'peg-rim', r: 28.5 }, pop);
    el('text', { class: 'peg-label', y: 7 }, pop).textContent = note.label;
    el('text', { class: 'peg-oct', y: 23 }, pop).textContent = note.octave;
    el('use', { class: 'peg-star', href: '#star8', x: 15, y: -37, width: 22, height: 22 }, pop);
    pegs.push(g);
    rings.push(ring);
  });

  return { pegs, strings, rings };
}

/** Full-colour fan behind the win ribbon. */
export function buildWinFan(svg) {
  svg.replaceChildren();
  const count = 9;
  for (let i = 0; i < count; i++) {
    const angle = -64 + (128 / (count - 1)) * i;
    el('use', { class: 'wf', href: '#plume', x: 172, y: 18, width: 56, height: 210, style: `transform:rotate(${angle}deg);--i:${i}` }, svg);
  }
  el('use', { href: '#bird', transform: 'translate(0 -62)' }, svg);
}
