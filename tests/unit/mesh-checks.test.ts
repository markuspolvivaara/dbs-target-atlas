import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TARGETS } from '../../src/data/targets';
import { pointsInside } from './glb';
import { across, joined, nodeStats, PUBLIC, sideProblems, soup, volume, widthAt, type NodeStats } from './meshcheck';

/**
 * The site audit's geometry checks (audit/07-roadmap.md, "Geometry checks in CI"; the findings in audit/04-models.md),
 * run on the files as they are served, so that they run where the pipeline does not and measure what the site draws,
 * not what the pipeline reported: the pipeline's own checks had passed while the result was wrong. Each check here
 * fails on the files the audit found wrong (checked against them, from git, when it was written: the seven lesion
 * parts of MB-01, the brainstem of MA-01, the skull of MB-06).
 *
 * Elsewhere, also on the shipped files: meshes inside out (winding.test.ts); vertebrae in each other, the roots and
 * the vertebral artery in bone (spine.test.ts); the v1 hypoglossal nerve, arteries and sinuses in bone
 * (skullbase.test.ts); cerebrum and cerebellum through the tentorium (tentorium.test.ts).
 */

/**
 * Each section's frame, as a box: the head (or the spine and pelvis) the frame is measured in, with about 10 mm to
 * spare. A file in another frame's millimetres, in centimetres, or with its quantization offset lost lies outside it.
 * `span`: what the section's files together reach across, front to back and top to bottom, at least (about 85 % of
 * what they reach in November 2026): a section shrunk, or in the wrong units, falls short of it.
 */
type Box = [[number, number], [number, number], [number, number]];
const MNI: Box = [[-85, 85], [-120, 88], [-85, 95]];                // ICBM 2009b (and the 2009a tracts drawn on it)
const ZANATOMY: Box = [[-90, 90], [-130, 95], [-115, 125]];         // v1: from the Z-Anatomy model's hypophysial fossa
const CT: Box = [[-85, 85], [-120, 75], [-105, 115]];               // v2, v3, ventricles, vascular: from the CT's fitted fossa
const SPINE: Box = [[-160, 160], [-100, 110], [-215, 560]];         // one CT, from the centre of the L5 body
const SECTIONS: { dir: string; box: Box; span: [number, number, number]; midlineAtZero: boolean }[] = [
  { dir: 'meshes', box: MNI, span: [125, 160, 115], midlineAtZero: true },
  { dir: 'tracts', box: MNI, span: [105, 125, 130], midlineAtZero: true },
  { dir: 'cortex', box: MNI, span: [125, 160, 115], midlineAtZero: true },
  { dir: 'brainstem', box: MNI, span: [65, 55, 65], midlineAtZero: true },
  { dir: 'wm', box: MNI, span: [120, 155, 115], midlineAtZero: true },
  { dir: 'wm-ends', box: MNI, span: [120, 155, 105], midlineAtZero: true },
  { dir: 'skullbase', box: ZANATOMY, span: [135, 175, 185], midlineAtZero: true },
  { dir: 'skullbase-ct', box: CT, span: [125, 150, 170], midlineAtZero: true },
  { dir: 'skullbase-v3', box: CT, span: [120, 145, 140], midlineAtZero: true },
  { dir: 'ventricles', box: CT, span: [55, 85, 60], midlineAtZero: true },
  { dir: 'vascular', box: CT, span: [110, 130, 130], midlineAtZero: true },
  // (the CT's midline is the patient's own, up to 12 mm off x = 0 along the thoracic spine: L and R are compared)
  { dir: 'spine', box: SPINE, span: [260, 160, 650], midlineAtZero: false },
];
const TRIANGLES = 4, LINES = 1;

interface Volume { file: string; dims: number[]; origin: number[]; spacing: number }
interface SbStructure { id: string; name: string; file: string; type: string; category?: string; inBone?: { share: number }; approach?: unknown; pushedFrom?: unknown; tumourView?: string; replaces?: string; forView?: unknown }
// (the manifests as served)
const served = <T>(name: string): T => JSON.parse(readFileSync(new URL(`assets/${name}`, PUBLIC), 'utf8')) as T;
const manifest = served<{ volumes: Record<string, Volume> }>('manifest.json');
const bsManifest = served<{ structures: { id: string; file: string }[]; fit: { widths: { part: string; z: number; modelMm: number; templateMm: number }[] } }>('bs-manifest.json');
const sbManifest = served<{ structures: SbStructure[] }>('sb-manifest.json');
const sbv3Manifest = served<{ structures: SbStructure[] }>('sbv3-manifest.json');

describe('every shipped mesh', () => {
  it.each(SECTIONS.map((s) => [s.dir, s] as const))('%s: clean arrays, named for its side, inside its frame', async (dir, sec) => {
    const files = readdirSync(new URL(`assets/${dir}/`, PUBLIC)).filter((f) => f.endsWith('.glb')).sort();
    expect(files.length).toBeGreaterThan(5);
    const bad: string[] = [];
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const f of files) {
      const nodes: NodeStats[] = await nodeStats(`assets/${dir}/${f}`);
      if (!nodes.length) bad.push(`${dir}/${f}: no mesh`);
      for (const n of nodes) {
        const at = `${dir}/${f}:${n.node}`;
        if (n.modes.some((m) => m !== TRIANGLES && m !== LINES)) bad.push(`${at}: drawn as mode ${n.modes.join(', ')}, not triangles or lines`);
        if (n.nonFinite) bad.push(`${at}: ${n.nonFinite} positions not finite`);
        if (n.badIndices) bad.push(`${at}: ${n.badIndices} indices past its vertices`);
        if (n.badNormals) bad.push(`${at}: ${n.badNormals} of ${n.normals} normals not of unit length`);
        // (triangles that draw nothing: taken out before a mesh is encoded, pipeline/triangles.mjs; the site audit's MB-16
        // and MC-12 found 3 with a corner repeated, 7982 without area and 2 drawn twice)
        if (n.degenerate || n.flat || n.twice || n.fins) bad.push(`${at}: of ${n.triangles} triangles ${n.degenerate} with a corner repeated, ${n.flat} without area, ${n.twice} drawn twice, ${n.fins} fins`);
        for (let k = 0; k < 3; k++) {
          if (n.lo[k] < sec.box[k][0] || n.hi[k] > sec.box[k][1]) bad.push(`${at}: ${'xyz'[k]} from ${n.lo[k].toFixed(1)} to ${n.hi[k].toFixed(1)} mm, outside the frame's ${sec.box[k].join(' to ')}`);
          lo[k] = Math.min(lo[k], n.lo[k]); hi[k] = Math.max(hi[k], n.hi[k]);
        }
      }
      if (nodes.length) bad.push(...sideProblems(nodes, sec.midlineAtZero, /__(men|koos|knosp)_/.test(f)));
    }
    for (let k = 0; k < 3; k++) if (hi[k] - lo[k] < sec.span[k]) bad.push(`${dir}: its files reach ${(hi[k] - lo[k]).toFixed(1)} mm along ${'xyz'[k]}, less than ${sec.span[k]}`);
    expect(bad).toEqual([]);
  }, 180_000);
});

describe('the brainstem section’s fitted brainstem (the audit’s MA-01: fitted to the far wall of the cisterns)', () => {
  const parts = ['bs_midbrain', 'bs_pons', 'bs_medulla'].map((id) => bsManifest.structures.find((s) => s.id === id)!.file);
  const surface = async () => {
    const S = await Promise.all(parts.map((f) => soup(f)));
    return { ...joined(S), N: Float64Array.from(S.flatMap((s) => [...s.N])) };
  };

  it('has the template’s fluid outside it and its tissue inside (T2: bright outside, dark inside)', async () => {
    const crop = volume(manifest.volumes.t2_crop_05mm), whole = volume(manifest.volumes.t2_15mm);
    const t2 = (x: number, y: number, z: number) => { const v = crop(x, y, z); return Number.isNaN(v) ? whole(x, y, z) : v; };
    const r = across(await surface(), t2);
    expect(r.n).toBeGreaterThan(10_000);
    // November 2026: median 47, 62 % with a clear step out, 11 % in. The surface before the refit: −15, 13 %, 47 %;
    // the same surface 10 % larger: 10, 39 %, 19 %; 20 % smaller: 4, 27 %, 8 %
    expect(r.median).toBeGreaterThan(25);
    expect(r.outShare).toBeGreaterThan(0.5);
    expect(r.inShare).toBeLessThan(0.2);
  }, 60_000);

  it('is as wide as the template’s brainstem at four levels, as its manifest says', async () => {
    const S = await surface();
    expect(bsManifest.fit.widths).toHaveLength(4);
    for (const w of bsManifest.fit.widths) {
      const mm = widthAt(S, w.z);
      expect(Math.abs(mm - w.modelMm), `${w.part} at z ${w.z}`).toBeLessThan(0.5);
      // (the build's own bounds: before the refit the medulla was 1.6 times the template's width)
      expect(mm / w.templateMm, `${w.part} at z ${w.z}`).toBeGreaterThan(0.8);
      expect(mm / w.templateMm, `${w.part} at z ${w.z}`).toBeLessThan(1.25);
    }
  }, 60_000);
});

const plain = (s: SbStructure) => !s.approach && !s.pushedFrom && !s.tumourView && !s.replaces && !s.forView;
const bonesOf = (ss: SbStructure[]) => ss.filter((s) => s.category === 'bone' && plain(s) && !s.name.startsWith('Sinus of'));

describe('nerves and vessels against the skull-base bone they are drawn with', () => {
  it('v3 (the default model): the nerves that run in the open lie outside the bone (the audit’s MB-06)', async () => {
    const ss = sbv3Manifest.structures;
    // the CT's bones are pieces of one surface: closed only together
    const bone = joined(await Promise.all(bonesOf(ss).map((s) => soup(s.file))));
    // in a bony canal or groove, so in the drawn bone: the facial nerve, the chorda tympani, the nerves in the
    // internal acoustic meatus, the greater petrosal nerve
    const inCanal = new Set(['Facial nerve (VII)', 'Chorda tympani', 'Nerves in the internal acoustic meatus (VII, VIII)', 'Greater petrosal nerve']);
    // in the cisterns, the cavernous sinus and the orbit's fissure: V2 and VI ran 14 to 21 mm under the bone surface
    // (60 % and 27 % of their surface in bone) until the skull was carved round them
    const open = new Set(['Oculomotor nerve (III)', 'Trochlear nerve (IV)', 'Trigeminal nerve (V)', 'Ophthalmic nerve (V1)', 'Maxillary nerve (V2)',
      'Abducens nerve (VI)', 'Vestibulocochlear nerve (VIII)', 'Optic chiasm', 'Optic tract']);
    const nerves = ss.filter((s) => s.category === 'nerve' && plain(s));
    for (const n of open) expect(nerves.map((s) => s.name), n).toContain(n);
    const bad: string[] = [];
    for (const s of nerves) {
      if (inCanal.has(s.name)) continue;
      const t = await soup(s.file);
      const share = pointsInside(t.P, bone.P, bone.T) / (t.P.length / 3);
      // (the rest pass through a foramen narrower than the drawn nerve: up to 17 % of their surface)
      if (share > (open.has(s.name) ? 0.05 : 0.25)) bad.push(`${s.name}: ${(100 * share).toFixed(1)} % of its surface in bone`);
    }
    expect(bad).toEqual([]);
  }, 120_000);

  it('v3: the nerves of the jugular foramen and of the cavernous sinus, the chiasm and the stalk do not run through the veins and arteries beside them', async () => {
    const ss = sbv3Manifest.structures;
    const of = (name: string) => soup(ss.find((s) => s.name === name && plain(s))!.file);
    // (routed like the other nerves, 7 to 21 % of IX's and XI's tubes lay in the sigmoid sinus and 11 % of the left X's
    // in the inferior petrosal sinus; the abducens nerve's centre line ran 3 mm through the carotid's traced part and
    // the left oculomotor nerve's 2.5 mm through its label. A vertex or two may graze a neighbour's surface)
    const pairs: [string[], string[]][] = [
      [['Glossopharyngeal nerve (IX)', 'Vagus nerve (X)', 'Accessory nerve (XI)'], ['Sigmoid sinus', 'Inferior petrosal sinus', 'Internal jugular vein']],
      [['Oculomotor nerve (III)', 'Trochlear nerve (IV)', 'Abducens nerve (VI)'], ['Internal carotid artery', 'Internal carotid artery (petrous and lacerum parts)']],
      // (fitted from Z-Anatomy, the chiasm lay 2.4 mm too high: 14 % of its surface in the anterior cerebral arteries'
      // first segments, where the CT shows the third ventricle's fluid. It is drawn at the height the CT shows it, the
      // tracts flat and clear of the arteries, the stalk traced on the CT behind and under it)
      [['Optic chiasm', 'Optic tract', 'Pituitary stalk'], ['Anterior cerebral artery (A1–A2)', 'Anterior communicating artery', 'Third anterior cerebral artery (A2)',
        'Internal carotid artery', 'Posterior communicating artery', 'Posterior cerebral artery (P1–P2)']],
      [['Optic chiasm', 'Optic tract'], ['Pituitary stalk']],
    ];
    const bad: string[] = [];
    for (const [nerves, vessels] of pairs) for (const v of vessels) {
      const V = await of(v);
      for (const n of nerves) {
        const N = await of(n);
        const share = pointsInside(N.P, V.P, V.T) / (N.P.length / 3);
        if (share > 0.01) bad.push(`${n}: ${(100 * share).toFixed(1)} % of its surface inside the ${v.toLowerCase()}`);
      }
    }
    expect(bad).toEqual([]);
  }, 120_000);

  it('v1 (Z-Anatomy): a nerve or vessel drawn through bone says so on its card', async () => {
    const ss = sbManifest.structures;
    // (Z-Anatomy's bones are each closed: each is counted on its own)
    const bones = await Promise.all(bonesOf(ss).map((s) => soup(s.file)));
    const bad: string[] = [];
    let n = 0;
    for (const s of ss.filter((s) => s.type === 'tube' && ['nerve', 'artery', 'vein'].includes(s.category ?? '') && plain(s))) {
      const t = await soup(s.file);
      const share = bones.reduce((a, b) => a + pointsInside(t.P, b.P, b.T), 0) / (t.P.length / 3);
      n++;
      // (the card's note counts what lies over 0.5 mm deep: pipeline/skullbase_v1_inbone.py; a tube on the bone has
      // part of its surface under it, up to 14 % here without a note)
      if (share > 0.2 && !s.inBone) bad.push(`${s.name}: ${(100 * share).toFixed(1)} % of its surface in bone, and no note`);
    }
    expect(n).toBeGreaterThan(60);
    expect(bad).toEqual([]);
  }, 120_000);
});

describe('skull base v1: the Kawase drilling keeps off what it must not open (the audit’s AP-06)', () => {
  it('no protected structure lies in the bone removed, and none is nearer to it than its margin, less the grid', async () => {
    // (the margins as pipeline/skullbase_v3_approach.py KW_KEEP_MM states them for v1; the right cochlear and
    // vestibular nerves were added after the drilling had run through two-thirds of the cochlear nerve)
    const MARGIN: Record<string, number> = {
      'Internal carotid artery': 1.5, Cochlea: 1.5, 'Vestibule and semicircular canals': 1.5, 'Vestibulocochlear nerve (VIII)': 1.0,
      'Facial nerve (VII)': 1.5, 'Cochlear nerve': 1.0, 'Vestibular nerve': 1.0,
    };
    const removed = await soup(sbManifest.structures.find((s) => s.file.endsWith('sb_appr_kawase__removed.glb'))!.file);
    const bad: string[] = [];
    for (const [name, mm] of Object.entries(MARGIN)) {
      const st = sbManifest.structures.find((s) => s.name === name && !s.approach && !s.pushedFrom && !s.tumourView && !s.replaces && !s.forView);
      expect(st, name).toBeTruthy();
      const t = await soup(st!.file);
      // (the right side only: the drilling is on the right)
      const R: number[] = [];
      for (let i = 0; i < t.P.length; i += 3) if (t.P[i] > 0) R.push(t.P[i], t.P[i + 1], t.P[i + 2]);
      const Q = Float64Array.from(R);
      const inside = pointsInside(Q, removed.P, removed.T);
      let nearest = Infinity;
      for (let i = 0; i < Q.length; i += 3) for (let j = 0; j < removed.P.length; j += 3) {
        const d = Math.hypot(Q[i] - removed.P[j], Q[i + 1] - removed.P[j + 1], Q[i + 2] - removed.P[j + 2]);
        if (d < nearest) nearest = d;
      }
      // (0.5 mm: the grid the cut is made on)
      if (inside > 0 || nearest < mm - 0.5) bad.push(`${name}: ${inside} points inside, nearest ${nearest.toFixed(2)} mm (margin ${mm})`);
    }
    expect(bad).toEqual([]);
  }, 120_000);
});

describe('skull base v3: the tumours move the fitted small arteries they reach (the audit’s MB-09)', () => {
  it('each moved artery lies outside its tumour, where it ran through it before', async () => {
    const ss = sbv3Manifest.structures;
    const copies = ss.filter((s) => s.tumourView && s.replaces && s.category === 'artery');
    // (the Koos IV AICA ran 65 % inside its tumour, the foramen magnum meningioma's anterior spinal artery 45 %)
    for (const [view, name] of [['koos_4', 'Anterior inferior cerebellar artery'], ['men_foramen_magnum', 'Anterior spinal artery']])
      expect(copies.some((s) => s.tumourView === view && s.name === name), `${name} in ${view}`).toBe(true);
    const bad: string[] = [];
    for (const c of copies) {
      const tumour = await soup(ss.find((s) => s.id === `tm_${c.tumourView}`)!.file);
      const share = async (file: string) => { const t = await soup(file); return pointsInside(t.P, tumour.P, tumour.T) / (t.P.length / 3); };
      const before = await share(ss.find((s) => s.id === c.replaces)!.file), after = await share(c.file);
      // (a few points stay inside, near its surface: the Koos III lateral pontine branches and the petroclival
      // AICA's loop keep 2.5 and 3.5 % of theirs, from 12.7 and 20.5 %; more rounds of the push do not free them)
      if (after > 0.04 || after >= before) bad.push(`${c.id}: ${(100 * before).toFixed(1)} % inside before, ${(100 * after).toFixed(1)} % after`);
    }
    expect(copies.length).toBeGreaterThan(5);
    expect(bad).toEqual([]);
  }, 120_000);
});

describe('vascular section: lesions drawn by rule keep out of this CT’s bone (the audit’s MB-19)', () => {
  it('the ophthalmic aneurysm’s dome, the flow-diverted one and the AVMs’ nidi', async () => {
    // (the CT's bones are pieces of one surface: closed only together)
    const bone = joined(await Promise.all(bonesOf(sbv3Manifest.structures).map((s) => soup(s.file))));
    const bad: string[] = [];
    // (the ophthalmic dome lay 41 % in the bone over it, the grade III nidus 19 %; a dome's neck meets its artery at
    // the bone's edge: 4 % now)
    for (const [f, most] of [['va_ophthalmic__sac', 0.06], ['va_fd__sac', 0.06], ['va_avm1__nidus', 0.01], ['va_avm3__nidus', 0.01], ['va_avm5__nidus', 0.01]] as const) {
      const t = await soup(`assets/vascular/${f}.glb`);
      const share = pointsInside(t.P, bone.P, bone.T) / (t.P.length / 3);
      if (share > most) bad.push(`${f}: ${(100 * share).toFixed(1)} % of its surface in bone`);
    }
    expect(bad).toEqual([]);
  }, 120_000);
});

describe('brainstem: the nuclei of the third and fourth nerves lie in the midbrain (the audit’s D-028)', () => {
  it('the trochlear nucleus is in the midbrain mesh, not the pons; the oculomotor nucleus level with the superior colliculus', async () => {
    const file = (id: string) => bsManifest.structures.find((s) => s.id === id)!.file;
    const [midbrain, pons, iv, iii, sc] = await Promise.all(['bs_midbrain', 'bs_pons', 'bs_n_trochlear', 'bs_n_oculomotor', 'bs_superior_colliculus'].map((id) => soup(file(id))));
    const share = (t: { P: Float64Array }, m: { P: Float64Array; T: Uint32Array }) => pointsInside(t.P, m.P, m.T) / (t.P.length / 3);
    // (Z-Anatomy's model has it where the aqueduct ends: 94 % of it lay in the pons mesh and none in the midbrain's)
    expect(share(iv, midbrain)).toBeGreaterThan(0.8);
    expect(share(iv, pons)).toBeLessThan(0.1);
    expect(share(iii, midbrain)).toBeGreaterThan(0.95);
    const meanZ = (t: { P: Float64Array }) => { let z = 0; for (let i = 2; i < t.P.length; i += 3) z += t.P[i]; return z / (t.P.length / 3); };
    // (level with the superior colliculus along the oblique aqueduct: 3 mm lower, being 7 mm further forward; it was 8 mm lower)
    expect(Math.abs(meanZ(iii) - meanZ(sc))).toBeLessThan(4.5);
  }, 60_000);
});

describe('skull base v3: the routed cranial nerves begin at the brainstem’s surface (the audit’s MB-11)', () => {
  it('no nerve from III to XII has more than a little of its surface inside the brainstem', async () => {
    const ss = sbv3Manifest.structures;
    const stem = await Promise.all(['Midbrain', 'Pons', 'Medulla oblongata'].map((n) => soup(ss.find((s) => s.name === n && plain(s))!.file)));
    const bad: string[] = [];
    let n = 0;
    for (const s of ss.filter((s) => s.category === 'nerve' && /\((III|IV|V|VI|VII|VIII|IX|X|XI|XII)\)$/.test(s.name) && !s.approach && !s.tumourView && !s.forView)) {
      const t = await soup(s.file);
      const share = stem.reduce((a, b) => a + pointsInside(t.P, b.P, b.T), 0) / (t.P.length / 3);
      n++;
      // (their roots began 1 to 4 mm inside it: 11 to 34 % of each nerve's surface; a tube that ends in the surface
      // has its last ring and cap under it. The short eighth nerve leaves at the pontomedullary junction, where the
      // pons and the medulla as drawn overlap and its points count twice: 11 %. The trochlear nerve is laid round the
      // brainstem on its surface: cut like the others, after the hindbrain was fitted round the fourth ventricle, it
      // had lost its first 17 mm and began at the front of the pons)
      if (share > (s.name.startsWith('Vestibulocochlear') ? 0.12 : 0.08)) bad.push(`${s.name}: ${(100 * share).toFixed(1)} % of its surface inside the brainstem`);
    }
    expect(n).toBe(10);
    expect(bad).toEqual([]);
  }, 120_000);

  it('the trochlear nerve begins at the back of the brainstem, on each side', async () => {
    const ss = sbv3Manifest.structures;
    const mid = await nodeStats(ss.find((s) => s.name === 'Midbrain' && plain(s))!.file);
    const iv = await nodeStats(ss.find((s) => s.name === 'Trochlear nerve (IV)' && plain(s))!.file);
    // (y runs forwards: the nerve reaches further back than the midbrain's middle, front to back. Routed through the
    // brainstem it began 2 mm in front of that middle; cut at the surface, at the front of the pons, 17 mm in front)
    const middle = (Math.min(...mid.map((m) => m.lo[1])) + Math.max(...mid.map((m) => m.hi[1]))) / 2;
    expect(iv.map((n) => n.node).sort()).toEqual(['L', 'R']);
    for (const n of iv) expect(n.lo[1], n.node).toBeLessThan(middle - 5);
  }, 60_000);
});

describe('Horn 2022\'s printed peaks and the volumes drawn for them', () => {
  // (the peaks the paper prints lie at the edge of the maps it distributes, which the volumes are drawn from at half
  // their maximum: at most 0.8 mm outside the volume, which the markers' notes say. A marker further off than that
  // would be a peak or a volume in another place)
  it.each(['t-ss-gen', 't-ss-cerv'])('%s lies within a millimetre of its volume, each side', async (id) => {
    const t = TARGETS.find((x) => x.id === id)!;
    const { P } = await soup(`assets/meshes/${t.structureId}.glb`);
    for (const side of ['left', 'right'] as const) {
      const [x, y, z] = t.mni[side];
      let near = Infinity;
      for (let i = 0; i < P.length; i += 3) near = Math.min(near, Math.hypot(P[i] - x, P[i + 1] - y, P[i + 2] - z));
      // (to the nearest vertex: the surface's triangles are about 0.25 mm across)
      expect(near, `${id} ${side}`).toBeLessThan(1);
      expect(t.note, id).toMatch(/volume drawn here/);
    }
  }, 60_000);
});
