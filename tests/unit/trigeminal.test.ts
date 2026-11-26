import { describe, expect, it, vi } from 'vitest';
import { meshSoup } from './glb';
import { TrigeminalSchema, type Trigeminal } from '../../src/skullbase/trigeminal';
import { PERC_SECTIONS, MVD_SECTIONS } from '../../src/skullbase/trigeminal-text';
import { SB_GROUP } from '../../src/skullbase/groups';
import { decodeSkull as decodeV1 } from '../../src/skullbase/state';

/**
 * The trigeminal neuralgia views (module plan A3; the owner's decisions of 26 November 2026), checked on the files the
 * site serves: the root entry zone on the drawn nerve and pons (v3), the percutaneous needle clear of every bone mesh
 * along its whole length, through the foramen ovale and ending at its target (Meckel's cave on v3, the trigeminal nerve on
 * v1), and the views' links.
 */
type V = [number, number, number];
type Manifest = { structures: { id: string; name: string; type: string; file: string; approach?: string; pushedFrom?: string }[] };
type Lm = { id: string; name: string; side: string; ras: V };

const sub = (a: readonly number[], b: readonly number[]): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: readonly number[], b: readonly number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const dist = (a: readonly number[], b: readonly number[]) => Math.hypot(...sub(a, b));

/** the nearest distance from p to a triangle soup (brute force: the files here are small) */
function toMesh(p: readonly number[], { P, T }: { P: Float64Array; T: Uint32Array }): number {
  let best = Infinity;
  const v = (i: number): V => [P[3 * i], P[3 * i + 1], P[3 * i + 2]];
  for (let t = 0; t < T.length; t += 3) {
    const a = v(T[t]), b = v(T[t + 1]), c = v(T[t + 2]);
    best = Math.min(best, dist(p, closestOnTriangle(p, a, b, c)));
  }
  return best;
}
/** Ericson's closest point on a triangle (Real-Time Collision Detection, 5.1.5) */
function closestOnTriangle(p: readonly number[], a: V, b: V, c: V): V {
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return a;
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2;
  const at = (s: V, d: V, k: number): V => [s[0] + d[0] * k, s[1] + d[1] * k, s[2] + d[2] * k];
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return at(a, ab, d1 / (d1 - d3));
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return at(a, ac, d2 / (d2 - d6));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return at(b, sub(c, b), (d4 - d3) / ((d4 - d3) + (d5 - d6)));
  const den = 1 / (va + vb + vc);
  const sv = vb * den, sw = vc * den;
  return [a[0] + ab[0] * sv + ac[0] * sw, a[1] + ab[1] * sv + ac[1] * sw, a[2] + ab[2] * sv + ac[2] * sw];
}

/** Where along the segment from o to e (0..1) it crosses a triangle of the soup. */
function crossings(o: readonly number[], e: readonly number[], { P, T }: { P: Float64Array; T: Uint32Array }): number[] {
  const d = sub(e, o);
  const out: number[] = [];
  for (let t = 0; t < T.length; t += 3) {
    const a = 3 * T[t], b = 3 * T[t + 1], c = 3 * T[t + 2];
    const e1: V = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], e2: V = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
    const p: V = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
    const det = dot(e1, p);
    if (Math.abs(det) < 1e-14) continue;
    const tv: V = [o[0] - P[a], o[1] - P[a + 1], o[2] - P[a + 2]];
    const u = dot(tv, p) / det;
    if (u < 0 || u > 1) continue;
    const q: V = [tv[1] * e1[2] - tv[2] * e1[1], tv[2] * e1[0] - tv[0] * e1[2], tv[0] * e1[1] - tv[1] * e1[0]];
    const w = dot(d, q) / det;
    if (w < 0 || u + w > 1) continue;
    const s = dot(e2, q) / det;
    if (s >= 0 && s <= 1) out.push(s);
  }
  return out;
}
/** The generalised winding number of q about a triangle soup (the solid angles summed, van Oosterom and Strackee): about
 * 1 inside a closed surface, 0 outside. The skull's meshes are not all closed (v3's are cut where the CT ends, which
 * shifts the number by a smooth amount: about −0.25 round the foramen ovale), so this counts a point inside from 0.5. */
function winding(q: readonly number[], { P, T }: { P: Float64Array; T: Uint32Array }): number {
  let w = 0;
  for (let t = 0; t < T.length; t += 3) {
    const a = 3 * T[t], b = 3 * T[t + 1], c = 3 * T[t + 2];
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

/** the section's modules as a page of the default model (v3) loads them */
async function v3Modules() {
  vi.resetModules();
  const g = globalThis as unknown as { document?: unknown };
  const had = 'document' in g;
  g.document = { querySelector: (q: string) => (q.includes('sb-model') ? { content: 'v3' } : null) };
  try {
    return { index: await import('../../src/skullbase'), groups: await import('../../src/skullbase/groups'), state: await import('../../src/skullbase/state'),
      trigeminal: await import('../../src/skullbase/trigeminal') };
  } finally {
    if (!had) delete g.document;
  }
}

const MODELS = [
  { model: 'v3', prefix: 'sbv3' },
  { model: 'zanatomy', prefix: 'sb' },
] as const;
const load = async (prefix: string) => ({
  T: TrigeminalSchema.parse((await import(`../../src/data/generated/${prefix}-trigeminal.json`)).default) as Trigeminal,
  manifest: (await import(`../../src/data/generated/${prefix}-manifest.json`)).default as unknown as Manifest,
  landmarks: (await import(`../../src/data/generated/${prefix}-landmarks.json`)).default as unknown as Lm[],
});
const file = (m: Manifest, name: string) => m.structures.find((s) => s.name === name && !s.pushedFrom && !s.approach)!.file;

describe('trigeminal neuralgia: the measured geometry', () => {
  it('both models’ files parse, each for its own model; v1 has no decompression and v3 has', async () => {
    for (const { model, prefix } of MODELS) {
      const { T, landmarks } = await load(prefix);
      expect(T.model).toBe(model);
      // the points added are new
      for (const l of T.landmarks) expect(landmarks.some((x) => x.id === l.id), l.id).toBe(false);
      expect(T.needle.boneCrossedMm, model).toBe(0);
      expect(T.needle.outerBelowCrossingMm).toBe(40);
    }
    expect((await load('sb')).T.mvd).toBeNull();
    expect((await load('sbv3')).T.mvd).not.toBeNull();
    // v1's right foramen ovale is its left one mirrored
    const v1 = await load('sb');
    const left = v1.landmarks.find((l) => l.name === 'Foramen ovale' && l.side === 'L')!;
    const right = v1.T.landmarks.find((l) => l.name === 'Foramen ovale' && l.side === 'R')!;
    for (const [k, x] of [-left.ras[0], left.ras[1], left.ras[2]].entries()) expect(right.ras[k]).toBeCloseTo(x, 2);
  });

  it('v3: the root entry zone lies on the drawn trigeminal nerve, where it meets the pons', async () => {
    const { T, manifest } = await load('sbv3');
    const rez = T.mvd!.rootEntry;
    const nerve = await meshSoup(file(manifest, 'Trigeminal nerve (V)'));
    const pons = await meshSoup(file(manifest, 'Pons'));
    expect(toMesh(rez, nerve)).toBeLessThan(1.5);
    expect(toMesh(rez, pons)).toBeLessThan(2);
    // the landmark marks the same point, on the right
    expect(T.landmarks.find((l) => l.id === 'lm_root_entry_zone_of_the_trigeminal_nerve_r')!.ras).toEqual(rez);
    // the camera inside the posterior fossa: closer to the root than any view through an opening, and above the craniotomy
    expect(T.mvd!.cameraToRootMm).toBeCloseTo(dist(T.mvd!.camera.position, rez), 1);
    expect(T.mvd!.camera.target).toEqual(rez);
    expect(T.mvd!.cameraToRootMm).toBeLessThan(45);
    expect(T.mvd!.camera.position[2]).toBeGreaterThan(rez[2] - T.mvd!.craniotomyBelowRootMm);
  }, 120_000);

  for (const { model, prefix } of MODELS) {
    it(`${model}: the needle crosses no bone, passes the foramen ovale and ends at its target`, async () => {
      const { T, manifest, landmarks } = await load(prefix);
      const n = T.needle;
      const len = dist(n.outer, n.tip);
      expect(len).toBeCloseTo(n.tipBeyondCrossingMm + n.outerBelowCrossingMm, 0);
      // from the outer end to the tip it meets no surface of the shipped bone meshes, and every 0.25 mm along it lies
      // inside none of them (none tolerated). (A ray's parity, pointsInside, cannot be used: v3's sphenoid is not closed,
      // and rays from the foramen found it "inside" on 42 of the 208 points in one direction and outside in others.)
      const steps = Math.ceil(len / 0.25);
      const bones = manifest.structures.filter((s) => s.type === 'bone' && !s.approach && !s.pushedFrom);
      expect(bones.length).toBeGreaterThan(10);
      for (const b of bones) {
        const soup = await meshSoup(b.file);
        expect(crossings(n.outer, n.tip, soup), `${model}: ${b.name}`).toEqual([]);
        const inside: number[] = [];
        for (let i = 0; i <= steps; i++) {
          const q = n.outer.map((x, k) => x + (n.tip[k] - x) * (i / steps));
          if (winding(q, soup) >= 0.5) inside.push(i * len / steps);
        }
        expect(inside, `${model}: ${b.name}, mm from the outer end`).toEqual([]);
      }
      // the crossing on the line, within 2 mm of the foramen's centre, which lies near the foramen's label
      const d = sub(n.tip, n.outer).map((x) => x / len) as V;
      const off = sub(n.crossing, n.outer);
      const t = dot(off, d);
      expect(dist(n.crossing, n.outer.map((x, k) => x + d[k] * t))).toBeLessThan(0.05);
      expect(dist(n.crossing, n.ovaleCentre)).toBeLessThan(2);
      expect(dist(n.crossing, n.ovaleCentre)).toBeCloseTo(n.crossingFromCentreMm, 1);
      const label = [...landmarks, ...T.landmarks].find((l) => l.name === 'Foramen ovale' && l.side === 'R')!;
      expect(dist(n.ovaleCentre, label.ras)).toBeLessThan(2.5);
      // the tip: Meckel's cave (v3), the trigeminal nerve's run down to the foramen 12 mm beyond it (v1)
      if (model === 'v3') {
        expect(n.tipAt).toBe('Meckel\'s cave');
        expect(dist(n.tip, landmarks.find((l) => l.name === 'Meckel\'s cave' && l.side === 'R')!.ras)).toBeLessThan(2);
      } else {
        expect(n.tipAt).toBe('the trigeminal nerve');
        // (Z-Anatomy's mandibular nerve above the foramen is the run of its trigeminal nerve's mesh that leads to it; its
        // "Mandibular nerve (V3)" is the part below)
        expect(toMesh(n.tip, await meshSoup(file(manifest, 'Trigeminal nerve (V)')))).toBeLessThan(2);
        expect(dist(n.tip, n.ovaleCentre)).toBeCloseTo(12.2, 0);
      }
      // the views: along the needle, aimed at the crossing from below it; the overview below the skull base, from the side
      expect(n.views.along.target).toEqual(n.crossing);
      const a = sub(n.views.along.position, n.crossing);
      expect(dot(a, d) / Math.hypot(...a)).toBeLessThan(-0.999);
      expect(n.views.overview.position[0]).toBeGreaterThan(100);
      expect(n.views.overview.position[2]).toBeLessThan(n.views.overview.target[2]);
    }, 300_000);
  }
});

describe('trigeminal neuralgia: the views', () => {
  it('v1 (this file’s default model) has the percutaneous route and no decompression; a decompression link opens its default view', () => {
    expect(SB_GROUP.has('trigeminal_mvd')).toBe(false);
    const g = SB_GROUP.get('trigeminal_percutaneous')!;
    expect(g.needle?.tipAt).toBe('the trigeminal nerve');
    expect(g.info).toBe('percutaneous');
    expect(g.landmarks).toContain('lm_foramen_ovale_r');
    expect(decodeV1('#/atlas?g=trigeminal_mvd&rs=100').grp).not.toBe('trigeminal_mvd');
  });
  it('v3: the decompression opens with the cerebellum drawn back, and its link round-trips', async () => {
    const { groups: G, state: S, index: I, trigeminal: TN } = await v3Modules();
    expect(I.crossCheckSb()).toEqual([]);
    expect(G.crossCheckGroups()).toEqual([]);
    const s = S.decodeSkull('#/atlas?g=trigeminal_mvd&rs=100');
    expect(s.grp).toBe('trigeminal_mvd');
    expect(s.morphs).toEqual({ retrosigmoid: 1 });
    const link = S.encodeSkull(s);
    expect(link).toContain('g=trigeminal_mvd');
    expect(link).toContain('rs=100');
    expect(S.decodeSkull(link)).toEqual(s);
    // drawn through the retrosigmoid craniotomy, framed on the nerve, the root entry zone on its own side
    const mvd = G.SB_GROUP.get('trigeminal_mvd')!;
    const rs = G.SB_GROUP.get('retrosigmoid')!;
    expect(mvd.approach).toBe('mvd');
    expect(I.geomOf('mvd')).toBe(I.APPROACH_GEOM.retrosigmoid);
    expect(new Set(mvd.structures)).toEqual(new Set(rs.structures));
    expect(mvd.landmarks).toEqual(['lm_root_entry_zone_of_the_trigeminal_nerve_r']);
    expect(mvd.key!.map((id) => I.SB.get(id)!.name)).toEqual(['Trigeminal nerve (V)', 'Superior cerebellar artery (fitted course)', 'Superior cerebellar artery', 'Facial nerve (VII)', 'Vestibulocochlear nerve (VIII)']);
    expect(mvd.aim).toEqual(TN.TRIGEMINAL!.mvd!.camera);
    // the percutaneous route right after it, with the needle and its overview camera
    const ids = G.SB_GROUPS.map((g) => g.id);
    expect(ids.indexOf('trigeminal_percutaneous')).toBe(ids.indexOf('trigeminal_mvd') + 1);
    const perc = G.SB_GROUP.get('trigeminal_percutaneous')!;
    expect(perc.needle).toEqual(TN.TRIGEMINAL!.needle);
    expect(perc.aim).toEqual(TN.TRIGEMINAL!.needle.views.overview);
    expect(perc.landmarks.map((id) => I.LM.get(id)!.name).sort()).toEqual(['Foramen lacerum', 'Foramen ovale', 'Foramen spinosum', 'Meckel\'s cave']);
    // the root entry zone is a landmark of the model's: its card, labels and "Measure positions from here"
    expect(I.LM.get('lm_root_entry_zone_of_the_trigeminal_nerve_l')?.side).toBe('L');
    // ... labelled in the decompression view only (not in the ear and temporal-bone views, which label every other point)
    const tn = new Set(TN.TRIGEMINAL!.landmarks.map((l) => l.id));
    expect(G.SB_GROUPS.filter((g) => g.landmarks.some((id) => tn.has(id))).map((g) => g.id)).toEqual(['trigeminal_mvd']);
  });
  it('the cards ask for the measured read-outs where the views have them', () => {
    expect(MVD_SECTIONS.map((x) => x.measured).filter(Boolean)).toEqual(['tnRoot']);
    expect(PERC_SECTIONS.map((x) => x.measured).filter(Boolean)).toEqual(['tnNeedle', 'tnOvale']);
  });
});
