import { describe, expect, it } from 'vitest';
import { crossCheckSb, DEFINITIONS, definitionFor, LANDMARKS, NOT_YET_SHOWN, REGIONS, SB_MANIFEST } from '../../src/skullbase';
import { SB_GROUPS } from '../../src/skullbase/groups';
import { skullPlan, skullScene } from '../../src/skullbase/scene';
import { decodeSkull, defaultSkullState, encodeSkull } from '../../src/skullbase/state';
import { nodeMeans } from './glb';
import { FORAMEN_CONTENTS } from '../../src/skullbase/foramina';
import { TB_NOTES, TB_REF, TB_REFS } from '../../src/skullbase/temporal';

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
  it('foramina the model does not label are located on both sides, with how and what passes through', () => {
    const located = LANDMARKS.filter((l) => l.how);
    for (const n of ['Superior orbital fissure', 'Internal acoustic meatus', 'Stylomastoid foramen', 'Jugular foramen',
      'External opening of carotid canal', 'Internal opening of carotid canal', 'Foramen lacerum', 'Cribriform plate']) {
      const both = located.filter((l) => l.name === n);
      expect(both.map((l) => l.side).sort(), n).toEqual(['L', 'R']);
      expect(FORAMEN_CONTENTS[n]?.length, n).toBeGreaterThan(0);
      for (const l of both) expect(Math.sign(l.ras[0]), n).toBe(l.side === 'L' ? -1 : 1);
    }
    const at = (n: string) => located.find((l) => l.name === n && l.side === 'R')!.ras;
    // order from front to back: cribriform plate, orbital fissure, internal acoustic meatus, jugular foramen
    expect(at('Cribriform plate')[1]).toBeGreaterThan(at('Superior orbital fissure')[1]);
    expect(at('Superior orbital fissure')[1]).toBeGreaterThan(at('Internal acoustic meatus')[1]);
    expect(at('Internal acoustic meatus')[2]).toBeGreaterThan(at('Stylomastoid foramen')[2]);
    expect(NOT_YET_SHOWN).toEqual(['Clivus']);
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
  it('systems combine: the link keeps them, the plan draws both, the cut is the least restrictive', () => {
    const s = decodeSkull('#/atlas?g=nerves&with=arteries');
    expect(s.grp).toBe('nerves');
    expect(s.also).toEqual(['arteries']);
    expect(s.cutAbove).toBeNull();                                   // the arteries are not cut away
    expect(decodeSkull(encodeSkull(s))).toEqual(s);
    const p = skullPlan(s.grp, null, s.also);
    const nerve = SB_MANIFEST.structures.find((x) => x.name === 'Optic nerve (II)')!.id;
    const artery = SB_MANIFEST.structures.find((x) => x.name === 'Basilar artery')!.id;
    expect(p.looks.get(nerve)).toBe('primary');
    expect(p.looks.get(artery)).toBe('primary');
    // only systems combine: with another kind of view, or an unknown id, the extra is dropped
    expect(decodeSkull('#/atlas?g=floor&with=arteries').also).toEqual([]);
    expect(decodeSkull('#/atlas?g=nerves&with=floor,nope,nerves').also).toEqual([]);
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
    expect(SB_GROUPS.length).toBe(1 + REGIONS.length + 3 + 6);
    // the all-bones view draws every bone and every landmark
    const all = SB_GROUPS.find((g) => g.id === 'bone_all_bones')!;
    expect(all.landmarks.length).toBe(LANDMARKS.length);
    expect(all.structures.length).toBe(SB_MANIFEST.structures.filter((s) => s.type === 'bone').length);
  });
});

describe('the detailed model (TopBrain CT angiogram, Z-Anatomy fitted onto it)', async () => {
  const { SbManifestSchema } = await import('../../src/data/schema');
  const ct = SbManifestSchema.parse((await import('../../src/data/generated/sbct-manifest.json')).default);
  const lms = (await import('../../src/data/generated/sbct-landmarks.json')).default as { name: string; ras: number[]; distanceToBoneMm: number }[];
  it('has the same bones, cranial nerves I–XII and artery systems as the first model', () => {
    const bones = (m: typeof ct) => new Set(m.structures.filter((s) => s.type === 'bone').map((s) => s.name));
    for (const b of ['Sphenoid bone', 'Temporal bone', 'Occipital bone', 'Frontal bone', 'Ethmoid bone']) expect(bones(ct).has(b), b).toBe(true);
    const cns = new Set(ct.structures.filter((s) => s.category === 'nerve').map((s) => s.cranialNerve));
    expect(cns).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]));
    expect(new Set(ct.structures.filter((s) => s.category === 'artery').map((s) => s.system))).toEqual(new Set(ct.arterySystems));
  });
  it('draws the labelled vessels from the CT and marks what was fitted from the model as approximate', () => {
    const by = (n: string) => ct.structures.find((s) => s.name === n)!;
    for (const n of ['Internal carotid artery', 'Basilar artery', 'Anterior communicating artery', 'Posterior communicating artery', 'Superior sagittal sinus']) {
      expect(by(n), n).toBeTruthy();
      expect(by(n).fitted, n).toBeUndefined();
      expect(by(n).derivation, n).toMatch(/TopBrain/);
    }
    for (const n of ['Optic nerve (II)', 'Middle meningeal artery', 'Cavernous sinus']) expect(by(n)?.fitted, n).toBe(true);
    for (const s of ct.structures) if (s.type === 'bone') expect(s.fitted, s.name).toBeUndefined();
  });
  it('keeps the frame: origin at the hypophysial fossa, the landmarks on or near the bone', () => {
    expect(lms.find((l) => l.name === 'Hypophysial fossa')!.ras).toEqual([0, 0, 0]);
    expect(lms.length).toBeGreaterThan(100);
    expect(lms.filter((l) => l.distanceToBoneMm > 16)).toEqual([]);
    for (const s of ct.structures) expect(s.file, s.id).toMatch(/^assets\/skullbase-ct\//);
  });
});

describe('the temporal-bone model (v3: OpenEar specimen registered onto the CT)', async () => {
  const { SbManifestSchema } = await import('../../src/data/schema');
  const { LandmarkSchema } = await import('../../src/skullbase');
  const v3 = SbManifestSchema.parse((await import('../../src/data/generated/sbv3-manifest.json')).default);
  const lms = (await import('../../src/data/generated/sbv3-landmarks.json')).default.map((l: unknown) => LandmarkSchema.parse(l));
  const fit = (await import('../../src/data/generated/sbv3-fit.json')).default as {
    fit: Record<string, { correlation: number; scale: number; mirrored: boolean; checksHU: Record<string, number> }>;
    crossCheck: Record<string, Record<string, { failed?: boolean; distanceMm?: Record<string, number> }>>;
    facialSegmentsMm: Record<string, { labyrinthine: number; tympanic: number; mastoid: number; secondGenuAngle: number }>;
  };
  it('registers the specimen onto both ears: good correlation, near true size, the left one mirrored', () => {
    for (const side of ['R', 'L']) {
      expect(fit.fit[side].correlation, side).toBeGreaterThan(0.6);
      expect(Math.abs(fit.fit[side].scale - 1), side).toBeLessThan(0.15);
      expect(fit.fit[side].mirrored, side).toBe(side === 'L');
      // independent of the fit: the carried-over canal contents on fluid, the carotid on the contrast-filled lumen
      expect(fit.fit[side].checksHU['Nerves in the internal acoustic meatus (VII, VIII)'], side).toBeLessThan(150);
      const car = fit.fit[side].checksHU['Internal carotid artery (petrous part)'];
      expect(car > 150 && car < 500, `${side} carotid ${car}`).toBe(true);
    }
  });
  it('another ear registered the same way puts the geniculate ganglion and the windows within a few millimetres', () => {
    for (const side of ['R', 'L']) {
      const ok = Object.values(fit.crossCheck[side]).filter((r) => !r.failed);
      expect(ok.length, side).toBeGreaterThan(0);
      for (const r of ok) {
        expect(r.distanceMm!['Geniculate ganglion'], side).toBeLessThan(3);
        expect(r.distanceMm!['Oval window'], side).toBeLessThan(2);
      }
    }
  });
  it('the facial nerve segments measure within about two SD of a 50-bone dissection series (Kalaiarasi 2018)', () => {
    for (const side of ['R', 'L']) {
      const s = fit.facialSegmentsMm[side];
      expect(Math.abs(s.tympanic - 9.34), side).toBeLessThan(2 * 1.12 + 0.1);
      expect(Math.abs(s.mastoid - 12.8), side).toBeLessThan(2 * 1.8 + 0.1);
      expect(s.secondGenuAngle >= 95 && s.secondGenuAngle <= 125, side).toBe(true);   // Gupta 2013
    }
  });
  it('every carried-over structure has both ears, on their sides; bone and vessels are the CT model\'s own files', () => {
    for (const s of v3.structures) {
      if (s.id.startsWith('tb_')) {
        expect(s.centroid!.L[0], s.id).toBeLessThan(0);
        expect(s.centroid!.R[0], s.id).toBeGreaterThan(0);
        expect(s.file, s.id).toMatch(/^assets\/skullbase-v3\//);
      } else {
        expect(s.file, s.id).toMatch(/^assets\/skullbase-ct\//);
        expect(s.fitted, s.id).toBeUndefined();     // nothing approximate from Z-Anatomy
      }
    }
    for (const side of ['L', 'R']) expect(lms.filter((l) => l.side === side).length).toBeGreaterThanOrEqual(6);
  });
  it('routes the cranial nerves I–XII through this CT: hardly through bone, near their fitted course, out by the right foramina', async () => {
    const f = (await import('../../src/data/generated/sbv3-fit.json')).default as unknown as {
      nerves: Record<string, Record<string, { boneCrossedMm: number; maxFromFittedMm: number }>>;
      nerveChecks: { mandibularNerveToOvaleHoleMm: Record<string, number>; opticNerveToSegmentationMm: Record<string, number>; jugularNervesToBulbMm: Record<string, Record<string, number>> };
    };
    expect(new Set(v3.structures.map((s) => s.cranialNerve).filter(Boolean))).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]));
    for (const [n, sides] of Object.entries(f.nerves)) for (const [side, r] of Object.entries(sides)) {
      expect(r.boneCrossedMm, `${n} ${side}`).toBeLessThanOrEqual(2);
      expect(r.maxFromFittedMm, `${n} ${side}`).toBeLessThanOrEqual(8);
    }
    for (const side of ['R', 'L']) {
      expect(f.nerveChecks.mandibularNerveToOvaleHoleMm[side], side).toBeLessThanOrEqual(2.5);   // the floor's own foramen ovale
      expect(f.nerveChecks.opticNerveToSegmentationMm[side], side).toBeLessThanOrEqual(2);       // TotalSegmentator's optic nerve
      for (const d of Object.values(f.nerveChecks.jugularNervesToBulbMm[side])) expect(d, side).toBeLessThanOrEqual(7);
    }
  });
  it('traces the carotid through the canal in its own lumen, and anchors the small arteries it cannot show (marked approximate)', async () => {
    const f = (await import('../../src/data/generated/sbv3-fit.json')).default as unknown as { carotids: Record<string, { inLumenShare: number; medianFromSpecimenMm: number }> };
    for (const side of ['R', 'L']) {
      expect(f.carotids[side].inLumenShare, side).toBeGreaterThanOrEqual(0.9);
      expect(f.carotids[side].medianFromSpecimenMm, side).toBeLessThanOrEqual(3.5);
    }
    const byName = (n: string) => v3.structures.find((s) => s.name === n);
    expect(byName('Internal carotid artery (petrous and lacerum parts)')?.system).toBe('Internal carotid artery');
    expect(byName('Internal carotid artery (petrous part)')).toBeUndefined();       // the specimen's only guides the trace
    for (const n of ['Proximal lateral striate branches', 'Medial pontine branches of basilar artery', 'Anterior spinal artery', 'Anterior ethmoidal artery']) {
      expect(byName(n)?.fitted, n).toBe(true);
      expect(v3.arterySystems).toContain(byName(n)!.system);
    }
  });
  it('locates the foramina on both sides, roughly mirror images of each other', () => {
    const named = (n: string, s: string) => lms.find((l) => l.name === n && l.side === s)!;
    for (const n of ['Optic canal', 'Superior orbital fissure', 'Foramen rotundum', 'Foramen ovale', 'Foramen spinosum', 'Foramen lacerum',
      'Jugular foramen', 'Hypoglossal canal', 'Internal acoustic meatus', 'External opening of carotid canal']) {
      const r = named(n, 'R'), l = named(n, 'L');
      expect(r && l, n).toBeTruthy();
      expect(r.ras[0], n).toBeGreaterThan(0);
      expect(Math.abs(r.ras[0] + l.ras[0]), n).toBeLessThan(6);
      expect(Math.abs(r.ras[1] - l.ras[1]), n).toBeLessThan(6);
      expect(r.how, n).toBeTruthy();
    }
    expect(lms.filter((l) => l.name === 'Foramen magnum')).toHaveLength(1);
  });
  it('notes name things the model shows, and cite references that exist', () => {
    const names = new Set([...v3.structures.map((s) => s.name), ...lms.map((l) => l.name)]);
    for (const [name, claims] of Object.entries(TB_NOTES)) {
      expect(names.has(name), name).toBe(true);
      for (const c of claims) for (const r of c.refIds) expect(TB_REF.has(r), r).toBe(true);
    }
    const used = new Set(Object.values(TB_NOTES).flat().flatMap((c) => c.refIds));
    expect(TB_REFS.map((r) => r.id).filter((r) => !used.has(r))).toEqual([]);
  });
});
