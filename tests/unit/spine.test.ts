import { describe, expect, it } from 'vitest';
import { crossCheckSpine, discBelow, SP, SP_MANIFEST, SP_REFS, vertebraOf } from '../../src/spine';
import published from '../../src/data/generated/spine-published.json';
import {
  ACDF_STATEMENTS, affectedRoot, APPROACH_STATEMENTS, APPROACHES, CCJ, CCJ_MEASURES, CERVICAL_GEOM, crossCheckContent, exitingRoot, exposureRegion, GEOM_BY_LEVEL,
  LESION_ZONES, LUMBAR_GEOM, NECK_LANDMARKS, ROOT_FUNCTION, STATEMENTS, THORACIC_GEOM, VERTEBRAL_ARTERY,
} from '../../src/spine/content';
import { REGION, REGIONS } from '../../src/spine/regions';
import { LESION_MARKERS, lesionMarkerId, spinePlan, spineScene } from '../../src/spine/scene';
import { decodeSpine, defaultSpineState, encodeSpine } from '../../src/spine/state';
import { nodeMeans } from './glb';

describe('spine data (VerSe CT + TotalSegmentator)', () => {
  it('generated files agree with each other; every statement reference resolves', () => {
    expect(crossCheckSpine()).toEqual([]);
    expect(crossCheckContent()).toEqual([]);
    for (const st of Object.values(STATEMENTS)) for (const r of st.refIds) expect(SP_REFS.get(r)?.shortLabel, r).toMatch(/^[A-Z][A-Za-z-]+ \d{4}$/);
  });
  it('has every vertebra C1-L5, the sacrum, and the discs of the lumbar region', () => {
    for (const lv of ['C1', 'C7', 'T1', 'T12', 'L1', 'L5', 'S1']) expect(vertebraOf(lv), lv).toBeTruthy();
    for (const lv of ['L1', 'L2', 'L3', 'L4', 'L5']) expect(discBelow(lv), lv).toBeTruthy();
    expect(SP.get('sp_dural_sac')?.layer).toBe('tracts');
  });
  it('every schematic element is flagged (the card shows the flag): roots, ganglia, the vertebral artery; vessels and soft tissue only in the neck', () => {
    for (const s of SP_MANIFEST.structures) {
      if (['root', 'ganglion'].includes(s.category ?? '') || s.id === 'sp_vertebral_artery') expect(s.schematic, s.id).toBe(true);
      else expect(s.schematic, s.id).toBeUndefined();
      expect(['zone', 'artery', 'vein'], s.id).not.toContain(s.category);
      // dorsal focus in the lumbar and thoracic regions: vessels, viscera and muscles are drawn in the cervical one only
      if (['vessel', 'viscera', 'muscle'].includes(s.category ?? '')) expect(s.region, s.id).toBe('cervical');
    }
    const roots = (region: string) => SP_MANIFEST.structures.filter((s) => s.category === 'root' && s.region === region).map((s) => s.level);
    expect(roots('lumbar')).toEqual(['L1', 'L2', 'L3', 'L4', 'L5', 'S1']);
    expect(roots('thoracic')).toEqual(Array.from({ length: 12 }, (_, i) => `T${i + 1}`));
    expect(roots('cervical')).toEqual(['C3', 'C4', 'C5', 'C6', 'C7', 'C8']);
  });
  it('measured lumbar geometry is plausible, with a disc height at every lumbar disc above L5-S1', () => {
    for (const g of LUMBAR_GEOM) {
      if (g.canal) { expect(g.canal.width, g.level).toBeGreaterThan(12); expect(g.canal.depth, g.level).toBeGreaterThan(8); }
      for (const f of [g.foramen.L, g.foramen.R]) if (f) { expect(f.height, g.pair).toBeGreaterThan(10); expect(f.height, g.pair).toBeLessThan(35); }
    }
    for (const g of LUMBAR_GEOM.filter((x) => x.pair !== 'L5-S1')) {
      expect(g.discHeightMm, g.pair).toBeGreaterThan(3);
      expect(g.discHeightMm, g.pair).toBeLessThan(20);
    }
  });
  it('shipped GLBs decode with the left half left of the right half', async () => {
    const m = await nodeMeans(SP.get('sp_l3')!.file);
    expect(m.L[0]).toBeLessThan(m.R[0]);
    const r = await nodeMeans(SP.get('sp_root_l4')!.file);
    expect(r.L[0]).toBeLessThan(0);
    expect(r.R[0]).toBeGreaterThan(0);
  });
});

describe('spine scene and URL state', () => {
  it('plans reference only catalogue entries; a level keeps its vertebra and disc solid', () => {
    const p = spinePlan({ region: 'lumbar', level: 'L4', sel: null });
    for (const id of [...p.looks.keys(), ...p.focusIds]) expect(spineScene.catalog.byId.has(id), id).toBe(true);
    expect(p.looks.get('sp_l4')).toBe('primary');
    expect(p.looks.get('sp_disc_l4_l5')).toBe('primary');
    expect(p.looks.get('sp_l2')).toBe('context');
    for (const m of p.markers) expect(spineScene.catalog.markers.has(m.targetId), m.targetId).toBe(true);
    expect(REGIONS.every((r) => r.ready)).toBe(true);
  });
  it('round-trips a teaching link and ignores regions that are not built yet', () => {
    const s = { ...defaultSpineState(), level: 'L4', sel: 'sp_root_l4', hemi: 'L' as const, cutSide: 'R' as const, labels: 'all' as const, hidden: ['sp_sacrum'] };
    s.layers.discs = { on: true, opacity: 0.5 };
    expect(decodeSpine(encodeSpine(s))).toEqual(s);
    expect(decodeSpine('#/atlas?r=sacral').region).toBe('lumbar');
    const neck = { ...defaultSpineState(), region: 'cervical' as const, level: 'C5' };
    neck.layers.viscera = { on: false, opacity: 0.3 };
    expect(decodeSpine(encodeSpine(neck))).toEqual(neck);
    const les = { ...defaultSpineState(), level: 'L5', lesion: { pair: 'L5-S1', zone: 'farlateral' as const, side: 'R' as const } };
    expect(decodeSpine(encodeSpine(les))).toEqual(les);
    // a lesion belongs to the disc below the selected level; anything else is dropped
    expect(decodeSpine('#/atlas?lv=L3&les=L4-L5.paracentral.L').lesion).toBeNull();
    expect(decodeSpine('#/atlas?lv=L4&les=L4-L5.central.L').lesion).toBeNull();
  });
});

describe('lesion-to-root tool', () => {
  it('a paracentral herniation affects the traversing root, a foraminal or far lateral one the exiting root', () => {
    expect(affectedRoot('L4-L5', 'paracentral')).toBe('L5');
    expect(affectedRoot('L4-L5', 'foraminal')).toBe('L4');
    expect(affectedRoot('L4-L5', 'farlateral')).toBe('L4');
    expect(affectedRoot('L5-S1', 'paracentral')).toBe('S1');
  });
  it('every lumbar disc below L1 has herniation positions on the correct side, ordered medial to lateral', () => {
    const pairs = LUMBAR_GEOM.filter((g) => g.lesions).map((g) => g.pair);
    expect(pairs).toEqual(['L1-L2', 'L2-L3', 'L3-L4', 'L4-L5', 'L5-S1']);
    for (const g of LUMBAR_GEOM) if (g.lesions) for (const sd of ['L', 'R'] as const) {
      const sign = sd === 'L' ? -1 : 1;
      const x = LESION_ZONES.map(([z]) => sign * (g.lesions![sd][z][0] - g.discCentre[0]));
      expect(x[0], `${g.pair} ${sd}`).toBeGreaterThan(0);
      expect(x[1], `${g.pair} ${sd}`).toBeGreaterThan(x[0]);
      expect(x[2], `${g.pair} ${sd}`).toBeGreaterThan(x[1]);
    }
    expect(LESION_MARKERS.length).toBe(pairs.length * 2 * 3);
  });
  it('the plan puts the affected root forward and marks the herniation', () => {
    const p = spinePlan({ region: 'lumbar', level: 'L4', sel: null, lesion: { pair: 'L4-L5', zone: 'paracentral', side: 'L' } });
    expect(p.looks.get('sp_root_l5')).toBe('primary');
    expect(p.looks.get('sp_drg_l5')).toBe('primary');
    expect(p.looks.get('sp_root_l4')).toBe('context');
    expect(p.markers).toEqual([{ targetId: lesionMarkerId('L4-L5', 'paracentral', 'L'), primary: true }]);
    expect(spineScene.catalog.markers.has(p.markers[0].targetId)).toBe(true);
  });
  it('ISNCSCI function covers L1-S1, with a key muscle for L2-S1', () => {
    expect(Object.keys(ROOT_FUNCTION)).toEqual(['L1', 'L2', 'L3', 'L4', 'L5', 'S1']);
    for (const r of ['L2', 'L3', 'L4', 'L5', 'S1']) expect(ROOT_FUNCTION[r].keyMuscle, r).toBeTruthy();
    expect(ROOT_FUNCTION.L1.keyMuscle).toBeNull();
  });
});

describe('thoracic region (phase 3a)', () => {
  it('is built: T1-T12 with their discs, roots and the canal contents; no ribs, no lumbar roots, no vessels', () => {
    const r = REGION.get('thoracic')!;
    expect(r.ready).toBe(true);
    expect(r.levels).toEqual(Array.from({ length: 12 }, (_, i) => `T${i + 1}`));
    for (let i = 1; i <= 12; i++) {
      for (const id of [`sp_t${i}`, `sp_root_t${i}`, `sp_drg_t${i}`]) expect(r.structures, id).toContain(id);
    }
    expect(SP_MANIFEST.structures.filter((s) => s.category === 'rib')).toEqual([]);
    for (const id of ['sp_disc_c7_t1', 'sp_disc_t6_t7', 'sp_disc_t12_l1', 'sp_dural_sac']) expect(r.structures, id).toContain(id);
    expect(r.structures).not.toContain('sp_root_l4');
    expect(REGION.get('lumbar')!.structures).not.toContain('sp_root_t6');
  });
  it('measures the canal and disc height at every level; the foramen size is not reported (rib heads)', () => {
    expect(THORACIC_GEOM.map((g) => g.pair)).toEqual(['C7-T1', ...Array.from({ length: 11 }, (_, i) => `T${i + 1}-T${i + 2}`), 'T12-L1']);
    for (const g of THORACIC_GEOM) {
      expect(g.canal, g.pair).toBeTruthy();
      expect(g.canal!.area, g.pair).toBeGreaterThan(120);
      expect(g.canal!.area, g.pair).toBeLessThan(400);
      expect(g.discHeightMm, g.pair).toBeGreaterThan(1);
      expect(g.foramenMeasured, g.pair).toBe(false);
      expect([g.foramen.L, g.foramen.R]).toEqual([null, null]);
      expect(g.lesions, g.pair).toBeUndefined();
    }
    // T12-L1 sits in both chains; the level map takes the thoracic one
    expect(GEOM_BY_LEVEL.get('T12')!.foramenMeasured).toBe(false);
    expect(GEOM_BY_LEVEL.get('L4')!.foramen.L).toBeTruthy();
  });
  it('a thoracic level plan references only catalogue entries and keeps its vertebra solid', () => {
    const p = spinePlan({ region: 'thoracic', level: 'T6', sel: null });
    for (const id of [...p.looks.keys(), ...p.focusIds]) expect(spineScene.catalog.byId.has(id), id).toBe(true);
    expect(p.looks.get('sp_t6')).toBe('primary');
    expect(p.looks.get('sp_disc_t6_t7')).toBe('primary');
    expect(p.looks.get('sp_t3')).toBe('context');
    expect(decodeSpine('#/atlas?r=thoracic&lv=T6').level).toBe('T6');
  });
});

describe('thoracic dorsal approaches (phase 3c)', () => {
  it('the exposure table follows the order of the successive resections, per region; every statement is sourced', () => {
    expect(Object.keys(published.approachExposure)).toEqual(['T1-T2', 'T3-T6', 'T7-T10', 'T11-T12']);
    for (const ex of Object.values(published.approachExposure)) {
      const v = Object.values(ex);
      expect(v.length).toBe(5);
      v.slice(1).forEach((x, i) => expect(x).toBeGreaterThanOrEqual(v[i]));
    }
    expect(['T1', 'T2', 'T3', 'T6', 'T7', 'T10', 'T11', 'T12'].map(exposureRegion)).toEqual(['T1-T2', 'T1-T2', 'T3-T6', 'T3-T6', 'T7-T10', 'T7-T10', 'T11-T12', 'T11-T12']);
    for (const a of Object.values(APPROACHES)) expect(a.removes.refIds.length, a.id).toBeGreaterThan(0);
    for (const [k, st] of Object.entries(APPROACH_STATEMENTS)) if (k !== 'view') expect(st.refIds.length, k).toBeGreaterThan(0);
    // the views turn further to the side in the order of the resections
    const angles = Object.values(APPROACHES).map((a) => a.viewAngle);
    expect([...angles].sort((a, b) => a - b)).toEqual(angles);
  });
  it('an approach shows the disc, the sac and the level root, with the two vertebrae see-through; the link round-trips', () => {
    const s = decodeSpine('#/atlas?r=thoracic&lv=T6&ap=ctv.R');
    expect(s.approach).toEqual({ id: 'ctv', side: 'R' });
    expect(decodeSpine(encodeSpine(s)).approach).toEqual({ id: 'ctv', side: 'R' });
    const p = spinePlan(s);
    for (const id of [...p.looks.keys(), ...p.focusIds]) expect(spineScene.catalog.byId.has(id), id).toBe(true);
    expect([p.looks.get('sp_t6'), p.looks.get('sp_t7')]).toEqual(['context', 'context']);
    expect([p.looks.get('sp_disc_t6_t7'), p.looks.get('sp_dural_sac'), p.looks.get('sp_root_t6'), p.looks.get('sp_drg_t6')]).toEqual(['primary', 'primary', 'primary', 'primary']);
    expect(p.looks.get('sp_root_t8')).toBe('context');
    // roots outside the region stay hidden
    expect(p.looks.get('sp_root_l4')).toBe('hidden');
    // lumbar levels and unknown approaches have none
    expect(decodeSpine('#/atlas?r=lumbar&lv=L4&ap=ctv.R').approach).toBeNull();
    expect(decodeSpine('#/atlas?r=thoracic&lv=T6&ap=xx.R').approach).toBeNull();
  });
});

describe('cervical region (phase 2a)', () => {
  it('is built: C1-C7 with the discs C2-C3 to C7-T1, roots C3-C8, the vertebral artery and the neck', () => {
    const r = REGION.get('cervical')!;
    expect(r.levels).toEqual(['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7']);
    for (const id of ['sp_c1', 'sp_c7', 'sp_t1', 'sp_dural_sac', 'sp_disc_c2_c3', 'sp_disc_c7_t1', 'sp_root_c8', 'sp_drg_c3', 'sp_vertebral_artery',
      'sp_cca_left', 'sp_ijv_right', 'sp_trachea', 'sp_esophagus', 'sp_thyroid', 'sp_larynx', 'sp_prevertebral_left', 'sp_scm_right']) {
      expect(r.structures, id).toContain(id);
    }
    // no thoracic roots and no lumbar structures in the neck
    expect(r.structures).not.toContain('sp_root_t1');
    expect(r.structures).not.toContain('sp_l1');
  });
  it('names the root that leaves below each level by the cervical rule (C8 between C7 and T1)', () => {
    expect(['C2', 'C5', 'C7', 'T4', 'L4'].map(exitingRoot)).toEqual(['C3', 'C6', 'C8', 'T4', 'L4']);
    expect(CERVICAL_GEOM.map((g) => g.pair)).toEqual(['C2-C3', 'C3-C4', 'C4-C5', 'C5-C6', 'C6-C7', 'C7-T1']);
    for (const g of CERVICAL_GEOM) {
      expect(g.foramenMeasured, g.pair).toBe(false);
      expect(g.canal!.width, g.pair).toBeGreaterThan(18);
      expect(g.canal!.depth, g.pair).toBeGreaterThan(10);
    }
    // C7-T1 is measured in both chains; the cervical entry is the one used
    expect(GEOM_BY_LEVEL.get('C7')).toBe(CERVICAL_GEOM[5]);
    for (const n of [3, 4, 5, 6, 7, 8]) expect(SP.get(`sp_root_c${n}`)!.derivation, `C${n}`).toContain('lower part of the');
  });
  it('the vertebral artery enters at a level where the foramina above it are all found; its sides are left and right', async () => {
    const order = ['C7', 'C6', 'C5', 'C4', 'C3'];
    for (const sd of ['L', 'R'] as const) {
      const e = VERTEBRAL_ARTERY.entry[sd];
      expect(order, sd).toContain(e);
      for (const lv of ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'].slice(0, 7 - order.indexOf(e) - 1)) expect(VERTEBRAL_ARTERY.foramina[lv][sd], `${lv}${sd}`).toBeTruthy();
    }
    const m = await nodeMeans(SP.get('sp_vertebral_artery')!.file);
    expect(m.L[0]).toBeLessThan(m.R[0]);
    for (const k of ['vaSegments', 'vaEntry', 'vaGroove', 'vaHighRiding', 'cervicalRootRule', 'cervicalRootDisc'] as const) expect(STATEMENTS[k].refIds.length, k).toBeGreaterThan(0);
  });
  it('the anterior approach (ACDF) shows the disc, the carotid sheath, the viscera and the prevertebral muscles; the link round-trips', () => {
    const s = decodeSpine('#/atlas?r=cervical&lv=C5&ap=acdf.L');
    expect(s.approach).toEqual({ id: 'acdf', side: 'L' });
    expect(decodeSpine(encodeSpine(s)).approach).toEqual({ id: 'acdf', side: 'L' });
    // only at cervical levels; the dorsal approaches only at thoracic ones
    expect(decodeSpine('#/atlas?r=thoracic&lv=T6&ap=acdf.L').approach).toBeNull();
    expect(decodeSpine('#/atlas?r=cervical&lv=C5&ap=ctv.L').approach).toBeNull();
    const p = spinePlan(s);
    for (const id of [...p.looks.keys(), ...p.focusIds]) expect(spineScene.catalog.byId.has(id), id).toBe(true);
    expect([p.looks.get('sp_c5'), p.looks.get('sp_c6')]).toEqual(['context', 'context']);
    for (const id of ['sp_disc_c5_c6', 'sp_cca_left', 'sp_ijv_left', 'sp_trachea', 'sp_esophagus', 'sp_prevertebral_left', 'sp_vertebral_artery']) expect(p.looks.get(id), id).toBe('primary');
    expect(p.looks.get('sp_scm_left')).toBe('context');
    expect(p.looks.get('sp_root_c6')).toBe('context');
    for (const st of Object.values(ACDF_STATEMENTS)) for (const r of st.refIds) expect(SP_REFS.has(r), r).toBe(true);
    expect(['C2', 'C2-C3', 'C3', 'C3-C4', 'C4', 'C4-C5', 'C5', 'C5-C6', 'C6', 'C6-C7', 'C7', 'C7-T1', 'T1']).toContain(NECK_LANDMARKS.cricoidInferior.level);
  });
  it('a cervical level plan references only catalogue entries and draws the neck on its own layers', () => {
    const p = spinePlan({ region: 'cervical', level: 'C5', sel: null });
    for (const id of [...p.looks.keys(), ...p.focusIds]) expect(spineScene.catalog.byId.has(id), id).toBe(true);
    expect(p.looks.get('sp_c5')).toBe('primary');
    expect(p.looks.get('sp_disc_c5_c6')).toBe('primary');
    expect(p.looks.get('sp_trachea')).toBe('primary');
    expect(p.looks.get('sp_l4')).not.toBe('primary');
    expect(SP.get('sp_trachea')!.layer).toBe('viscera');
    expect(SP.get('sp_cca_left')!.layer).toBe('vessels');
  });
});

describe('spine craniocervical junction (its own CT)', () => {
  it('is a region of its own: the occiput, C1-C3 and the canal contents, nothing of the whole-spine CT, not even ghosted', () => {
    const r = REGION.get('ccj')!;
    expect(r.ready).toBe(true);
    expect(r.levels).toEqual([]);
    expect([...r.structures].sort()).toEqual(['sp_ccj_c1', 'sp_ccj_c2', 'sp_ccj_c3', 'sp_ccj_dural_sac', 'sp_ccj_occiput']);
    const p = spinePlan({ ...defaultSpineState(), region: 'ccj' });
    for (const st of SP_MANIFEST.structures) expect(p.looks.get(st.id), st.id).toBe(r.structures.includes(st.id) ? 'primary' : 'hidden');
    // and the junction is never drawn with the other regions
    for (const reg of ['lumbar', 'thoracic', 'cervical'] as const) {
      const q = spinePlan({ ...defaultSpineState(), region: reg });
      for (const id of r.structures) expect(q.looks.get(id), `${reg} ${id}`).toBe('hidden');
    }
  });

  it('its measurements lie within the ranges of 500 adults; its landmarks are in place; each measurement is sourced', () => {
    const m = CCJ.measurements;
    const range: Record<string, [number, number]> = { adi: [0.36, 2.92], padi: [13.11, 26.81], mcrae: [28.53, 43.11], bdi: [1.66, 9.34], bai: [2.54, 11.34], cca: [116.03, 179.62] };
    for (const [k, [lo, hi]] of Object.entries(range)) { expect(m[k as 'adi'], k).toBeGreaterThanOrEqual(lo); expect(m[k as 'adi'], k).toBeLessThanOrEqual(hi); }
    expect(m.densBelowMcRae).toBeGreaterThan(0);
    const L = CCJ.landmarks;
    expect(Math.hypot(...L.densTip)).toBeLessThan(1);           // the origin
    expect(L.basion[1]).toBeGreaterThan(L.opisthion[1]);        // the basion in front of the opisthion
    expect(L.basion[2]).toBeGreaterThan(L.densTip[2]);          // and above the dens
    expect(Math.hypot(L.basion[1] - L.opisthion[1], L.basion[2] - L.opisthion[2])).toBeCloseTo(m.mcrae, 0);
    expect(Math.hypot(L.basion[1] - L.densTip[1], L.basion[2] - L.densTip[2])).toBeCloseTo(m.bdi, 0);
    expect(CCJ_MEASURES.map((x) => x.id).sort()).toEqual(['adi', 'bai', 'bdi', 'cca', 'mcrae', 'padi']);
    for (const x of CCJ_MEASURES) for (const st of [x.definition, x.normal]) expect(st.refIds.every((r) => SP_REFS.has(r)), x.id).toBe(true);
    expect(CCJ.image.file).toBe('assets/spine/ccj_midsag.png');
  });

  it('the measurement shown is in the link, and only in the junction', () => {
    const s = { ...defaultSpineState(), region: 'ccj' as const, measure: 'bdi' as const };
    expect(decodeSpine(encodeSpine(s)).measure).toBe('bdi');
    expect(decodeSpine('#/atlas?r=cervical&cm=bdi').measure).toBeNull();
    expect(decodeSpine('#/atlas?r=ccj&cm=nonsense').measure).toBeNull();
  });
});
