import { describe, expect, it } from 'vitest';
import { MANIFEST } from '../../src/data';
import { defaultState } from '../../src/state';
import { makeCatalog } from '../../src/viewer/scene';
import { dbsScene } from '../../src/viewer/selection';

describe('scene source contract (shared viewer)', () => {
  it('DBS catalogue covers every manifest structure, volume and target marker', () => {
    const c = dbsScene.catalog;
    expect(c.structures.length).toBe(MANIFEST.structures.length);
    expect(Object.keys(c.volumes).sort()).toEqual(Object.keys(MANIFEST.volumes).sort());
    for (const m of c.markers.values()) expect(c.byId.has(m.structureId), m.id).toBe(true);
    for (const l of c.landmarks) expect(c.byId.has(l), l).toBe(true);
  });
  it('plans only reference catalogue entries', () => {
    const s = defaultState();
    for (const [ind, sym] of [['pd', null], ['et', 'et-head'], ['epi', 'epi-focal'], ['gdys', null]] as const) {
      const p = dbsScene.plan({ ...s, ind, sym });
      for (const id of [...p.looks.keys(), ...p.tracts.keys(), ...p.parcels.keys(), ...p.focusIds]) expect(dbsScene.catalog.byId.has(id), `${ind}: ${id}`).toBe(true);
      for (const m of p.markers) expect(dbsScene.catalog.markers.has(m.targetId), m.targetId).toBe(true);
    }
  });
  it('the plan key changes with what the plan depends on, and only that', () => {
    const s = defaultState();
    const k = dbsScene.planKey(s);
    expect(dbsScene.planKey({ ...s, hemi: 'L', sel: 'stn', cutSide: 'R' })).toBe(k);
    expect(dbsScene.planKey({ ...s, ind: 'et' })).not.toBe(k);
    expect(dbsScene.planKey({ ...s, borders: false })).not.toBe(k);
  });
  it('makeCatalog indexes structures and markers', () => {
    const c = makeCatalog(MANIFEST.structures.slice(0, 2), {}, [{ id: 'm1', label: 'x', structureId: MANIFEST.structures[0].id, mni: { left: [-1, 0, 0], right: [1, 0, 0] } }], ['a']);
    expect(c.byId.size).toBe(2);
    expect(c.markers.get('m1')?.label).toBe('x');
    expect(c.landmarks.has('a')).toBe(true);
  });
});
