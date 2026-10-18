import { ROOT_FUNCTION } from '../spine/content';

/**
 * A schematic lower-limb chart (front and back view of one leg, drawn for this site) with the ISNCSCI key sensory
 * points of L1-S1 placed where the ISNCSCI worksheet marks them. It is not a dermatome map: published maps disagree
 * (see the statement shown with it). The root given as `active` is highlighted. Coordinates in ROOT_FUNCTION are for
 * the left leg (front view: medial is towards the chart's left); the right leg is its mirror image.
 */
const NS = 'http://www.w3.org/2000/svg';
// the left leg in a 100 x 104 frame, groin at the top and toes or heel at the bottom. Front: medial towards x = 0,
// the foot seen end-on (toes at the bottom). Back: lateral towards x = 0, the heel at the bottom.
const LEG = 'M26 2 L74 2 C76 18 70 36 65 48 C64 52 64 56 65 60 C68 68 64 78 59 86 C60 90 64 93 66 97 C67 100 64 102 60 102 '
  + 'L40 102 C35 102 34 99 36 96 C38 92 40 89 41 86 C37 76 32 66 35 58 C36 54 36 51 35 48 C31 36 27 18 26 2 Z';
const PATELLA = 'M50 46 C55 46 56 50 56 53 C56 57 53 59 50 59 C47 59 44 57 44 53 C44 50 45 46 50 46 Z';
const LEG_BACK = 'M26 2 L74 2 C73 18 69 36 65 48 C64 51 64 54 65 58 C68 66 63 76 59 86 C60 92 58 99 50 100 '
  + 'C42 99 40 92 41 86 C36 78 32 68 35 60 C36 56 36 52 35 48 C30 36 24 18 26 2 Z';

function el(tag: string, attrs: Record<string, string | number>, text?: string): SVGElement {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text !== undefined) e.textContent = text;
  return e;
}

export function bodyChart(active: string | null, side: 'L' | 'R' = 'L'): SVGSVGElement {
  const leg = side === 'L' ? 'left' : 'right';
  const svg = el('svg', { viewBox: '0 0 230 124', class: 'body-chart', role: 'img',
    'aria-label': active ? `Key sensory point of ${active} on a chart of the ${leg} leg` : `Key sensory points L1 to S1 on a chart of the ${leg} leg` }) as SVGSVGElement;
  const views: ['front' | 'back', number, string, string][] = [['front', 5, LEG, 'front'], ['back', 125, LEG_BACK, 'back']];
  const mirror = side === 'R';
  for (const [view, dx, path, label] of views) {
    const g = el('g', { transform: `translate(${dx} 8)` });
    const flip = mirror ? 'translate(100 0) scale(-1 1)' : '';
    g.append(el('path', { d: path, class: 'bc-leg', transform: flip }));
    if (view === 'front') g.append(el('path', { d: PATELLA, class: 'bc-detail', transform: flip }));
    g.append(el('text', { x: 50, y: -1, class: 'bc-view', 'text-anchor': 'middle' }, `${leg === 'left' ? 'Left' : 'Right'} leg, ${label}`));
    // which edge is medial: front view of the left leg and back view of the right leg have it on the left
    const medialLeft = (view === 'front') !== mirror;
    g.append(el('text', { x: 24, y: 110, class: 'bc-side', 'text-anchor': 'start' }, medialLeft ? 'medial' : 'lateral'));
    g.append(el('text', { x: 76, y: 110, class: 'bc-side', 'text-anchor': 'end' }, medialLeft ? 'lateral' : 'medial'));
    for (const [root, f] of Object.entries(ROOT_FUNCTION)) {
      if (f.sensoryPoint.view !== view) continue;
      const on = root === active;
      const y = f.sensoryPoint.y;
      const x = mirror ? 100 - f.sensoryPoint.x : f.sensoryPoint.x;
      g.append(el('circle', { cx: x, cy: y, r: on ? 3.6 : 2.2, class: on ? 'bc-dot on' : 'bc-dot' }));
      g.append(el('text', { x: x + (x > 50 ? 5 : -5), y: y + 1.4, class: on ? 'bc-lab on' : 'bc-lab', 'text-anchor': x > 50 ? 'start' : 'end' }, root));
    }
    svg.append(g);
  }
  return svg;
}
