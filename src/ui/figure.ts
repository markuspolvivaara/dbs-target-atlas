import { BRAND } from '../brand';
import { h } from './h';

/**
 * "Save image" (the site audit's roadmap, section 3: figure export): the 3D view saved as a PNG for slides and
 * handouts, with what the reader chooses in a small dialog: the name labels and the orientation compass as on screen,
 * the legend, and a caption that names the view, the date, the link to it, and the sources and licences of what is
 * drawn (in full, or shortly with a link to the section's credits). Sizes: as on screen, twice that, or 3840 pixels
 * wide. The choices are kept in this browser.
 */

/** What the figure needs of the viewer (Viewer has these). */
export interface FigureViewer {
  capture(scale: number): HTMLCanvasElement | null;
  maxCaptureScale(): number;
  drawnCredits(): { items: { source: string; licence: string }[]; templateSlices: boolean };
}

export interface FigureParts {
  viewer: FigureViewer;
  stage: HTMLElement;
  labels: HTMLElement;
  leaders: SVGSVGElement;
  gizmo: SVGSVGElement;
  legend: HTMLElement;
}

type Size = '1x' | '2x' | '4k';
interface FigurePrefs { labels: boolean; compass: boolean; legend: boolean; caption: boolean; size: Size; licences: 'full' | 'short' }
const KEY = 'atlas-figure-prefs';
const DEFAULTS: FigurePrefs = { labels: true, compass: true, legend: false, caption: true, size: '2x', licences: 'full' };

function loadPrefs(): FigurePrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<FigurePrefs>;
    const p = { ...DEFAULTS, ...raw };
    if (!['1x', '2x', '4k'].includes(p.size)) p.size = DEFAULTS.size;
    if (!['full', 'short'].includes(p.licences)) p.licences = DEFAULTS.licences;
    return p;
  } catch {
    return { ...DEFAULTS };
  }
}
function savePrefs(p: FigurePrefs): void {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* not remembered */ }
}

/** The MRI templates' notice, which their licence asks to appear in all copies (NOTICE, section 3). */
const TEMPLATE_NOTICE = 'MRI slices: ICBM 2009b nonlinear asymmetric templates. Copyright (C) 1993–2004 Louis Collins, McConnell Brain Imaging Centre, Montreal Neurological Institute, McGill University.';

/** The view's size on screen (CSS pixels) and the scale for a size choice. */
function scaleFor(size: Size, w: number): number {
  return size === '1x' ? 1 : size === '2x' ? 2 : 3840 / w;
}

/** The "Save image" button and its dialog, for an atlas page's toolbar (`get`: the page's parts, read when used: the
 * toolbar is made before the viewer). */
export function figureControl(get: () => FigureParts): HTMLElement {
  let prefs = loadPrefs();
  const box = (k: 'labels' | 'compass' | 'legend' | 'caption', label: string, note?: string) => {
    const input = h('input', { type: 'checkbox', 'data-k': k }) as HTMLInputElement;
    input.checked = prefs[k];
    input.addEventListener('change', () => { prefs = { ...prefs, [k]: input.checked }; savePrefs(prefs); sync(); });
    return h('label', { class: 'view-setting' }, input, h('span', {}, label, note ? h('span', { class: 'view-setting-note' }, note) : null));
  };
  const radio = (name: 'size' | 'licences', value: string, label: HTMLElement | string) => {
    const input = h('input', { type: 'radio', name: `fig-${name}`, value }) as HTMLInputElement;
    input.checked = prefs[name] === value;
    input.addEventListener('change', () => { if (input.checked) { prefs = { ...prefs, [name]: value } as FigurePrefs; savePrefs(prefs); sync(); } });
    return h('label', { class: 'view-setting' }, input, h('span', {}, label));
  };
  const dims: Record<Size, HTMLElement> = { '1x': h('span', { class: 'fig-dims' }), '2x': h('span', { class: 'fig-dims' }), '4k': h('span', { class: 'fig-dims' }) };
  const captionNote = h('p', { class: 'view-setting-note fig-warn', hidden: true }, 'Without the caption the image does not name its sources and licences: give them with it (see this section’s Credits page).');
  const licenceSet = h('fieldset', { class: 'fig-set' }, h('legend', {}, 'Licences in the caption'),
    radio('licences', 'full', 'In full, as the Credits page gives them'),
    radio('licences', 'short', 'Short: the sources, and a link to the Credits page'));
  const status = h('p', { class: 'view-setting-note', role: 'status', 'aria-live': 'polite' });
  const save = h('button', { type: 'button', class: 'fig-save' }, 'Save PNG') as HTMLButtonElement;
  const cancel = h('button', { type: 'button', class: 'linklike' }, 'Cancel');
  const panel = h('div', { class: 'view-settings-panel fig-panel', id: 'fig-panel', role: 'dialog', 'aria-label': 'Save the view as an image', hidden: true },
    h('p', { class: 'fig-title' }, 'Save the view as an image'),
    h('fieldset', { class: 'fig-set' }, h('legend', {}, 'Include'),
      box('labels', 'Name labels', 'As on screen: with Labels set to Off there are none.'),
      box('compass', 'Orientation compass'),
      box('legend', 'Legend'),
      box('caption', 'Caption', 'The view’s name, the date, its link, and the sources and licences of what is drawn.')),
    captionNote, licenceSet,
    h('fieldset', { class: 'fig-set' }, h('legend', {}, 'Size'),
      radio('size', '1x', h('span', {}, 'As on screen', dims['1x'])),
      radio('size', '2x', h('span', {}, 'Twice the screen', dims['2x'])),
      radio('size', '4k', h('span', {}, '3840 pixels wide (4K)', dims['4k']))),
    h('div', { class: 'fig-actions' }, save, cancel), status);
  const btn = h('button', {
    type: 'button', class: 'tbtn', title: 'Save this view as an image, with its sources and licences', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-controls': 'fig-panel',
  }, 'Save image') as HTMLButtonElement;
  // (the dialog floats over the page, placed under the button: inside the stage it would be cut by the stage's edge
  // and drawn under the compass)
  const wrap = h('div', { class: 'fig-control' }, btn);
  const place = () => {
    const r = btn.getBoundingClientRect();
    const w = panel.offsetWidth;
    panel.style.top = `${Math.round(r.bottom + 6)}px`;
    panel.style.left = `${Math.round(Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)))}px`;
  };
  window.addEventListener('resize', () => { if (!panel.hidden) place(); });

  function sync(): void {
    for (const el of licenceSet.querySelectorAll('input')) (el as HTMLInputElement).disabled = !prefs.caption;
    licenceSet.classList.toggle('off', !prefs.caption);
    captionNote.hidden = prefs.caption;
    const parts = get();
    const c = parts.viewer.maxCaptureScale();
    const r = parts.stage.querySelector('canvas')!.getBoundingClientRect();
    for (const s of ['1x', '2x', '4k'] as Size[]) {
      const k = scaleFor(s, r.width);
      const input = panel.querySelector(`input[name="fig-size"][value="${s}"]`) as HTMLInputElement;
      input.disabled = !c || k > c;
      dims[s].textContent = ` ${Math.round(r.width * k)} × ${Math.round(r.height * k)} pixels${input.disabled && c ? ' (too large for this graphics card)' : ''}`;
    }
    save.disabled = !c;
    if (!c) status.textContent = 'The 3D view needs WebGL, which this browser could not start: there is nothing to save.';
  }
  const close = (refocus = false) => {
    if (panel.hidden) return;
    panel.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    if (refocus) btn.focus();
  };
  btn.addEventListener('click', () => {
    if (!panel.hidden) { close(); return; }
    prefs = loadPrefs();
    for (const el of panel.querySelectorAll('input[type="checkbox"]')) (el as HTMLInputElement).checked = prefs[(el as HTMLInputElement).dataset.k as 'labels'];
    for (const el of panel.querySelectorAll('input[type="radio"]')) { const i = el as HTMLInputElement; i.checked = prefs[i.name.slice(4) as 'size'] === i.value; }
    status.textContent = '';
    sync();
    if (!panel.isConnected) document.body.append(panel);
    panel.hidden = false;
    place();
    btn.setAttribute('aria-expanded', 'true');
    save.focus();
  });
  cancel.addEventListener('click', () => close(true));
  panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); } });
  document.addEventListener('click', (e) => { if (!wrap.contains(e.target as Node) && !panel.contains(e.target as Node)) close(); });
  save.addEventListener('click', () => {
    status.textContent = 'Drawing…';
    // (a moment for the status to show before the drawing holds the page up; not a frame: a hidden page draws none)
    setTimeout(() => {
      const canvas = composeFigure(get(), prefs);
      if (!canvas) { status.textContent = 'The view could not be drawn.'; return; }
      canvas.toBlob((blob) => {
        if (!blob) { status.textContent = 'The image could not be made (it may be too large for this browser).'; return; }
        const a = h('a', { href: URL.createObjectURL(blob), download: fileName() }) as HTMLAnchorElement;
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        status.textContent = `Saved ${a.download} (${canvas.width} × ${canvas.height} pixels).`;
      }, 'image/png');
    }, 30);
  });
  return wrap;
}

/** e.g. openneuroatlas-arcuate-fasciculus-white-matter-tracts-2026-11-19.png */
function fileName(): string {
  const slug = (t: string) => t.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const parts = document.title.split(' · ').filter((x) => x !== BRAND.name);
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `${slug(BRAND.name.replace(/^Open /, 'open-'))}-${slug(parts.join(' ')).slice(0, 80)}-${date}.png`;
}

// ---------------------------------------------------------------- drawing
const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const FONT = '"Atkinson Hyperlegible", system-ui, sans-serif';

/** The lines of a text that fit `width` (words kept whole; a word longer than the width on a line of its own). */
export function wrap(ctx: Pick<CanvasRenderingContext2D, 'measureText'>, text: string, width: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const w of text.split(/\s+/).filter(Boolean)) {
    const t = line ? `${line} ${w}` : w;
    if (line && ctx.measureText(t).width > width) { out.push(line); line = w; } else line = t;
  }
  if (line) out.push(line);
  return out;
}

/** The caption's paragraphs: the view, the site, the date and the link; then the sources and licences of what is drawn. */
export function captionText(credits: { items: { source: string; licence: string }[]; templateSlices: boolean }, licences: 'full' | 'short', title: string, href: string, creditsHref: string, date: Date): { title: string; lines: string[] } {
  const day = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const lines = [`${BRAND.name}, saved ${day}. This view: ${href}`];
  if (licences === 'full') {
    // grouped by licence: each licence once, with the sources it covers
    const by = new Map<string, string[]>();
    for (const c of credits.items) by.set(c.licence, [...(by.get(c.licence) ?? []), c.source]);
    for (const [lic, srcs] of by) lines.push(`${[...new Set(srcs)].join('; ')}. Licence: ${lic}.`);
  } else {
    lines.push(`Sources: ${[...new Set(credits.items.map((c) => c.source))].join('; ')}. Licences and attribution: ${creditsHref}`);
  }
  if (credits.templateSlices) lines.push(TEMPLATE_NOTICE);
  return { title, lines };
}

/** The figure: the view drawn at the chosen size, with what the reader chose on it, beside it and under it. */
export function composeFigure(parts: FigureParts, prefs: FigurePrefs): HTMLCanvasElement | null {
  const viewCanvas = parts.stage.querySelector('canvas')!;
  const vr = viewCanvas.getBoundingClientRect();
  const view = parts.viewer.capture(scaleFor(prefs.size, vr.width));
  if (!view) return null;
  const k = view.width / vr.width;
  const pad = Math.round(14 * k);
  // the legend: the rows shown (not the hidden ones, nor the actions)
  // (also when the legend box is closed on screen)
  const rows = prefs.legend ? ([...parts.legend.querySelectorAll(':scope > li')] as HTMLElement[]).filter((li) => !li.classList.contains('off') && !li.classList.contains('lg-actions')) : [];
  const legendW = rows.length ? Math.round(280 * k) : 0;
  const probe = document.createElement('canvas').getContext('2d')!;
  // each row's text in up to two lines (a longer one ends in "…")
  const legFont = `${Math.round(12.5 * k)}px ${FONT}`;
  probe.font = legFont;
  const rowText = rows.map((li) => {
    const lines = wrap(probe, (li.textContent ?? '').replace(/\s+/g, ' ').trim(), legendW - pad * 2 - 30 * k);
    return lines.length > 2 ? [lines[0], `${lines[1]}…`] : lines;
  });
  const lineL = Math.round(16 * k), rowGap = Math.round(6 * k);
  const rowH = rowText.map((l) => Math.max(Math.round(16 * k), l.length * lineL) + rowGap);
  const legendH = rows.length ? pad * 2 + rowH.reduce((a, b) => a + b, 0) + Math.round(24 * k) : 0;
  // the caption
  const capFont = `${Math.round(12.5 * k)}px ${FONT}`, capTitle = `700 ${Math.round(15 * k)}px ${FONT}`;
  const capW = view.width + legendW - 2 * pad;
  const cap = prefs.caption
    ? captionText(parts.viewer.drawnCredits(), prefs.licences, document.title.replace(` · ${BRAND.name}`, ''), location.href,
      `${location.origin}${location.pathname}#/credits`, new Date())
    : null;
  probe.font = capFont;
  const capLines = cap ? cap.lines.flatMap((l, i) => [...wrap(probe, l, capW), ...(i < cap.lines.length - 1 ? [''] : [])]) : [];
  const lineH = Math.round(17 * k);
  const capH = cap ? pad * 2 + Math.round(22 * k) + capLines.length * lineH : 0;
  const W = view.width + legendW;
  const H = Math.max(view.height, legendH) + capH;
  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const ctx = out.getContext('2d')!;
  ctx.fillStyle = css('--surface') || '#fff';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = css('--viewer-bg') || '#000';
  ctx.fillRect(0, 0, view.width, Math.max(view.height, legendH));
  ctx.drawImage(view, 0, 0);
  const at = (r: DOMRect) => ({ x: (r.left - vr.left) * k, y: (r.top - vr.top) * k, w: r.width * k, h: r.height * k });
  // the name labels and their leaders, where they are on screen
  if (prefs.labels) {
    const svgR = parts.leaders.getBoundingClientRect();
    ctx.lineWidth = Math.max(1, k);
    for (const el of parts.leaders.children) {
      const st = getComputedStyle(el);
      if (el.tagName === 'line') {
        const n = (a: string) => Number(el.getAttribute(a));
        ctx.strokeStyle = st.stroke; ctx.globalAlpha = Number(st.opacity) || 1;
        ctx.beginPath();
        ctx.moveTo((svgR.left - vr.left + n('x1')) * k, (svgR.top - vr.top + n('y1')) * k);
        ctx.lineTo((svgR.left - vr.left + n('x2')) * k, (svgR.top - vr.top + n('y2')) * k);
        ctx.stroke();
      } else if (el.tagName === 'circle') {
        const n = (a: string) => Number(el.getAttribute(a));
        ctx.fillStyle = st.fill; ctx.globalAlpha = Number(st.opacity) || 1;
        ctx.beginPath();
        ctx.arc((svgR.left - vr.left + n('cx')) * k, (svgR.top - vr.top + n('cy')) * k, n('r') * k, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    for (const el of parts.labels.children) {
      const e = el as HTMLElement;
      if (e.hidden || !e.textContent) continue;
      const st = getComputedStyle(e);
      const b = at(e.getBoundingClientRect());
      ctx.globalAlpha = Number(st.opacity) || 1;
      ctx.fillStyle = st.backgroundColor;
      ctx.strokeStyle = st.borderTopColor;
      ctx.beginPath();
      ctx.roundRect(b.x, b.y, b.w, b.h, 5 * k);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = st.color;
      ctx.font = `${st.fontStyle} ${st.fontWeight} ${parseFloat(st.fontSize) * k}px ${FONT}`;
      ctx.textBaseline = 'middle';
      const text = wrap(ctx, e.textContent, Infinity)[0] ?? '';
      ctx.save();
      ctx.beginPath();
      ctx.rect(b.x, b.y, b.w, b.h);
      ctx.clip();
      ctx.fillText(text, b.x + parseFloat(st.paddingLeft) * k, b.y + b.h / 2);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
  // the orientation compass: its circle, axes and letters
  if (prefs.compass && parts.gizmo.getBoundingClientRect().width) {
    const g = at(parts.gizmo.getBoundingClientRect());
    const gs = getComputedStyle(parts.gizmo);
    const sx = g.w / 80, cx = g.x + g.w / 2, cy = g.y + g.h / 2;
    ctx.fillStyle = gs.backgroundColor;
    ctx.strokeStyle = gs.borderTopColor;
    ctx.lineWidth = k;
    ctx.beginPath();
    ctx.arc(cx, cy, g.w / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    for (const el of parts.gizmo.children) {
      const st = getComputedStyle(el);
      const n = (a: string) => Number(el.getAttribute(a));
      if (el.tagName === 'line') {
        ctx.strokeStyle = st.stroke; ctx.lineWidth = parseFloat(st.strokeWidth) * sx;
        ctx.beginPath();
        ctx.moveTo(cx + n('x1') * sx, cy + n('y1') * sx);
        ctx.lineTo(cx + n('x2') * sx, cy + n('y2') * sx);
        ctx.stroke();
      } else if (el.tagName === 'text') {
        ctx.fillStyle = st.fill;
        ctx.font = `${st.fontWeight} ${parseFloat(st.fontSize) * sx}px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(el.textContent ?? '', cx + n('x') * sx, cy + n('y') * sx);
      }
    }
    ctx.textAlign = 'start';
  }
  // the legend, beside the view
  if (rows.length) {
    const x0 = view.width + pad;
    ctx.fillStyle = css('--ink') || '#000';
    ctx.font = `700 ${Math.round(13 * k)}px ${FONT}`;
    ctx.textBaseline = 'middle';
    ctx.fillText('Legend', x0, pad + Math.round(10 * k));
    let top = pad + Math.round(24 * k);
    rows.forEach((li, i) => {
      const y = top + rowH[i] / 2 - rowGap / 2;
      top += rowH[i];
      const sw = li.querySelector('.sw') as HTMLElement | null;
      const c = sw ? getComputedStyle(sw).getPropertyValue('--c').trim() : '';
      if (sw && c) {
        const cls = sw.classList;
        ctx.globalAlpha = cls.contains('patch') ? 0.7 : cls.contains('border') ? 0.7 : 1;
        ctx.fillStyle = c; ctx.strokeStyle = c;
        const sw0 = x0, sww = 22 * k, swh = 12 * k;
        if (cls.contains('line')) {
          ctx.lineWidth = (cls.contains('border') ? 2 : cls.contains('alt') ? 3 : 4) * k;
          ctx.setLineDash(cls.contains('alt') ? [4 * k, 3 * k] : []);
          ctx.beginPath(); ctx.moveTo(sw0, y); ctx.lineTo(sw0 + sww, y); ctx.stroke();
          ctx.setLineDash([]);
        } else if (cls.contains('dot') || cls.contains('ring')) {
          ctx.beginPath(); ctx.arc(sw0 + sww / 2, y, swh / 2, 0, Math.PI * 2);
          if (cls.contains('ring')) { ctx.lineWidth = 2.5 * k; ctx.stroke(); } else ctx.fill();
        } else if (cls.contains('outline')) {
          ctx.lineWidth = 2.5 * k; ctx.beginPath(); ctx.roundRect(sw0, y - swh / 2, sww, swh, 3 * k); ctx.stroke();
        } else {
          ctx.beginPath(); ctx.roundRect(sw0, y - swh / 2, sww, swh, (cls.contains('patch') ? 6 : 3) * k); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = css('--ink') || '#000';
      ctx.font = legFont;
      const lines = rowText[i];
      lines.forEach((l, j) => ctx.fillText(l, x0 + 30 * k, y + (j - (lines.length - 1) / 2) * lineL));
    });
  }
  // the caption, under both
  if (cap) {
    let y = Math.max(view.height, legendH) + pad;
    ctx.fillStyle = css('--line') || '#ccc';
    ctx.fillRect(0, y - pad, W, Math.max(1, Math.round(k)));
    ctx.fillStyle = css('--ink') || '#000';
    ctx.textBaseline = 'top';
    ctx.font = capTitle;
    ctx.fillText(cap.title, pad, y);
    y += Math.round(22 * k);
    ctx.font = capFont;
    ctx.fillStyle = css('--muted') || '#555';
    for (const l of capLines) { if (l) ctx.fillText(l, pad, y); y += lineH; }
  }
  return out;
}
