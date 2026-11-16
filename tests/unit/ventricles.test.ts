import { describe, expect, it } from 'vitest';
import { crossCheckVe, ETV, LANDMARKS, TARGETS, TRAJ, trajectoryFor, VE, VE_MANIFEST } from '../../src/ventricles';
import { ACCURACY, CHEN_COHORT, ETV_SCORE, FRAZIER, TEMPORAL_HORN, THIRD_WALLS } from '../../src/ventricles/content';
import { VE_REFERENCES } from '../../src/ventricles/references';
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

// The site audit's D-009 (the owner's choices of 16 November 2026: the ETV Success Score as a table; Frazier's point with
// a marker on the skull; Keen's point left out, as this CT does not show the ear).
describe('ventricles additions (audit D-009)', () => {
  const lm = new Map(LANDMARKS.map((l) => [l.id, l]));

  it('the inion at the back of the skull on the midline, and Frazier’s point above it, 35 mm to each side', () => {
    const inion = lm.get('lm_inion')!, bregma = lm.get('lm_bregma')!.ras;
    expect(inion.side).toBe('M');
    expect(Math.abs(inion.ras[0] - TRAJ.midline)).toBeLessThan(1);
    expect(inion.ras[1]).toBeLessThan(bregma[1] - 90);
    for (const s of ['r', 'l'] as const) {
      const p = lm.get(`lm_frazier_${s}`)!;
      expect(p.name).toBe('Frazier\'s point');
      expect(Math.abs(Math.abs(p.ras[0] - TRAJ.midline) - 35), s).toBeLessThan(0.5);
      expect(Math.sign(p.ras[0] - TRAJ.midline), s).toBe(s === 'r' ? 1 : -1);
      // 60 mm up a curved surface: higher than the inion by somewhat less
      expect(p.ras[2] - inion.ras[2], s).toBeGreaterThan(40);
      expect(p.ras[2] - inion.ras[2], s).toBeLessThan(60);
      expect(p.how).toMatch(/^60 mm up the outer table from the inion along the midline and, at that height, 35 mm from the midline/);
      expect(p.how).toMatch(/parietal bone/);
    }
    // no Keen's point: the CT's field ends above the ear
    expect(LANDMARKS.some((l) => /keen/i.test(l.id + l.name))).toBe(false);
    // the catheter view marks them, on the catheter's side
    for (const side of ['L', 'R'] as const) {
      const st = defaultVeState(); st.grp = 'evd'; st.cath.side = side;
      expect(catheterMarkers(st)).toEqual(expect.arrayContaining(['lm_inion', `lm_frazier_${side.toLowerCase()}`]));
      expect(catheterMarkers(st)).not.toContain(`lm_frazier_${side === 'L' ? 'r' : 'l'}`);
    }
    expect(FRAZIER[0].text).toMatch(/about 6 cm above the inion and 3–4 cm from the midline/);
    expect(FRAZIER[0].refIds).toEqual(['elbadway2026']);
    expect(FRAZIER[1].text).toMatch(/parietal bone above the lambdoid suture, entered the ventricle at the atrium/);
    expect(FRAZIER[1].refIds).toEqual(['kara2026']);
  });

  it('the ETV Success Score: the three factors and their points, a sum of at most 90, its two sources', () => {
    expect(ETV_SCORE.rows.map(([f]) => f)).toEqual(['Age', 'Cause', 'Previous shunt']);
    const pts = Object.fromEntries(ETV_SCORE.rows.map(([f, items]) => [f, items.map(([, x]) => x)]));
    expect(pts).toEqual({ Age: [0, 10, 30, 40, 50], Cause: [0, 20, 30], 'Previous shunt': [0, 10] });
    expect(ETV_SCORE.rows[0][1][0][0]).toBe('Under 1 month');
    expect(ETV_SCORE.rows[1][1][0][0]).toBe('Postinfectious');
    expect(ETV_SCORE.rows[2][1]).toEqual([['Yes', 0], ['No', 10]]);
    expect(Object.values(pts).reduce((n, v) => n + Math.max(...v), 0)).toBe(90);
    expect(ETV_SCORE.refIds).toEqual(['krause2024']);
    expect(ETV_SCORE.intro[0].text).toMatch(/618 ventriculostomies in children at 12 centres, success judged at 6 months/);
    expect(ETV_SCORE.intro[0].refIds).toEqual(['kulkarni2009']);
    expect(ETV_SCORE.note).toMatch(/derived in children.*not a calculator/);
    // the original paper is not open access, and says so
    const k = VE_REFERENCES.find((r) => r.id === 'kulkarni2009')!;
    expect(k.pmcid).toBeUndefined();
    expect(k.citation).toMatch(/Checked against its abstract: the full text is not open access\.$/);
  });

  it('the third ventricle’s roof and other walls, the temporal horn’s walls, and whom Chen’s percentages come from', () => {
    expect(THIRD_WALLS.map((c) => c.text.split(':')[0])).toEqual(['Roof', 'Anterior wall', 'Posterior wall, from above down', 'Lateral walls']);
    expect(THIRD_WALLS[0].refIds).toEqual(['azab2014']);
    expect(THIRD_WALLS[2].text).toMatch(/habenular commissure, the pineal gland, the pineal recess and the posterior commissure/);
    expect(TEMPORAL_HORN.every((c) => c.refIds.join() === 'kucukyuruk2012')).toBe(true);
    expect(TEMPORAL_HORN[0].text).toMatch(/roof and lateral wall are formed by the tapetum/);
    expect(TEMPORAL_HORN[1].text).toMatch(/amygdala forms its anterior wall/);
    expect(CHEN_COHORT[0].text).toMatch(/older than 16 \(median age 64, interquartile range 53–73\) with normal ventricles, the frontal horns 21\.7–53\.7 mm/);
    expect(Object.keys(ACCURACY)).toEqual(TARGETS);
  });
});

