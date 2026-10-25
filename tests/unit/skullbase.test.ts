import { describe, expect, it, vi } from 'vitest';
import { crossCheckSb, DEFINITIONS, definitionFor, LANDMARKS, NOT_YET_SHOWN, REGIONS, SB_MANIFEST } from '../../src/skullbase';
import { SB_GROUPS } from '../../src/skullbase/groups';
import { skullPlan, skullScene } from '../../src/skullbase/scene';
import { decodeSkull, defaultSkullState, encodeSkull } from '../../src/skullbase/state';
import { nodeMeans } from './glb';
import { FORAMEN_CONTENTS } from '../../src/skullbase/foramina';
import { TB_NOTES, TB_REF, TB_REFS } from '../../src/skullbase/temporal';
import { APPROACH_REF, APPROACH_REFS, APPROACHES } from '../../src/skullbase/approaches';

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
  it('every carried-over structure has both ears, on their sides; vessels are the CT model\'s own files, bone this model\'s', () => {
    for (const s of v3.structures) {
      if (s.id.startsWith('tb_') || s.id.startsWith('br_') || s.id.startsWith('pf_')) {
        expect(s.centroid!.L[0], s.id).toBeLessThan(0);
        expect(s.centroid!.R[0], s.id).toBeGreaterThan(0);
        expect(s.file, s.id).toMatch(/^assets\/skullbase-v3\//);
      } else if (s.approach || s.morph || s.type === 'bone') {
        // the craniotomy's cut bones and the bone removed, the arteries that move with the opening, and v3's own skull
        // (completed beyond the scan): this build's files
        expect(s.file, s.id).toMatch(/^assets\/skullbase-v3\//);
      } else {
        expect(s.file, s.id).toMatch(/^assets\/skullbase-ct\//);
        // nothing approximate from Z-Anatomy, but the falx the interhemispheric view draws (v2's fitted one)
        if (s.name !== 'Falx cerebri') expect(s.fitted, s.id).toBeUndefined();
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

/** The section's modules as a v3 page loads them (its <meta name="sb-model" content="v3">). */
async function v3Modules() {
  vi.resetModules();
  const g = globalThis as unknown as { document?: unknown };
  const had = 'document' in g;
  g.document = { querySelector: (q: string) => (q.includes('sb-model') ? { content: 'v3' } : null) };
  try {
    return { groups: await import('../../src/skullbase/groups'), scene: await import('../../src/skullbase/scene'), state: await import('../../src/skullbase/state') };
  } finally {
    if (!had) delete g.document;
  }
}

describe('v3 surgical view: the pterional craniotomy and the template brain fitted into the CT', async () => {
  const { SbManifestSchema } = await import('../../src/data/schema');
  const { groups: G3, scene: S3, state: T3 } = await v3Modules();
  const v3 = SbManifestSchema.parse((await import('../../src/data/generated/sbv3-manifest.json')).default);
  const byId = new Map(v3.structures.map((s) => [s.id, s]));
  const geom = (await import('../../src/data/generated/sbv3-approaches.json')).default as unknown as Record<string, { bones: string[]; removed: string; removedMl: number; side: string; burrHoles: number[][] }>;
  const brain = (await import('../../src/data/generated/sbv3-fit.json')).default.brain as unknown as {
    fit: Record<string, number>; clear: Record<string, Record<string, number>>; open: Record<string, number>; lift: Record<string, number>; lsoLift: Record<string, number>;
    interhemispheric: Record<string, number>; aca: { a3: string[]; thirdA2ToAcomMm: number | null };
    params: Record<string, number>; vesselsMovedMaxMm: Record<string, Record<string, { open: number; lift: number; lsoLift: number }>>; m1LengthMm: Record<string, number>;
  };
  it('cuts the right pterional flap out of the CT bone: each cut bone stands in for a whole one, a plausible volume removed', () => {
    const ap = geom.pterional;
    expect(ap.side).toBe('R');
    expect(ap.bones.map((id) => byId.get(id)!.name).sort()).toEqual(['Frontal bone', 'Parietal bone', 'Sphenoid bone', 'Temporal bone']);
    for (const id of ap.bones) expect(byId.has(byId.get(id)!.replaces!), id).toBe(true);
    expect(ap.removedMl).toBeGreaterThan(4);
    expect(ap.removedMl).toBeLessThan(30);
    // the burr holes on the right side of the skull, in front of the ear
    for (const p of ap.burrHoles) { expect(p[0]).toBeGreaterThan(20); expect(p[1]).toBeGreaterThan(-35); }
  });
  it('cuts a lateral supraorbital flap from the frontal bone only, and each surgical view draws only its own craniotomy', () => {
    const lso = geom.lso;
    expect(lso.side).toBe('R');
    expect(lso.bones.map((id) => byId.get(id)!.name)).toEqual(['Frontal bone']);
    expect(lso.removedMl).toBeGreaterThan(4);
    expect(lso.removedMl).toBeLessThan(30);
    expect(lso.burrHoles).toHaveLength(1);                 // one burr hole (Cha 2012)
    const pl = S3.skullPlan('lso', null), pt = S3.skullPlan('transsylvian', null);
    expect(pl.camera).toBe('supraorbital');                 // down its corridor over the lateral orbital roof
    for (const id of [...lso.bones, lso.removed]) { expect(pl.looks.get(id), id).not.toBe('hidden'); expect(pt.looks.get(id), id).toBe('hidden'); }
    for (const id of [...geom.pterional.bones, geom.pterional.removed]) expect(pl.looks.get(id), id).toBe('hidden');
    expect(pl.looks.get('sb_frontal_bone')).toBe('hidden');      // the cut frontal bone stands in for it
    expect(pl.looks.get('sb_temporal_bone')).toBe('primary');    // the LSO leaves the temporal bone whole
  });
  it('fits the template brain into the skull and onto this patient\'s middle cerebral artery', () => {
    const f = brain.fit;
    expect(f.tableMedianMm).toBeLessThan(1.5);
    expect(f.m2InsulaMedianMmR).toBeLessThan(2);           // M2 on the insula (Srinivasa 2021)
    expect(f.m3FissureMedianMmR).toBeLessThan(2);          // M3 in the fissure
    expect(f.m2InCortexShareR).toBeLessThan(0.1);
    expect(f.m3InCortexShareR).toBeLessThan(0.1);
    expect(f.minRelativeVolume).toBeGreaterThan(0);        // the deformation never folds
    for (const side of ['R', 'L']) {
      expect(brain.clear[side].inBoneWayAfter, side).toBe(0);
      expect(brain.clear[side].inVesselAfter, side).toBe(0);
      expect(brain.clear[side].acrossFalxAfter, side).toBe(0);   // each hemisphere on its own side of the falx
      expect(brain.m1LengthMm[side], side).toBeGreaterThan(5);
      expect(brain.m1LengthMm[side], side).toBeLessThan(40);
    }
  });
  it('the opening moves the lips about as far as asked, and the M2 and M3 branches with them', () => {
    expect(brain.open.maxMovedMm).toBeGreaterThan(Math.min(brain.params.openFrontalMm, brain.params.openTemporalMm) - 0.5);
    expect(brain.open.maxMovedMm).toBeLessThan(Math.max(brain.params.openFrontalMm, brain.params.openTemporalMm) + 2);
    for (const [name, m] of Object.entries(brain.vesselsMovedMaxMm)) {
      expect(m.L, name).toEqual({ open: 0, lift: 0, lsoLift: 0 });       // only the right side opens
      expect(m.R.open, name).toBeGreaterThan(0.5);
      expect(m.R.open, name).toBeLessThanOrEqual(brain.params.openFrontalMm + 1);   // with the frontal side only
    }
    // the lift: the frontal lobe's orbital surface up by about its stated amount
    expect(brain.lift.maxMovedMm).toBeGreaterThan(brain.params.liftMm - 0.5);
    expect(brain.lift.maxMovedMm).toBeLessThan(brain.params.liftMm + 2);
    // the lateral supraorbital view's own lift, along its corridor; the arteries carried no further than the cortex
    expect(brain.lsoLift.maxMovedMm).toBeGreaterThan(brain.params.lsoLiftMm - 0.5);
    expect(brain.lsoLift.maxMovedMm).toBeLessThan(brain.params.lsoLiftMm + 2);
    for (const [name, m] of Object.entries(brain.vesselsMovedMaxMm)) expect(m.R.lsoLift, name).toBeLessThanOrEqual(brain.params.lsoLiftMm + 1);
    const morph = v3.structures.filter((s) => s.morph).map((s) => s.name);
    expect(morph).toEqual(expect.arrayContaining(['Insula', 'Frontal lobe', 'Temporal lobe', 'Middle cerebral artery (M2 segment)', 'Middle cerebral artery (M3 segment)']));
  });
  it('draws its own skull: the CT\'s bone, completed beyond the scan, and the face from the fitted model', async () => {
    const fit = (await import('../../src/data/generated/sbv3-fit.json')).default as unknown as { skull: { faceBones: string[]; face: Record<string, number>; edge: Record<string, number> } };
    const bones = v3.structures.filter((s) => s.type === 'bone' && !s.approach);
    for (const n of ['Frontal bone', 'Sphenoid bone', 'Temporal bone', 'Maxilla', 'Zygomatic bone', 'Nasal bone', 'Vomer']) expect(bones.some((b) => b.name === n), n).toBe(true);
    for (const b of bones) expect(b.file, b.name).toMatch(/^assets\/skullbase-v3\//);         // v3's own meshes, not v2's
    for (const n of fit.skull.faceBones) {
      const b = bones.find((x) => x.name === n);
      if (b) expect(b.derivation, n).toMatch(/fitted onto this CT throughout/);
    }
    expect(bones.find((b) => b.name === 'Sphenoid bone')!.derivation).toMatch(/CT angiogram's bone surface/);
    // the refits bring the model closer to the CT's bone
    expect(fit.skull.face.withinAfter).toBeGreaterThanOrEqual(fit.skull.face.withinBefore);
    expect(fit.skull.edge.medianAfterMm).toBeLessThan(fit.skull.edge.medianBeforeMm);
    expect(fit.skull.edge.p90AfterMm).toBeLessThan(2.5);
  });
  it('the view draws the cut bones, the removed bone see-through and the brain; elsewhere none of them', () => {
    const p = S3.skullPlan('transsylvian', null);
    const ap = geom.pterional;
    for (const id of ap.bones) { expect(p.looks.get(id), id).toBe('primary'); expect(p.looks.get(byId.get(id)!.replaces!), id).toBe('hidden'); }
    expect(p.looks.get(ap.removed)).toBe('ghost');
    for (const s of v3.structures.filter((x) => x.category === 'brain')) expect(p.looks.get(s.id), s.id).toBe('primary');
    expect(p.camera).toBe('anterolateral');
    for (const g of G3.SB_GROUPS.filter((x) => x.kind !== 'approach')) {
      const q = S3.skullPlan(g.id, null);
      for (const id of [...ap.bones, ap.removed]) expect(q.looks.get(id), `${g.id} ${id}`).toBe('hidden');
      for (const s of v3.structures.filter((x) => x.category === 'brain')) expect(q.looks.get(s.id), `${g.id} ${s.id}`).toBe('hidden');
    }
  });
  it('the interhemispheric view: a right parasagittal flap, both hemispheres, the right one held off the falx', () => {
    const ih = geom.interhemispheric;
    expect(ih.side).toBe('R');
    expect(ih.removedMl).toBeGreaterThan(4);
    const p = S3.skullPlan('interhemispheric', null);
    expect(p.camera).toBe('vertex');
    expect(G3.SB_GROUP.get('interhemispheric')!.hemi).toBe('both');
    for (const id of [...ih.bones]) expect(p.looks.get(id), id).toBe('primary');
    expect(p.looks.get(ih.removed)).toBe('ghost');
    expect(p.looks.get(v3.structures.find((x) => x.name === 'Falx cerebri')!.id)).not.toBe('hidden');
    expect(p.looks.get('br_medial_wall')).toBe('primary');
    // the retraction moves the medial surface about as far as asked, and leaves nothing outside the cavity
    expect(brain.interhemispheric.maxMovedMm).toBeGreaterThan(brain.params.interhemisphericMm - 0.5);
    expect(brain.interhemispheric.maxMovedMm).toBeLessThan(brain.params.interhemisphericMm + 2);
    expect(brain.interhemispheric.outsideCavityAfter).toBe(0);
    // this CT labels a right A3 and a third anterior cerebral artery, no left A3 (the view's note says so)
    expect(brain.aca.a3).toEqual(['R', 'third']);
    expect(brain.aca.thirdA2ToAcomMm).toBe(0);
    const s = T3.decodeSkull('#/atlas?g=interhemispheric&op=40&ih=50');
    expect(s.morphs).toEqual({ interhemispheric: 0.5 });
  });
  it('the telovelar view: a midline suboccipital flap, the posterior fossa fitted around this patient\'s arteries, the tonsils drawn apart and the vermis lifted', async () => {
    const so = geom.suboccipital;
    expect(so.side).toBe('M');
    expect(so.bones.map((id) => byId.get(id)!.name)).toEqual(['Occipital bone']);
    const p = S3.skullPlan('telovelar', null);
    expect(p.camera).toBe('suboccipital');
    expect(G3.SB_GROUP.get('telovelar')!.hemi).toBe('both');
    const pf = v3.structures.filter((x) => x.category === 'hindbrain' || x.category === 'ventricle');
    expect(pf.map((x) => x.name)).toEqual(expect.arrayContaining(['Cerebellar hemisphere', 'Tonsil of cerebellum', 'Vermis', 'Medulla oblongata', 'Pons', 'Fourth ventricle']));
    for (const x of pf) expect(p.looks.get(x.id), x.id).toBe('primary');
    // the cerebrum is not drawn here, nor the posterior fossa in the other views
    for (const x of v3.structures.filter((y) => y.category === 'brain')) expect(p.looks.get(x.id), x.id).toBe('hidden');
    for (const x of pf) expect(S3.skullPlan('transsylvian', null).looks.get(x.id), x.id).toBe('hidden');
    expect(pf.filter((x) => x.morph).map((x) => x.name).sort()).toEqual(['Cerebellar hemisphere', 'Tonsil of cerebellum', 'Vermis']);
    const pr = ((await import('../../src/data/generated/sbv3-fit.json')).default as unknown as { pfossa: {
      fit: { vesselInsideShare: number; minRelativeVolume: number; before: { vesselInsideShare: number } }; clear: Record<string, number>; telovelar: { maxMovedMm: number; inBoneAfter: number; inVesselAfter: number; tonsilToMedullaMm: { rest: number; moved: number };
        vermisLiftMm: number; uvulaToMedullaMm: { rest: number; moved: number }; inVentricle: { rest: number; moved: number } };
      params: Record<string, number>;
    } }).pfossa;
    expect(pr.fit.vesselInsideShare).toBeLessThan(pr.fit.before.vesselInsideShare);
    expect(pr.fit.minRelativeVolume).toBeGreaterThan(0);
    expect(pr.clear.inBoneAfter).toBe(0);
    expect(pr.telovelar.inBoneAfter).toBe(0);
    expect(pr.telovelar.inVesselAfter).toBe(0);
    expect(pr.telovelar.tonsilToMedullaMm.moved).toBeGreaterThan(pr.telovelar.tonsilToMedullaMm.rest);
    // the nodule and uvula lifted off the roof of the fourth ventricle, nothing carried into it, nothing folded
    expect(pr.telovelar.vermisLiftMm).toBeCloseTo(pr.params.tvVermisMm, 0);
    expect(pr.telovelar.uvulaToMedullaMm.moved).toBeGreaterThan(pr.telovelar.uvulaToMedullaMm.rest);
    expect(pr.telovelar.inVentricle.moved).toBeLessThanOrEqual(pr.telovelar.inVentricle.rest);
    expect(pr.params.tvMm / pr.params.tvReachMm + pr.params.tvVermisMm / pr.params.tvVermisReachMm).toBeLessThan(1);
    expect(T3.decodeSkull('#/atlas?g=telovelar&tv=60&op=30').morphs).toEqual({ telovelar: 0.6 });
  });
  it('the retrosigmoid view: a craniotomy against this patient\'s own sinuses, the right hemisphere drawn back from the petrous bone', async () => {
    const rs = geom.retrosigmoid;
    expect(rs.side).toBe('R');
    expect(rs.removedMl).toBeGreaterThan(1);
    expect(rs.removedMl).toBeLessThan(10);                     // a few centimetres across (Tang 2025: a mean 3.8 cm)
    expect(rs.bones.map((id) => byId.get(id)!.name)).toEqual(expect.arrayContaining(['Occipital bone']));
    for (const p of rs.burrHoles) { expect(p[0]).toBeGreaterThan(30); expect(p[1]).toBeLessThan(-20); }   // behind the right ear
    const p = S3.skullPlan('retrosigmoid', null);
    expect(p.camera).toBe('retrosigmoid');
    expect(G3.SB_GROUP.get('retrosigmoid')!.hemi).toBe('R');
    for (const id of [...rs.bones, rs.removed]) expect(p.looks.get(id), id).not.toBe('hidden');
    const aica = v3.structures.find((x) => x.name === 'Anterior inferior cerebellar artery')!;
    expect(aica.fitted).toBe(true);                             // this angiogram does not label it
    expect(p.looks.get(aica.id)).not.toBe('hidden');
    const pf = ((await import('../../src/data/generated/sbv3-fit.json')).default as unknown as { pfossa: {
      retrosigmoid: { maxMovedMm: number; inBoneAfter: number; inVesselAfter: number; meatusToCerebellumMm: { rest: number; moved: number }; inCorridor: { rest: number; moved: number } };
      params: Record<string, number> } }).pfossa;
    expect(pf.params.rsMm / pf.params.rsReachMm).toBeLessThan(1);           // cannot fold the cerebellum
    expect(pf.retrosigmoid.maxMovedMm).toBeLessThan(pf.params.rsMm + 2);
    expect(pf.retrosigmoid.inVesselAfter).toBe(0);
    expect(pf.retrosigmoid.meatusToCerebellumMm.moved).toBeGreaterThan(pf.retrosigmoid.meatusToCerebellumMm.rest);   // the angle opens
    expect(pf.retrosigmoid.inCorridor.rest).toBeGreaterThan(0);                 // the cerebellum lies in the corridor at rest ...
    expect(pf.retrosigmoid.inCorridor.moved).toBe(0);                           // ... and clears it drawn back
    expect(T3.decodeSkull('#/atlas?g=retrosigmoid&rs=60&tv=40').morphs).toEqual({ retrosigmoid: 0.6 });
  });
  it('the opening and the lift are in the link for the surgical view only', () => {
    const s = T3.decodeSkull('#/atlas?g=transsylvian&op=40&lf=70&ih=50');
    expect(s.grp).toBe('transsylvian');
    expect(s.morphs.open).toBeCloseTo(0.4);
    expect(s.morphs.lift).toBeCloseTo(0.7);
    expect(s.morphs.interhemispheric).toBeUndefined();          // not this view's shape
    expect(T3.encodeSkull(s)).toContain('op=40');
    expect(T3.encodeSkull(s)).toContain('lf=70');
    expect(T3.decodeSkull('#/atlas?g=arteries&op=40&lf=70').morphs).toEqual({});
    // the lateral supraorbital view lifts along its own corridor (its own parameter); the pterional lift is not its shape
    const l = T3.decodeSkull('#/atlas?g=lso&ll=80&lf=70&op=20');
    expect(l.morphs).toEqual({ lsoLift: 0.8, open: 0.2 });
    expect(T3.encodeSkull(l)).toContain('ll=80');
  });
  it('sourced content: references exist and are used, context structures exist', () => {
    const used = new Set(APPROACHES.flatMap((a) => a.sections.flatMap((x) => x.claims)).flatMap((c) => c.refIds));
    for (const r of used) expect(APPROACH_REF.has(r), r).toBe(true);
    expect(APPROACH_REFS.map((r) => r.id).filter((r) => !used.has(r))).toEqual([]);
    for (const a of APPROACHES) for (const n of a.context) expect(v3.structures.some((s) => s.name === n), n).toBe(true);
  });
});
