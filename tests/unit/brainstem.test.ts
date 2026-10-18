import { describe, expect, it } from 'vitest';
import { BS, BS_MANIFEST, BS_REFS, crossCheckBs, kindOf, MEASURED, ofKind, ZONE_GEOM, ZONE_TEXT } from '../../src/brainstem';
import { NOT_DRAWN } from '../../src/brainstem/content';
import { BS_GROUPS } from '../../src/brainstem/groups';
import { bsPlan, bsScene } from '../../src/brainstem/scene';
import { decodeBs, defaultBsState, encodeBs } from '../../src/brainstem/state';
import { SECTIONS } from '../../src/brand';
import { nodeMeans } from './glb';

describe('brainstem data', () => {
  it('content, references and generated files agree', () => {
    expect(crossCheckBs()).toEqual([]);
  });
  it('the fit to the template is close and symmetric', () => {
    const f = BS_MANIFEST.fit;
    expect(f.warpedMedianMm).toBeLessThan(1);
    expect(f.warpedP90Mm).toBeLessThan(3);
    expect(f.scale).toBeGreaterThan(0.9);
    expect(f.scale).toBeLessThan(1.1);
    // the fitted model is kept symmetric (the AAN atlas is MNI-native, its own midline at x = 0.5)
    for (const s of BS_MANIFEST.structures.filter((x) => x.dataset === 'zanatomy')) {
      const c = s.centroid!;
      if (s.id === 'bs_a_basilar_artery') continue; // one midline vessel, drawn with the right side
      expect(c.L[0] + c.R[0], s.id).toBeCloseTo(0, 0);
    }
  });
  it('has the brainstem, cranial nerves III–XII with their nuclei, the arousal network and the entry zones', () => {
    expect(ofKind('surface').sort()).toEqual(['bs_medulla', 'bs_midbrain', 'bs_pons']);
    const nerves = BS_MANIFEST.structures.filter((s) => s.category === 'nerve');
    expect(new Set(nerves.map((s) => s.cranialNerve))).toEqual(new Set([3, 4, 5, 6, 7, 8, 9, 10, 11, 12]));
    // Z-Anatomy models every motor and parasympathetic nucleus and the vestibular and cochlear nuclei, but not the
    // trigeminal nuclei
    for (const n of nerves.filter((x) => x.cranialNerve !== 5)) expect(BS_MANIFEST.structures.some((s) => s.category === 'cnNucleus' && s.cranialNerve === n.cranialNerve), n.name).toBe(true);
    expect(ofKind('aan').length).toBe(10);
    expect(ofKind('sez').length).toBe(15);
    expect(new Set(ofKind('sez').map((id) => BS.get(id)!.bsRegion))).toEqual(new Set(['midbrain', 'pons', 'floor', 'medulla']));
  });
  it('places the structures in MNI space where the brainstem is, in order from top to bottom', () => {
    const z = (id: string) => BS.get(id)!.centroid!.R[2];
    expect(z('bs_midbrain')).toBeGreaterThan(z('bs_pons'));
    expect(z('bs_pons')).toBeGreaterThan(z('bs_medulla'));
    expect(z('bs_n_oculomotor')).toBeGreaterThan(z('bs_n_abducens'));
    expect(z('bs_n_abducens')).toBeGreaterThan(z('bs_n_hypoglossal'));
    // the arousal network's periaqueductal grey lies around the model's aqueduct
    const pag = BS.get('bs_aan_pag')!.centroid!.R, aq = BS.get('bs_aqueduct')!.centroid!.R;
    expect(Math.hypot(pag[1] - aq[1], pag[2] - aq[2])).toBeLessThan(6);
    // ventral zones in front, floor zones behind
    const y = (id: string) => ZONE_GEOM.get(id)!.anchor.R[1];
    expect(y('sez_perioculomotor')).toBeGreaterThan(y('sez_supracollicular'));
    expect(y('sez_supratrigeminal')).toBeGreaterThan(y('sez_suprafacial'));
    expect(y('sez_anterolateral_sulcus')).toBeGreaterThan(y('sez_posterior_median_sulcus'));
  });
  it('the facial colliculus is placed by the published proportions of the floor', () => {
    const fc = MEASURED.facialColliculus as { rostralMarginZ: number; caudalMarginZ: number };
    const top = MEASURED.aqueductOpeningZ as number, obex = MEASURED.obexZ as number, len = MEASURED.floorLengthMm as number;
    expect((top - fc.rostralMarginZ) / len).toBeCloseTo(0.4357, 2);
    expect((fc.caudalMarginZ - obex) / len).toBeCloseTo(0.4334, 2);
  });
  it('every zone has borders from a source, and its card names how it was drawn', () => {
    for (const [id, t] of ZONE_TEXT) {
      expect(t.borders.length, id).toBeGreaterThan(0);
      expect(ZONE_GEOM.get(id)!.construction.length, id).toBeGreaterThan(40);
      expect(BS.get(id)!.schematic, id).toBe(true);
    }
    expect(NOT_DRAWN.length).toBeGreaterThan(0);
  });
  it('every reference has a PubMed id and a DOI link', () => {
    for (const r of BS_REFS) {
      expect(r.pmid, r.id).toMatch(/^\d+$/);
      expect(r.url, r.id).toMatch(/^https:\/\/doi\.org\//);
    }
  });
  it('is listed as a section, after the skull base', () => {
    const ids = SECTIONS.map((s) => s.id);
    expect(ids.indexOf('brainstem')).toBe(ids.indexOf('skullbase') + 1);
  });
});

describe('brainstem scene and URL state', () => {
  it('plans reference only catalogue entries', () => {
    for (const g of BS_GROUPS) {
      const p = bsPlan(g.id, null);
      for (const id of [...p.looks.keys(), ...p.tracts.keys(), ...p.focusIds]) expect(bsScene.catalog.byId.has(id), `${g.id}: ${id}`).toBe(true);
    }
  });
  it('zone views show the surface solid and their zones; inside views see through it', () => {
    const floor = bsPlan('sez_floor', null);
    expect(floor.looks.get('bs_pons')).toBe('primary');
    expect(floor.looks.get('sez_suprafacial')).toBe('primary');
    expect(floor.looks.get('bs_fourth_ventricle')).toBe('hidden');
    const inside = bsPlan('cn_nuclei', null);
    expect(inside.looks.get('bs_pons')).toBe('shell');
    expect(inside.looks.get('bs_n_abducens')).toBe('primary');
    const tracts = bsPlan('tracts', null);
    expect(tracts.tracts.get('wm_cst')).toBe('key');
    // a zone selected from an inside view still sits on a solid surface
    expect(bsPlan('cn_nuclei', 'sez_suprafacial').looks.get('bs_pons')).toBe('primary');
  });
  it('kinds cover every structure', () => {
    for (const s of bsScene.catalog.structures) expect(kindOf(s.id), s.id).toBeTruthy();
  });
  it('round-trips a teaching link', () => {
    const s = { ...defaultBsState(), grp: 'sez_floor', sel: 'sez_suprafacial', hemi: 'R' as const, cutSide: 'L' as const, labels: 'all' as const, hidden: ['bs_n_abducens'], sliceSeq: 't2' as const };
    s.layers.cortex = { on: true, opacity: 0.5 };
    s.clip.axial = { on: true, mm: -42.5 };
    expect(decodeBs(encodeBs(s))).toEqual(s);
  });
  it('a bare link opens the overview', () => {
    expect(decodeBs('#/atlas').grp).toBe('overview');
    expect(decodeBs('#/atlas?g=nonsense').grp).toBe('overview');
  });
});

describe('shipped brainstem GLBs', () => {
  it.each(['bs_pons', 'bs_n_hypoglossal', 'bs_aan_lc', 'sez_peritrigeminal', 'bs_cn_trigeminal_nerve'].map((id) => [id, BS.get(id)!]))('%s decodes, on the right sides', async (_id, s) => {
    const means = await nodeMeans(s.file);
    for (const side of ['L', 'R'] as const) {
      expect(means[side], side).toBeDefined();
      expect(Math.sign(means[side][0])).toBe(side === 'L' ? -1 : 1);
    }
  });
});

describe('e2e brainstem group list stays in step with the groups module', () => {
  it('ids and names match tests/e2e/smoke.spec.ts', async () => {
    const { readFileSync } = await import('node:fs');
    const spec = readFileSync(new URL('../e2e/smoke.spec.ts', import.meta.url), 'utf8');
    for (const g of BS_GROUPS) expect(spec, g.id).toContain(`{ id: '${g.id}', name: '${g.name}' }`);
  });
});
