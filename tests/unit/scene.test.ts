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
  it('a structure’s own opacity goes into a link and back (sop), in every section', async () => {
    const { decodeOpacity, encodeOpacity } = await import('../../src/viewer/scene');
    const p = new URLSearchParams();
    encodeOpacity(p, { sb_temporal_bone: 0.3, wm_af: 1, ctx_g_precentral: 0.125 });
    expect(p.get('sop')).toBe('sb_temporal_bone:0.30,ctx_g_precentral:0.13');
    const s = { opacity: { old: 0.5 } } as unknown as Parameters<typeof decodeOpacity>[1];
    decodeOpacity(p, s);
    expect(s.opacity).toEqual({ sb_temporal_bone: 0.3, ctx_g_precentral: 0.13 });
    decodeOpacity(new URLSearchParams('sop=bad,x:2,y:-1'), s);
    expect(s.opacity).toEqual({ x: 1 });
    decodeOpacity(new URLSearchParams(''), s);
    expect('opacity' in s).toBe(false);
    // each section's link keeps it
    const sections = await Promise.all([
      import('../../src/state').then((m) => [m.encode, (h: string) => m.decode(h), m.defaultState] as const),
      import('../../src/tracts/state').then((m) => [m.encodeTracts, (h: string) => m.decodeTracts(h).state, m.defaultTractsState] as const),
      import('../../src/cortex/state').then((m) => [m.encodeCortex, m.decodeCortex, m.defaultCortexState] as const),
    ]);
    for (const [enc, dec, def] of sections) {
      const st = { ...def(), opacity: { wm_af: 0.4 } };
      expect((dec(enc(st as never)) as { opacity?: Record<string, number> }).opacity).toEqual({ wm_af: 0.4 });
    }
  });
  it('makeCatalog indexes structures and markers', () => {
    const c = makeCatalog(MANIFEST.structures.slice(0, 2), {}, [{ id: 'm1', label: 'x', structureId: MANIFEST.structures[0].id, mni: { left: [-1, 0, 0], right: [1, 0, 0] } }], ['a']);
    expect(c.byId.size).toBe(2);
    expect(c.markers.get('m1')?.label).toBe('x');
    expect(c.landmarks.has('a')).toBe(true);
  });
});
