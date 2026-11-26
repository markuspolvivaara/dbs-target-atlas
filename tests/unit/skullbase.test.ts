import { describe, expect, it, vi } from 'vitest';
import { APPROACH_GEOM, crossCheckSb, DEFINITIONS, definitionFor, LANDMARKS, NOT_YET_SHOWN, REGIONS, SB_MANIFEST } from '../../src/skullbase';
import { SB_GROUP, SB_GROUPS } from '../../src/skullbase/groups';
import { skullPlan, skullScene } from '../../src/skullbase/scene';
import { decodeSkull, defaultSkullState, encodeSkull } from '../../src/skullbase/state';
import { meshSoup, nodeExtentsX, nodeMeans, nodeMorphs, pointsInside } from './glb';
import sbModifications from '../../src/data/generated/sb-modifications.json';
import { FORAMEN_CONTENTS } from '../../src/skullbase/foramina';
import { atOpeningNote, inBoneNote } from '../../src/ui/skullbase-atlas';
import { TB_NOTES, TB_REF, TB_REFS } from '../../src/skullbase/temporal';
import { APPROACH_REF, APPROACH_REFS, APPROACHES, CAVERNOUS_INFO, ENDONASAL_INFO } from '../../src/skullbase/approaches';
import { PERC_SECTIONS } from '../../src/skullbase/trigeminal-text';
import { TRIGEMINAL } from '../../src/skullbase/trigeminal';

describe('skull-base data (Z-Anatomy export)', () => {
  it('generated files agree with each other', () => {
    expect(crossCheckSb()).toEqual([]);
  });
  it('the temporal-bone views: Z-Anatomy\u2019s own ear, and what it lacks drawn by rule and said so', () => {
    const by = (n: string) => SB_MANIFEST.structures.find((s) => s.name === n);
    for (const n of ['Cochlea', 'Vestibule and semicircular canals', 'Malleus', 'Incus', 'Stapes', 'Tympanic membrane']) {
      expect(by(n)?.dataset, n).toBe('zanatomy');
      expect(by(n)?.centroid?.R?.[0], n).toBeGreaterThan(0);
      expect(by(n)?.centroid?.L?.[0], n).toBeLessThan(0);
    }
    expect(by('Greater petrosal nerve')?.derivation).toMatch(/^Drawn by rule/);
    for (const n of ['Geniculate ganglion', 'Second genu of facial nerve', 'Oval window', 'Bone over the superior semicircular canal'])
      for (const side of ['L', 'R']) expect(LANDMARKS.find((l) => l.name === n && l.side === side)?.placed, `${n} ${side}`).toMatch(/^Drawn by rule/);
    // the ganglion lies on the facial nerve's way between the meatus and the stylomastoid foramen, lateral to the meatus
    const lm = (n: string) => LANDMARKS.find((l) => l.name === n && l.side === 'R')!.ras;
    expect(lm('Geniculate ganglion')[0]).toBeGreaterThan(lm('Internal acoustic meatus')[0] + 10);
    expect(lm('Second genu of facial nerve')[1]).toBeLessThan(lm('Geniculate ganglion')[1]);
  });
  it('the cerebral arteries’ cortical branches are moved with the cortex out of the bone, and the shipped tubes are the moved ones', async () => {
    // Z-Anatomy draws them on a cortex that reaches into its own bone: 897 mm of their centre lines lay inside it
    // (982 mm while the bone field was 0.7 mm fatter than the bone meshes, the audit's MC-13)
    const fit = (await import('../../src/data/generated/sb-v1fit.json')).default as unknown as
      { brain: { arteries: Record<string, { lengthMm: number; inBoneBeforeMm: number; inBoneAfterMm: number; maxMovedMm: number; centroid: Record<'L' | 'R', number[]>; box: Record<'L' | 'R', number[][]> }> } };
    const moved = Object.entries(fit.brain.arteries);
    expect(moved.length).toBe(16);
    expect(moved.reduce((a, [, r]) => a + r.inBoneBeforeMm, 0)).toBeGreaterThan(800);
    expect(moved.reduce((a, [, r]) => a + r.inBoneAfterMm, 0)).toBeLessThan(2);
    for (const [name, r] of moved) {
      expect(r.inBoneAfterMm, name).toBeLessThanOrEqual(Math.max(1, 0.02 * r.lengthMm));
      const s = SB_MANIFEST.structures.find((x) => x.name === name)!;
      expect(s.category, name).toBe('artery');
      expect(s.derivation, name).toMatch(/moved with that cortex/);
      expect(s.centroid, name).toEqual(r.centroid);
      // the file on the site is the moved tube: it reaches as far to each side as the moved tube's box says
      const ext = await nodeExtentsX(s.file);
      for (const side of ['L', 'R'] as const) {
        expect(Math.abs(ext[side][0] - r.box[side][0][0]), `${name} ${side}`).toBeLessThan(0.1);
        expect(Math.abs(ext[side][1] - r.box[side][1][0]), `${name} ${side}`).toBeLessThan(0.1);
        expect(r.centroid[side][0] < 0, `${name} ${side}`).toBe(side === 'L');
      }
    }
    // (Z-Anatomy's prefrontal artery reaches 60.9 mm from the midline, inside the frontal bone: the moved one stops short of it)
    expect(fit.brain.arteries['Prefrontal artery'].box.R[1][0]).toBeLessThan(59.5);
    expect(fit.brain.arteries['Prefrontal artery'].box.L[0][0]).toBeGreaterThan(-59.5);
    // the trunks and the Sylvian arteries are not moved
    for (const n of ['Middle cerebral artery (M1 segment)', 'Anterior cerebral artery', 'Posterior cerebral artery'])
      if (SB_MANIFEST.structures.some((x) => x.name === n)) expect(fit.brain.arteries[n], n).toBeUndefined();
  }, 60_000);
  it('the hypoglossal nerve runs through the model’s own hypoglossal canal, not through the bone beside it', async () => {
    // (the audit's finding MC-09: Z-Anatomy's curve ran through the occipital bone 5 mm from the canal, 17.6 mm of it
    // in bone a side; pipeline/skullbase_v1_xii.py finds the canal in the bone and leads the nerve through it)
    type Side = { canal: { centre: number[]; fromLabelMm: number; lengthMm: number; widthMm: number }; inBoneBeforeMm: number; inBoneAfterMm: number;
      toCanalCentreMm: number; toCanalCentreBeforeMm: number; maxMovedMm: number; sharpestTurnDeg: number };
    const step = (sbModifications as unknown as { steps: { step: string; metrics: Record<string, Side> }[] }).steps.find((x) => x.step === 'skullbase_v1_xii')!;
    expect(Object.keys(step.metrics).sort()).toEqual(['L', 'R']);
    const label = LANDMARKS.find((l) => l.name === 'Hypoglossal canal')!;
    const nerve = await meshSoup(SB_MANIFEST.structures.find((x) => x.name === 'Hypoglossal nerve (XII)')!.file);
    for (const [sd, r] of Object.entries(step.metrics)) {
      // the canal, found beside Z-Anatomy's label for it
      expect(r.canal.fromLabelMm, sd).toBeLessThan(1);
      expect(r.canal.lengthMm, sd).toBeGreaterThan(4);
      expect(r.canal.widthMm, sd).toBeGreaterThan(1.5);
      const sign = sd === 'R' ? 1 : -1;
      expect(Math.hypot(r.canal.centre[0] - sign * Math.abs(label.ras[0]), r.canal.centre[1] - label.ras[1], r.canal.centre[2] - label.ras[2]), sd).toBeLessThan(2);
      // the nerve: through its middle, out of the bone
      expect(r.toCanalCentreBeforeMm, sd).toBeGreaterThan(4);
      expect(r.toCanalCentreMm, sd).toBeLessThan(0.5);
      expect(r.inBoneBeforeMm, sd).toBeGreaterThan(15);
      expect(r.inBoneAfterMm, sd).toBeLessThanOrEqual(1);
      expect(r.maxMovedMm, sd).toBeLessThan(12);
      expect(r.sharpestTurnDeg, sd).toBeLessThan(70);
      // the shipped tube passes the canal's centre (its radius there is 0.3 to 0.5 mm)
      let near = Infinity;
      for (let i = 0; i < nerve.P.length; i += 3) near = Math.min(near, Math.hypot(nerve.P[i] - r.canal.centre[0], nerve.P[i + 1] - r.canal.centre[1], nerve.P[i + 2] - r.canal.centre[2]));
      expect(near, sd).toBeLessThan(0.8);
    }
    // on the shipped files: hardly a vertex of the nerve inside the occipital bone (before: 413 of 4,424, 9 %; now 8 of 4,370)
    const bone = await meshSoup(SB_MANIFEST.structures.find((x) => x.name === 'Occipital bone')!.file);
    expect(pointsInside(nerve.P, bone.P, bone.T) / (nerve.P.length / 3)).toBeLessThan(0.01);
    expect(SB_MANIFEST.structures.find((x) => x.name === 'Hypoglossal nerve (XII)')!.derivation).toContain('Led through the canal');
  }, 60_000);
  it('the straight and occipital sinuses start at the confluence, the basilar artery lies off the clivus, the middle meningeal artery passes its foramen', async () => {
    // (decision 5 on the audit's MC-11, pipeline/skullbase_v1_vessels.py: Z-Anatomy's file has both sinuses 44.5 mm in
    // front of the confluence; it draws the basilar artery pressed into the clivus and the middle meningeal artery
    // through solid bone 2.6 mm from the model's own foramen spinosum)
    type M = {
      sinuses: { offsetLengthMm: number; straight: { toConfluenceMm: number; toInferiorSagittalMm: number; toConfluenceBeforeMm: number };
        occipital: { toConfluenceMm: number; inBoneBeforeMm: number; inBoneAfterMm: number; offCrestMaxMm: number } };
      basilar: { basilar: { inBoneBeforeMm: number; inBoneAfterMm: number; wallAfterMm: number; toBrainstemAfterMm: number; maxMovedMm: number };
        branches: Record<string, Record<string, { inBoneBeforeMm: number; inBoneAfterMm: number }>> };
      meningeal: Record<string, { canal: { centre: number[]; fromLabelMm: number; lengthMm: number; widthMm: number }; inBoneBeforeMm: number;
        inBoneAfterMm: number; toCanalCentreBeforeMm: number; toCanalCentreMm: number; originMovedMm: number; sharpestTurnDeg: number }>;
      carried: Record<string, { maxMovedMm: number }>; joins: Record<string, [number, number]>; nerves: Record<string, [number, number]>;
    };
    const m = (sbModifications as unknown as { steps: { step: string; metrics: M }[] }).steps.find((x) => x.step === 'skullbase_v1_vessels')!.metrics;
    const file = (n: string) => SB_MANIFEST.structures.find((x) => x.name === n && !x.replaces)!.file;
    const nearest = (a: Float64Array, b: Float64Array) => {
      let best = Infinity;
      for (let i = 0; i < a.length; i += 3) for (let j = 0; j < b.length; j += 3)
        best = Math.min(best, Math.hypot(a[i] - b[j], a[i + 1] - b[j + 1], a[i + 2] - b[j + 2]));
      return best;
    };
    // the sinuses: moved back by the offset, the straight sinus meets the transverse sinuses and the inferior sagittal sinus
    expect(m.sinuses.offsetLengthMm).toBeGreaterThan(40);
    expect(m.sinuses.offsetLengthMm).toBeLessThan(50);
    expect(m.sinuses.straight.toConfluenceBeforeMm).toBeGreaterThan(40);
    expect(m.sinuses.straight.toConfluenceMm).toBeLessThan(0.5);
    expect(m.sinuses.straight.toInferiorSagittalMm).toBeLessThan(2);
    const straight = (await meshSoup(file('Straight sinus'))).P;
    expect(nearest(straight, (await meshSoup(file('Transverse sinus'))).P)).toBeLessThan(2);
    expect(nearest(straight, (await meshSoup(file('Inferior sagittal sinus'))).P)).toBeLessThan(2.5);
    expect(m.sinuses.occipital.toConfluenceMm).toBeLessThan(0.5);
    expect(m.sinuses.occipital.inBoneBeforeMm).toBeGreaterThan(5);
    expect(m.sinuses.occipital.inBoneAfterMm).toBe(0);
    expect(m.sinuses.occipital.offCrestMaxMm).toBeLessThan(0.5);
    // the basilar artery off the bone, not into the pons; what is joined to it still meets it; the nerves no nearer
    const b = m.basilar.basilar;
    expect(b.inBoneBeforeMm).toBeGreaterThan(10);
    expect(b.inBoneAfterMm).toBe(0);
    expect(b.wallAfterMm).toBeGreaterThan(-0.1);
    expect(b.toBrainstemAfterMm).toBeGreaterThan(-0.3);
    expect(b.maxMovedMm).toBeLessThan(3);
    for (const [n, sides] of Object.entries(m.basilar.branches)) for (const [sd, r] of Object.entries(sides)) {
      expect(r.inBoneBeforeMm, `${n} ${sd}`).toBeGreaterThan(10);
      expect(r.inBoneAfterMm, `${n} ${sd}`).toBeLessThanOrEqual(0.5);
    }
    for (const id of ['sb_vertebral_artery', 'sb_anterior_inferior_cerebellar_artery', 'sb_superior_cerebellar_artery', 'sb_posterior_cerebral_artery'])
      expect(m.carried[id], id).toBeDefined();
    for (const [id, [before, after]] of Object.entries(m.joins)) expect(after, id).toBeLessThanOrEqual(before + 0.1);
    for (const [k, [before, after]] of Object.entries(m.nerves)) expect(after, k).toBeGreaterThanOrEqual(Math.min(before, 0.5) - 0.1);
    const basilar = (await meshSoup(file('Basilar artery'))).P;
    let inside = 0;
    for (const bone of ['Sphenoid bone', 'Occipital bone']) {
      const s = await meshSoup(file(bone));
      inside += pointsInside(basilar, s.P, s.T);
    }
    expect(inside / (basilar.length / 3)).toBeLessThan(0.03);
    expect(nearest(basilar, (await meshSoup(file('Vertebral artery'))).P)).toBeLessThan(0.5);
    // the middle meningeal artery through the foramen spinosum, found beside Z-Anatomy's label for it
    const label = LANDMARKS.find((l) => l.name === 'Foramen spinosum')!;
    const mma = (await meshSoup(file('Middle meningeal artery'))).P;
    expect(Object.keys(m.meningeal).sort()).toEqual(['L', 'R']);
    for (const [sd, r] of Object.entries(m.meningeal)) {
      expect(r.canal.fromLabelMm, sd).toBeLessThan(1);
      expect(r.canal.lengthMm, sd).toBeGreaterThan(4);
      expect(r.canal.widthMm, sd).toBeGreaterThan(1.5);
      const sign = sd === 'R' ? 1 : -1;
      expect(Math.hypot(r.canal.centre[0] - sign * Math.abs(label.ras[0]), r.canal.centre[1] - label.ras[1], r.canal.centre[2] - label.ras[2]), sd).toBeLessThan(2);
      expect(r.toCanalCentreBeforeMm, sd).toBeGreaterThan(2);
      expect(r.toCanalCentreMm, sd).toBeLessThan(0.5);
      expect(r.inBoneBeforeMm, sd).toBeGreaterThan(10);
      expect(r.inBoneAfterMm, sd).toBeLessThanOrEqual(1);
      expect(r.originMovedMm, sd).toBe(0);
      expect(r.sharpestTurnDeg, sd).toBeLessThan(70);
      expect(nearest(mma, new Float64Array(r.canal.centre)), sd).toBeLessThan(0.8);
    }
    // the cards: no in-bone note on what was moved out of the bone, and each says what was done
    for (const n of ['Basilar artery', 'Occipital sinus', 'Middle meningeal artery', 'Medial pontine branches of basilar artery', 'Lateral pontine branches of basilar artery']) {
      const it = SB_MANIFEST.structures.find((x) => x.name === n && !x.replaces)!;
      expect(it.inBone, n).toBeUndefined();
      expect(it.derivation, n).toContain('Corrected position (skullbase_v1_vessels.py)');
    }
    expect(SB_MANIFEST.structures.find((x) => x.name === 'Straight sinus')!.derivation).toMatch(/starts 44\.5 mm in front of the confluence/);
  }, 120_000);
  it('a vessel or nerve that runs inside the model’s bone says so on its card, with how much and where', () => {
    // (the audit's finding MC-11: Z-Anatomy's bones have few canals and grooves, so its curves run through the bone
    // meshes; pipeline/skullbase_v1_inbone.py measures every tube against every bone)
    const noted = SB_MANIFEST.structures.filter((x) => x.inBone);
    expect(noted.length).toBeGreaterThanOrEqual(20);
    expect(noted.length).toBeLessThanOrEqual(40);
    for (const x of noted) {
      expect(x.type, x.name).toBe('tube');
      expect(x.inBone!.share >= 0.05 || x.inBone!.deepestMm >= 2, x.name).toBe(true);
      expect(x.inBone!.bones.length, x.name).toBeGreaterThan(0);
      for (const b of x.inBone!.bones) expect(SB_MANIFEST.structures.some((y) => y.type === 'bone' && y.name === b), `${x.name}: ${b}`).toBe(true);
    }
    const of = (n: string) => SB_MANIFEST.structures.find((x) => x.name === n)!.inBone;
    // the carotid through a petrous bone without a canal; the labyrinth's nerves inside the temporal bone
    expect(of('Internal carotid artery')!.bones).toEqual(expect.arrayContaining(['Sphenoid bone', 'Temporal bone']));
    expect(of('Cochlear nerve')!.share).toBeGreaterThan(0.5);
    // what the project has moved out of the bone carries no note: the hypoglossal nerve, the cortical arteries
    for (const n of ['Hypoglossal nerve (XII)', 'Pericallosal artery', 'Callosomarginal artery', 'Artery of central sulcus']) expect(of(n), n).toBeUndefined();
    const note = inBoneNote(of('Internal carotid artery')!);
    expect(note).toMatch(/^\d+% of this tube’s surface lies more than 0\.5 mm inside the sphenoid bone and the temporal bone as Z-Anatomy draws them \(up to \d+\.\d mm deep\)\./);
    expect(inBoneNote({ share: 0.004, deepestMm: 2.1, bones: ['Sphenoid bone'] })).toMatch(/^A short stretch of this tube lies inside the sphenoid bone as Z-Anatomy draws it/);
  });
  it('the telovelar view has the floor’s landmarks, the retrosigmoid the tentorium, and the chiasm is a drawn crossing', () => {
    const tv = SB_GROUPS.find((g) => g.id === 'telovelar')!;
    const names = tv.landmarks.map((id) => LANDMARKS.find((l) => l.id === id)!.name);
    for (const n of ['Facial colliculus', 'Median sulcus of fourth ventricle', 'Vestibular area', 'Hypoglossal trigone', 'Vagal trigone', 'Obex'])
      expect(names, n).toContain(n);
    const rs = SB_GROUPS.find((g) => g.id === 'retrosigmoid')!;
    expect(rs.structures.map((id) => SB_MANIFEST.structures.find((s) => s.id === id)?.name)).toContain('Tentorium cerebelli');
    const ch = SB_MANIFEST.structures.find((s) => s.name === 'Optic chiasm')!;
    expect(ch.dataset).toBe('rule');
    expect(ch.derivation).toMatch(/Mncube 2019/);
    expect(SB_MANIFEST.structures.some((s) => s.name === 'Optic tract')).toBe(true);
    for (const n of ['Optic nerve (II)', 'Olfactory nerve (I)'])
      expect(SB_MANIFEST.structures.find((s) => s.name === n)?.derivation, n).toMatch(/moved just clear/);
  });
  it('the surgical views use Z-Anatomy\u2019s own brain and hindbrain, with the shapes; the cerebellar arteries move with them', () => {
    const by = (n: string) => SB_MANIFEST.structures.find((s) => s.name === n);
    // (six lobes, and the Kawase view's lifted copy of the temporal lobe)
    const brain = SB_MANIFEST.structures.filter((s) => s.category === 'brain' && !s.forView && !s.pushedFrom);
    expect(brain.length).toBe(6);
    expect(SB_MANIFEST.structures.filter((s) => s.forView === 'kawase').map((s) => s.replaces)).toEqual(['br_temporal_lobe']);
    for (const b of brain) { expect(b.morph, b.name).toBe(true); expect(b.dataset).toBe('zanatomy'); }
    // Z-Anatomy's brain is the same on both sides, so each piece's halves mirror each other. (They did not: the right
    // insula's floor reached 48 mm further back than the left's, the audit's MC-15, as the left M3 segment's name was
    // not read; and a piece of the left frontal and parietal surface, pinched off when the faces were reduced, was
    // dropped: the insula's centres lay 23 mm apart front to back, the frontal lobe's 2 mm)
    for (const b of brain) {
      const { L, R } = b.centroid!;
      expect(Math.abs(L[0] + R[0]), b.name).toBeLessThan(1);
      expect(Math.abs(L[1] - R[1]), b.name).toBeLessThan(1);
      expect(Math.abs(L[2] - R[2]), b.name).toBeLessThan(1);
    }
    for (const n of ['Superior cerebellar artery', 'Anterior inferior cerebellar artery', 'Posterior inferior cerebellar artery']) expect(by(n)?.morph, n).toBe(true);
    // (the trunks and the posterior cerebral artery, above the tentorium, stay)
    for (const n of ['Vertebral artery', 'Basilar artery', 'Posterior cerebral artery']) expect(by(n)?.morph, n).toBeFalsy();
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
    const tubes = SB_MANIFEST.structures.filter((s) => s.type === 'tube' && !s.pushedFrom);     // (not a tumour view's moved copy)
    expect(tubes.length).toBeGreaterThan(60);
    expect(SB_MANIFEST.structures.some((s) => s.type === 'tract')).toBe(false);
    const nerves = tubes.filter((s) => s.category === 'nerve');
    expect(nerves.every((s) => s.cranialNerve !== undefined)).toBe(true);
    expect(new Set(nerves.map((s) => s.cranialNerve))).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]));
    // the trigeminal nerve as its trunk and three divisions (branches merged into them); the chorda tympani in the facial nerve
    expect(nerves.filter((s) => s.cranialNerve === 5).map((s) => s.name).sort())
      .toEqual(['Mandibular nerve (V3)', 'Maxillary nerve (V2)', 'Ophthalmic nerve (V1)', 'Trigeminal nerve (V)']);
    // (the greater petrosal nerve, drawn by rule on the model for the temporal-bone views, is a branch of VII)
    expect(nerves.filter((s) => s.cranialNerve === 7).map((s) => s.name).sort()).toEqual(['Facial nerve (VII)', 'Greater petrosal nerve']);
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
    // (the overview, the regions, three systems, six bone views and the surgical views cut on this model's skull)
    // (and the six temporal-bone views)
    // (and the six temporal-bone views, the cavernous sinus and the endonasal view; and the tumours: Knosp 0-3A, Koos I-IV, four sites;
    // and trigeminal neuralgia's percutaneous route, but not its decompression, which v1 does not have)
    expect(SB_GROUPS.length).toBe(1 + REGIONS.length + 3 + 6 + Object.keys(APPROACH_GEOM).length + 6 + 2 + 12 + 1);
    expect(SB_GROUPS.filter((g) => g.kind === 'tumour').map((g) => g.id)).toEqual(['knosp_0', 'knosp_1', 'knosp_2', 'knosp_3a', 'koos_i', 'koos_ii',
      'koos_iii', 'koos_iv', 'meningioma_olfactory', 'meningioma_tuberculum', 'meningioma_petroclival', 'meningioma_foramen_magnum']);
    expect(SB_GROUPS.filter((g) => g.kind === 'approach').map((g) => g.id).sort())
      .toEqual(['endonasal', 'far_lateral', 'interhemispheric', 'kawase', 'lso', 'orbitozygomatic', 'retrosigmoid', 'subtemporal', 'telovelar', 'transsylvian', 'trigeminal_percutaneous']);
    expect(SB_GROUP.has('trigeminal_mvd')).toBe(false);
    expect(SB_GROUPS.filter((g) => ['temporal', 'ear_r', 'ear_l', 'facial', 'inner_ear', 'middle_ear'].includes(g.id)).length).toBe(6);
    // the all-bones view draws every bone and every landmark of the model's own; the points the trigeminal neuralgia
    // views add (here v1's mirrored right foramen ovale) are labelled in those views only
    const all = SB_GROUPS.find((g) => g.id === 'bone_all_bones')!;
    const tn = new Set((TRIGEMINAL?.landmarks ?? []).map((l) => l.id));
    expect(tn.has('lm_foramen_ovale_r')).toBe(true);
    expect(all.landmarks.length).toBe(LANDMARKS.length - tn.size);
    expect(SB_GROUPS.filter((g) => g.landmarks.some((id) => tn.has(id))).map((g) => g.id)).toEqual(['trigeminal_percutaneous']);
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
    // every cranial nerve is fitted, the trigeminal divisions too (they gather Z-Anatomy's branches under a new name)
    for (const s of ct.structures) if (s.category === 'nerve') expect(s.fitted, s.name).toBe(true);
  });
  it('says where a fitted nerve crosses the skull base off the CT\u2019s opening (MC-10), and links the routed one', async () => {
    const v3 = new Set(SbManifestSchema.parse((await import('../../src/data/generated/sbv3-manifest.json')).default).structures.map((s) => s.id));
    const noted = new Map(ct.structures.filter((s) => s.atOpening).map((s) => [s.name, s.atOpening!]));
    // the audit's cases: the right XII in the condylar bone, the left IX in the jugular foramen's wall, the left optic
    // nerve in sinus air, both V2
    for (const n of ['Hypoglossal nerve (XII)', 'Glossopharyngeal nerve (IX)', 'Optic nerve (II)', 'Maxillary nerve (V2)']) expect(noted.has(n), n).toBe(true);
    expect(noted.get('Hypoglossal nerve (XII)')!.R.solidMm).toBeGreaterThan(5);
    expect(noted.get('Glossopharyngeal nerve (IX)')!.L.solidMm).toBeGreaterThan(3);
    expect(noted.get('Optic nerve (II)')!.L.airMm).toBeGreaterThan(3);
    for (const n of ['Facial nerve (VII)', 'Vestibulocochlear nerve (VIII)', 'Trigeminal nerve (V)']) expect(noted.has(n), n).toBe(false);
    for (const [n, o] of noted) {
      expect(v3.has(o.routedId), n).toBe(true);
      for (const s of ['R', 'L'] as const) expect(o[s].solidMm, `${n} ${s}`).toBeLessThanOrEqual(o[s].boneMm);
    }
    const xii = atOpeningNote(noted.get('Hypoglossal nerve (XII)')!);
    expect(xii).toMatch(/^Over the first 40 mm of its fitted course, from inside the skull to just past its base: on the right, 11\.2 mm through the bone shown \(10\.5 mm of it at 400 HU or more\); on the left, 2\.2 mm through the bone shown \(none of it at 400 HU or more\)\./);
    expect(xii).toMatch(/that route lies a median 3\.1 mm on the right and 5\.8 mm on the left from it\.$/);
    expect(atOpeningNote(noted.get('Vagus nerve (X)')!)).toMatch(/on the right, clear of both;.* a median 1\.7 mm on the left from it\.$/);   // (0.9 mm before v3's vagus nerve was routed round the veins of the jugular foramen)
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
    for (const s of v3.structures.filter((x) => !x.id.startsWith('tm_') && !x.pushedFrom)) {     // (the tumours have their own test)
      if (s.id.startsWith('tb_') || s.id.startsWith('br_') || s.id.startsWith('pf_')) {
        if (s.id === 'tb_anterior_spinal_artery') {
          // its two halves run together down the front of the medulla, on the fitted medulla's midline (which is not
          // exactly the frame's): the left one left of the right one, the pair within 5 mm of the frame's midline
          expect(s.centroid!.L[0], s.id).toBeLessThan(s.centroid!.R[0]);
          expect(Math.abs(s.centroid!.L[0] + s.centroid!.R[0]) / 2, s.id).toBeLessThan(5);
        } else {
          expect(s.centroid!.L[0], s.id).toBeLessThan(0);
          expect(s.centroid!.R[0], s.id).toBeGreaterThan(0);
        }
        expect(s.file, s.id).toMatch(/^assets\/skullbase-v3\//);
      } else if (s.approach || s.morph || s.type === 'bone') {
        // the craniotomy's cut bones and the bone removed, the arteries that move with the opening, and v3's own skull
        // (completed beyond the scan): this build's files
        expect(s.file, s.id).toMatch(/^assets\/skullbase-v3\//);
      } else {
        // (or v3's own copy of it, joined to the vessel it meets: skullbase_v3_junctions.py, its card saying so)
        if (s.file.endsWith('.joined.glb')) expect(s.derivation, s.id).toMatch(/Joined to the /);
        else expect(s.file, s.id).toMatch(/^assets\/skullbase-ct\//);
        // nothing approximate from Z-Anatomy, but the falx the interhemispheric view draws, the sellar structures the
        // endonasal view draws and the veins the cavernous sinus view draws (v2's fitted ones, their cards saying so)
        const fittedOk = ['Falx cerebri', 'Anterior intercavernous sinus', 'Posterior intercavernous sinus', 'Optic chiasm',
          'Superior petrosal sinus', 'Inferior petrosal sinus', 'Superior ophthalmic vein', 'Inferior ophthalmic vein'];
        if (!fittedOk.includes(s.name)) expect(s.fitted, s.id).toBeUndefined();
        else if (s.fitted) expect(s.derivation, s.id).toMatch(/approximate/);
      }
    }
    for (const side of ['L', 'R']) expect(lms.filter((l) => l.side === side).length).toBeGreaterThanOrEqual(6);
  });
  it('routes the cranial nerves I–XII through this CT: hardly through bone, near their fitted course, out by the right foramina', async () => {
    const f = (await import('../../src/data/generated/sbv3-fit.json')).default as unknown as {
      nerves: Record<string, Record<string, { boneCrossedMm: number; maxFromFittedMm: number; maxFromGuideMm?: number }>>;
      nerveChecks: { mandibularNerveToOvaleHoleMm: Record<string, number>; opticNerveToSegmentationMm: Record<string, number>; jugularNervesToBulbMm: Record<string, Record<string, number>> };
    };
    expect(new Set(v3.structures.map((s) => s.cranialNerve).filter(Boolean))).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]));
    for (const [n, sides] of Object.entries(f.nerves)) for (const [side, r] of Object.entries(sides)) {
      expect(r.boneCrossedMm, `${n} ${side}`).toBeLessThanOrEqual(2);
      // (the accessory nerve is led along the vagus nerve's route at the jugular foramen, up to 11 mm from where the
      // fitted model has it on the left: it is held to that guide)
      expect(r.maxFromGuideMm ?? r.maxFromFittedMm, `${n} ${side}`).toBeLessThanOrEqual(8);
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

/** The section's modules as a page of one model loads them (its <meta name="sb-model" content="v3">, or "ct"). */
async function modelModules(model: 'v3' | 'ct') {
  vi.resetModules();
  const g = globalThis as unknown as { document?: unknown };
  const had = 'document' in g;
  g.document = { querySelector: (q: string) => (q.includes('sb-model') ? { content: model } : null) };
  try {
    return { index: await import('../../src/skullbase'), groups: await import('../../src/skullbase/groups'), scene: await import('../../src/skullbase/scene'), state: await import('../../src/skullbase/state') };
  } finally {
    if (!had) delete g.document;
  }
}
const v3Modules = () => modelModules('v3');

describe('skull-base landmarks, in each model', () => {
  it('none is a neighbouring bone’s landmark attached to the nearest cranial surface, and none carries such a text', async () => {
    // (v1 and v2 once listed the atlas's "Lateral mass" on the occipital bone, with Wikipedia's text on the atlas)
    for (const prefix of ['sb', 'sbct', 'sbv3']) {
      const lms = (await import(`../../src/data/generated/${prefix}-landmarks.json`)).default as { id: string; name: string; boneFrom?: string }[];
      const defs = (await import(`../../src/data/generated/${prefix}-definitions.json`)).default as Record<string, { text: string; url: string | null }>;
      expect(lms.length, prefix).toBeGreaterThan(50);
      expect(lms.filter((l) => l.boneFrom === 'nearest surface').map((l) => l.id), prefix).toEqual([]);
      expect(lms.some((l) => l.name === 'Lateral mass'), prefix).toBe(false);
      expect(Object.keys(defs), prefix).not.toContain('Lateral mass');
      // no text is the lead of Wikipedia's page on the atlas or the axis
      expect(Object.entries(defs).filter(([, d]) => /wiki\/(Atlas|Axis)_\(anatomy\)/.test(d.url ?? '')).map(([n]) => n), prefix).toEqual([]);
    }
  });
});

describe('skull-base data, in each model', () => {
  it('the generated files agree with each other in v2 and in the default model too (the check ran for v1 alone)', async () => {
    for (const model of ['ct', 'v3'] as const) {
      const { index } = await modelModules(model);
      expect(index.SB_MODEL, model).toBe(model);
      expect(index.crossCheckSb(), model).toEqual([]);
    }
  });
});

describe('skull-base nerves and vessels, in each model', () => {
  it('everything paired is drawn on both sides (v1 and v2 had a left cochlear nerve and no right one)', async () => {
    const { nodeExtentsX } = await import('./glb');
    for (const prefix of ['sb', 'sbct', 'sbv3']) {
      const m = (await import(`../../src/data/generated/${prefix}-manifest.json`)).default as { structures: { id: string; name: string; type: string; category?: string; file: string; pushedFrom?: string; tumourView?: string; approach?: string }[] };
      const oneSided: string[] = [];
      for (const s of m.structures) {
        if (s.type !== 'tube' || !['nerve', 'artery', 'vein'].includes(s.category ?? '') || s.pushedFrom || s.tumourView || s.approach) continue;
        const ext = await nodeExtentsX(s.file);
        const sides = Object.keys(ext);
        // a midline vessel is one node, across or on the midline; anything that lies wholly on one side has a twin
        if (sides.length === 1 && (ext[sides[0]][0] > 2 || ext[sides[0]][1] < -2)) oneSided.push(`${prefix}: ${s.name} (${sides[0]} only)`);
      }
      expect(oneSided, prefix).toEqual([]);
    }
    const coch = await nodeExtentsX('assets/skullbase/sb_cochlear_nerve.glb');
    expect(Object.keys(coch).sort()).toEqual(['L', 'R']);
    // the model is symmetric: the right one is the left one's mirror image
    expect(coch.R[0]).toBeCloseTo(-coch.L[1], 1);
    expect(coch.R[1]).toBeCloseTo(-coch.L[0], 1);
  }, 120_000);
});

describe('skull-base views, in each model', async () => {
  const models = { v1: await import('../../src/skullbase/groups'), v2: (await modelModules('ct')).groups, v3: (await v3Modules()).groups };
  it('list each structure and each landmark once (a repeat shows twice in the panel and the legend)', () => {
    for (const [name, G] of Object.entries(models)) {
      expect(G.SB_GROUPS.length, name).toBeGreaterThan(10);
      expect(G.crossCheckGroups(), name).toEqual([]);
    }
    // the three are different models, not one loaded three times
    expect(new Set(Object.values(models).map((G) => G.SB_GROUPS.length)).size).toBeGreaterThan(1);
    // v3's cranial floor lists the facial nerve once, though it is among both the nerves and the ear's parts
    const floor = models.v3.SB_GROUP.get('floor')!;
    expect(floor.structures.length).toBe(new Set(floor.structures).size);
  });
});

describe('v3 cranial floor landmarks', async () => {
  const { groups: G3 } = await v3Modules();
  const lms = (await import('../../src/data/generated/sbv3-landmarks.json')).default as unknown as { id: string; name: string; side: string; placed?: string }[];
  it('labels the clinoid processes, the sella and the petrous apex on the cranial floor, each saying how it was placed', () => {
    const floor = G3.SB_GROUP.get('floor')!;
    const names = new Set(floor.landmarks.map((id) => lms.find((l) => l.id === id)!.name));
    for (const n of ['Anterior clinoid process', 'Posterior clinoid process', 'Tuberculum sellae', 'Dorsum sellae', 'Apex of petrous part', 'Sphenoidal yoke']) expect(names, n).toContain(n);
    for (const n of ['Anterior clinoid process', 'Posterior clinoid process', 'Apex of petrous part']) {
      expect(lms.filter((l) => l.name === n).map((l) => l.side).sort(), n).toEqual(['L', 'R']);   // both sides, found on the CT
    }
    for (const l of lms.filter((l) => floor.landmarks.includes(l.id) && !['Optic canal'].includes(l.name))) {
      if (l.placed !== undefined) expect(l.placed.length, l.id).toBeGreaterThan(20);
    }
  });
});

describe('v3 floor of the fourth ventricle (telovelar view)', async () => {
  const { groups: G3 } = await v3Modules();
  const { TB_NOTES } = await import('../../src/skullbase/temporal');
  const lms = (await import('../../src/data/generated/sbv3-landmarks.json')).default as unknown as { id: string; name: string; side: string; ras: number[]; placed?: string }[];
  const at = (name: string, side: string) => lms.find((l) => l.name === name && l.side === side)!.ras;
  it('labels the facial colliculi, trigones, vestibular areas, median sulcus and obex, each with sourced notes', () => {
    const tv = G3.SB_GROUP.get('telovelar')!;
    const names = new Set(tv.landmarks.map((id) => lms.find((l) => l.id === id)!.name));
    for (const n of ['Facial colliculus', 'Hypoglossal trigone', 'Vagal trigone', 'Vestibular area', 'Median sulcus of fourth ventricle', 'Obex']) {
      expect(names, n).toContain(n);
      expect((TB_NOTES[n] ?? []).length, n).toBeGreaterThan(0);
    }
  });
  it('places them as the floor is laid out: paired ones either side of the median sulcus, the obex lowest, the colliculus about mid-floor', () => {
    const mid = at('Median sulcus of fourth ventricle', 'M');
    for (const n of ['Facial colliculus', 'Hypoglossal trigone', 'Vagal trigone', 'Vestibular area']) {
      expect(at(n, 'R')[0], n).toBeGreaterThan(mid[0] - 0.5);
      expect(at(n, 'L')[0], n).toBeLessThan(mid[0] + 0.5);
    }
    // laterally: hypoglossal trigone, then vagal trigone, then the vestibular area beyond the sulcus limitans
    const off = (n: string) => (at(n, 'R')[0] - at(n, 'L')[0]) / 2;
    expect(off('Hypoglossal trigone')).toBeLessThan(off('Vagal trigone'));
    expect(off('Vagal trigone')).toBeLessThan(off('Vestibular area'));
    const obex = at('Obex', 'M');
    for (const n of ['Facial colliculus', 'Hypoglossal trigone', 'Vagal trigone']) expect(at(n, 'R')[2], n).toBeGreaterThan(obex[2]);
    const fcToObex = at('Facial colliculus', 'R')[2] - obex[2];
    expect(fcToObex).toBeGreaterThan(9); expect(fcToObex).toBeLessThan(20);     // 14.5 ± 1.7 mm in Erginoglu 2026
  });
});

describe('v3 surgical view: the pterional craniotomy and the template brain fitted into the CT', async () => {
  const { SbManifestSchema } = await import('../../src/data/schema');
  const { groups: G3, scene: S3, state: T3 } = await v3Modules();
  const v3 = SbManifestSchema.parse((await import('../../src/data/generated/sbv3-manifest.json')).default);
  const byId = new Map(v3.structures.map((s) => [s.id, s]));
  const geom = (await import('../../src/data/generated/sbv3-approaches.json')).default as unknown as Record<string, { bones: string[]; cutBones: string[]; removed: string; removedMl: number; side: string; burrHoles: number[][] }>;
  const brain = (await import('../../src/data/generated/sbv3-fit.json')).default.brain as unknown as {
    fit: Record<string, number>; clear: Record<string, Record<string, number>>; open: Record<string, number>; lift: Record<string, number>; lsoLift: Record<string, number>;
    interhemispheric: Record<string, number>; aca: { a3: string[]; thirdA2ToAcomMm: number | null };
    params: Record<string, number>; vesselsMovedMaxMm: Record<string, Record<string, { open: number; lift: number; lsoLift: number }>>; m1LengthMm: Record<string, number>;
  };
  it('cuts the right pterional flap out of the CT bone: each cut bone stands in for a whole one, a plausible volume removed', () => {
    const ap = geom.pterional;
    expect(ap.side).toBe('R');
    expect(ap.cutBones.map((id) => byId.get(id)!.name).sort()).toEqual(['Frontal bone', 'Parietal bone', 'Sphenoid bone', 'Temporal bone']);
    for (const id of ap.cutBones) expect(ap.bones).toContain(id);
    for (const id of ap.bones) expect(byId.has(byId.get(id)!.replaces!), id).toBe(true);
    expect(ap.removedMl).toBeGreaterThan(4);
    expect(ap.removedMl).toBeLessThan(30);
    // the burr holes on the right side of the skull, in front of the ear
    for (const p of ap.burrHoles) { expect(p[0]).toBeGreaterThan(20); expect(p[1]).toBeGreaterThan(-35); }
  });
  it('cuts a lateral supraorbital flap from the frontal bone only, and each surgical view draws only its own craniotomy', () => {
    const lso = geom.lso;
    expect(lso.side).toBe('R');
    expect(lso.cutBones.map((id) => byId.get(id)!.name)).toEqual(['Frontal bone']);
    // the whole bones next to it (across the coronal suture, the sphenoid ridge) are remeshed with it, not cut
    expect(lso.bones.map((id) => byId.get(id)!.name).sort()).toEqual(['Frontal bone', 'Parietal bone', 'Sphenoid bone']);
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
  it('draws the Sylvian veins by rule, with the brain\'s shapes, in the pterional and supraorbital views', () => {
    const names = ['Superficial middle cerebral vein', 'Insular veins', 'Deep middle cerebral vein'];
    const veins = names.map((n) => v3.structures.find((s) => s.name === n)!);
    for (const v of veins) {
      expect(v, 'drawn').toBeDefined();
      expect(v.category).toBe('vein');
      expect(v.schematic, v.name).toBe(true);        // drawn by rule: this angiogram labels none near the fissure
      expect(v.morph, v.name).toBe(true);            // they move with the opening and the lift
    }
    const pt = S3.skullPlan('transsylvian', null), pl = S3.skullPlan('lso', null);
    for (const v of veins) { expect(pt.looks.get(v.id), v.name).not.toBe('hidden'); expect(pl.looks.get(v.id), v.name).not.toBe('hidden'); }
    for (const n of ['Sphenoparietal sinus', 'Basal vein (of Rosenthal)']) expect(APPROACHES.find((a) => a.id === 'pterional')!.context).toContain(n);
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
    for (const s of v3.structures.filter((x) => x.category === 'brain' && !x.pushedFrom)) expect(p.looks.get(s.id), s.id).toBe('primary');
    expect(p.camera).toBe('pterional');
    // (a tumour's view is drawn in its approach's view: there, that approach's own parts)
    for (const g of G3.SB_GROUPS.filter((x) => x.kind !== 'approach' && !(x.kind === 'tumour' && x.approach))) {
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
    expect(p.camera).toBe('vertexFront');
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
  it('the cavernous sinus view: the sinus and its walls see-through, the ten triangles, the veins that join it', () => {
    const g = G3.SB_GROUP.get('cavernous')!;
    const names = g.structures.map((id) => v3.structures.find((s) => s.id === id)?.name);
    for (const n of ['Cavernous sinus', 'Walls of the cavernous sinus', 'Abducens nerve (VI)', 'Superior petrosal sinus', 'Basilar venous plexus']) expect(names, n).toContain(n);
    expect(v3.structures.filter((s) => s.category === 'triangle')).toHaveLength(10);
    for (const n of ['Cavernous sinus', 'Walls of the cavernous sinus']) {
      const id = v3.structures.find((s) => s.name === n)!.id;
      expect([...(g.ghost ?? []), ...(g.shell ?? [])], n).toContain(id);
    }
  });

  it('the endoscopic endonasal view: its group, with the carotids, the optic nerves and the sellar contents behind the walls', () => {
    const g = G3.SB_GROUP.get('endonasal')!;
    expect(g.endonasal).toBe(true);
    expect(g.kind).toBe('approach');
    const names = g.structures.map((id) => v3.structures.find((s) => s.id === id)?.name);
    for (const n of ['Internal carotid artery', 'Optic nerve (II)', 'Adenohypophysis (anterior lobe)', 'Neurohypophysis (posterior lobe)', 'Pituitary stalk', 'Cavernous sinus']) expect(names, n).toContain(n);
    // the hypophysis modelled in this CT's fossa replaces v2's fitted one in v3
    expect(v3.structures.some((s) => s.id === 'sb_adenohypophysis')).toBe(false);
  });

  it('the telovelar view: a midline suboccipital flap, the posterior fossa fitted around this patient\'s arteries, the tonsils drawn apart and the vermis lifted', async () => {
    const so = geom.suboccipital;
    expect(so.side).toBe('M');
    expect(so.bones.map((id) => byId.get(id)!.name)).toEqual(['Occipital bone']);
    const p = S3.skullPlan('telovelar', null);
    expect(p.camera).toBe('suboccipital');
    expect(G3.SB_GROUP.get('telovelar')!.hemi).toBe('both');
    const pf = v3.structures.filter((x) => (x.category === 'hindbrain' || x.category === 'ventricle') && !x.pushedFrom);
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
    expect(p.camera).toBe('retrosigmoidLateral');
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
    expect(pf.retrosigmoid.inCorridor.moved).toBeLessThanOrEqual(0.02 * pf.retrosigmoid.inCorridor.rest);   // ... and clears them drawn back
    expect(T3.decodeSkull('#/atlas?g=retrosigmoid&rs=60&tv=40').morphs).toEqual({ retrosigmoid: 0.6 });
  });
  it('the trigeminal complex on this CT: the ganglion between the foramina, the root from the side of the pons, roughly mirror images', async () => {
    const tg = (await import('../../src/data/generated/sbv3-fit.json')).default as unknown as {
      trigeminal: Record<string, { meckel: number[]; spanMm: number; movedFromFittedMm: number }>; pfossa: { trigeminalRoots: Record<string, number[]> } };
    const ganglion = v3.structures.find((x) => x.name === 'Trigeminal ganglion')!;
    expect(ganglion).toBeTruthy();
    expect(ganglion.refIds).toContain('chaware2023');
    const lms = (await import('../../src/data/generated/sbv3-landmarks.json')).default as { name: string; side: string; ras: number[] }[];
    const lm = (n: string, side: string) => lms.find((l) => l.name === n && l.side === side)!.ras;
    for (const side of ['R', 'L']) {
      const m = lm("Meckel's cave", side), ov = lm('Foramen ovale', side), sof = lm('Superior orbital fissure', side);
      expect(m, side).toEqual(tg.trigeminal[side].meckel.map((v) => expect.closeTo(v, 0)));
      // behind the foramen ovale and the superior orbital fissure, medial of the foramen ovale (Meckel's cave)
      expect(m[1], side).toBeLessThan(sof[1]);
      expect(Math.abs(m[0]), side).toBeLessThan(Math.abs(ov[0]));
      expect(tg.trigeminal[side].spanMm, side).toBeGreaterThan(10);
      expect(tg.trigeminal[side].spanMm, side).toBeLessThan(25);
      const root = tg.pfossa.trigeminalRoots[side];
      expect(Math.abs(root[0]), side).toBeGreaterThan(8);                     // the side of the pons, not its midline
      expect(m[1] - root[1], side).toBeGreaterThan(15);                       // the root runs forwards to the ganglion
    }
    const [r, l] = ['R', 'L'].map((sd) => lm("Meckel's cave", sd));
    expect(Math.abs(r[0] + l[0])).toBeLessThan(4);
    expect(Math.abs(r[1] - l[1])).toBeLessThan(4);
    // the superior cerebellar artery beyond the angiogram's label: the fitted model's course, marked fitted
    const sca = v3.structures.find((x) => x.name === 'Superior cerebellar artery (fitted course)')!;
    expect(sca.fitted).toBe(true);
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
  it('v1’s cerebellar arteries lie on the cerebellum, not inside it, at rest and in every shape', async () => {
    // (half of the PICA ran inside Z-Anatomy's lobules, up to 4.7 mm deep: the step's fill took an open lobule for a shell)
    const pf = ((await import('../../src/data/generated/sb-v1fit.json')).default as unknown as { pfossa: {
      arteriesInHindbrain: Record<string, Record<string, Record<string, [number, number]>>> } }).pfossa;
    const arts = Object.keys(pf.arteriesInHindbrain);
    expect(arts.sort()).toEqual(['Anterior inferior cerebellar artery', 'Posterior inferior cerebellar artery', 'Superior cerebellar artery']);
    for (const [a, sides] of Object.entries(pf.arteriesInHindbrain)) {
      for (const [sd, poses] of Object.entries(sides)) {
        expect(Object.keys(poses).sort(), `${a} ${sd}`).toEqual(['farLateral', 'farLateralBack', 'rest', 'retrosigmoid', 'telovelar']);
        for (const [pose, [share, deepest]] of Object.entries(poses)) {
          expect(share, `${a} ${sd} ${pose}: share of the tube inside`).toBeLessThan(0.03);
          expect(deepest, `${a} ${sd} ${pose}: deepest`).toBeLessThan(1.0);
        }
      }
    }
  });
  it('v1’s far lateral shapes: the tonsil lifted, the medulla opened, no more of the cerebellum in bone than at rest', async () => {
    type Fl = { inBoneAfter: number; inVesselAfter: number; maxMovedMm: number };
    const pf = ((await import('../../src/data/generated/sb-v1fit.json')).default as unknown as { pfossa: {
      clear: { inBoneAfter: number; inVesselAfter: number };
      farLateral: Fl & { tonsilLowestZMm: { rest: number; lifted: number } };
      farLateralBack: Fl & { tonsilFrontYMm: { rest: number; back: number }; medullaGapMm: { rest: number; back: number } } } }).pfossa;
    // (Z-Anatomy's cerebellum keeps a few vertices in its bone at rest; the shapes add none)
    for (const s of [pf.farLateral, pf.farLateralBack]) {
      expect(s.inBoneAfter).toBeLessThanOrEqual(pf.clear.inBoneAfter);
      expect(s.inVesselAfter).toBeLessThanOrEqual(pf.clear.inVesselAfter);
      expect(s.maxMovedMm).toBeLessThan(12);
    }
    expect(pf.farLateral.tonsilLowestZMm.lifted - pf.farLateral.tonsilLowestZMm.rest).toBeGreaterThan(5);
    expect(pf.farLateralBack.tonsilFrontYMm.rest - pf.farLateralBack.tonsilFrontYMm.back).toBeGreaterThan(5);
    expect(pf.farLateralBack.medullaGapMm.back).toBeGreaterThan(pf.farLateralBack.medullaGapMm.rest + 3);
  });
  it('the far lateral view: the right tonsil and biventral lobule lifted superomedially, the PICA with them', async () => {
    const g = G3.SB_GROUP.get('far_lateral')!;
    expect(g.morphs).toEqual(['farLateral', 'farLateralBack']);
    expect(g.morphDefault).toEqual({ farLateral: 1 });                 // the second, a view aid, opens at 0
    expect(G3.SB_GROUP.get('meningioma_foramen_magnum')!.morphDefault).toEqual({ farLateral: 1 });   // its tumour opens so too
    // v1: the same shapes, built on Z-Anatomy's cerebellum (skullbase_v1_pfossa.py)
    const v1 = SB_GROUPS.find((x) => x.id === 'far_lateral')!;
    expect(v1.morphs).toEqual(['farLateral', 'farLateralBack']);
    expect(v1.morphDefault).toEqual({ farLateral: 1 });
    for (const id of ['pf_tonsil', 'pf_cerebellar_hemisphere', 'pf_vermis']) {
      const m = await nodeMorphs(SB_MANIFEST.structures.find((x) => x.id === id)!.file);
      expect(Object.keys(m.R ?? m[Object.keys(m)[0]]), id).toEqual(expect.arrayContaining(['farLateral', 'farLateralBack']));
    }
    expect(T3.decodeSkull('#/atlas?g=far_lateral&fl=40&rs=60').morphs).toEqual({ farLateral: 0.4 });
    const both = T3.decodeSkull('#/atlas?g=far_lateral&fl=40&fb=70');   // the two together
    expect(both.morphs).toEqual({ farLateral: 0.4, farLateralBack: 0.7 });
    expect(T3.encodeSkull(both)).toContain('fb=70');
    const pf = ((await import('../../src/data/generated/sbv3-fit.json')).default as unknown as { pfossa: {
      farLateral: { maxMovedMm: number; inBoneAfter: number; inVesselAfter: number; tonsilLowestZMm: { rest: number; lifted: number }; vertebralGapMm: { rest: number; lifted: number } };
      farLateralBack: { maxMovedMm: number; inBoneAfter: number; inVesselAfter: number; tonsilFrontYMm: { rest: number; back: number }; medullaGapMm: { rest: number; back: number } };
      params: Record<string, number> } }).pfossa;
    const { flMm, flMedial, flReachMm } = pf.params;
    expect(flMm * Math.hypot(1, flMedial) / flReachMm).toBeLessThan(1);          // cannot fold the cerebellum
    expect(pf.farLateral.inBoneAfter).toBe(0);
    expect(pf.farLateral.inVesselAfter).toBe(0);
    const rise = pf.farLateral.tonsilLowestZMm.lifted - pf.farLateral.tonsilLowestZMm.rest;
    expect(rise).toBeGreaterThan(0.5 * flMm);                                       // the tonsil rises about as far as the rule says ...
    expect(rise).toBeLessThan(flMm + 1.5);                                          // ... and no further
    expect(pf.farLateral.vertebralGapMm.lifted).toBeGreaterThan(pf.farLateral.vertebralGapMm.rest);   // off the vertebral artery
    // the second shape: the same parts straight back, cut short at the bone, never further than the rule
    const fb = pf.farLateralBack, { flBackMm } = pf.params;
    expect((flMm * Math.hypot(1, flMedial) + flBackMm) / flReachMm).toBeLessThan(1);   // the two together cannot fold it
    expect(fb.inBoneAfter).toBe(0);
    expect(fb.inVesselAfter).toBe(0);
    expect(fb.maxMovedMm).toBeLessThan(flBackMm + 1.5);
    const back = fb.tonsilFrontYMm.rest - fb.tonsilFrontYMm.back;
    expect(back).toBeGreaterThan(0.5 * flBackMm);
    expect(back).toBeLessThan(flBackMm + 1.5);
    expect(fb.medullaGapMm.back).toBeGreaterThan(fb.medullaGapMm.rest);              // off the medulla
    // the shipped right tonsil goes up and in; the left stays
    const tonsil = await nodeMorphs('assets/skullbase-v3/pf_tonsil.glb');
    expect(tonsil.R.farLateral.max).toBeGreaterThan(flMm - 0.5);
    expect(tonsil.R.farLateral.max).toBeLessThan(flMm * Math.hypot(1, flMedial) + 1.5);
    expect(tonsil.R.farLateral.mean[2]).toBeGreaterThan(0);
    expect(tonsil.R.farLateral.mean[0]).toBeLessThan(0);
    expect(tonsil.L.farLateral.max).toBeLessThan(0.2);
    expect(tonsil.R.farLateralBack.mean[1]).toBeLessThan(0);                        // back
    expect(tonsil.L.farLateralBack.max).toBeLessThan(0.2);
    // the PICA's fitted course lying on it is carried with it; the left one stays
    const pica = await nodeMorphs('assets/skullbase-v3/tb_posterior_inferior_cerebellar_artery_fitted_course.cleared.glb');
    expect(pica.R.farLateral.max).toBeGreaterThan(flMm - 0.5);
    expect(pica.R.farLateral.mean[2]).toBeGreaterThan(0);
    expect(pica.L.farLateral.max).toBeLessThan(0.2);
    expect(pica.R.farLateralBack.max).toBeGreaterThan(1);
  });
  it('the pterional and orbitozygomatic views: an anterior clinoidectomy switch, off by default, taking the clinoid process\'s own piece', async () => {
    for (const id of ['transsylvian', 'orbitozygomatic']) {
      const g = G3.SB_GROUP.get(id)!;
      expect(g.morphs, id).toContain('clinoid');
      expect(g.morphDefault?.clinoid, id).toBeUndefined();
      const piece = v3.structures.find((s) => s.id === `sb_appr_${g.approach}__clinoid`)!;
      expect(piece, id).toBeTruthy();
      expect(piece.clinoid).toBe(true);
      expect(piece.type).toBe('bone');
      expect(g.structures).toContain(piece.id);
      // drawn as bone until the switch takes it, then as the bone removed is
      expect(S3.skullPlan(id, null).looks.get(piece.id)).toBe('primary');
      expect(S3.skullPlan(id, null, [], true).looks.get(piece.id)).toBe('ghost');
      expect(T3.decodeSkull(`#/atlas?g=${id}`).morphs.clinoid).toBeUndefined();
      const on = T3.decodeSkull(`#/atlas?g=${id}&ac=100`);
      expect(on.morphs.clinoid).toBe(1);
      expect(T3.encodeSkull(on)).toContain('ac=100');
      // the sphenoid ridge: drilled as the view opens (its own piece drawn as the bone removed), intact by link or switch
      const ridge = v3.structures.find((s) => s.id === `sb_appr_${g.approach}__ridge`)!;
      expect(ridge, id).toBeTruthy();
      expect(ridge.ridge).toBe(true);
      expect(g.structures).toContain(ridge.id);
      expect(g.morphDefault?.ridge, id).toBe(1);
      expect(T3.decodeSkull(`#/atlas?g=${id}`).morphs.ridge).toBe(1);
      expect(S3.skullPlan(id, null).looks.get(ridge.id)).toBe('ghost');
      expect(S3.skullPlan(id, null, [], false, false).looks.get(ridge.id)).toBe('primary');
      const intact = T3.decodeSkull(`#/atlas?g=${id}&sr=0`);
      expect(intact.morphs.ridge ?? 0).toBe(0);
      expect(T3.encodeSkull(intact)).toContain('sr=0');
      expect(S3.skullScene.plan(intact).looks.get(ridge.id)).toBe('primary');
    }
    const geom = (await import('../../src/data/generated/sbv3-approaches.json')).default as unknown as Record<string, { clinoid?: string; clinoidMl?: number; ridgeMl?: number; how: string }>;
    for (const a of ['pterional', 'orbitozygomatic']) {
      expect(geom[a].clinoidMl, a).toBeGreaterThan(0.05);      // the size of a clinoid process, not more
      expect(geom[a].clinoidMl, a).toBeLessThan(2);
      expect(geom[a].how, a).toContain(`(${geom[a].clinoidMl!.toFixed(1)} ml, drawn by rule)`);
      expect(geom[a].ridgeMl, a).toBeGreaterThan(0.2);
      expect(geom[a].how, a).toContain(`the ridge intact (${geom[a].ridgeMl!.toFixed(1)} ml)`);
    }
  });
  it('a surgical view opens with its shapes full on, and a link that closes one keeps it closed', () => {
    const views = G3.SB_GROUPS.filter((g) => g.kind === 'approach' && g.morphs?.length);
    expect(views.map((g) => g.id).sort()).toEqual(['far_lateral', 'interhemispheric', 'lso', 'orbitozygomatic', 'retrosigmoid', 'subtemporal', 'telovelar', 'transsylvian', 'trigeminal_mvd']);
    for (const g of views) {
      // every shape full on, but the far lateral view's second one (a view aid) and the clinoidectomy switch, which open at 0
      expect(g.morphDefault, g.id).toEqual(Object.fromEntries(g.morphs!.filter((m) => m !== 'farLateralBack' && m !== 'clinoid').map((m) => [m, 1])));
      expect(T3.decodeSkull(`#/atlas?g=${g.id}`).morphs, g.id).toEqual(g.morphDefault);
    }
    const closed = T3.decodeSkull('#/atlas?g=transsylvian&op=0&lf=0');
    expect(closed.morphs).toEqual({ ridge: 1 });               // (the ridge's switch, not in the link, stays as the view opens)
    expect(T3.encodeSkull(closed)).toContain('op=0');
    expect(T3.decodeSkull(T3.encodeSkull(closed)).morphs).toEqual({ ridge: 1 });
  });
  it('the cameras: v3\'s surgical views their own directions (the telovelar view its earlier one), the tumours of a view framed alike', async () => {
    const cam = Object.fromEntries(G3.SB_GROUPS.filter((g) => g.kind === 'approach').map((g) => [g.id, g.camera]));
    expect(cam).toMatchObject({ transsylvian: 'pterional', orbitozygomatic: 'orbitozygomaticFront', interhemispheric: 'vertexFront',
      retrosigmoid: 'retrosigmoidLateral', far_lateral: 'farLateralLow', telovelar: 'suboccipital', subtemporal: 'subtemporalLow',
      trigeminal_mvd: 'aim', trigeminal_percutaneous: 'aim' });
    // the trigeminal neuralgia views' cameras are where the pipeline measured them (sbv3-trigeminal.json), passed on in the plan
    const tn = (await import('../../src/data/generated/sbv3-trigeminal.json')).default as unknown as { mvd: { camera: { position: number[]; target: number[] } }; needle: { views: { overview: { position: number[]; target: number[] } } } };
    expect(G3.SB_GROUP.get('trigeminal_mvd')!.aim).toEqual(tn.mvd.camera);
    expect(G3.SB_GROUP.get('trigeminal_percutaneous')!.aim).toEqual(tn.needle.views.overview);
    expect(S3.skullPlan('trigeminal_mvd', null).aim).toEqual(tn.mvd.camera);
    expect(S3.skullPlan('trigeminal_percutaneous', null).drawn).toEqual([{ id: 'tn_needle', name: 'Needle path (drawn by rule)' }]);
    expect(S3.skullPlan('retrosigmoid', null).aim).toBeUndefined();
    // v1 (this file's default model) opens its views as v3 does, except the retrosigmoid: on Z-Anatomy's skull v3's view
    // from below meets the mastoid, so it keeps its level one
    expect(Object.fromEntries(SB_GROUPS.filter((g) => g.kind === 'approach').map((g) => [g.id, g.camera]))).toMatchObject({
      transsylvian: 'pterional', orbitozygomatic: 'orbitozygomaticFront', interhemispheric: 'vertexFront', retrosigmoid: 'retrosigmoidLevel',
      far_lateral: 'farLateralLow', telovelar: 'suboccipital', subtemporal: 'subtemporalLow', trigeminal_percutaneous: 'aim' });
    // every tumour drawn in one view is framed on the same structures, so that going from one to another keeps the camera
    const tumours = G3.SB_GROUPS.filter((g) => g.tumour);
    const byView = new Map<string, typeof tumours>();
    for (const g of tumours) byView.set(g.approach ?? 'knosp', [...(byView.get(g.approach ?? 'knosp') ?? []), g]);
    expect(byView.get('retrosigmoid')!.map((g) => g.id)).toEqual(expect.arrayContaining(['koos_i', 'koos_iv', 'meningioma_petroclival']));
    for (const [view, gs] of byView) for (const g of gs) {
      expect(g.focusIds, `${view}: ${g.id}`).toEqual(gs[0].focusIds);
      expect(g.radius, `${view}: ${g.id}`).toBe(gs[0].radius);
      expect(g.camera, `${view}: ${g.id}`).toBe(gs[0].camera);
    }
  });
  it('sourced content: references exist and are used, context structures exist', async () => {
    const { TUMOURS } = await import('../../src/skullbase/tumours');
    const tumourClaims = TUMOURS.flatMap((t) => [...t.sections.flatMap((x) => x.claims), ...t.grades.flatMap((g) => [g.definition, ...(g.notes ?? [])])]);
    const used = new Set([...[...APPROACHES, ENDONASAL_INFO, CAVERNOUS_INFO, { sections: PERC_SECTIONS }].flatMap((a) => a.sections.flatMap((x) => x.claims)), ...tumourClaims].flatMap((c) => c.refIds));
    for (const r of used) expect(APPROACH_REF.has(r), r).toBe(true);
    expect(APPROACH_REFS.map((r) => r.id).filter((r) => !used.has(r))).toEqual([]);
    for (const a of APPROACHES) for (const n of a.context) expect(v3.structures.some((s) => s.name === n), n).toBe(true);
  });
  // audit AP-08 (the owner's choices of 17 November 2026): what a view's text names and its opening reaches is drawn in it
  it('AP-08: the views draw what their texts name beyond the opening, on both models', () => {
    const BEYOND = ['Optic chiasm', 'Pituitary stalk', 'Anterior communicating artery', 'Posterior communicating artery', 'Basilar artery'];
    const ORBITOZYGOMATIC_ONLY = ['Posterior cerebral artery (P1–P2)', 'Superior cerebellar artery', 'Trochlear nerve (IV)'];
    const want: Record<string, string[]> = {
      transsylvian: [...BEYOND, 'Olfactory nerve (I)'],
      lso: [...BEYOND, 'Olfactory nerve (I)'],
      orbitozygomatic: [...BEYOND, ...ORBITOZYGOMATIC_ONLY],
      retrosigmoid: ['Hypoglossal nerve (XII)', 'Superior petrosal sinus', 'Trochlear nerve (IV)'],
      kawase: ['Oculomotor nerve (III)', 'Trochlear nerve (IV)'],
      far_lateral: ['Anterior spinal artery'],
    };
    // v3: each is in the view's list and not hidden in its plan
    for (const [view, names] of Object.entries(want)) {
      const g = G3.SB_GROUP.get(view)!, plan = S3.skullPlan(view, null);
      for (const n of names) {
        const st = v3.structures.find((x) => x.name === n && !x.pushedFrom);
        expect(st, `${view}: ${n}`).toBeDefined();
        expect(g.structures, `${view}: ${n}`).toContain(st!.id);
        expect(plan.looks.get(st!.id), `${view}: ${n}`).not.toBe('hidden');
      }
    }
    // P1 and the superior cerebellar artery are not in the pterional and supraorbital views (5 and 2 % of P1 reachable)
    for (const view of ['transsylvian', 'lso']) for (const n of ['Posterior cerebral artery (P1–P2)', 'Superior cerebellar artery'])
      expect(G3.SB_GROUP.get(view)!.structures, `${view}: ${n}`).not.toContain(v3.structures.find((x) => x.name === n)!.id);
    // v1 (Z-Anatomy): the same under its own names; it draws the posterior cerebral artery whole (its pituitary stalk is
    // the narrow upper part of its two lobes, named apart by skullbase_v1_stalk.py)
    const own: Record<string, string | null> = { 'Posterior cerebral artery (P1–P2)': 'Posterior cerebral artery' };
    expect(SB_MANIFEST.structures.filter((x) => x.name === 'Pituitary stalk')).toHaveLength(1);
    for (const [view, names] of Object.entries(want)) {
      const g = SB_GROUPS.find((x) => x.id === view)!, plan = skullPlan(view, null);
      for (const n of names) {
        const name = n in own ? own[n] : n;
        if (name === null) continue;
        const st = SB_MANIFEST.structures.find((x) => x.name === name && !x.pushedFrom);
        expect(st, `v1 ${view}: ${name}`).toBeDefined();
        expect(g.structures, `v1 ${view}: ${name}`).toContain(st!.id);
        expect(plan.looks.get(st!.id), `v1 ${view}: ${name}`).not.toBe('hidden');
      }
    }
    // the three anterolateral summaries say they are there to find
    for (const id of ['pterional', 'lso', 'orbitozygomatic']) expect(APPROACHES.find((a) => a.id === id)!.summary, id).toMatch(/both communicating arteries.*the basilar artery.*turn the view to find them/);
  });
  // the owner's word of 17 November 2026, once the far lateral view drew it: the anterior spinal artery is cut where the
  // medulla is cut (the models draw no spinal cord, and it ran on past the medulla's end into empty space)
  it('AP-08: the anterior spinal artery ends where the drawn medulla ends, on both models', async () => {
    type Half = { pastMm: number; pastAfterMm: number; loops: number };
    type Cut = { cut: { point: number[]; normal: number[]; areaMm2: number; rmsMm: number }; L: Half; R: Half };
    const steps = (mods: unknown) => (mods as { steps: { step: string; metrics: Record<string, Cut> }[] }).steps;
    const v3Mods = (await import('../../src/data/generated/sbv3-modifications.json')).default;
    const named = (list: { name: string; file: string; derivation?: string; pushedFrom?: string }[], n: string) => list.find((x) => x.name === n && !x.pushedFrom)!;
    const cases: [string, Cut, typeof v3.structures, [number, number]][] = [
      ['v3', steps(v3Mods).find((x) => x.step === 'skullbase_v3_ends')!.metrics['Anterior spinal artery'], v3.structures, [5.8, 8.99]],
      ['v1', steps(sbModifications).find((x) => x.step === 'skullbase_v1_ends')!.metrics['Anterior spinal artery'], SB_MANIFEST.structures, [1.98, 1.98]],
    ];
    // the furthest a surface reaches past the cut's plane (mm; negative: it stops short of it)
    const past = (P: Float64Array, c: number[], n: number[]) => {
      let m = -Infinity;
      for (let i = 0; i < P.length; i += 3) m = Math.max(m, (P[i] - c[0]) * n[0] + (P[i + 1] - c[1]) * n[1] + (P[i + 2] - c[2]) * n[2]);
      return m;
    };
    for (const [model, cut, list, ran] of cases) {
      const artery = named(list, 'Anterior spinal artery'), medulla = named(list, 'Medulla oblongata');
      // the plane is the medulla's own cut end: a flat face of it, which nothing of the medulla passes
      expect(cut.cut.areaMm2, model).toBeGreaterThan(100);
      expect(cut.cut.rmsMm, model).toBeLessThan(0.2);
      expect(Math.abs(past((await meshSoup(medulla.file)).P, cut.cut.point, cut.cut.normal)), model).toBeLessThan(0.3);
      // the artery ran past it, and now reaches it and stops there (the shipped file's positions are stored to 0.02 mm)
      expect([cut.L.pastMm, cut.R.pastMm], model).toEqual(ran);
      expect([cut.L.pastAfterMm, cut.R.pastAfterMm, cut.L.loops, cut.R.loops], model).toEqual([0, 0, 1, 1]);
      expect(Math.abs(past((await meshSoup(artery.file)).P, cut.cut.point, cut.cut.normal)), model).toBeLessThan(0.05);
      expect(artery.derivation, model).toMatch(/Cut where the drawn medulla ends: it runs on down the spinal cord, which this model does not show/);
    }
    // the far lateral view says so on both models
    const { V1_TEXT } = await import('../../src/skullbase/approaches');
    for (const text of [APPROACHES.find((a) => a.id === 'far_lateral')!.notShown, V1_TEXT.far_lateral.notShown])
      expect(text).toMatch(/The spinal cord is not drawn either: the medulla is cut about a centimetre below the foramen magnum, and the anterior spinal artery is cut with it/);
  });
  // the roadmap's last surgical view (the owner's choices of 17 November 2026: a 5 x 5 cm flap over the zygomatic root
  // as Nakov 2017 has it, the temporal lobe's lift as a slider, both models)
  it('the subtemporal view: its flap over the zygomatic arch’s root, and a slider that lifts a copy of the temporal lobe, on both models', async () => {
    const v1Geom = (await import('../../src/data/generated/sb-approaches.json')).default as unknown as typeof geom;
    const models: [string, typeof geom, typeof v3.structures, { SB_GROUP: typeof G3.SB_GROUP }][] = [
      ['v3', geom, v3.structures, G3], ['v1', v1Geom, SB_MANIFEST.structures, { SB_GROUP: new Map(SB_GROUPS.map((g) => [g.id, g])) as typeof G3.SB_GROUP }]];
    for (const [model, ge, list, groups] of models) {
      const ap = ge.subtemporal as unknown as { how: string; removedMl: number; cutBones: string[]; burrHoles: number[][]; measured: Record<string, number> };
      const k = ap.measured;
      // the flap: 50 x 50 mm as drawn, a little less as cut (it keeps to the cavity's wall and the floor); nothing drilled.
      // (As cut it is measured on a 0.5 mm grid from the side: within 1 % of the drawing, 2514 mm² on v1)
      expect(k.flapMm2, model).toBe(2500);
      expect(k.sideMm2, model).toBeGreaterThan(2000);
      expect(k.sideMm2, model).toBeLessThanOrEqual(2525);
      expect(ap.removedMl, model).toBeGreaterThan(8);
      expect(ap.removedMl, model).toBeLessThan(13);
      expect(ap.how, model).toMatch(/Nakov 2017: 5 × 5 cm, below the superior temporal line and centred above the root of the zygoma/);
      expect(ap.how, model).toMatch(/The petrous apex is not drilled/);
      // the zygomatic arch's root as found on the skull: near the frame's origin front to back, its upper surface within
      // 3 mm of the middle fossa floor's level (Nakov 2017: level with it)
      expect(Math.abs(k.archRootY), model).toBeLessThan(5);
      expect(Math.abs(k.archTopZ - k.floorZ), model).toBeLessThan(3);
      // the bone removed lies over the root front to back, and above the floor's level
      const removed = list.find((x) => x.id === 'sb_appr_subtemporal__removed')!;
      const { P } = await meshSoup(removed.file);
      let y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (let i = 0; i < P.length; i += 3) { y0 = Math.min(y0, P[i + 1]); y1 = Math.max(y1, P[i + 1]); z0 = Math.min(z0, P[i + 2]); z1 = Math.max(z1, P[i + 2]); }
      // (its outline is centred on the root; the bone cut out of it ends 2 to 4 mm short of the outline in front, where
      // the squama is thin: a sliver there, 1.4 mm front to back, came and went with the skull's re-meshing, which moved
      // the middle of the piece from 1.5 to 2.2 mm behind the root on v3 at the same volume)
      expect(Math.abs((y0 + y1) / 2 - k.archRootY), model).toBeLessThan(3);
      // (the cut bone reaches a little past the 50 mm outline on v1, where the thin bone the flap leaves beside it goes with it)
      expect(y1 - y0, model).toBeGreaterThan(46);
      expect(y1 - y0, model).toBeLessThan(model === 'v1' ? 54 : 52);
      expect(z0, model).toBeGreaterThan(k.floorZ - 3);       // (flush with the floor, which under the flap lies a little below the tegmen's level)
      expect(z1, model).toBeLessThan(k.floorZ + (model === 'v1' ? 54 : 52));
      // the zygomatic bone stays whole: the view draws no cut copy of it
      expect(list.some((x) => x.id.startsWith('sb_appr_subtemporal__zygomatic')), model).toBe(false);
      // the slider: one shape, on a copy of the temporal lobe drawn in this view only; the right lobe lifted, straight
      // up, by the stated amount; the left one and everything else left alone
      const copy = list.find((x) => x.id === 'br_temporal_lobe__subtemporal')!;
      expect(copy, model).toMatchObject({ replaces: 'br_temporal_lobe', forView: 'subtemporal', morph: true });
      const shapes = await nodeMorphs(copy.file);
      expect(Object.keys(shapes.R), model).toEqual(['subtemporal']);
      expect(Object.keys(shapes.L ?? {}), model).toEqual([]);
      expect(shapes.R.subtemporal.max, model).toBeGreaterThan(k.liftMm - 0.3);
      expect(shapes.R.subtemporal.max, model).toBeLessThanOrEqual(k.liftMm + 0.05);
      expect(shapes.R.subtemporal.mean[2], model).toBeGreaterThan(1);
      expect(Math.abs(shapes.R.subtemporal.mean[0]) + Math.abs(shapes.R.subtemporal.mean[1]), model).toBeLessThan(0.05);
      expect([k.liftMm, k.liftSpanMm, k.liftFallMm, k.liftedMaxMm], model).toEqual([15, 16, 18, 15]);
      expect(k.liftMm / k.liftFallMm, model).toBeLessThan(1);          // (it cannot fold the lobe)
      // at rest the copy is the lobe itself
      const lobe = list.find((x) => x.id === 'br_temporal_lobe')!;
      const [a, b] = [await nodeMeans(copy.file), await nodeMeans(lobe.file)];
      for (const side of ['L', 'R']) for (let i = 0; i < 3; i++) expect(Math.abs(a[side][i] - b[side][i]), `${model} ${side}`).toBeLessThan(0.05);
      // the view: the copy in the lobe's place, one slider, open as the view opens, looking along the floor
      const g = groups.SB_GROUP.get('subtemporal')!;
      expect(g.structures, model).toContain(copy.id);
      expect(g.structures, model).not.toContain(lobe.id);
      expect(g.structures, model).toContain(removed.id);
      expect([g.morphs, g.morphDefault, g.camera, g.hemi], model).toEqual([['subtemporal'], { subtemporal: 1 }, 'subtemporalLow', 'R']);
    }
    // what it draws: v3 the vein of Labbé (drawn by rule) and no tentorium; v1 Z-Anatomy's tentorium, no vein, the insula left out
    const names3 = new Set(G3.SB_GROUP.get('subtemporal')!.structures.map((id) => v3.structures.find((x) => x.id === id)?.name));
    for (const n of ['Posterior cerebral artery (P1–P2)', 'Superior cerebellar artery', 'Basilar artery', 'Posterior communicating artery', 'Oculomotor nerve (III)',
      'Trochlear nerve (IV)', 'Midbrain', 'Pons', 'Inferior anastomotic vein (of Labbé)', 'Superior petrosal sinus']) expect(names3.has(n), n).toBe(true);
    expect(v3.structures.some((x) => x.name === 'Tentorium cerebelli')).toBe(false);
    const names1 = new Set(SB_GROUPS.find((x) => x.id === 'subtemporal')!.structures.map((id) => SB_MANIFEST.structures.find((x) => x.id === id)?.name));
    for (const n of ['Posterior cerebral artery', 'Superior cerebellar artery', 'Basilar artery', 'Oculomotor nerve (III)', 'Trochlear nerve (IV)', 'Midbrain', 'Pons',
      'Tentorium cerebelli']) expect(names1.has(n), `v1 ${n}`).toBe(true);
    expect(names1.has('Insula')).toBe(false);
    expect(SB_MANIFEST.structures.some((x) => /Labb/.test(x.name))).toBe(false);
    // its address: the slider's own parameter, kept in a link
    expect(T3.MORPH_PARAMS.subtemporal).toBe('st');
    const st = T3.defaultSkullState();
    st.grp = 'subtemporal';
    st.morphs = { subtemporal: 0.4 };
    expect(T3.encodeSkull(st)).toContain('st=40');
    expect(T3.decodeSkull(T3.encodeSkull(st)).morphs).toEqual({ subtemporal: 0.4 });
    // its text: every section sourced, the five new references among them
    const ap = APPROACHES.find((x) => x.id === 'subtemporal')!;
    expect(ap.sections.map((x) => x.title)).toEqual(['The craniotomy', 'Lifting the temporal lobe', 'The vein of Labbé', 'The tentorial edge and the nerves', 'What it reaches', 'Care points']);
    const cited = new Set(ap.sections.flatMap((x) => x.claims).flatMap((x) => x.refIds));
    expect([...cited].sort()).toEqual(['choquevelasquez2018st', 'li2022', 'minca2022', 'nakov2017', 'sanchezcorrea2019', 'signoretti2025']);
    for (const cl of ap.sections.flatMap((x) => x.claims)) expect(cl.refIds.length, cl.text).toBeGreaterThan(0);
    // a video article read in its abstract only says so
    for (const cl of ap.sections.flatMap((x) => x.claims).filter((x) => x.refIds.includes('choquevelasquez2018st'))) expect(cl.text).toMatch(/\((Checked against the abstract: a video article|Abstract)\.\)$/);
    expect(ap.notShown).toMatch(/the tentorium, which this model does not have/);
  });
});

describe('v1 tumours: the same rules on the Z-Anatomy model, as far as it has room', async () => {
  const { TUMOUR_FIT_V1: F } = await import('../../src/skullbase/tumours');
  const byId = new Map(SB_MANIFEST.structures.map((s) => [s.id, s]));
  it('Knosp 0 to 3A drawn and graded as meant; 3B and 4 not (its cavernous carotid lies in bone, below the sinus)', () => {
    expect(Object.keys(F.knosp.grades).sort()).toEqual(['0', '1', '2', '3A']);
    for (const [g, r] of Object.entries(F.knosp.grades)) expect(r.grade, g).toBe(g);
    expect(byId.has('tm_knosp_3b') || byId.has('tm_knosp_4')).toBe(false);
    const sec = F.knosp.sections.R;
    expect(sec.cavernous.c[1]).toBeLessThan(sec.supraclinoid.c[1]);
  });
  it('Koos by the drawing, and the meningiomas each reach the brain; every tumour on Z-Anatomy, drawn by rule', () => {
    expect(F.koos['2'].toBrainstemMm!).toBeGreaterThan(0);
    expect(F.koos['2'].extrameatalMaxMm!).toBeLessThan(20);
    expect(F.koos['3'].extrameatalMaxMm!).toBeLessThan(30);
    expect(F.koos['4'].extrameatalMaxMm!).toBeGreaterThan(30);
    for (const [site, r] of Object.entries(F.meningioma)) expect(r.push?.maxMovedMm ?? 0, site).toBeGreaterThan(0);
    for (const s of SB_MANIFEST.structures.filter((x) => x.category === 'tumour')) {
      expect(s.dataset, s.id).toBe('rule');
      expect(s.source, s.id).toBe('Drawn by rule on the Z-Anatomy model');
    }
  });
  it('a pushed or moved copy stands in for its part in its tumour view only', () => {
    const pushed = SB_MANIFEST.structures.filter((s) => s.pushedFrom && s.tumourView);
    expect(pushed.some((s) => s.name === 'Facial nerve (VII)')).toBe(true);
    for (const p of pushed) {
      expect(byId.has(p.replaces!), p.id).toBe(true);
      for (const g of SB_GROUPS) {
        if (!g.structures.includes(p.id)) continue;
        expect(g.kind, `${p.id} in ${g.id}`).toBe('tumour');
        expect(g.structures).not.toContain(p.replaces);
      }
    }
  });
});

describe('v3 tumours drawn by rule: Knosp, Koos and meningioma sites', async () => {
  const { SbManifestSchema } = await import('../../src/data/schema');
  const { groups: G3, scene: S3, state: T3 } = await v3Modules();
  const { TUMOURS, TUMOUR_FIT, KNOSP_GRADES, KOOS_GRADES } = await import('../../src/skullbase/tumours');
  const v3 = SbManifestSchema.parse((await import('../../src/data/generated/sbv3-manifest.json')).default);
  const byId = new Map(v3.structures.map((s) => [s.id, s]));
  it('every grade and site has its tumour and its view; each drawn adenoma grades as it is meant to', () => {
    for (const t of TUMOURS) for (const g of t.grades) {
      expect(byId.get(g.structure)?.category, g.structure).toBe('tumour');
      const grp = G3.SB_GROUP.get(`${t.family}_${g.id.toLowerCase()}`)!;
      expect(grp.kind).toBe('tumour');
      expect(grp.structures).toContain(g.structure);
    }
    expect(KNOSP_GRADES.map((g) => g.id)).toEqual(['0', '1', '2', '3A', '3B', '4']);
    expect(KOOS_GRADES.length).toBe(4);
    for (const g of KNOSP_GRADES) expect(TUMOUR_FIT.knosp.grades[g.id].grade, g.id).toBe(g.id);
    // the section lies through the sella, the cavernous carotid below the supraclinoid one
    const sec = TUMOUR_FIT.knosp.sections.R;
    expect(sec.cavernous.c[1]).toBeLessThan(sec.supraclinoid.c[1]);
    expect(Math.abs(TUMOUR_FIT.knosp.planeY)).toBeLessThan(6);
  });
  it('a pushed part stands in for its part in its tumour view only; the other views keep the part', () => {
    const pushed = v3.structures.filter((s) => s.pushedFrom && s.tumourView);
    expect(pushed.length).toBeGreaterThan(5);
    for (const p of pushed) {
      expect(byId.has(p.replaces!), p.id).toBe(true);
      for (const g of G3.SB_GROUPS) {
        if (!g.structures.includes(p.id)) continue;
        expect(g.kind, `${p.id} in ${g.id}`).toBe('tumour');
        expect(g.structures).not.toContain(p.replaces);
      }
    }
    const rs = G3.SB_GROUP.get('retrosigmoid')!;
    expect(rs.structures.some((id) => byId.get(id)?.pushedFrom)).toBe(false);
    const plan = S3.skullPlan('koos_iv', null);
    expect(plan.looks.get('tm_koos_4')).toBe('primary');
    // the part is drawn on the left only, beside its moved copy, which holds the right half (the audit's MC-18: Side = Both
    // had no left cerebellum)
    expect(plan.looks.get('pf_cerebellar_hemisphere')).toBe(plan.looks.get('pf_cerebellar_hemisphere__koos_4'));
    expect(plan.onlySide?.get('pf_cerebellar_hemisphere')).toBe('L');
    expect(plan.onlySide?.has('pf_cerebellar_hemisphere__koos_4')).toBe(false);
    for (const g of G3.SB_GROUPS.filter((x) => x.kind === 'tumour' && x.keepLeft?.length)) {
      const p = S3.skullPlan(g.id, null);
      for (const [part, copy] of g.keepLeft!) if (p.looks.get(copy) !== 'hidden') expect(p.onlySide?.get(part), `${g.id} ${part}`).toBe('L');
    }
    // a copy that holds both halves (an artery a midline tumour reaches on both sides: copySides) stands in for the
    // whole part, whose left half is not drawn beside it (the audit's MB-09)
    const both = v3.structures.filter((s) => s.copySides?.includes('L'));
    const shown = G3.SB_GROUPS.filter((g) => g.kind === 'tumour' && both.some((c) => g.structures.includes(c.id)));
    expect(shown.length).toBeGreaterThan(0);
    for (const g of shown) {
      const p = S3.skullPlan(g.id, null);
      for (const c of both.filter((c) => g.structures.includes(c.id))) {
        expect(g.keepLeft?.some(([, copy]) => copy === c.id), `${g.id} ${c.id}`).toBe(false);
        expect(p.looks.get(c.replaces!), `${g.id} ${c.replaces}`).toBe('hidden');
        expect(p.onlySide?.has(c.replaces!)).toBe(false);
      }
    }
  });
  it('Koos grades by the drawing: II off the brainstem and under 2 cm outside the meatus, IV over 3 cm', () => {
    expect(TUMOUR_FIT.koos['2'].toBrainstemMm!).toBeGreaterThan(0);
    expect(TUMOUR_FIT.koos['2'].extrameatalMaxMm!).toBeLessThan(20);
    expect(TUMOUR_FIT.koos['3'].extrameatalMaxMm!).toBeLessThan(30);
    expect(TUMOUR_FIT.koos['4'].extrameatalMaxMm!).toBeGreaterThan(30);
    expect(TUMOUR_FIT.koos['4'].toBrainstemMm!).toBeLessThan(0);
  });
  it('each tumour card quotes the drawing the Grading page measures (one run of the tumours on each model)', async () => {
    // (the tumour step drew a different Koos II on each run, 8 or 9 mm, until its surface samples were seeded: the card
    // and the report must come from the same run)
    const { TUMOUR_FIT_V1, TUMOUR_FIT_V3 } = await import('../../src/skullbase/tumours');
    for (const [model, structures, fit] of [['v3', v3.structures, TUMOUR_FIT_V3], ['v1', SB_MANIFEST.structures, TUMOUR_FIT_V1]] as const) {
      const card = new Map(structures.map((s) => [s.id, s.derivation ?? '']));
      const ml = (id: string) => Number(/([\d.]+) ml\.$/.exec(card.get(id) ?? '')?.[1]);
      for (const [g, r] of Object.entries(fit.koos)) expect(ml(`tm_koos_${g}`), `${model} Koos ${g}`).toBe(r.ml);
      for (const [g, r] of Object.entries(fit.knosp.grades)) expect(ml(`tm_knosp_${g.toLowerCase()}`), `${model} Knosp ${g}`).toBe(r.ml);
      for (const [site, r] of Object.entries(fit.meningioma)) expect(ml(`tm_men_${site}`), `${model} ${site}`).toBe(r.ml);
      expect(card.get('tm_koos_2'), model).toContain(`${fit.koos['2'].diameterMm} mm across`);
    }
  });
  it('every tumour is a closed surface on both models: no edge of the grid it is drawn on cuts it open', async () => {
    // (v1's Koos IV reached past its grid's lateral edge and was shipped open there, a hole 16 x 25 mm; a tumour across
    // the midline is split into its left and right halves there, so an open edge within 0.25 mm of it is allowed)
    for (const [model, structures] of [['v3', v3.structures], ['v1', SB_MANIFEST.structures]] as const) {
      for (const s of structures.filter((x) => x.category === 'tumour')) {
        const { P, T } = await meshSoup(s.file);
        const key = (i: number) => `${P[3 * i].toFixed(3)},${P[3 * i + 1].toFixed(3)},${P[3 * i + 2].toFixed(3)}`;
        const at = new Map<string, number>();
        const v = Array.from({ length: P.length / 3 }, (_, i) => { const k = key(i); if (!at.has(k)) at.set(k, at.size); return at.get(k)!; });
        const uses = new Map<string, { n: number; a: number; b: number }>();
        for (let t = 0; t < T.length; t += 3) {
          for (const [a, b] of [[T[t], T[t + 1]], [T[t + 1], T[t + 2]], [T[t + 2], T[t]]]) {
            const e = v[a] < v[b] ? `${v[a]} ${v[b]}` : `${v[b]} ${v[a]}`;
            const u = uses.get(e) ?? { n: 0, a, b };
            u.n++;
            uses.set(e, u);
          }
        }
        const open = [...uses.values()].filter((u) => u.n !== 2 && !(Math.abs(P[3 * u.a]) < 0.25 && Math.abs(P[3 * u.b]) < 0.25));
        expect(open.length, `${model} ${s.id}: edges off the midline not shared by two triangles`).toBe(0);
      }
    }
  }, 60_000);
  it('the Knosp view is cut at its section while the reader keeps it; tumour views open onto the tumour', () => {
    const s = T3.decodeSkull('#/atlas?g=knosp_3b');
    expect(s.section).toBe(true);
    expect(T3.encodeSkull({ ...s, section: false })).toContain('sec=0');
    expect(T3.decodeSkull('#/atlas?g=knosp_3b&sec=0').section).toBe(false);
    const k = T3.decodeSkull('#/atlas?g=koos_iii');
    expect(k.morphs.retrosigmoid).toBe(1);                       // retracted by default ...
    expect(T3.decodeSkull(T3.encodeSkull({ ...k, morphs: {} })).morphs.retrosigmoid).toBeUndefined();   // ... and closed if the link says so
  });
});

describe('v3 anterior petrosectomy (Kawase)', async () => {
  const { SbManifestSchema } = await import('../../src/data/schema');
  const { groups: G3, scene: S3 } = await v3Modules();
  const v3 = SbManifestSchema.parse((await import('../../src/data/generated/sbv3-manifest.json')).default);
  const geom = (await import('../../src/data/generated/sbv3-approaches.json')).default as unknown as Record<string, { removed: string; guides?: string[]; measured?: Record<string, number> }>;
  it('drills the petrous apex within the rhomboid, draws the rhomboid, and lifts the temporal lobe in its view only', () => {
    const k = geom.kawase;
    expect(k.measured!.drilledMl).toBeGreaterThan(0.5);
    expect(k.measured!.drilledMl).toBeLessThan(4);        // (Signoretti 2025: 2.83 ± 0.28 cm³)
    const g = G3.SB_GROUP.get('kawase')!;
    expect(g.structures).toContain(k.guides![0]);
    expect(g.structures).toContain('br_temporal_lobe__kawase');
    expect(g.structures).not.toContain('br_temporal_lobe');
    const plan = S3.skullPlan('kawase', null);
    expect(plan.looks.get('br_temporal_lobe')).toBe('hidden');
    expect(plan.looks.get(k.guides![0])).toBe('primary');
    // elsewhere the lobe is the fitted one
    expect(G3.SB_GROUP.get('transsylvian')!.structures).toContain('br_temporal_lobe');
    expect(v3.structures.find((s) => s.id === 'br_temporal_lobe__kawase')?.forView).toBe('kawase');
  });
});

describe('what passes through a foramen (review C11)', async () => {
  const { PASSAGES, FORAMEN_REF } = await import('../../src/skullbase/foramina');
  it('the foramen ovale lists V3, the accessory meningeal artery, the lesser petrosal nerve (variable) and the emissary vein, each sourced', () => {
    const ov = PASSAGES['Foramen ovale'];
    expect(ov.map((p) => p.structure)).toEqual(['Mandibular nerve (V3)', 'Accessory meningeal artery', 'Lesser petrosal nerve', 'Emissary vein']);
    expect(ov.find((p) => p.structure === 'Lesser petrosal nerve')!.passage).toBe('variable');
    for (const p of ov) for (const r of p.refIds) expect(FORAMEN_REF.has(r), r).toBe(true);
    // a structure the model draws is named by the model's own name
    for (const p of ov) for (const n of p.model) expect(SB_MANIFEST.structures.some((s) => s.name === n), n).toBe(true);
  });
});

describe('the site audit’s B5: the skull base texts against their sources', async () => {
  const { MENINGIOMA_SITES, KOOS_GRADES, KNOSP_GRADES, KNOSP_GRADE_3, TUMOURS } = await import('../../src/skullbase/tumours');
  const { PASSAGES, FORAMEN_REFS } = await import('../../src/skullbase/foramina');
  const { DEFINITION_EDITS } = await import('../../src/skullbase');
  const raw = [
    (await import('../../src/data/generated/sb-definitions.json')).default,
    (await import('../../src/data/generated/sbct-definitions.json')).default,
    (await import('../../src/data/generated/sbv3-definitions.json')).default,
  ] as Record<string, { text: string }>[];
  it('meningioma shares carry their own denominator and source (C-001)', () => {
    for (const s of MENINGIOMA_SITES) {
      expect(s.share, s.id).toMatch(/of (all|all intracranial|posterior fossa) meningiomas$/);
      for (const r of s.shareRefs) expect(APPROACH_REF.has(r), r).toBe(true);
    }
    expect(MENINGIOMA_SITES.find((s) => s.id === 'petroclival')!.share).toBe('5–11 % of posterior fossa meningiomas');
    const defs = TUMOURS.find((t) => t.family === 'meningioma')!.grades.map((g) => g.definition.text);
    for (const d of defs) expect(d).not.toMatch(/of skull base meningiomas/);
  });
  it('Koos grades by the brainstem; Knosp with its original papers and the invasion found at surgery (C-005, C-006)', () => {
    expect(KOOS_GRADES.find((g) => g.id === 'II')!.definition).toMatch(/without contacting the brainstem/);
    for (const g of KOOS_GRADES) expect(g.definition, g.id).not.toMatch(/[<>] ?\d/);
    expect(KNOSP_GRADES.map((g) => g.invasion)).toEqual(['–', '1.5 %', '9.9 %', '26.5 %', '70.6 %', '100 %']);
    expect([KNOSP_GRADE_3.cure, KNOSP_GRADE_3.complications]).toEqual(['46.0 % (17/37)', '8.1 % (3/37)']);
    const kn = TUMOURS.find((t) => t.family === 'knosp')!.sections.flatMap((s) => s.claims);
    expect(kn.flatMap((c) => c.refIds)).toEqual(expect.arrayContaining(['knosp1993', 'micko2015']));
    // "3–4 invasive" is that cohort's threshold, not part of the scale
    expect(kn.find((c) => c.text.startsWith('Knosp 0'))!.text).not.toMatch(/invasive/);
    for (const r of ['knosp1993', 'micko2015', 'koos1998']) expect(APPROACH_REF.get(r)!.citation, r).toMatch(/abstract/);
  });
  it('the foramina: vessels and neuraxis beside the nerves, the jugular foramen’s compartments first, the carotid over the lacerum (C-003, C-004, C-010, C-011)', () => {
    expect(TB_NOTES['Foramen magnum'].map((c) => c.text).join(' ')).toMatch(/medulla oblongata, the vertebral arteries/);
    expect(TB_NOTES['Optic canal'].map((c) => c.text).join(' ')).toMatch(/ophthalmic artery/);
    expect(TB_NOTES['Hypoglossal canal'][0].refIds).toEqual(['kalthur2023']);
    expect(TB_NOTES['Jugular foramen'][0].refIds).toEqual(['katsuta1997']);
    expect(FORAMEN_CONTENTS['Jugular foramen'][0].refIds).toEqual(['katsuta1997']);
    expect(TB_NOTES['Foramen lacerum'].map((c) => c.text).join(' ')).toMatch(/not through it/);
    for (const g of SB_GROUPS) expect(JSON.stringify(g), g.id).not.toMatch(/through the carotid canal and foramen lacerum/);
    expect(FORAMEN_REFS.map((r) => r.id)).not.toContain('khairnar2013');
    for (const p of PASSAGES['Foramen ovale']) expect(p.refIds.length, p.structure).toBeGreaterThan(0);
  });
  it('two shipped definitions corrected in every model, the edit said on the card (C-009)', () => {
    // the words to replace are still in each model's generated file that has the structure (a rebuild would show here)
    for (const d of raw) for (const [name, e] of Object.entries(DEFINITION_EDITS)) if (d[name] && e.old) expect(d[name].text, name).toContain(e.old);
    expect(definitionFor('Facial nerve (VII)')!.text).not.toMatch(/labyrinthine segment\) is/);
    expect(definitionFor('Facial nerve (VII)')!.edited).toMatch(/segments of the nerve’s bony canal/);
    expect(definitionFor('Callosomarginal artery')).toBeNull();
  });
  it('approach texts as their papers report them (C-007, C-008)', () => {
    const all = APPROACHES.flatMap((a) => a.sections.flatMap((s) => s.claims)).concat(ENDONASAL_INFO.sections.flatMap((s) => s.claims));
    expect(all.find((c) => c.refIds.includes('mosteiro2026') && /bifurcation/.test(c.text))!.text).toMatch(/about the same through the LSO and the minipterional/);
    expect(all.find((c) => c.refIds.includes('nguyen2026') && /sphenoid sinus had a single natural ostium/.test(c.text))!.text).toMatch(/smaller, the authors note, than the 3–4 mm/);
  });
});

describe('skull-base definitions, cleaned (the audit’s C-016, C-017)', () => {
  it('no export artefacts are left, the sinus texts say what a sinus is, and the misspelt name is shown corrected', async () => {
    for (const model of ['zanatomy', 'ct', 'v3'] as const) {
      const index = model === 'zanatomy' ? await import('../../src/skullbase') : (await modelModules(model)).index;
      for (const [name, d] of Object.entries(index.DEFINITIONS)) {
        expect(d.text, `${model} ${name}`).not.toMatch(/ \(\)|\[\d+\]|\[Fig|\b(STRUCTURE|FUNCTION|SURFACES|CONTENTS)\b|beneath th |areas? (within the skull )?beneath the brain|sigmoid sinus vein/);
      }
      expect(index.DEFINITIONS['Supercilliary arch'], model).toBeUndefined();
    }
    const { tidyDefinition } = await import('../../src/skullbase');
    expect(tidyDefinition('of the temporal bone. STRUCTURE The opening')).toBe('of the temporal bone. The opening');
    expect(tidyDefinition('EXTERNAL SURFACE: The external surface [Fig. 1] is convex')).toBe('The external surface is convex');
    expect(tidyDefinition('the CSF flows. MRI shows')).toBe('the CSF flows. MRI shows');
  });
});
