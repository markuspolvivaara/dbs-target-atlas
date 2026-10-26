import { describe, expect, it } from 'vitest';
import { crossCheckVe, ETV, LANDMARKS, TARGETS, TRAJ, trajectoryFor, VE, VE_MANIFEST } from '../../src/ventricles';
import { VE_GROUPS } from '../../src/ventricles/groups';
import { catheterMarkers, vePlan } from '../../src/ventricles/scene';
import { decodeVe, defaultScopeDepth, defaultVeState, encodeVe, ETV_DEFAULT, etvLine, SCOPE_ENTRY_MAX } from '../../src/ventricles/state';

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
  it('the drawn ventricles: the CT’s completed by the fitted model, joined by the foramina of Monro and the aqueduct', () => {
    const v = TRAJ.ventricles;
    for (const id of ['ve_lateral_ventricle', 've_third_ventricle', 've_interventricular_foramen', 've_cerebral_aqueduct', 've_fourth_ventricle']) expect(VE.get(id)?.category, id).toBe('ventricle');
    // one cavity, lateral ventricles to fourth; the CT shows the fourth ventricle's upper part and the model lies on it
    expect(v.fit.drawnPieces).toBe(1);
    expect(v.drawnMl.fourth).toBeGreaterThanOrEqual(v.volumeMl.fourth);
    expect(v.volumeMl.fourth).toBeGreaterThan(0);
    expect(v.fit.fourthFitMedianMm).toBeLessThan(1.5);
    expect(v.fit.aqueduct.courseMm).toBeGreaterThan(12);
    expect(v.fit.aqueduct.courseMm).toBeLessThan(26);
    expect(TRAJ.params.aqueductMm[1]).toBeLessThan(TRAJ.params.aqueductMm[0]);
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
  it('around the ventricles: the fitted structures are there, labelled fitted; the mammillary bodies where da Silva puts them', () => {
    for (const id of ['ve_fornix', 've_septum_pellucidum', 've_choroid_plexus', 've_mammillary_body', 've_thalamus', 've_optic_chiasm']) {
      expect(VE.get(id)?.fitted, id).toBe(true);
      expect(VE.get(id)?.category, id).toBe('deep');
    }
    expect(VE.get('ve_mammillary_body')!.refIds).toContain('dasilva2024');
    for (const id of ['sb_basilar_artery', 'sb_posterior_cerebral_artery_p1_p2', 'tb_oculomotor_nerve_iii', 'pf_midbrain']) expect(VE.has(id), id).toBe(true);
    // da Silva 2024 (200 MRIs, mean ± SD from the anterior commissure along the AC-PC line): this CT within 3 SD
    const near = ([y, z]: number[], my: number, sy: number, mz: number, sz: number) => Math.abs(y - my) < 3 * sy && Math.abs(z - mz) < 3 * sz;
    expect(near(ETV.infundibularRecessAcpcMm, -0.49, 1.6, -13.34, 1.78)).toBe(true);
    expect(near(ETV.basilarApexAcpcMm, -9.79, 2.22, -13.97, 4.08)).toBe(true);
    expect(ETV.mammillary.placedAcpcMm[0]).toBeCloseTo(-8.56, 1);
    expect(near(ETV.mammillary.placedAcpcMm, -8.56, 1.18, -7.01, 1.65)).toBe(true);
    expect(ETV.acpcLengthMm).toBeGreaterThan(20);
    expect(ETV.acpcLengthMm).toBeLessThan(32);
  });
  it('the endoscopic third ventriculostomy: the target between the recess and the mammillary bodies, Sousa’s line plausible on this skull', () => {
    const [ty] = ETV.targetAcpcMm;
    expect(ty).toBeLessThan(ETV.infundibularRecessAcpcMm[0]);
    expect(ty).toBeGreaterThan(ETV.mammillary.placedAcpcMm[0]);
    expect(ETV.targetToBasilarApexMm).toBeGreaterThan(3);
    expect(ETV.targetToBasilarApexMm).toBeLessThan(12);
    for (const side of ['R', 'L'] as const) {
      const t = ETV.trajectories[side];
      expect(Math.hypot(...t.direction), side).toBeCloseTo(1, 3);
      expect(t.depthMm, side).toBeGreaterThan(75);          // Sousa 2025, without hydrocephalus: 88.5 ± 3.9 mm
      expect(t.depthMm, side).toBeLessThan(100);
      expect(t.depthToMonroMm, side).toBeLessThan(t.depthMm);
      expect(t.fromMidlineMm, side).toBeGreaterThan(5);
      expect(t.fromMidlineMm, side).toBeLessThan(35);
      expect(Math.sign(t.entry[0] - ETV.frame.origin[0])).toBe(side === 'R' ? 1 : -1);
      expect(t.entry[2]).toBeGreaterThan(t.target[2] + 60); // the burr hole far above the floor
    }
    expect(etvLine('R', 0).entry).toEqual(ETV.trajectories.R.entry);
    expect(etvLine('R', 1).depthMm).toBeCloseTo(ETV.hydrocephalus.trajectories.R.depthMm, 5);
  });
  it('the hydrocephalus shape: meets Roşu’s medians and Aydin’s floor, triventricular, does not fold', () => {
    const H = ETV.hydrocephalus;
    expect(H.rest.evansIndex).toBeLessThan(0.3);
    expect(Math.abs(H.hydrocephalus.evansIndex - H.goal.evansIndex)).toBeLessThan(0.01);
    expect(Math.abs(H.hydrocephalus.thirdWidthMm - H.goal.thirdWidthMm)).toBeLessThan(0.5);
    // the floor comes down over this patient's P1 segments, which hold it a little above Aydin's 2.75 mm
    expect(H.hydrocephalus.floorToApexMm).toBeGreaterThanOrEqual(H.goal.floorToApexMm - 0.3);
    expect(H.hydrocephalus.floorToApexMm).toBeLessThan(H.goal.floorToApexMm + 1);
    expect(H.hydrocephalus.floorToApexMm).toBeLessThan(H.rest.floorToApexMm - 3);
    expect(H.goal).toEqual({ evansIndex: 0.42, thirdWidthMm: 23.5, floorToApexMm: 2.75 });
    expect(H.jacobianMinAround).toBeGreaterThan(0);
    // the mammillary bodies where da Silva 2024 measured them in hydrocephalus (medians, 24 MRIs)
    expect(H.mammillary.placedAcpcMm[0]).toBeCloseTo(H.mammillary.daSilvaHydroAcpcMm[0], 0);
    expect(H.mammillary.daSilvaHydroAcpcMm).toEqual([-11.3, -7.05]);
    // the line lengthens with the ventricles (Sousa: about 6 mm per 0.1 of Evans' index)
    expect(H.trajectories.R.depthMm).toBeGreaterThan(ETV.trajectories.R.depthMm);
  });
  it('the endoscope and the shape are in the link; the ventriculostomy view drops the shape', () => {
    const s = decodeVe('#/atlas?g=etv&es=L&ed=70&ea=5,-3&eo=8,-4&er=90&ev=3d&hy=60');
    expect(s.scope).toEqual({ side: 'L', depth: 70, ap: 5, ml: -3, ex: 8, ey: -4, roll: 90, big: false });
    expect(decodeVe('#/atlas?g=etv&eo=99,-99&er=500').scope).toMatchObject({ ex: SCOPE_ENTRY_MAX.ex, ey: -SCOPE_ENTRY_MAX.ey, roll: 180 });
    expect(s.morphs.hydrocephalus).toBeCloseTo(0.6);
    expect(decodeVe(encodeVe(s))).toMatchObject({ scope: s.scope, morphs: s.morphs });
    // the ventriculostomy view opens with the shape at ETV_DEFAULT.hydro and the scope as ETV_DEFAULT says
    const d = decodeVe('#/atlas?g=etv');
    expect(d.morphs.hydrocephalus).toBe(ETV_DEFAULT.hydro);
    expect(d.scope).toMatchObject({ depth: defaultScopeDepth('R', ETV_DEFAULT.hydro), ex: ETV_DEFAULT.ex, ey: ETV_DEFAULT.ey, ap: ETV_DEFAULT.ap, ml: ETV_DEFAULT.ml });
    expect(encodeVe(d)).not.toMatch(/[?&](hy|ed|ea|eo|er)=/);
    const none = decodeVe('#/atlas?g=etv&hy=0');
    expect(none.morphs).toEqual({});
    expect(decodeVe(encodeVe(none)).morphs).toEqual({});
    expect(decodeVe('#/atlas?g=evd&hy=60').morphs).toEqual({});
    expect(encodeVe({ ...s, grp: 'ventricles' })).not.toContain('ed=');
    const p = vePlan(decodeVe('#/atlas?g=etv'));
    expect(p.looks.get('ve_third_ventricle')).toBe('context');
    expect(p.looks.get('ve_fornix')).toBe('primary');
  });
});
