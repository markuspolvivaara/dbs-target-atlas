import { describe, expect, it } from 'vitest';
import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { readFileSync } from 'node:fs';
import { crossCheckCtx, CTX_MANIFEST, FUNCTIONS, LABEL, LABELS, LOBE, LOBES, MEDIAL_WALL, shortName } from '../../src/cortex';
import { cortexPlan, cortexScene, viewLabels } from '../../src/cortex/scene';
import { decodeCortex, defaultCortexState, encodeCortex } from '../../src/cortex/state';
import { VIEW, VIEWS } from '../../src/cortex/views';
import { nodeMeans } from './glb';

const byShort = new Map(LABELS.map((l) => [l.short, l]));

describe('cortex data (Destrieux on the Lead-DBS template surface)', () => {
  it('generated files agree with each other', () => {
    expect(crossCheckCtx()).toEqual([]);
  });
  it('has the 74 Destrieux labels plus the medial wall and the 10 functional areas, each with its own file', () => {
    expect(LABELS.length).toBe(74);
    expect(FUNCTIONS.length).toBe(10);
    expect(CTX_MANIFEST.structures.length).toBe(85);
    expect(new Set(CTX_MANIFEST.structures.map((s) => s.file)).size).toBe(85);
    expect(CTX_MANIFEST.structures.find((s) => s.id === MEDIAL_WALL)).toBeTruthy();
  });
  it('keeps Destrieux Table 1 facts: names and the views each label is seen on', () => {
    expect(byShort.get('S_central')!.name).toBe('Central sulcus (Rolando’s fissure)');
    expect(byShort.get('S_central')!.views).toEqual(['S', 'A', 'L', 'P']);
    expect(byShort.get('G_insular_short')!.views).toEqual(['L']);
    expect(byShort.get('G_rectus')!.views).toContain('I');
    expect(shortName(byShort.get('G_front_middle')!.id)).toBe('Middle frontal gyrus');
  });
  it('measured lobes and borders agree with the labels’ names', () => {
    const lobes = (s: string) => byShort.get(s)!.lobes.map((x) => x.lobe);
    expect(lobes('G_precentral')).toContain('frontal');
    expect(lobes('G_postcentral')).toContain('parietal');
    expect(lobes('S_central')).toEqual(expect.arrayContaining(['frontal', 'parietal']));
    expect(byShort.get('G_and_S_cingul-Ant')!.lobe).toBe('cingulate');
    expect(byShort.get('G_and_S_cingul-Ant')!.lobeBy).toBe('name');
    const borders = byShort.get('S_central')!.borders.map((b) => b.id);
    expect(borders).toEqual(expect.arrayContaining([byShort.get('G_precentral')!.id, byShort.get('G_postcentral')!.id]));
    for (const lb of LOBES) expect(lb.labels.length, lb.id).toBeGreaterThan(0);
    expect(LOBE.get('insula')!.labels).toEqual(expect.arrayContaining(LABELS.filter((l) => l.insula).map((l) => l.id)));
  });
  it('relates the DBS section’s motor areas to the central region, not the occipital lobe', () => {
    const m1 = (s: string) => byShort.get(s)!.parcels.find((p) => p.id === 'm1')?.parcelInLabel ?? 0;
    expect(m1('S_central') + m1('G_precentral')).toBeGreaterThan(0.5);
    expect(m1('G_cuneus')).toBe(0);
  });
  it('anchors sit on their own hemisphere (within the template’s 2 mm midline overlap)', () => {
    for (const l of LABELS) {
      expect(l.anchor.L.pial[0], l.id).toBeLessThan(2.5);
      expect(l.anchor.R.pial[0], l.id).toBeGreaterThan(-2.5);
      expect(l.anchor.L.inflated[0], l.id).toBeLessThan(0);
      expect(l.anchor.R.inflated[0], l.id).toBeGreaterThan(0);
    }
  });
  it('shipped GLBs decode, keep their side, and carry the inflated morph target, shading and cut-away flag', async () => {
    const pc = LABEL.get(byShort.get('G_precentral')!.id)!;
    const means = await nodeMeans(`assets/cortex/${pc.id}.glb`);
    expect(means.L[0]).toBeLessThan(-20);
    expect(means.R[0]).toBeGreaterThan(20);
    await MeshoptDecoder.ready;
    const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
    const doc = await io.readBinary(new Uint8Array(readFileSync(new URL(`../../public/assets/cortex/${pc.id}.glb`, import.meta.url))));
    for (const mesh of doc.getRoot().listMeshes()) {
      const prim = mesh.listPrimitives()[0];
      expect(prim.listSemantics()).toEqual(expect.arrayContaining(['POSITION', 'NORMAL', 'COLOR_0', '_OPER']));
      expect(prim.listTargets()[0].listSemantics()).toEqual(expect.arrayContaining(['POSITION', 'NORMAL']));
    }
    // the opercular flag never removes the insula itself
    const ins = await io.readBinary(new Uint8Array(readFileSync(new URL(`../../public/assets/cortex/${byShort.get('G_insular_short')!.id}.glb`, import.meta.url))));
    const a = ins.getRoot().listMeshes()[0].listPrimitives()[0].getAttribute('_OPER')!;
    const el: number[] = [];
    let max = 0;
    for (let i = 0; i < a.getCount(); i++) { a.getElement(i, el); max = Math.max(max, el[0]); }
    expect(max).toBe(0);
  });
});

describe('cortex scene and URL state', () => {
  it('plans reference only catalogue entries; each view highlights its Table 1 labels', () => {
    for (const v of VIEWS) {
      const p = cortexPlan({ view: v.id, lobe: null, colour: 'lobe', inflate: 0 });
      for (const id of [...p.looks.keys(), ...p.focusIds]) expect(cortexScene.catalog.byId.has(id), `${v.id}: ${id}`).toBe(true);
      expect([...p.looks].filter(([, l]) => l === 'primary').map(([id]) => id).sort()).toEqual([...v.labels].sort());
    }
    expect(VIEW.get('insular')!.labels.length).toBe(5);
    expect(viewLabels({ view: 'lateral', lobe: 'insula' }).every((id) => LOBE.get('insula')!.labels.includes(id))).toBe(true);
  });
  it('colour modes: atlas colours override every label, plain highlights nothing', () => {
    expect(cortexPlan({ view: 'lateral', lobe: null, colour: 'atlas', inflate: 0 }).colours!.size).toBe(74);
    const plain = cortexPlan({ view: 'lateral', lobe: null, colour: 'plain', inflate: 0 });
    expect(LABELS.every((l) => plain.looks.get(l.id) === 'muted')).toBe(true);
    // functional areas are drawn only when their group is picked, over muted labels
    expect(FUNCTIONS.every((f) => plain.looks.get(f.id) === 'hidden')).toBe(true);
    const lang = cortexPlan({ view: 'lateral', lobe: null, colour: 'lobe', inflate: 0, fn: 'language' });
    for (const f of FUNCTIONS) expect(lang.looks.get(f.id), f.id).toBe(f.group === 'language' ? 'primary' : 'hidden');
    expect(LABELS.every((l) => lang.looks.get(l.id) === 'muted')).toBe(true);
  });
  it('the insular view cuts the opercula on the pial surface only', () => {
    expect(cortexPlan({ view: 'insular', lobe: null, colour: 'lobe', inflate: 0 }).cutOpercula).toBe(true);
    expect(cortexPlan({ view: 'insular', lobe: null, colour: 'lobe', inflate: 1 }).cutOpercula).toBe(false);
    expect(cortexPlan({ view: 'lateral', lobe: null, colour: 'lobe', inflate: 0 }).cutOpercula).toBe(false);
  });
  it('round-trips a teaching link', () => {
    const s = { ...defaultCortexState(), view: 'medial' as const, lobe: 'cingulate' as const, sel: byShort.get('G_and_S_cingul-Ant')!.id, hemi: 'L' as const, inflate: 1, colour: 'atlas' as const, labels: 'all' as const, cutSide: 'R' as const, hidden: [MEDIAL_WALL] };
    s.layers.cortex = { on: true, opacity: 0.6 };
    expect(decodeCortex(encodeCortex(s))).toEqual(s);
  });
  it('a link without settings takes them from its view', () => {
    expect(decodeCortex('#/atlas?v=medial').hemi).toBe('L');
    expect(decodeCortex('#/atlas?v=nonsense').view).toBe('lateral');
  });
});
