import { describe, expect, it } from 'vitest';
import { connectedAreas, CONNECTOME, crossCheckWm, GROUP, parseWmContent, TOPIC, WM, WM_MANIFEST } from '../../src/tracts';
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

describe('cortical connections from the published tract-to-region table', () => {
  it('covers every tract the table has a column for (not CC, EmC, AC or the posterior fossa tracts)', () => {
    const missing = ['wm_cc', 'wm_emc', 'wm_ac', ...WM.topics.filter((t) => t.tier === 'fossa').map((t) => t.id)];
    expect(Object.keys(CONNECTOME.tracts).sort()).toEqual(WM.topics.map((t) => t.id).filter((id) => !missing.includes(id)).sort());
  });
  it('known values survive the conversion (spot checks against the spreadsheet)', () => {
    // raw cells: FAT (left) / BA1/3 = 0.98403755868544596, SLF_I (left) / BA4 = 0.90422535211267596,
    // SLF_III (left) / BA1/3 = 1; the right-hemisphere block starts after the left one
    expect(CONNECTOME.tracts.wm_fat.L['BA1/3']).toBe(0.984);
    expect(CONNECTOME.tracts.wm_slf1.L.BA4).toBe(0.904);
    expect(CONNECTOME.tracts.wm_slf3.L['BA1/3']).toBe(1);
    expect(CONNECTOME.tracts.wm_fat.R['BA1/3']).toBe(0.027);
    expect(connectedAreas('wm_or', 'L').map((a) => a.area)).toContain('BA17');
  });
  it('lists areas in numeric order at or above the threshold', () => {
    const a = connectedAreas('wm_af', 'L');
    expect(a.every((x) => x.p >= CONNECTOME.min)).toBe(true);
    const n = a.map((x) => parseInt(x.area.slice(2), 10));
    expect(n).toEqual([...n].sort((p, q) => p - q));
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
    expect([...p.parcels.keys()].sort()).toEqual(['presma', 'sma']);
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
