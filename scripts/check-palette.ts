/**
 * Palette check: WCAG contrast for every colour used as text, and colour-vision
 * deficiency (CVD) separation for colours that appear together in one view.
 *
 * CVD simulation: Machado, Oliveira & Fernandes 2009 (IEEE TVCG 15:1291),
 * severity 1.0 matrices, applied in linear RGB. Distance: CIEDE2000.
 * Run: npx vite-node scripts/check-palette.ts   (exit 1 on contrast failures)
 */
import palette from '../src/data/palette.json';
import { CONTENT, MAN, TGT } from '../src/data';
import { plan } from '../src/viewer/selection';
import { WM, WM_MAN } from '../src/tracts';

type RGB = [number, number, number];
const P = palette as unknown as Record<'light' | 'dark', Record<string, string>>;

const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as RGB;
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const unlin = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const lum = (rgb: RGB) => { const [r, g, b] = rgb.map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrast = (a: string, b: string) => {
  const [x, y] = [lum(hex(a)), lum(hex(b))].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const MACHADO: Record<string, number[][]> = {
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
};
const simulate = (rgb: RGB, m: number[][] | null): RGB => {
  if (!m) return rgb;
  const l = rgb.map(lin);
  return m.map((row) => unlin(Math.min(1, Math.max(0, row[0] * l[0] + row[1] * l[1] + row[2] * l[2])))) as RGB;
};
function lab(rgb: RGB): RGB {
  const [r, g, b] = rgb.map(lin);
  const xyz = [(0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, 0.2126 * r + 0.7152 * g + 0.0722 * b, (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883];
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const [fx, fy, fz] = xyz.map(f);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
function de2000(a: RGB, b: RGB): number {
  const [L1, a1, b1] = a, [L2, a2, b2] = b;
  const rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cm = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const h = (x: number, y: number) => { const v = Math.atan2(y, x) / rad; return v < 0 ? v + 360 : v; };
  const h1 = h(a1p, b1), h2 = h(a2p, b2);
  const dL = L2 - L1, dC = C2p - C1p;
  let dh = h2 - h1;
  if (C1p * C2p === 0) dh = 0; else if (dh > 180) dh -= 360; else if (dh < -180) dh += 360;
  const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin((dh / 2) * rad);
  const Lm = (L1 + L2) / 2, Cpm = (C1p + C2p) / 2;
  let hm = h1 + h2;
  if (C1p * C2p !== 0) hm = Math.abs(h1 - h2) > 180 ? (h1 + h2 + (h1 + h2 < 360 ? 360 : -360)) / 2 : (h1 + h2) / 2;
  const T = 1 - 0.17 * Math.cos((hm - 30) * rad) + 0.24 * Math.cos(2 * hm * rad) + 0.32 * Math.cos((3 * hm + 6) * rad) - 0.2 * Math.cos((4 * hm - 63) * rad);
  const SL = 1 + (0.015 * (Lm - 50) ** 2) / Math.sqrt(20 + (Lm - 50) ** 2), SC = 1 + 0.045 * Cpm, SH = 1 + 0.015 * Cpm * T;
  const RT = -2 * Math.sqrt(Cpm ** 7 / (Cpm ** 7 + 25 ** 7)) * Math.sin(60 * Math.exp(-(((hm - 275) / 25) ** 2)) * rad);
  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH));
}

// ---- 1. contrast (text uses)
const BASE = {
  light: { surface: '#FFFFFF', bg: '#E9EDF0', ink: '#14253A', muted: '#566879', link: '#1F55A8', warnBg: '#FBF1DC', warnInk: '#6A4A06', viewer: '#E4E9EE' },
  dark: { surface: '#18242F', bg: '#101A23', ink: '#E2E8EE', muted: '#9AAAB9', link: '#8FB5F2', warnBg: '#3A2E14', warnInk: '#F2D79A', viewer: '#0C141C' },
};
const TEXT_TOKENS = ['stn', 'gpi', 'vim', 'psa', 'snr', 'cm', 'vo', 'str', 'den', 'ppn']; // .seq strong, .err, accents
let fail = 0;
const rows: string[] = [];
for (const t of ['light', 'dark'] as const) {
  const b = BASE[t];
  const checks: [string, string, string, number][] = [
    ['ink/surface', b.ink, b.surface, 4.5], ['ink/bg', b.ink, b.bg, 4.5], ['muted/surface', b.muted, b.surface, 4.5],
    ['muted/bg', b.muted, b.bg, 4.5], ['link/surface', b.link, b.surface, 4.5], ['warn', b.warnInk, b.warnBg, 4.5],
    ...TEXT_TOKENS.map((k) => [`${k}/surface`, P[t][k], b.surface, 4.5] as [string, string, string, number]),
    // non-text graphics (swatches, structures on the viewer background): WCAG 1.4.11, 3:1
    ...Object.keys(P[t]).filter((k) => !['cortex', 'contact', 'ctx'].includes(k)).map((k) => [`${k}/viewer (graphic)`, P[t][k], b.viewer, 3] as [string, string, string, number]),
  ];
  for (const [name, fg, bg, min] of checks) {
    const c = contrast(fg, bg);
    const ok = c >= min;
    if (!ok && min === 4.5) fail++;
    rows.push(`${ok ? 'ok  ' : min === 4.5 ? 'FAIL' : 'warn'} ${t.padEnd(5)} ${name.padEnd(28)} ${c.toFixed(2)} (min ${min})`);
  }
}

// ---- 2. CVD separation for colours that appear together
const views = [
  ...CONTENT.indications.map((i) => plan(i.id, null, true)),
  ...CONTENT.symptoms.map((s) => plan(s.indicationId, s.id, true)),
];
const pairs = new Map<string, Set<string>>();
for (const p of views) {
  const tokens = new Set<string>();
  for (const [id, look] of p.looks) if (look === 'primary' || look === 'alt' || look === 'context') tokens.add(MAN.get(id)!.colour.token);
  for (const id of [...p.tracts.keys(), ...p.parcels.keys()]) tokens.add(MAN.get(id)!.colour.token);
  for (const m of p.markers) tokens.add(MAN.get(TGT.get(m.targetId)!.structureId)!.colour.token);
  const list = [...tokens].sort();
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const k = `${list[i]}|${list[j]}`;
    if (!pairs.has(k)) pairs.set(k, new Set());
    pairs.get(k)!.add(p.title);
  }
}
// white-matter section: the tracts of each group appear together
for (const g of WM.groups.filter((x) => x.kind !== 'all')) {
  const list = [...new Set(g.tractIds.map((id) => WM_MAN.get(id)!.colour.token))].sort();
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const k = `${list[i]}|${list[j]}`;
    if (!pairs.has(k)) pairs.set(k, new Set());
    pairs.get(k)!.add(`tracts: ${g.name}`);
  }
}
// cortex section: the six lobe colours appear together
{
  const list = ['lobeFrontal', 'lobeParietal', 'lobeTemporal', 'lobeOccipital', 'lobeCingulate', 'lobeInsula'];
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const k = `${list[i]}|${list[j]}`;
    if (!pairs.has(k)) pairs.set(k, new Set());
    pairs.get(k)!.add('cortex: lobes');
  }
}
// spine section: the colours drawn together in the 3D view (spSafe and spCaution only colour the lettered grade badge)
{
  const list = ['spBone', 'spDisc', 'spCord', 'spRoot', 'spRisk'];
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const k = `${list[i]}|${list[j]}`;
    if (!pairs.has(k)) pairs.set(k, new Set());
    pairs.get(k)!.add('spine: lumbar');
  }
}
// spine section, cervical: the neck's vessels and soft tissue (viscera and muscles share one colour) drawn with the
// bone, cord and roots
{
  const list = ['spBone', 'spDisc', 'spCord', 'spRoot', 'spRisk', 'spArtery', 'spVein', 'spSoft'];
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const k = `${list[i]}|${list[j]}`;
    if (!pairs.has(k)) pairs.set(k, new Set());
    pairs.get(k)!.add('spine: cervical');
  }
}
// skull base v3 (temporal bone): the ear's views draw bone (the ossicles too), nerves, the inner ear, the tympanic
// membrane and the petrous carotid together; its vessels view draws bone with the arteries and veins; the transsylvian
// view draws the brain (the insula apart), the arteries and nerves and the cut bone; the interhemispheric view the brain
// with its medial wall apart, the falx, the arteries and the sagittal sinuses (the falx a sheet, the superior sagittal
// sinus a tube along its edge); the telovelar view the cerebellum (its tonsils apart), the brainstem, the fourth
// ventricle, the arteries, sinuses and lower cranial nerves. The bone a craniotomy removes is drawn see-through in the
// viewer's ghost colour, so sbRemoved only colours its legend swatch and is not listed.
for (const [view, list] of [['skull base v3: ear', ['sbBone', 'sbArtery', 'sbNerve', 'sbLabyrinth', 'sbMembrane']], ['skull base v3: vessels', ['sbBone', 'sbArtery', 'sbVein']],
  ['skull base v3: transsylvian', ['sbBone', 'sbArtery', 'sbNerve', 'sbBrain', 'sbInsula']],
  ['skull base v3: interhemispheric', ['sbBone', 'sbArtery', 'sbVein', 'sbSoft', 'sbBrain', 'sbMedialWall']],
  ['skull base v3: telovelar', ['sbBone', 'sbArtery', 'sbVein', 'sbNerve', 'sbBrain', 'sbTonsil', 'sbBrainstem', 'sbCsf']],
  // the ventricles section: this CT's ventricles in its bone, with the catheter (a tube against their surface)
  ['ventricles: ventriculostomy', ['sbBone', 'sbCsf', 'electrode']],
  // the endoscopic view's 3D view: the structures around the ventricles (see-through), the vessels and the endoscope
  ['ventricles: endoscopic third ventriculostomy', ['sbBone', 'sbCsf', 'electrode', 'fx', 'mb', 'ot', 'sbArtery', 'sbBrain', 'sbBrainstem',
    'sbMedialWall', 'sbNerve', 'sbVein', 'str', 'thal', 'veChoroid']]] as const) {
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const k = `${list[i]}|${list[j]}`;
    if (!pairs.has(k)) pairs.set(k, new Set());
    pairs.get(k)!.add(view);
  }
}
const cvd: string[] = [];
const MIN_DE = 10;
for (const t of ['light', 'dark'] as const) {
  for (const [kind, m] of [['normal', null], ...Object.entries(MACHADO)] as [string, number[][] | null][]) {
    for (const [k, where] of pairs) {
      const [a, b] = k.split('|');
      const d = de2000(lab(simulate(hex(P[t][a]), m)), lab(simulate(hex(P[t][b]), m)));
      if (d < MIN_DE) cvd.push(`${t.padEnd(5)} ${kind.padEnd(12)} ${a}/${b}: ΔE00 ${d.toFixed(1)}  (${[...where].slice(0, 2).join('; ')}${where.size > 2 ? '…' : ''})`);
    }
  }
}

console.log('WCAG contrast');
rows.forEach((r) => console.log('  ' + r));
console.log(`\nCVD separation: ${pairs.size} colour pairs co-occur in a view; pairs below ΔE00 ${MIN_DE}:`);
console.log(cvd.length ? cvd.map((c) => '  ' + c).join('\n') : '  none');
console.log('\nPairs below threshold are also told apart by look (solid / outline / line / dashed) and labels.');
process.exit(fail ? 1 : 0);
