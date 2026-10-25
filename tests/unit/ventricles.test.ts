import { describe, expect, it } from 'vitest';
import { crossCheckVe, LANDMARKS, TARGETS, TRAJ, trajectoryFor, VE, VE_MANIFEST } from '../../src/ventricles';
import { VE_GROUPS } from '../../src/ventricles/groups';
import { catheterMarkers, vePlan } from '../../src/ventricles/scene';
import { decodeVe, defaultVeState, encodeVe } from '../../src/ventricles/state';

describe('ventricles section', () => {
  it('content, references and generated files agree', () => {
    expect(crossCheckVe()).toEqual([]);
  });
  it('this CT’s ventricles: plausible size, split at the midline, narrow frontal horns measured', () => {
    const v = TRAJ.ventricles;
    for (const s of ['R', 'L'] as const) { expect(v.volumeMl[s]).toBeGreaterThan(0.5); expect(v.volumeMl[s]).toBeLessThan(30); }
    const lv = VE.get('ve_lateral_ventricle')!;
    expect(lv.centroid!.R[0]).toBeGreaterThan(TRAJ.midline);
    expect(lv.centroid!.L[0]).toBeLessThan(TRAJ.midline);
    expect(v.frontalHorns.evansIndex).toBeCloseTo(v.frontalHorns.widthMm / v.frontalHorns.innerSkullMm, 2);
    expect(VE_MANIFEST.structures.some((s) => s.category === 'bone')).toBe(true);
  });
  it('the drawn ventricles: the CT’s completed by the fitted model, joined by the foramina of Monro', () => {
    const v = TRAJ.ventricles;
    for (const id of ['ve_lateral_ventricle', 've_third_ventricle', 've_interventricular_foramen']) expect(VE.get(id)?.category, id).toBe('ventricle');
    // the drawn ventricles hold the CT's, and each side has its foramen
    for (const s of ['R', 'L'] as const) {
      expect(v.drawnMl[s]).toBeGreaterThanOrEqual(v.volumeMl[s]);
      expect(v.drawnMl[`monro${s}`]).toBeGreaterThan(0);
      expect(v.fit.monro[s].gapMm).toBeLessThan(6);
    }
    expect(v.drawnMl.third).toBeGreaterThanOrEqual(v.volumeMl.third);
    // the model follows the CT where it shows the ventricles, without folding; the foramina lie on darker CT
    expect(v.fit.fitMedianMm).toBeLessThan(1.2);
    expect(v.fit.jacobianMin).toBeGreaterThan(0.2);
    for (const s of ['R', 'L']) expect(v.fit.monroCt[s].insideHu).toBeLessThan(v.fit.monroCt[s].aroundHu);
    // a circle of the published mean cross-section
    expect(Math.PI * v.fit.monroRadiusMm ** 2).toBeCloseTo(TRAJ.params.monroAreaMm2, 1);
    // the trajectories stop where Chen advises withdrawing the catheter
    for (const t of TRAJ.trajectories) if (t.ventricle) expect(t.depthMm!).toBeLessThanOrEqual(TRAJ.params.maxDepthMm);
  });
  it('the skull’s landmarks: Kocher’s point at its stated distance from the midline and in front of bregma, the meatus on the temporal bones', () => {
    const lm = new Map(LANDMARKS.map((l) => [l.id, l]));
    const bregma = lm.get('lm_bregma')!.ras;
    for (const [k, d] of Object.entries(TRAJ.params.kocher)) for (const s of ['r', 'l']) {
      const p = lm.get(`lm_kocher_${k}_${s}`)!.ras;
      expect(Math.abs(Math.abs(p[0] - TRAJ.midline) - d), `${k} ${s}`).toBeLessThan(2);
      expect(p[1] - bregma[1], `${k} ${s}`).toBeGreaterThan(0);
      expect(Math.sign(p[0] - TRAJ.midline)).toBe(s === 'r' ? 1 : -1);
    }
    expect(lm.get('lm_meatus_r')!.ras[0]).toBeGreaterThan(40);
    expect(lm.get('lm_meatus_l')!.ras[0]).toBeLessThan(-40);
    // the projected canthi lie on the line between the meatus, at the stated distance from the midline
    expect(Math.abs(lm.get('lm_canthus_r')!.ras[0] - TRAJ.midline - TRAJ.canthusMm)).toBeLessThan(0.05);
  });
  it('every trajectory: a unit direction from its entry; aimed ones point at their aim; a hit has a depth, a miss a distance', () => {
    for (const t of TRAJ.trajectories) {
      const n = Math.hypot(...t.direction);
      expect(Math.abs(n - 1)).toBeLessThan(1e-3);
      if (t.aim) {
        const v = t.aim.map((a, i) => a - t.entry[i]);
        const len = Math.hypot(...v);
        expect(v.reduce((s, x, i) => s + x * t.direction[i], 0) / len).toBeGreaterThan(0.999);
      } else expect(t.target).toBe('P');
      if (t.ventricle) expect(t.depthMm).toBeGreaterThan(15);
      else expect(t.missMm).toBeGreaterThanOrEqual(0);
    }
    // aiming further across the midline turns the catheter medially: IMC is the most lateral aim, CMC the most medial
    for (const s of ['R', 'L'] as const) {
      const x = (tg: string) => trajectoryFor('chen', s, 0, tg)!.aim![0];
      const sg = s === 'R' ? 1 : -1;
      expect(sg * x('IMC')).toBeGreaterThan(sg * x('MAM'));
      expect(sg * x('MAM')).toBeGreaterThan(sg * x('CMC'));
    }
    expect(TARGETS.length).toBe(4);
  });
  it('the views: ventricles highlighted; the ventriculostomy view draws its side’s Kocher’s point; the catheter is in the link', () => {
    for (const g of VE_GROUPS) {
      const s = { ...defaultVeState(), grp: g.id };
      const p = vePlan(s);
      for (const id of g.key) expect(p.looks.get(id), id).toBe('primary');
      if (g.catheter) expect(p.markers.map((m) => m.targetId)).toContain('lm_kocher_chen_r');
    }
    const s = decodeVe('#/atlas?g=evd&cs=L&ck=park&co=10&ct=IMC');
    expect(s.cath).toEqual({ side: 'L', kocher: 'park', offset: 10, target: 'IMC' });
    expect(catheterMarkers(s)).toContain('lm_kocher_park_l');
    expect(decodeVe(encodeVe(s)).cath).toEqual(s.cath);
    // the catheter's settings stay out of the link of a view without one, and bad values fall back to the defaults
    expect(encodeVe({ ...s, grp: 'ventricles' })).not.toContain('ct=');
    expect(decodeVe('#/atlas?g=evd&co=7&ct=XYZ').cath).toEqual(defaultVeState().cath);
  });
});
