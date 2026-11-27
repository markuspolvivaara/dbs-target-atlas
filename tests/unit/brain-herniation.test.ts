import { describe, expect, it, vi } from 'vitest';
import { meshSoup, morphSoup, nodeMeans, nodeMorphs } from './glb';
import { HerniationSchema, type Tonsillar } from '../../src/skullbase/herniation';
import { HN_REFS, TONSILLAR_SECTIONS } from '../../src/skullbase/herniation-text';
import { APPROACH_REF } from '../../src/skullbase/approaches';
import { SB_GROUPS } from '../../src/skullbase/groups';
import { decodeSkull as decodeV1, MORPH_PARAMS } from '../../src/skullbase/state';
import report from '../../src/data/generated/sbv3-herniation.json';
import manifestJson from '../../src/data/generated/sbv3-manifest.json';

/**
 * The tonsillar herniation view (module plan A5; the owner's decisions of 26 November 2026), checked on the files the site
 * serves: the measured report, the copies (at rest each is its original; at full the tonsils' lowest points lie the
 * reported depth below McRae's line), no copy point entering any shipped bone mesh as the slider moves, the posterior
 * inferior cerebellar arteries outside the moved tonsils, and the view and its link. (Disc herniation in the spine
 * section has its own file, herniation.test.ts.) An illustration, not a simulation: these check the drawing, not the
 * physiology.
 */
type V = [number, number, number];
type S = { id: string; name: string; type: string; file: string; approach?: string; pushedFrom?: string; replaces?: string; herniationView?: string; morph?: boolean; category?: string; copySides?: string[] };
const manifest = manifestJson as unknown as { structures: S[] };
const T: Tonsillar = HerniationSchema.parse(report).tonsillar;
const byId = new Map(manifest.structures.map((s) => [s.id, s]));
const copies = manifest.structures.filter((s) => s.herniationView && s.pushedFrom);
const VIEW = 'herniation_tonsillar';
const CHECKED = [0.25, 0.5, 0.75, 1];
/** the slider values the step checks its moves at: 0.05, 0.10, ... 1 (here the meshes are checked at CHECKED) */
const STEP_CHECKED = Array.from({ length: 20 }, (_, k) => Math.round(5 * (k + 1)) / 100);

const sub = (a: readonly number[], b: readonly number[]): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: readonly number[], b: readonly number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: readonly number[], b: readonly number[]): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: V): V => { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l]; };

/** McRae's plane's caudal normal: the plane holds the line from the basion to the opisthion and the left-right axis */
const below = (() => {
  const n = unit(cross(sub(T.opisthion, T.basion), [1, 0, 0]));
  const caudal: V = n[2] > 0 ? [-n[0], -n[1], -n[2]] : n;
  return (p: readonly number[]) => dot(sub(p, T.basion), caudal);
})();

/** The generalised winding number of q about a triangle soup (as trigeminal.test.ts): about 1 inside, 0 outside. */
function winding(q: readonly number[], P: ArrayLike<number>, Tr: Uint32Array): number {
  let w = 0;
  for (let t = 0; t < Tr.length; t += 3) {
    const a = 3 * Tr[t], b = 3 * Tr[t + 1], c = 3 * Tr[t + 2];
    const ax = P[a] - q[0], ay = P[a + 1] - q[1], az = P[a + 2] - q[2];
    const bx = P[b] - q[0], by = P[b + 1] - q[1], bz = P[b + 2] - q[2];
    const cx = P[c] - q[0], cy = P[c + 1] - q[1], cz = P[c + 2] - q[2];
    const la = Math.hypot(ax, ay, az), lb = Math.hypot(bx, by, bz), lc = Math.hypot(cx, cy, cz);
    const det = ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
    const den = la * lb * lc + (ax * bx + ay * by + az * bz) * lc + (bx * cx + by * cy + bz * cz) * la + (cx * ax + cy * ay + cz * az) * lb;
    w += 2 * Math.atan2(det, den);
  }
  return w / (4 * Math.PI);
}

/** A soup's triangles bucketed by their boxes on a grid (cell mm), within a region of interest (lo, hi). */
function triangleGrid({ P, T: Tr }: { P: Float64Array; T: Uint32Array }, lo: V, hi: V, cell = 2) {
  const n = [0, 1, 2].map((k) => Math.max(1, Math.ceil((hi[k] - lo[k]) / cell)));
  const cells = new Map<number, number[]>();
  const ci = (v: number, k: number) => Math.min(n[k] - 1, Math.max(0, Math.floor((v - lo[k]) / cell)));
  for (let t = 0; t < Tr.length / 3; t++) {
    const tl = [0, 1, 2].map((k) => Math.min(P[3 * Tr[3 * t] + k], P[3 * Tr[3 * t + 1] + k], P[3 * Tr[3 * t + 2] + k]));
    const th = [0, 1, 2].map((k) => Math.max(P[3 * Tr[3 * t] + k], P[3 * Tr[3 * t + 1] + k], P[3 * Tr[3 * t + 2] + k]));
    if ([0, 1, 2].some((k) => th[k] < lo[k] || tl[k] > hi[k])) continue;
    for (let i = ci(tl[0], 0); i <= ci(th[0], 0); i++) for (let j = ci(tl[1], 1); j <= ci(th[1], 1); j++) for (let k = ci(tl[2], 2); k <= ci(th[2], 2); k++) {
      const key = (i * n[1] + j) * n[2] + k;
      const b = cells.get(key);
      if (b) b.push(t); else cells.set(key, [t]);
    }
  }
  /** the triangles whose cells a segment's box touches */
  return (o: readonly number[], e: readonly number[]): number[] => {
    const out = new Set<number>();
    const a = [0, 1, 2].map((k) => ci(Math.min(o[k], e[k]), k)), b = [0, 1, 2].map((k) => ci(Math.max(o[k], e[k]), k));
    for (let i = a[0]; i <= b[0]; i++) for (let j = a[1]; j <= b[1]; j++) for (let k = a[2]; k <= b[2]; k++) for (const t of cells.get((i * n[1] + j) * n[2] + k) ?? []) out.add(t);
    return [...out];
  };
}

/** Where along the segment from o to e (0..1) it crosses the given triangles of the soup (Möller–Trumbore). */
function crossingsAt(o: readonly number[], e: readonly number[], P: Float64Array, Tr: Uint32Array, tris: number[]): number[] {
  const d = sub(e, o);
  const out: number[] = [];
  for (const t of tris) {
    const a = 3 * Tr[3 * t], b = 3 * Tr[3 * t + 1], c = 3 * Tr[3 * t + 2];
    const e1: V = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], e2: V = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
    const p = cross(d, e2);
    const det = dot(e1, p);
    if (Math.abs(det) < 1e-14) continue;
    const tv: V = [o[0] - P[a], o[1] - P[a + 1], o[2] - P[a + 2]];
    const u = dot(tv, p) / det;
    if (u < 0 || u > 1) continue;
    const q = cross(tv, e1);
    const w = dot(d, q) / det;
    if (w < 0 || u + w > 1) continue;
    const s = dot(e2, q) / det;
    if (s >= 0 && s <= 1) out.push(s);
  }
  return out;
}

/** The farthest any point of A lies from its nearest point of B (mm; B's points hashed on a 0.5 mm grid). */
function farthest(A: Float64Array, B: Float64Array): number {
  const cell = 0.5, key = (x: number, y: number, z: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  const grid = new Map<string, number[]>();
  for (let i = 0; i < B.length; i += 3) { const k = key(B[i], B[i + 1], B[i + 2]); const b = grid.get(k); if (b) b.push(i); else grid.set(k, [i]); }
  let worst = 0;
  for (let i = 0; i < A.length; i += 3) {
    let best = Infinity;
    const [cx, cy, cz] = [A[i], A[i + 1], A[i + 2]].map((v) => Math.floor(v / cell));
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++)
      for (const j of grid.get(`${cx + dx},${cy + dy},${cz + dz}`) ?? []) best = Math.min(best, Math.hypot(A[i] - B[j], A[i + 1] - B[j + 1], A[i + 2] - B[j + 2]));
    worst = Math.max(worst, best);
  }
  return worst;
}

describe('tonsillar herniation: the measured report', () => {
  it('parses, and its checks hold: the depth reached, nothing in bone, no fold, the medulla met and not entered', () => {
    expect(T.descentMm).toBe(8);
    expect(T.mcraeLengthMm).toBeCloseTo(Math.hypot(...sub(T.opisthion, T.basion)), 1);
    for (const s of ['L', 'R'] as const) {
      // at rest the tonsils lie at the line (this CT's tonsils sit on the foramen magnum); at full the design depth below it
      expect(Math.abs(T.tonsilTips.rest[s].belowLineMm), s).toBeLessThan(2);
      expect(Math.abs(T.tonsilTips.full[s].belowLineMm - T.descentMm), s).toBeLessThanOrEqual(1);
      for (const k of ['rest', 'full'] as const) expect(below(T.tonsilTips[k][s].point), `${k} ${s}`).toBeCloseTo(T.tonsilTips[k][s].belowLineMm, 1);
    }
    expect(T.boneVerticesAnyT).toBe(0);
    expect(T.boneMeshGapMinMm).toBeGreaterThanOrEqual(T.params.boneGapMm - 0.01);
    // the fold check on the moves as written: no tissue triangle turned over, no neighbouring points closing as fast as 1
    expect(T.foldFree).toBe(true);
    expect(T.params.closingLimit).toBe(1);
    expect(T.slopeMax).toBeLessThan(T.params.closingLimit);
    expect(T.closingPairs).toBe(0);
    expect(T.trianglesTurnedOver).toBe(0);
    expect(T.params.flippedTriangles).toBe(0);
    expect(T.params.trianglesNearlyTurnedOver).toBe(0);
    // nothing entered: where a copy crosses a neighbour at rest (the fitted parts do), it crosses it no more
    expect(T.structuresEntered).toEqual([]);
    expect(T.pathsCrossingAnything).toBe(0);
    for (const [k, w] of Object.entries(T.params.wallsTouched)) expect(w.maxAnyT, k).toBeLessThanOrEqual(w.rest);
    for (const [k, c] of Object.entries(T.params.copiesCrossing)) if (c.rule !== 'same part') expect(c.max, k).toBeLessThanOrEqual(c.rest);
    expect(T.picaOutsideTonsilsAnyT).toBe(true);
    for (const s of ['L', 'R'] as const) {
      expect(T.medullaGapBelowLineMm[s], s).toBeGreaterThanOrEqual(0);
      expect(T.medullaGapBelowLineMm[s], s).toBeLessThanOrEqual(0.5);
    }
    expect(T.medullaGapMm.full).toBeGreaterThanOrEqual(0);
    expect(T.medullaGapMm.full).toBeLessThanOrEqual(0.5);
    expect(T.medullaGapMm.minAnyT).toBeGreaterThanOrEqual(0);
    expect(T.medullaGapMm.rest).toBeGreaterThan(T.medullaGapMm.full);
    expect(T.params.checkedAt).toEqual(STEP_CHECKED);
    // the sagittal camera square to the midline from the left; the posterior one below what it looks at
    const sg = sub(T.cameras.sagittal.target, T.cameras.sagittal.position);
    expect(sg[0]).toBeGreaterThan(0);
    expect(Math.abs(sg[1]) + Math.abs(sg[2])).toBeLessThan(0.01);
    expect(T.cameras.posterior.position[2]).toBeLessThan(T.cameras.posterior.target[2]);
    expect(T.cameras.posterior.position[1]).toBeLessThan(T.cameras.posterior.target[1]);     // (and behind it)
  });
  it('lists the copies the manifest ships, each for this view, standing in for a part the model has', () => {
    expect(copies.map((c) => c.id).sort()).toEqual(T.copies.map((c) => c.id).sort());
    for (const c of T.copies) {
      const s = byId.get(c.id)!;
      expect(c.id).toBe(`${c.replaces}__hn_tonsillar`);
      expect(s.replaces).toBe(c.replaces);
      expect(s.herniationView).toBe(VIEW);
      expect(s.name).toBe(byId.get(c.replaces)!.name);
      expect(s.morph).toBe(true);
      expect(s.copySides).toEqual(['L', 'R']);
      expect(byId.get(c.replaces)!.pushedFrom).toBeUndefined();
    }
    const guide = byId.get('hn_mcrae_line')!;
    expect(guide).toMatchObject({ category: 'guide', herniationView: VIEW, name: 'McRae’s line (basion to opisthion)' });
    expect(guide.pushedFrom).toBeUndefined();
    // only this view's copies and guide carry the field
    expect(manifest.structures.filter((s) => s.herniationView).map((s) => s.herniationView)).toEqual(Array(copies.length + 1).fill(VIEW));
  });
});

describe('tonsillar herniation: the shipped meshes', () => {
  it('each copy at rest is its original, and carries one shape, \'tonsillar\', on both halves, moving as far as reported', async () => {
    for (const c of T.copies) {
      const s = byId.get(c.id)!;
      const [a, b] = await Promise.all([nodeMeans(s.file), nodeMeans(s.pushedFrom!)]);
      expect(Object.keys(a).sort(), c.id).toEqual(Object.keys(b).sort());
      for (const side of Object.keys(b)) for (let k = 0; k < 3; k++) expect(Math.abs(a[side][k] - b[side][k]), `${c.id} ${side}`).toBeLessThan(0.05);
      // every point of either lies on a point of the other (the files' quantization apart: compression may drop a
      // repeated vertex or triangle from one of them, so the counts can differ by a few)
      const [sa, sb] = await Promise.all([meshSoup(s.file), meshSoup(s.pushedFrom!)]);
      expect(Math.abs(sa.P.length - sb.P.length) / sb.P.length, c.id).toBeLessThan(0.002);
      expect(farthest(sa.P, sb.P), `${c.id}: from the copy at rest to the original`).toBeLessThan(0.02);
      expect(farthest(sb.P, sa.P), `${c.id}: from the original to the copy at rest`).toBeLessThan(0.02);
      const m = await nodeMorphs(s.file);
      for (const side of ['L', 'R']) expect(Object.keys(m[side] ?? {}), `${c.id} ${side}`).toEqual(['tonsillar']);
      expect(Math.max(...Object.values(m).map((x) => x.tonsillar.max)), c.id).toBeCloseTo(c.maxMoveMm, 1);
    }
  }, 120_000);

  it('at full the tonsils\' lowest points lie the reported depth below McRae\'s line, at rest where the report has them', async () => {
    const { P, D } = await morphSoup(byId.get('pf_tonsil__hn_tonsillar')!.file, 'tonsillar');
    // (the halves by side: the left tonsil lies left of x −2, the right one right of x 0)
    for (const [k, t] of [['rest', 0], ['full', 1]] as const) {
      for (const side of ['L', 'R'] as const) {
        let best = -Infinity;
        for (let i = 0; i < P.length; i += 3) {
          if ((P[i] < -1) !== (side === 'L')) continue;
          best = Math.max(best, below([P[i] + t * D[i], P[i + 1] + t * D[i + 1], P[i + 2] + t * D[i + 2]]));
        }
        expect(best, `${k} ${side}`).toBeCloseTo(T.tonsilTips[k][side].belowLineMm, 1);
      }
    }
    // the line as drawn: from the basion to the opisthion, every point within its radius of the segment
    const g = await meshSoup(byId.get('hn_mcrae_line')!.file);
    const ax = sub(T.opisthion, T.basion), len = Math.hypot(...ax);
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < g.P.length; i += 3) {
      const r = sub([g.P[i], g.P[i + 1], g.P[i + 2]], T.basion);
      const along = dot(r, ax) / len;
      lo = Math.min(lo, along); hi = Math.max(hi, along);
      expect(Math.hypot(...cross(r, ax)) / len).toBeLessThan(0.5);
    }
    expect(lo).toBeLessThan(0.5);
    expect(hi).toBeGreaterThan(len - 0.5);
  }, 60_000);

  it('no copy point enters a shipped bone mesh as the slider moves that was not in it at rest', async () => {
    // The viewer blends each copy in a straight line, so a point's way from rest to full is a segment: it is in a bone at
    // t when its state at rest (winding number) is flipped by an odd number of the segment's crossings of that bone's
    // surface up to t. The crossings are found among the triangles near the segment; the winding number is reckoned
    // only for a point that crosses (the 3 copy points already in the bone the step draws at rest are allowed).
    const bones = manifest.structures.filter((s) => s.type === 'bone' && !s.approach && !s.pushedFrom);
    expect(bones.length).toBeGreaterThan(10);
    const moved = await Promise.all(copies.map(async (c) => ({ id: c.id, ...(await morphSoup(c.file, 'tonsillar')) })));
    const lo: V = [Infinity, Infinity, Infinity], hi: V = [-Infinity, -Infinity, -Infinity];
    let n = 0;
    for (const m of moved) for (let i = 0; i < m.P.length; i += 3) {
      if (Math.hypot(m.D[i], m.D[i + 1], m.D[i + 2]) < 1e-4) continue;
      n++;
      for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], m.P[i + k], m.P[i + k] + m.D[i + k]); hi[k] = Math.max(hi[k], m.P[i + k], m.P[i + k] + m.D[i + k]); }
    }
    expect(n).toBeGreaterThan(1000);
    const entered: string[] = [];
    let crossed = 0;
    for (const b of bones) {
      const soup = await meshSoup(b.file);
      const near = triangleGrid(soup, [lo[0] - 1, lo[1] - 1, lo[2] - 1], [hi[0] + 1, hi[1] + 1, hi[2] + 1]);
      for (const m of moved) for (let i = 0; i < m.P.length; i += 3) {
        if (Math.hypot(m.D[i], m.D[i + 1], m.D[i + 2]) < 1e-4) continue;
        const o = [m.P[i], m.P[i + 1], m.P[i + 2]], e = [o[0] + m.D[i], o[1] + m.D[i + 1], o[2] + m.D[i + 2]];
        const s = crossingsAt(o, e, soup.P, soup.T, near(o, e));
        if (!s.length) continue;
        crossed++;
        const atRest = winding(o, soup.P, soup.T) >= 0.5;
        for (const t of CHECKED) {
          const inside = atRest !== (s.filter((x) => x <= t).length % 2 === 1);
          if (inside && !atRest) entered.push(`${m.id} point ${i / 3} in ${b.name} at ${t}`);
        }
      }
    }
    expect(entered).toEqual([]);
    // (the ways that cross a bone surface at all, entering and leaving it between two slider values checked or leaving
    // it from the points in it at rest: few)
    expect(crossed).toBeLessThan(50);
  }, 600_000);

  it('the posterior inferior cerebellar arteries\' copies stay outside the moved tonsils at every slider value checked', async () => {
    const tonsil = await morphSoup(byId.get('pf_tonsil__hn_tonsillar')!.file, 'tonsillar');
    const picas = copies.filter((c) => c.name.startsWith('Posterior inferior cerebellar artery'));
    expect(picas.length).toBe(2);
    const at = (s: { P: Float64Array; D: Float64Array }, t: number) => s.P.map((x, i) => x + t * s.D[i]);
    for (const c of picas) {
      const a = await morphSoup(c.file, 'tonsillar');
      for (const t of [0, ...CHECKED]) {
        const X = at(tonsil, t), Q = at(a, t);
        const lo = [0, 1, 2].map((k) => Math.min(...X.filter((_, i) => i % 3 === k))), hi = [0, 1, 2].map((k) => Math.max(...X.filter((_, i) => i % 3 === k)));
        let inside = 0;
        for (let i = 0; i < Q.length; i += 3) {
          const q = [Q[i], Q[i + 1], Q[i + 2]];
          if (q.some((v, k) => v < lo[k] || v > hi[k])) continue;
          if (winding(q, X, tonsil.T) >= 0.5) inside++;
        }
        expect(inside, `${c.id} at ${t}`).toBe(0);
      }
    }
  }, 300_000);
});

/** the section's modules as a page of the default model (v3) loads them */
async function v3Modules() {
  vi.resetModules();
  const g = globalThis as unknown as { document?: unknown };
  const had = 'document' in g;
  g.document = { querySelector: (q: string) => (q.includes('sb-model') ? { content: 'v3' } : null) };
  try {
    return { index: await import('../../src/skullbase'), groups: await import('../../src/skullbase/groups'), state: await import('../../src/skullbase/state'),
      scene: await import('../../src/skullbase/scene'), herniation: await import('../../src/skullbase/herniation') };
  } finally {
    if (!had) delete g.document;
  }
}

describe('tonsillar herniation: the view', () => {
  it('v3: drawn with its copies in place of their parts, the guide, the slider at full, the left half cut away', async () => {
    const { index: I, groups: G, scene: SC, herniation: H } = await v3Modules();
    expect(I.crossCheckSb()).toEqual([]);
    expect(G.crossCheckGroups()).toEqual([]);
    const g = G.SB_GROUP.get(VIEW)!;
    expect(g).toMatchObject({ kind: 'herniation', name: 'Tonsillar herniation', herniation: 'tonsillar', info: 'tonsillar', camera: 'aim', morphs: ['tonsillar'], morphDefault: { tonsillar: 1 } });
    // the report's sagittal camera, moved back along its line of sight (the same target and direction)
    const sg = H.HERNIATION!.tonsillar.cameras.sagittal;
    expect(g.aim).toEqual(H.hnPose(sg));
    expect(g.aim!.target).toEqual(sg.target);
    for (let k = 0; k < 3; k++) expect(g.aim!.position[k] - sg.target[k]).toBeCloseTo((sg.position[k] - sg.target[k]) * H.HN_CAMERA_BACK, 1);
    // the left half cut away, left of McRae's line (drawn on this CT's midline, 1.4 mm left of the frame's)
    expect(g.section).toEqual({ normal: [-1, 0, 0], point: [H.HN_SAGITTAL_CUT_X, 0, 0] });
    for (const c of T.copies) {
      expect(g.structures, c.id).toContain(c.id);
      expect(g.structures, c.replaces).not.toContain(c.replaces);
    }
    expect(g.structures).toContain('hn_mcrae_line');
    for (const n of ['Medulla oblongata', 'Pons', 'Fourth ventricle', 'Vertebral artery', 'Anterior inferior cerebellar artery',
      'Glossopharyngeal nerve (IX)', 'Vagus nerve (X)', 'Accessory nerve (XI)', 'Hypoglossal nerve (XII)']) expect(g.structures.map((id) => I.SB.get(id)!.name), n).toContain(n);
    const p = SC.skullPlan(VIEW, null);
    for (const c of T.copies) { expect(p.looks.get(c.id), c.id).toBe('primary'); expect(p.looks.get(c.replaces), c.replaces).toBe('hidden'); }
    expect(p.looks.get('hn_mcrae_line')).toBe('primary');
    expect(p.onlySide?.size ?? 0).toBe(0);         // (the copies hold both halves)
    expect(p.aim).toEqual(g.aim);
    expect(p.focusIds).toContain('pf_tonsil__hn_tonsillar');
    // the view after the tumours, in its own row
    expect(G.SB_GROUPS.filter((x) => x.kind === 'herniation').map((x) => x.id)).toEqual([VIEW]);
    expect(G.SB_GROUPS[G.SB_GROUPS.length - 1].id).toBe(VIEW);
  });
  it('v3: no other view draws a copy or the guide, and none of them shows', async () => {
    const { groups: G, scene: SC } = await v3Modules();
    const own = new Set(manifest.structures.filter((s) => s.herniationView).map((s) => s.id));
    for (const g of G.SB_GROUPS.filter((x) => x.id !== VIEW)) {
      expect(g.structures.filter((id) => own.has(id)), g.id).toEqual([]);
      expect((g.key ?? []).filter((id) => own.has(id)), g.id).toEqual([]);
      const p = SC.skullPlan(g.id, null);
      for (const id of own) expect(p.looks.get(id), `${g.id} ${id}`).toBe('hidden');
    }
  });
  it('v3: a link\'s sel= does not draw a copy or the guide outside its view, nor a tumour view\'s copy outside its own', async () => {
    const { groups: G, scene: SC, state: St } = await v3Modules();
    const other = 'telovelar';
    expect(G.SB_GROUP.has(other)).toBe(true);
    // the link: elsewhere a copy stands for its part, the guide for nothing (the viewer draws whatever is selected); in
    // its own view each stays selected
    for (const c of copies) {
      expect(St.decodeSkull(`#/atlas?g=${other}&sel=${c.id}`).sel, c.id).toBe(c.replaces);
      expect(St.decodeSkull(`#/atlas?g=${VIEW}&sel=${c.id}`).sel, c.id).toBe(c.id);
    }
    expect(St.decodeSkull(`#/atlas?g=${other}&sel=hn_mcrae_line`).sel).toBeNull();
    expect(St.decodeSkull(`#/atlas?g=${VIEW}&sel=hn_mcrae_line`).sel).toBe('hn_mcrae_line');
    expect(St.decodeSkull(`#/atlas?g=${other}&sel=pf_tonsil`).sel).toBe('pf_tonsil');
    for (const id of [...copies.map((c) => c.id), 'hn_mcrae_line']) {
      const p = SC.skullPlan(other, id);
      expect(p.looks.get(id), id).toBe('hidden');
      // in its own view a selected copy or the guide is drawn as ever
      expect(SC.skullPlan(VIEW, id).looks.get(id), id).toBe('primary');
    }
    // a copy's part is drawn in the other view as that view draws it, whether or not the copy is selected
    for (const c of copies) expect(SC.skullPlan(other, c.id).looks.get(c.replaces!), c.id).toBe(SC.skullPlan(other, null).looks.get(c.replaces!));
    // the tumour views' moved copies alike: hidden through sel= elsewhere, drawn in their own views
    const tumourCopies = manifest.structures.filter((s) => s.pushedFrom && (s as { tumourView?: string }).tumourView);
    expect(tumourCopies.length).toBeGreaterThan(5);
    let inOwn = 0;
    for (const s of tumourCopies) {
      expect(SC.skullPlan(other, s.id).looks.get(s.id), s.id).toBe('hidden');
      expect(St.decodeSkull(`#/atlas?g=${other}&sel=${s.id}`).sel, s.id).toBe(s.replaces ?? null);
      // (a copy its view draws: selecting it there changes nothing; a few copies no view draws stay hidden everywhere)
      const own = G.SB_GROUPS.find((g) => g.structures.includes(s.id));
      if (!own) continue;
      inOwn++;
      expect(SC.skullPlan(own.id, s.id).looks.get(s.id), `${own.id} ${s.id}`).toBe(SC.skullPlan(own.id, null).looks.get(s.id));
      expect(SC.skullPlan(own.id, s.id).looks.get(s.id), `${own.id} ${s.id}`).not.toBe('hidden');
      expect(St.decodeSkull(`#/atlas?g=${own.id}&sel=${s.id}`).sel, `${own.id} ${s.id}`).toBe(s.id);
    }
    expect(inOwn).toBeGreaterThan(5);
    // a cranial nerve's trunk selected elsewhere lights up the nerve, not its moved copies
    const ix = SC.skullPlan(other, 'tb_glossopharyngeal_nerve_ix');
    expect(ix.looks.get('tb_glossopharyngeal_nerve_ix')).toBe('primary');
    for (const s of tumourCopies.filter((x) => x.name === 'Glossopharyngeal nerve (IX)')) expect(ix.looks.get(s.id), s.id).toBe('hidden');
    // and a plain part the other view does not draw still shows when selected
    const plain = manifest.structures.find((s) => s.type === 'soft' && !s.pushedFrom && !s.herniationView && !s.approach && !G.SB_GROUP.get(other)!.structures.includes(s.id))!;
    expect(SC.skullPlan(other, plain.id).looks.get(plain.id), plain.id).toBe('primary');
  });
  it('v3: the link g=herniation_tonsillar&to=100 round-trips; the view opens at full; the shape stays out of other views', async () => {
    const { state: St } = await v3Modules();
    expect(MORPH_PARAMS.tonsillar).toBe('to');
    expect(new Set(Object.values(MORPH_PARAMS)).size).toBe(Object.keys(MORPH_PARAMS).length);
    const s = St.decodeSkull('#/atlas?g=herniation_tonsillar&to=100');
    expect(s.grp).toBe(VIEW);
    expect(s.morphs).toEqual({ tonsillar: 1 });
    const link = St.encodeSkull(s);
    expect(link).toContain('g=herniation_tonsillar');
    expect(link).toContain('to=100');
    expect(St.decodeSkull(link)).toEqual(s);
    // without the parameter the view opens at full; at 0 the link keeps the 0 (the view's default is not 0)
    expect(St.decodeSkull('#/atlas?g=herniation_tonsillar').morphs).toEqual({ tonsillar: 1 });
    const rest = St.decodeSkull('#/atlas?g=herniation_tonsillar&to=0');
    expect(rest.morphs).toEqual({});
    expect(St.encodeSkull(rest)).toContain('to=0');
    expect(St.decodeSkull('#/atlas?g=herniation_tonsillar&to=40').morphs.tonsillar).toBeCloseTo(0.4);
    // with the cut off, the link says so
    expect(St.encodeSkull({ ...s, section: false })).toContain('sec=0');
    // another view does not take the shape
    expect(St.decodeSkull('#/atlas?g=telovelar&to=100').morphs).not.toHaveProperty('tonsillar');
    expect(St.encodeSkull(St.decodeSkull('#/atlas?g=telovelar&to=100'))).not.toContain('to=');
  });
  it('v1 (this file\'s default model) has no herniation view; a link to it opens the default view', () => {
    expect(SB_GROUPS.filter((g) => g.kind === 'herniation')).toEqual([]);
    expect(decodeV1('#/atlas?g=herniation_tonsillar&to=100').grp).not.toBe(VIEW);
  });
  it('the card cites references that exist, asks for the measured read-out, and its references are in the shared list', () => {
    for (const c of TONSILLAR_SECTIONS.flatMap((x) => x.claims)) for (const r of c.refIds) expect(APPROACH_REF.has(r), r).toBe(true);
    for (const r of HN_REFS) expect(APPROACH_REF.get(r.id)).toBe(r);
    expect(TONSILLAR_SECTIONS.map((x) => x.measured).filter(Boolean)).toEqual(['hnTonsillar']);
    const used = new Set(TONSILLAR_SECTIONS.flatMap((x) => x.claims).flatMap((c) => c.refIds));
    expect(HN_REFS.map((r) => r.id).filter((r) => !used.has(r))).toEqual([]);
  });
});
