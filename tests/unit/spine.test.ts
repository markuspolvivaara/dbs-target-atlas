import { describe, expect, it } from 'vitest';
import { crossCheckSpine, discBelow, SP, SP_MANIFEST, SP_REFS, vertebraOf } from '../../src/spine';
import { affectedRoot, crossCheckContent, LESION_ZONES, LUMBAR_GEOM, ROOT_FUNCTION, STATEMENTS } from '../../src/spine/content';
import { REGION } from '../../src/spine/regions';
import { LESION_MARKERS, lesionMarkerId, spinePlan, spineScene } from '../../src/spine/scene';
import { decodeSpine, defaultSpineState, encodeSpine } from '../../src/spine/state';
import { nodeMeans } from './glb';

describe('spine data (VerSe CT + TotalSegmentator)', () => {
  it('generated files agree with each other; every statement reference resolves', () => {
    expect(crossCheckSpine()).toEqual([]);
    expect(crossCheckContent()).toEqual([]);
    for (const st of Object.values(STATEMENTS)) for (const r of st.refIds) expect(SP_REFS.get(r)?.shortLabel, r).toMatch(/^[A-Z][A-Za-z]+ \d{4}$/);
  });
  it('has every vertebra C1-L5, the sacrum, and the discs of the lumbar region', () => {
    for (const lv of ['C1', 'C7', 'T1', 'T12', 'L1', 'L5', 'S1']) expect(vertebraOf(lv), lv).toBeTruthy();
    for (const lv of ['L1', 'L2', 'L3', 'L4', 'L5']) expect(discBelow(lv), lv).toBeTruthy();
    expect(SP.get('sp_dural_sac')?.layer).toBe('tracts');
  });
  it('every schematic element is flagged (the card shows the flag): roots and ganglia; no vessels, muscle or psoas zones', () => {
    for (const s of SP_MANIFEST.structures) {
      if (['root', 'ganglion'].includes(s.category ?? '')) expect(s.schematic, s.id).toBe(true);
      else expect(s.schematic, s.id).toBeUndefined();
      expect(['zone', 'artery', 'vein', 'muscle'], s.id).not.toContain(s.category);
    }
    expect(SP_MANIFEST.structures.filter((s) => s.category === 'root').map((s) => s.level)).toEqual(['L1', 'L2', 'L3', 'L4', 'L5', 'S1']);
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
    expect(REGION.get('cervical')!.ready).toBe(false);
  });
  it('round-trips a teaching link and ignores regions that are not built yet', () => {
    const s = { ...defaultSpineState(), level: 'L4', sel: 'sp_root_l4', hemi: 'L' as const, cutSide: 'R' as const, labels: 'all' as const, hidden: ['sp_sacrum'] };
    s.layers.discs = { on: true, opacity: 0.5 };
    expect(decodeSpine(encodeSpine(s))).toEqual(s);
    expect(decodeSpine('#/atlas?r=cervical').region).toBe('lumbar');
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
