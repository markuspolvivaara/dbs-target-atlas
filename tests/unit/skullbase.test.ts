import { describe, expect, it } from 'vitest';
import { crossCheckSb, DEFINITIONS, definitionFor, LANDMARKS, NOT_YET_SHOWN, REGIONS, SB_MANIFEST } from '../../src/skullbase';
import { SB_GROUPS } from '../../src/skullbase/groups';
import { skullPlan, skullScene } from '../../src/skullbase/scene';
import { decodeSkull, defaultSkullState, encodeSkull } from '../../src/skullbase/state';
import { nodeMeans } from './glb';

describe('skull-base data (Z-Anatomy export)', () => {
  it('generated files agree with each other', () => {
    expect(crossCheckSb()).toEqual([]);
  });
  it('has the cranial bones, cranial nerves I–XII and the main intracranial arteries and sinuses', () => {
    const names = new Set(SB_MANIFEST.structures.map((s) => s.name));
    for (const b of ['Sphenoid bone', 'Temporal bone', 'Occipital bone', 'Frontal bone', 'Ethmoid bone', 'Parietal bone']) expect(names.has(b), b).toBe(true);
    for (const n of ['Olfactory nerve (I)', 'Optic nerve (II)', 'Oculomotor nerve (III)', 'Trochlear nerve (IV)', 'Trigeminal nerve (V)', 'Abducens nerve (VI)',
      'Facial nerve (VII)', 'Vestibulocochlear nerve (VIII)', 'Glossopharyngeal nerve (IX)', 'Vagus nerve (X)', 'Accessory nerve (XI)', 'Hypoglossal nerve (XII)']) expect(names.has(n), n).toBe(true);
    for (const n of ['Internal carotid artery', 'Basilar artery', 'Vertebral artery', 'Posterior communicating artery', 'Cavernous sinus', 'Sigmoid sinus', 'Superior sagittal sinus']) expect(names.has(n), n).toBe(true);
  });
  it('the origin is the hypophysial fossa, and sella landmarks sit around it as expected from their names', () => {
    const lm = new Map(LANDMARKS.map((l) => [l.name, l.ras]));
    expect(lm.get('Hypophysial fossa')!.map((v) => v + 0)).toEqual([0, 0, 0]);
    expect(lm.get('Tuberculum sellae')![1]).toBeGreaterThan(0); // anterior
    expect(lm.get('Dorsum sellae')![1]).toBeLessThan(0); // posterior
    expect(lm.get('Foramen magnum')![2]).toBeLessThan(-20); // well below
    expect(Math.abs(lm.get('Foramen ovale')![0])).toBeGreaterThan(15); // lateral
  });
  it('every landmark lies close to its bone (opening centres excepted) and every region lists measured neighbours', () => {
    for (const l of LANDMARKS) expect(l.distanceToBoneMm, l.name).toBeLessThanOrEqual(20);
    for (const r of REGIONS) expect(r.structures.length, r.landmark).toBeGreaterThan(1);
  });
  it('most definitions carry their Wikipedia source link (cards show it when present)', () => {
    const defs = Object.values(DEFINITIONS);
    expect(defs.length).toBeGreaterThan(150);
    expect(defs.filter((d) => d.url?.startsWith('https://en.wikipedia.org/')).length / defs.length).toBeGreaterThan(0.75);
  });
  it('vessels and nerves are tube meshes; every nerve knows its cranial nerve, and I–XII are all there', async () => {
    const tubes = SB_MANIFEST.structures.filter((s) => s.type === 'tube');
    expect(tubes.length).toBeGreaterThan(60);
    expect(SB_MANIFEST.structures.some((s) => s.type === 'tract')).toBe(false);
    const nerves = tubes.filter((s) => s.category === 'nerve');
    expect(nerves.every((s) => s.cranialNerve !== undefined)).toBe(true);
    expect(new Set(nerves.map((s) => s.cranialNerve))).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]));
    // the trigeminal nerve as its trunk and three divisions (branches merged into them); the chorda tympani in the facial nerve
    expect(nerves.filter((s) => s.cranialNerve === 5).map((s) => s.name).sort())
      .toEqual(['Mandibular nerve (V3)', 'Maxillary nerve (V2)', 'Ophthalmic nerve (V1)', 'Trigeminal nerve (V)']);
    expect(nerves.filter((s) => s.cranialNerve === 7).map((s) => s.name)).toEqual(['Facial nerve (VII)']);
    for (const n of ['Mandibular nerve (V3)', 'Maxillary nerve (V2)', 'Ophthalmic nerve (V1)']) expect(definitionFor(n), n).not.toBeNull();
    const ica = SB_MANIFEST.structures.find((s) => s.name === 'Internal carotid artery')!;
    const means = await nodeMeans(ica.file);
    expect(means.L[0]).toBeLessThan(0);
    expect(means.R[0]).toBeGreaterThan(0);
  });
  it('keeps only the arteries selected for skull-base teaching, each under its system', () => {
    const arts = SB_MANIFEST.structures.filter((s) => s.category === 'artery');
    const names = new Set(arts.map((s) => s.name));
    for (const n of ['Internal carotid artery', 'Anterior cerebral artery', 'Middle cerebral artery (M1 segment)', 'Posterior cerebral artery',
      'Posterior inferior cerebellar artery', 'Anterior inferior cerebellar artery', 'Superior cerebellar artery', 'Basilar artery', 'Middle meningeal artery',
      'Anterior communicating artery', 'Posterior communicating artery', 'Pericallosal artery', 'Callosomarginal artery', 'Angular artery',
      'Middle cerebral artery (M3 segment)']) expect(names.has(n), n).toBe(true);
    for (const n of ['Facial artery', 'Superficial temporal artery', 'Lingual artery', 'Lateral occipital artery']) expect(names.has(n), n).toBe(false);
    expect(arts.every((s) => SB_MANIFEST.arterySystems.includes(s.system ?? ''))).toBe(true);
    expect(definitionFor('Middle cerebral artery (M1 segment)')).not.toBeNull();
  });
  it('the missing landmarks are listed as not yet shown', () => {
    expect(NOT_YET_SHOWN).toContain('Jugular foramen');
    expect(NOT_YET_SHOWN).toContain('Superior orbital fissure');
  });
});

describe('skull-base scene and URL state', () => {
  it('plans reference only catalogue entries', () => {
    for (const g of SB_GROUPS) {
      const p = skullPlan(g.id, null);
      for (const id of [...p.looks.keys(), ...p.tracts.keys(), ...p.focusIds]) expect(skullScene.catalog.byId.has(id), `${g.id}: ${id}`).toBe(true);
      for (const m of p.markers) expect(skullScene.catalog.markers.has(m.targetId), m.targetId).toBe(true);
    }
  });
  it('selecting a cranial nerve\'s trunk lights up the whole nerve; a division on its own only itself', () => {
    const id = (n: string) => SB_MANIFEST.structures.find((s) => s.name === n)!.id;
    const fifth = SB_MANIFEST.structures.filter((s) => s.cranialNerve === 5).map((s) => s.id);
    const all = skullPlan('floor', id('Trigeminal nerve (V)'));
    for (const x of fifth) expect(all.looks.get(x), x).toBe('primary');
    const one = skullPlan('floor', id('Ophthalmic nerve (V1)'));
    expect(one.looks.get(id('Ophthalmic nerve (V1)'))).toBe('primary');
    expect(one.looks.get(id('Mandibular nerve (V3)'))).not.toBe('primary');
  });
  it('round-trips a teaching link', () => {
    const s = { ...defaultSkullState(), grp: 'near_hypophysial_fossa', sel: 'sb_internal_carotid_artery', hemi: 'L' as const, cutAbove: 12, cutSide: 'R' as const, labels: 'all' as const, hidden: ['sb_basilar_artery'] };
    s.layers.nuclei = { on: true, opacity: 0.5 };
    expect(decodeSkull(encodeSkull(s))).toEqual(s);
  });
  it('a link without settings takes them from its group', () => {
    const s = decodeSkull('#/atlas?g=arteries');
    expect(s.cutAbove).toBeNull();
  });
});

describe('shipped skull-base GLBs', () => {
  it.each(SB_MANIFEST.structures.filter((s) => ['Sphenoid bone', 'Temporal bone', 'Internal carotid artery', 'Cavernous sinus'].includes(s.name)).map((s) => [s.name, s]))('%s decodes, on the right sides', async (_n, s) => {
    const means = await nodeMeans(s.file);
    for (const side of ['L', 'R'] as const) {
      expect(means[side], side).toBeDefined();
      expect(Math.sign(means[side][0])).toBe(side === 'L' ? -1 : 1);
    }
  });
});

describe('e2e group list stays in step with the groups module', () => {
  it('ids and names match tests/e2e/smoke.spec.ts', async () => {
    const { readFileSync } = await import('node:fs');
    const spec = readFileSync(new URL('../e2e/smoke.spec.ts', import.meta.url), 'utf8');
    for (const g of SB_GROUPS) if (g.kind === 'bone') expect(spec, g.name).toContain(`'${g.name}'`);
    expect(SB_GROUPS.length).toBe(1 + REGIONS.length + 3 + 5);
  });
});
