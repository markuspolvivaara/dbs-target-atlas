import { describe, expect, it } from 'vitest';
import { areaName, END_PATCH, endsOn, patchOf, WM_ENDS } from '../../src/data/ends';
import { crossCheckWm, GROUP, parseWmContent, TOPIC, WM, WM_MANIFEST } from '../../src/tracts';
import { CONTEXT_STRUCTURES, tractPlan, tractsScene } from '../../src/tracts/scene';
import { decodeTracts, defaultTractsState, encodeTracts } from '../../src/tracts/state';
import { nodeMeans } from './glb';

describe('white-matter content', () => {
  it('parses and cross-checks (refs exist and are all cited, every tract has a card, groups are valid)', () => {
    const c = parseWmContent();
    expect(crossCheckWm(c)).toEqual([]);
  });
  it('every card has course and connections; core cards also function', () => {
    for (const t of WM.topics) {
      expect(t.course.length, t.id).toBeGreaterThan(0);
      expect(t.connections.length, t.id).toBeGreaterThan(0);
      if (t.tier === 'core') expect(t.functions.length, t.id).toBeGreaterThan(0);
    }
  });
  it('the core, extended and posterior fossa tract lists', () => {
    const abbr = (tier: string) => WM.topics.filter((t) => t.tier === tier).map((t) => t.abbr).sort();
    expect(abbr('core')).toEqual(
      ['AF', 'CBT', 'CC', 'CST', 'Cingulum (dorsal)', 'Cingulum (parahippocampal)', 'FAT', 'Fornix', 'IFOF', 'ILF', 'OR', 'SLF I', 'SLF II', 'SLF III', 'UF'].sort());
    // (B4: the acoustic radiation withdrawn; the DRTT as two tracts, crossed and uncrossed)
    expect(abbr('extended')).toEqual(['AC', 'ATR', 'CStr-A', 'CStr-P', 'CStr-S', 'EmC', 'MdLF', 'PTR', 'STR', 'TPAT', 'VOF'].sort());
    expect(abbr('fossa')).toEqual(['CPT-F', 'CPT-O', 'CPT-P', 'DRTT', 'ICP', 'MCP', 'ML', 'RST', 'SCP', 'nDRTT'].sort());
  });
  it('every group stays within one tier, and each tier opens on a function group', () => {
    for (const g of WM.groups) for (const id of g.tractIds) expect(TOPIC.get(id)!.tier, `${g.id}: ${id}`).toBe(g.tier);
    for (const tier of ['core', 'extended', 'fossa']) expect(WM.groups.find((g) => g.tier === tier)!.kind).toBe('function');
  });
  it('highlighted cortex exists in the shared DBS assets', () => {
    const ctx = new Set(CONTEXT_STRUCTURES.map((s) => s.id));
    for (const t of WM.topics) for (const p of t.parcels) expect(ctx.has(p), `${t.id}: ${p}`).toBe(true);
  });
});

describe('the site audit\u2019s B4: what each atlas bundle shows', () => {
  it('splits the DRTT into crossed and uncrossed tracts and withdraws the acoustic radiation', () => {
    const man = (id: string) => WM_MANIFEST.structures.find((s) => s.id === id);
    expect(man('wm_ar')).toBeUndefined();
    expect(TOPIC.has('wm_ar')).toBe(false);
    // every streamline of the atlas file is in one of the two (counted from the source by the build)
    expect(man('wm_drtt')!.sourceStreamlines).toEqual({ L: 1727, R: 652 });
    expect(man('wm_ndrtt')!.sourceStreamlines).toEqual({ L: 1971, R: 6332 });
    expect(TOPIC.get('wm_drtt')!.name).toMatch(/decussating$/);
    expect(TOPIC.get('wm_ndrtt')!.name).toMatch(/non-decussating$/);
    // the loop group (the cerebellum returns to contralateral cortex) keeps only the crossed tract
    expect(GROUP.get('fossa_loop')!.tractIds).not.toContain('wm_ndrtt');
    expect(GROUP.get('fossa_all')!.tractIds).toEqual(expect.arrayContaining(['wm_drtt', 'wm_ndrtt']));
  });
  it('says on the cards what the bundles drawn connect, from their measured ends', () => {
    expect(TOPIC.get('wm_or')!.aliases).toContain('Meyer’s loop');          // a shallow loop is there (rechecked)
    expect(TOPIC.get('wm_or')!.measured.join(' ')).toMatch(/shallow Meyer’s loop.*not at the lateral geniculate body/);
    for (const id of ['wm_ml', 'wm_rst', 'wm_emc', 'wm_ac']) expect(TOPIC.get(id)!.measured.length, id).toBeGreaterThan(0);
    expect(TOPIC.get('wm_slf1')!.aliases).toEqual([]);                      // "dorsal SLF" names SLF II elsewhere
    expect(TOPIC.get('wm_slf1')!.connections.flatMap((c) => c.refIds)).toEqual(expect.arrayContaining(['wang2016', 'komaitis2020']));
    expect(TOPIC.get('wm_cs_p')!.summary).not.toMatch(/temporal/);
  });
});

// the site audit's B-007: where the bundles' streamlines end on the cortex (pipeline/wm_ends.py), in place of the
// published table of the areas a bundle overlaps (which lists areas it only passes)
describe('where the bundles end on the cortex', () => {
  const end = (tid: string, key: 'L' | 'R' | 'M', name: string) => {
    const t = WM_ENDS.tracts[tid]!;
    return t.bundles[key]!.ends[t.ends.indexOf(name)]!;
  };
  const share = (e: { areas: { id: string; share: number }[] }, id: string) => e.areas.filter((a) => a.id === id).reduce((x, a) => x + a.share, 0);
  it('every tract is measured, both its ends, with shares that add up', () => {
    expect(Object.keys(WM_ENDS.tracts).sort()).toEqual(WM_MANIFEST.structures.map((s) => s.id).sort());
    for (const [id, t] of Object.entries(WM_ENDS.tracts)) {
      const keys = Object.keys(t.bundles);
      expect(keys.length === 1 ? keys : keys.sort(), id).toEqual(keys.length === 1 ? ['M'] : ['L', 'R']);
      for (const b of Object.values(t.bundles)) for (const e of b!.ends) {
        if (e.areas.length) expect(e.areas.reduce((x, a) => x + a.share, 0) + e.rest, id).toBeCloseTo(1, 2);
        expect(e.areas.length > 0, id).toBe(e.atCortex >= WM_ENDS.rule.endMinShare);
        for (const a of e.areas) expect(WM_ENDS.areas[a.id], `${id}: ${a.id}`).toBeTruthy();
      }
    }
  });
  it('the measured ends where the anatomy is known', () => {
    for (const sd of ['L', 'R'] as const) {
      // the corticospinal tract: the upper end on the precentral gyrus, the lower end not at the cerebral cortex
      expect(end('wm_cst', sd, 'upper').areas[0].id).toBe('ctx_g_precentral');
      expect(end('wm_cst', sd, 'lower').atCortex).toBeLessThan(0.02);
      // the arcuate fasciculus: the opercular part of the inferior frontal gyrus in front, the temporal lobe behind
      expect(share(end('wm_af', sd, 'front'), 'ctx_g_front_inf_opercular')).toBeGreaterThan(0.3);
      expect(end('wm_af', sd, 'back').areas.every((a) => /_temp/.test(a.id))).toBe(true);
      // the IFOF passes the insula (the published table lists it), it does not end there
      for (const e of WM_ENDS.tracts.wm_ifof.bundles[sd]!.ends) expect(e.areas.some((a) => /insula/.test(a.id))).toBe(false);
      // the optic radiation's front end is in the thalamus, near the medial wall, not at the cortex
      expect(end('wm_or', sd, 'front').atCortex).toBeLessThan(0.02);
    }
    // the cerebellar peduncles and the fornix do not end at the cerebral cortex, and get no patch
    for (const id of ['wm_scp', 'wm_mcp', 'wm_icp', 'wm_fx']) {
      for (const b of Object.values(WM_ENDS.tracts[id].bundles)) for (const e of b!.ends) expect(e.atCortex, id).toBeLessThan(0.05);
      expect(patchOf(id), id).toBeNull();
    }
    // the corpus callosum: one bundle, its two ends on the two hemispheres
    expect(WM_ENDS.tracts.wm_cc.ends).toEqual(['left', 'right']);
    expect(end('wm_cc', 'M', 'left').areas.every((a) => a.side === 'L')).toBe(true);
    expect(end('wm_cc', 'M', 'right').areas.every((a) => a.side === 'R')).toBe(true);
  });
  it('names areas as the cortex section does, and finds the tracts that end on one', () => {
    expect(areaName('ctx_g_oc_temp_med_lingual')).toBe('Lingual gyrus');
    expect(areaName('ctx_g_front_inf_opercular')).toBe('Opercular part of the inferior frontal gyrus');
    const pre = endsOn('ctx_g_precentral');
    expect(pre.find((e) => e.tract === 'wm_cst' && e.end === 'upper' && e.side === 'L')!.share).toBeGreaterThan(0.5);
    expect(pre.map((e) => e.share)).toEqual([...pre.map((e) => e.share)].sort((a, b) => b - a));
    expect(endsOn('ctx_g_precentral').some((e) => e.tract === 'wm_cc' && e.end === null)).toBe(true);
  });
  it('a chosen tract draws its patch of cortex; the patches are cortical areas in the tract\'s colour', () => {
    const p = tractPlan('language', 'wm_af');
    expect(p.parcels.get('wm_af__ends')).toBe('key');
    expect(tractPlan('language', null).parcels.size).toBe(0);
    expect(tractPlan('fossa_peduncles', 'wm_mcp').parcels.size).toBe(0);
    for (const [id, s] of END_PATCH) {
      expect(tractsScene.catalog.byId.get(id), id).toBe(s);
      expect([s.type, s.colour.token], id).toEqual(['cortex', WM_MANIFEST.structures.find((x) => `${x.id}__ends` === id)!.colour.token]);
    }
  });
});

describe('white-matter scene and URL state', () => {
  it('plans reference only catalogue entries; a selected tract outside the group is added', () => {
    for (const g of WM.groups) {
      const p = tractPlan(g.id, null);
      for (const id of [...p.looks.keys(), ...p.tracts.keys(), ...p.parcels.keys(), ...p.focusIds]) expect(tractsScene.catalog.byId.has(id), `${g.id}: ${id}`).toBe(true);
      expect([...p.tracts.keys()]).toEqual(g.tractIds);
    }
    const p = tractPlan('visual', 'wm_fat');
    expect(p.tracts.get('wm_fat')).toBe('key');
    // (the HMAT areas its card names, and the patch where its streamlines end)
    expect([...p.parcels.keys()].sort()).toEqual(['presma', 'sma', 'wm_fat__ends']);
    expect(p.focusIds).toEqual(['wm_fat']);
  });
  it('round-trips a teaching link', () => {
    const s = { ...defaultTractsState(), grp: 'slf', sel: 'wm_slf2', hemi: 'R' as const, labels: 'hover' as const, cutSide: 'L' as const, sliceSeq: 't2' as const };
    s.clip.coronal = { on: true, mm: -32.5 };
    s.layers.cortex = { on: true, opacity: 0.4 };
    s.hidden = ['wm_af'];
    const back = decodeTracts(encodeTracts(s)).state;
    expect(back).toEqual(s);
  });
  it('a link without a hemisphere says so (the group decides)', () => {
    expect(decodeTracts('#/atlas?g=slf').hasHemi).toBe(false);
    expect(GROUP.get('slf')!.hemi).toBe('R');
  });
  it('a link that names a tract but no group says so (the page opens a group that holds the tract)', () => {
    expect(decodeTracts('#/atlas?sel=wm_cst').hasGroup).toBe(false);
    expect(decodeTracts('#/atlas?g=motor&sel=wm_cst').hasGroup).toBe(true);
  });
});

describe('shipped white-matter GLBs', () => {
  it.each(WM_MANIFEST.structures.map((s) => [s.id, s]))('%s: decoded streamline centroid matches the pipeline report, on the right side', async (_id, s) => {
    const means = await nodeMeans(s.file);
    for (const side of ['L', 'R'] as const) {
      const d = Math.hypot(...means[side].map((v, i) => v - s.centroid![side][i]));
      expect(d, `${s.id}/${side}`).toBeLessThan(0.1);
      expect(Math.sign(means[side][0])).toBe(side === 'L' ? -1 : 1);
    }
    expect(TOPIC.has(s.id)).toBe(true);
  });
});
