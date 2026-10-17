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
  it('every card has course, connections and function, each claim with a reference', () => {
    for (const t of WM.topics) {
      expect(t.course.length, t.id).toBeGreaterThan(0);
      expect(t.connections.length, t.id).toBeGreaterThan(0);
      expect(t.functions.length, t.id).toBeGreaterThan(0);
    }
  });
  it('the tier-1 tract list', () => {
    expect(WM.topics.map((t) => t.abbr).sort()).toEqual(
      ['AF', 'CBT', 'CC', 'CST', 'Cingulum (dorsal)', 'Cingulum (parahippocampal)', 'FAT', 'IFOF', 'ILF', 'OR', 'SLF I', 'SLF II', 'SLF III', 'UF'].sort());
  });
  it('highlighted cortex exists in the shared DBS assets', () => {
    const ctx = new Set(CONTEXT_STRUCTURES.map((s) => s.id));
    for (const t of WM.topics) for (const p of t.parcels) expect(ctx.has(p), `${t.id}: ${p}`).toBe(true);
  });
});

describe('cortical connections from the published tract-to-region table', () => {
  it('covers every tract except the corpus callosum (not in the table)', () => {
    expect(Object.keys(CONNECTOME.tracts).sort()).toEqual(WM.topics.map((t) => t.id).filter((id) => id !== 'wm_cc').sort());
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
