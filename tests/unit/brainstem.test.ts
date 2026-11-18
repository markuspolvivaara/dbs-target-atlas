import { describe, expect, it } from 'vitest';
import { BS, BS_MANIFEST, BS_REF, BS_REFS, crossCheckBs, kindOf, MEASURED, nervesOf, nucleiOf, ofKind, OWN_TRACTS, TRACT_FIT, ZONE_GEOM, ZONE_TEXT } from '../../src/brainstem';
import { HCP_ATLAS, NOT_DRAWN, NUCLEI_NOT_MODELLED, SHARED_NUCLEI, TRACT_TEXT } from '../../src/brainstem/content';
import { BS_GROUPS } from '../../src/brainstem/groups';
import { bsPlan, bsScene, liesInside } from '../../src/brainstem/scene';
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
    // on the brainstem's own surface, not on the far wall of the cisterns (as it was until November 2026: about 3 mm
    // too large, 7 % of the surface on its own boundary and 34 % on the far wall), and not too small either
    expect(f.cstInsideShare).toBeGreaterThan(0.9);
    expect(f.ownWallWithin1mmShare).toBeGreaterThan(0.4);
    expect(f.farWallWithin1mmShare).toBeLessThan(0.15);
    expect(Math.abs(f.ownWallSignedMedianMm)).toBeLessThan(1);
    expect(f.solidFluidShare).toBeLessThan(0.12);
    // the model's fourth ventricle is fluid on the template, and no arousal nucleus lies in it
    expect(f.ventricleFluidShare).toBeGreaterThan(0.7);
    expect(f.aanInVentricleMaxShare).toBeLessThan(0.15);
    expect(f.widths).toHaveLength(4);
    for (const w of f.widths) if (w.templateMm) expect(w.modelMm / w.templateMm, `${w.part} z ${w.z}`).toBeGreaterThan(0.8), expect(w.modelMm / w.templateMm, `${w.part} z ${w.z}`).toBeLessThan(1.25);
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
  // the audit's D-008 (November 2026)
  it('a nucleus that serves several nerves lists them all, and each of those nerves lists the nucleus', () => {
    const amb = BS.get('bs_n_ambiguus')!, sol = BS.get('bs_n_solitary')!;
    expect(nervesOf(amb)).toEqual([9, 10, 11]);
    expect(nervesOf(sol)).toEqual([7, 9, 10]);
    // the others still serve the one nerve they are listed under
    for (const s of BS_MANIFEST.structures.filter((x) => x.category === 'cnNucleus' && !SHARED_NUCLEI[x.id])) expect(nervesOf(s), s.id).toEqual([s.cranialNerve]);
    const ids = (cn: number) => nucleiOf(cn).map((s) => s.id).sort();
    expect(ids(7)).toEqual(['bs_n_facial', 'bs_n_solitary', 'bs_n_sup_salivatory']);
    expect(ids(9)).toEqual(['bs_n_ambiguus', 'bs_n_inf_salivatory', 'bs_n_solitary']);
    expect(ids(10)).toEqual(['bs_n_ambiguus', 'bs_n_dorsal_vagal', 'bs_n_solitary']);
    expect(ids(11)).toEqual(['bs_n_accessory', 'bs_n_ambiguus']);
    // what each nerve has in the nucleus, each sentence from a source read in full
    for (const [id, claims] of Object.entries(SHARED_NUCLEI)) {
      expect(claims.length, id).toBe(3);
      for (const cl of claims) for (const r of cl.refIds) expect(BS_REF.get(r)?.pmcid, `${id}: ${r}`).toMatch(/^PMC\d+$/);
    }
    expect(SHARED_NUCLEI.bs_n_ambiguus.map((c) => c.text).join(' ')).toMatch(/stylopharyngeus[\s\S]*cranial part/);
    expect(SHARED_NUCLEI.bs_n_solitary[0].text).toMatch(/chorda tympani/);
  });
  it('the trigeminal nerve says its four nuclei are not modelled, with what the sources say of each', () => {
    expect(nucleiOf(5)).toEqual([]);
    expect(Object.keys(NUCLEI_NOT_MODELLED)).toEqual(['5']);
    const t = NUCLEI_NOT_MODELLED[5];
    expect(t.lead).toMatch(/^Not modelled/);
    const text = t.claims.map((c) => c.text).join(' ');
    for (const name of ['Principal sensory nucleus', 'Motor nucleus', 'Mesencephalic nucleus', 'Spinal nucleus']) expect(text, name).toContain(name);
    for (const cl of t.claims) for (const r of cl.refIds) expect(BS_REF.get(r)?.pmcid, r).toMatch(/^PMC\d+$/);
  });
  it('four tracts of the HCP-YA atlas are drawn as its streamlines where the atlas has them, each measured against this template', () => {
    expect(OWN_TRACTS).toEqual(['bs_t_mlf', 'bs_t_ctt', 'bs_t_stt', 'bs_t_ll']);
    expect(BS_MANIFEST.datasets.hcp842.licence).toMatch(/^CC BY-SA 4\.0/);
    expect(BS_MANIFEST.datasets.hcp842.url).toBe('https://brain.labsolver.org/hcp_trk_atlas.html');
    expect(HCP_ATLAS.every((c) => c.refIds.includes('yeh2018'))).toBe(true);
    for (const id of OWN_TRACTS) {
      const s = BS.get(id)!, t = TRACT_TEXT[id];
      // streamlines, as the white-matter section's tracts are
      expect([s.type, s.role, s.category, s.dataset], id).toEqual(['tract', 'tract', 'tract', 'hcp842']);
      expect(kindOf(id), id).toBe('tract');
      expect(s.derivation, id).toMatch(/without a shift[\s\S]*near z = -50 mm/);
      expect(t.claims.length, id).toBeGreaterThan(1);
      for (const cl of [...t.claims, ...t.measures]) for (const r of cl.refIds) expect(BS_REF.get(r)?.pmcid, `${id}: ${r}`).toMatch(/^PMC\d+$/);
      for (const side of ['L', 'R'] as const) {
        const f = TRACT_FIT[id][side];
        const where = `${id} ${side}`;
        // every streamline the atlas's file holds is drawn but the few shorter than 10 mm
        expect(s.streamlines![side], where).toBe(f.streamlines);
        expect(s.sourceStreamlines![side], where).toBe(f.sourceStreamlines);
        expect(f.streamlines, where).toBeGreaterThanOrEqual(9);
        expect(f.streamlines, where).toBeLessThanOrEqual(f.sourceStreamlines);
        expect(f.lengthMm[0], where).toBeGreaterThanOrEqual(10);
        // the atlas's lower edge (the spinothalamic tract's streamlines run 2 mm on); up to the top of the midbrain or just past it
        expect(f.zMm[0], where).toBeLessThanOrEqual(-50);
        expect(f.zMm[0], where).toBeGreaterThan(-53.5);
        expect(f.zMm[1], where).toBeGreaterThan(-10);
        expect(f.zMm[1], where).toBeLessThan(5);
        // drawn without a shift from another ICBM-152 space: most of their length lies inside the fitted brainstem, none
        // of it far outside, little of it in the model's ventricle (the bounds are what the build measured, with room)
        expect(f.insideShare, where).toBeGreaterThan(0.5);
        expect(f.outsideMaxMm, where).toBeLessThan(5);
        expect(f.inVentricleShare, where).toBeLessThan(0.1);
        expect(f.fluidShare, where).toBeLessThan(0.55);
        // the streamline file's coordinates: read from the voxel's centre its points lie in the atlas's own volume of
        // the tract; read from the corner, as the format has it, fewer do
        expect(f.inOwnVolumeShare, where).toBeGreaterThanOrEqual(0.99);
        expect(f.cornerReadShare, where).toBeLessThan(f.inOwnVolumeShare);
        expect(f.belowGridShare, where).toBeLessThan(0.03);
      }
      // only the right lateral lemniscus lies as much as two-fifths outside the fitted brainstem
      if (id !== 'bs_t_ll') expect(Math.min(TRACT_FIT[id].L.insideShare, TRACT_FIT[id].R.insideShare), id).toBeGreaterThan(0.8);
      // left of the midline on the left
      expect(s.centroid!.L[0], id).toBeLessThan(0);
      expect(s.centroid!.R[0], id).toBeGreaterThan(0);
    }
    // the fasciculus lies beside the midline, the spinothalamic tract and the lateral lemniscus further out
    const x = (id: string) => BS.get(id)!.centroid!.R[0];
    expect(x('bs_t_mlf')).toBeLessThan(x('bs_t_ctt'));
    expect(x('bs_t_ctt')).toBeLessThan(x('bs_t_ll'));
    expect(x('bs_t_mlf')).toBeLessThan(5);
    // and behind the medial lemniscus's level in the tegmentum: dorsal to the pons's centre
    expect(BS.get('bs_t_mlf')!.centroid!.R[1]).toBeLessThan(BS.get('bs_pons')!.centroid!.R[1]);
    // Li 2021's distances are the published ones
    expect(TRACT_TEXT.bs_t_mlf.measures[0].text).toMatch(/0\.50 mm \(left\) and 0\.48 mm \(right\) from the median sulcus and 1\.41 mm and 1\.51 mm from the floor/);
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
    // twelve tracts run through one another here: a chosen tract fades the others back, whatever the viewer's setting
    for (const g of BS_GROUPS) expect(bsPlan(g.id, null).fadeOtherTracts, g.id).toBe(true);
    // the section's own tracts are streamlines too: drawn as lines, not as meshes
    for (const id of OWN_TRACTS) {
      expect(tracts.tracts.get(id), id).toBe('key');
      expect(tracts.looks.has(id), id).toBe(false);
    }
    // the fasciculus lies under the floor, and partly outside the fitted surface: under the solid floor it is not
    // drawn (only stray lines of it would show); it is seen through the surface once it (or a nucleus under the
    // floor) is chosen; an entry zone chosen there leaves the surface solid
    expect(floor.tracts.has('bs_t_mlf')).toBe(false);
    expect(floor.looks.get('bs_n_abducens')).toBe('context');
    expect(bsPlan('sez_floor', 'bs_n_abducens').tracts.get('bs_t_mlf')).toBe('border');
    expect(bsPlan('sez_floor', 'sez_suprafacial').tracts.has('bs_t_mlf')).toBe(false);
    expect(liesInside('bs_t_mlf') && liesInside('bs_n_abducens') && liesInside('bs_aan_lc')).toBe(true);
    expect(liesInside('sez_suprafacial') || liesInside('bs_cn_facial_nerve') || liesInside('wm_cst') || liesInside('bs_olive')).toBe(false);
    expect(bsPlan('sez_floor', 'bs_t_mlf').looks.get('bs_pons')).toBe('shell');
    expect(bsPlan('sez_floor', 'bs_t_mlf').tracts.get('bs_t_mlf')).toBe('key');
    expect(bsPlan('sez_floor', 'bs_n_abducens').looks.get('bs_pons')).toBe('shell');
    expect(bsPlan('sez_floor', 'sez_suprafacial').looks.get('bs_pons')).toBe('primary');
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
  it.each(['bs_pons', 'bs_n_hypoglossal', 'bs_aan_lc', 'sez_peritrigeminal', 'bs_cn_trigeminal_nerve', 'bs_t_mlf', 'bs_t_ctt', 'bs_t_stt', 'bs_t_ll'].map((id) => [id, BS.get(id)!]))('%s decodes, on the right sides', async (_id, s) => {
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

describe('the site audit’s B6: the supratrigeminal zone drawn is Cavalheiro’s (D-007)', () => {
  it('is named for its source and says that others use the name elsewhere', () => {
    expect(ZONE_GEOM.get('sez_supratrigeminal')!.name).toBe('Supratrigeminal zone (Cavalheiro 2015)');
    const refs = ZONE_TEXT.get('sez_supratrigeminal')!.borders.flatMap((c) => c.refIds);
    expect(refs).not.toContain('cavalcanti2016');
    expect(refs).toContain('alafif2026');
  });
});
