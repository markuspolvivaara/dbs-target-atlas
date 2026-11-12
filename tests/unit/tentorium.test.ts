import { describe, expect, it } from 'vitest';
import fitJson from '../../src/data/generated/sbv3-fit.json';
import { V3_FIT } from '../../src/skullbase';
import { meshSoup, pointsInside } from './glb';

/**
 * The default skull base's cerebrum (a template fitted into this CT) and its cerebellum (Z-Anatomy's, fitted into the
 * posterior fossa) either side of one tentorium: a surface through this CT's own transverse sinuses, straight sinus and
 * petrous ridges (pipeline/skullbase_v3_tentorium.py). Before November 2026 each was fitted on its own against
 * Z-Anatomy's fitted tentorium as a soft term, and they shared 32 ml along it, with the transverse sinuses inside both
 * (the audit's finding MB-03).
 */
const CEREBRUM = ['br_frontal_lobe', 'br_parietal_lobe', 'br_temporal_lobe', 'br_occipital_lobe', 'br_insula', 'br_cingulate_gyrus', 'br_medial_wall'];
const CEREBELLUM = ['pf_cerebellar_hemisphere', 'pf_vermis', 'pf_tonsil'];
const file = (id: string) => `assets/skullbase-v3/${id}.glb`;

describe('skull base (default model): the cerebrum and the cerebellum either side of the tentorium', () => {
  it('the build reports it: under 1 ml shared, the sinuses in the tentorium inside neither', () => {
    const t = V3_FIT.tentorium!;
    expect(t.overlapMl).toBeLessThanOrEqual(1);
    expect(t.cerebrumUnderSheetMl).toBeLessThanOrEqual(1);
    expect(t.cerebellumOverSheetMl).toBeLessThanOrEqual(1);
    expect(t.sinusInCerebrumShare).toBeLessThanOrEqual(0.05);
    expect(t.sinusInCerebellumShare).toBeLessThanOrEqual(0.05);
  });

  it('the surface is anchored on this CT: transverse sinuses, straight sinus and petrous ridges, each passed within a millimetre', () => {
    const t = V3_FIT.brain!.tentorium!;
    expect(t.anchors.transverseSinus).toBeGreaterThan(30);
    expect(t.anchors.straightSinus).toBeGreaterThan(10);
    expect(t.anchors.petrousRidge).toBeGreaterThan(20);
    expect(t.anchorMissMm.max).toBeLessThan(1);
    // (what it replaced: the fitted model's tentorium, well off those structures)
    expect(Math.min(t.fittedAboveTransverseSinusRMm, t.fittedAboveTransverseSinusLMm)).toBeGreaterThan(5);
    // the raw report keeps the rest (footprint, radii) for the record
    expect((fitJson as unknown as { brain: { tentorium: { footprintCm2: number } } }).brain.tentorium.footprintCm2).toBeGreaterThan(40);
  });

  it('on the shipped files: no vertex of the cerebellum inside a cerebral hemisphere, none of the cerebrum inside the cerebellum', async () => {
    // each hemisphere is the closed surface its seven pieces make together (both hemispheres in one soup); each
    // cerebellar file's halves are closed on their own
    const cer = await Promise.all(CEREBRUM.map((id) => meshSoup(file(id))));
    const nP = cer.reduce((n, m) => n + m.P.length, 0), nT = cer.reduce((n, m) => n + m.T.length, 0);
    const P = new Float64Array(nP), T = new Uint32Array(nT);
    let op = 0, ot = 0;
    for (const m of cer) {
      P.set(m.P, op);
      for (let i = 0; i < m.T.length; i++) T[ot + i] = m.T[i] + op / 3;
      op += m.P.length; ot += m.T.length;
    }
    let cbPoints = 0, cbInside = 0, cerInside = 0;
    // (the cerebrum's vertices near the posterior fossa only: the rest cannot be in the cerebellum)
    const near: number[] = [];
    for (let i = 0; i < P.length; i += 3) if (P[i + 1] < -20 && P[i + 2] < 25) near.push(P[i], P[i + 1], P[i + 2]);
    const Q = Float64Array.from(near);
    for (const id of CEREBELLUM) {
      const cb = await meshSoup(file(id));
      cbPoints += cb.P.length / 3;
      cbInside += pointsInside(cb.P, P, T);
      cerInside += pointsInside(Q, cb.P, cb.T);
    }
    // (the files before: 16.7 % of the cerebellar hemispheres' vertices lay inside the cerebral hemispheres)
    expect(cbInside / cbPoints).toBeLessThan(0.002);
    expect(cerInside / (Q.length / 3)).toBeLessThan(0.002);
  }, 120_000);
});

/**
 * Fitted vessels on the bone and on the brainstem (the audit's findings MB-04, MB-05, MB-08): the petrosal sinuses
 * laid onto this CT's bone, the pontine branches and the anterior spinal artery onto the fitted brainstem, the fitted
 * cerebellar arteries' courses without corners; each measured against the bone as the model draws it.
 */
describe('skull base (default model): fitted vessels lie on the bone and the brainstem, not in them', () => {
  const OFF_BONE = ['Anterior inferior cerebellar artery', 'Superior cerebellar artery (fitted course)',
    'Posterior inferior cerebellar artery (fitted course)', 'Medial pontine branches of basilar artery',
    'Lateral pontine branches of basilar artery', 'Anterior spinal artery', 'Superior petrosal sinus', 'Inferior petrosal sinus'];

  it('the petrosal sinuses: none of their centre line in the drawn bone (24 to 36 mm of each was)', () => {
    const p = V3_FIT.petrosal!;
    expect(Object.keys(p).sort()).toEqual(['sb_inferior_petrosal_sinus', 'sb_superior_petrosal_sinus']);
    for (const [id, sides] of Object.entries(p)) for (const side of ['R', 'L']) {
      const r = sides[side];
      expect(r.inBoneBeforeMm, `${id} ${side}`).toBeGreaterThan(20);
      expect(r.inBoneMm, `${id} ${side}`).toBeLessThanOrEqual(2);
      expect(r.lengthMm, `${id} ${side}`).toBeGreaterThan(35);
      expect(r.lengthMm, `${id} ${side}`).toBeLessThan(90);
    }
  });

  it('every vessel and nerve is measured against the bone as drawn; the courses that run on the brain or the bone are out of it', () => {
    const b = V3_FIT.drawnBone!;
    expect(Object.keys(b).length).toBeGreaterThan(60);
    for (const name of OFF_BONE) for (const side of ['R', 'L']) {
      expect(b[name]?.[side], `${name} ${side}`).toBeTruthy();
      // (the right lateral pontine branches had 52 % of their surface in the petrous apex)
      expect(b[name][side].share, `${name} ${side}`).toBeLessThanOrEqual(0.05);
    }
  });

  it('the fitted cerebellar arteries and the branches on the brainstem do not fold back on themselves; few corners are left', () => {
    const c = V3_FIT.fittedCourses!;
    // (before: the anterior inferior cerebellar artery 3 and 4 corners over 70 degrees, the sharpest 106; the superior
    // 8 and 14, the sharpest 149, a twig traced out and back)
    for (const name of ['Anterior inferior cerebellar artery', 'Superior cerebellar artery (fitted course)', 'Medial pontine branches of basilar artery',
      'Lateral pontine branches of basilar artery', 'Anterior spinal artery']) for (const side of ['R', 'L']) {
      expect(c[name]?.[side], `${name} ${side}`).toBeTruthy();
      expect(c[name][side].sharpestDeg, `${name} ${side}`).toBeLessThanOrEqual(100);
      expect(c[name][side].cornersOver70, `${name} ${side}`).toBeLessThanOrEqual(4);
    }
    // (the PICA's carried-on course, some 670 mm of small branches a side: 34 and 29 corners over 70 degrees before)
    for (const side of ['R', 'L']) expect(c['Posterior inferior cerebellar artery (fitted course)'][side].cornersOver70, side).toBeLessThanOrEqual(6);
  });
});
