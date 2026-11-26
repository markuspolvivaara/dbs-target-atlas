import { describe, expect, it } from 'vitest';
import wmManifestJson from '../../src/data/generated/wm-manifest.json';
import { crossCheckCtx, CTX_REFS, FUNCTIONS, LABEL, LABELS, MEDIAL_WALL, shortName } from '../../src/cortex';
import { REG_REFS, REGION, REGIONS, regionTract } from '../../src/cortex/regions';
import { cortexPlan, cortexScene, REGION_SURFACE_OPACITY, REGION_TOKEN, viewLabels } from '../../src/cortex/scene';
import { decodeCortex, defaultCortexState, encodeCortex } from '../../src/cortex/state';
import { SYN_REFS, SYNDROMES } from '../../src/cortex/syndromes';

// the module plan's addition 2: surgical regions for glioma surgery (src/cortex/regions.ts)
describe('cortex surgical regions', () => {
  it('the owner’s five: the SMA, the insula, the dominant frontal operculum, the dominant temporal lobe, the parietal lobe', () => {
    expect(REGIONS.map((r) => r.id)).toEqual(['sma', 'insula', 'operculum', 'temporal', 'parietal']);
    // the dominant-side regions are drawn on the left
    for (const r of REGIONS) expect(r.side, r.id).toBe('L');
    expect(REGION.get('insula')!.view).toBe('insular');
  });

  it('every area and tract exists, the named area is drawn where the atlas has it, every sentence has a source', () => {
    expect(crossCheckCtx()).toEqual([]);
    const wm = new Map((wmManifestJson as { structures: { id: string; name: string }[] }).structures.map((s) => [s.id, s.name]));
    for (const r of REGIONS) {
      for (const l of r.labels) expect(LABEL.has(l.id), `${r.id}: ${l.id}`).toBe(true);
      for (const f of r.fns) expect(FUNCTIONS.some((x) => x.id === f.id), `${r.id}: ${f.id}`).toBe(true);
      for (const t of r.tracts) expect(wm.get(t.id), `${r.id}: ${t.id}`).toBe(t.name);
      for (const x of [...r.labels, ...r.fns, ...r.tracts]) {
        expect(x.why.length, `${r.id}: ${x.id} without a reason`).toBeGreaterThan(3);
        for (const ref of x.refIds ?? []) expect(CTX_REFS.has(ref), `${r.id}: ${x.id}: ${ref}`).toBe(true);
      }
      const ids = [...r.labels, ...r.fns, ...r.tracts].map((x) => x.id);
      expect(new Set(ids).size, `${r.id}: drawn twice`).toBe(ids.length);
      for (const c of [...r.mapped, ...r.deficits, ...r.course, ...r.limits]) {
        expect(c.refIds.length, `${r.id}: “${c.text}”`).toBeGreaterThan(0);
        for (const ref of c.refIds) expect(CTX_REFS.has(ref), `${r.id}: ${ref}`).toBe(true);
        expect(c.text, r.id).toMatch(/^[A-Z“(].*[.)]$/s);
      }
    }
    // the owner's rule (2026-11-25): the named area where the atlas has it, not a gyrus standing in: the SMA, pre-SMA and
    // ventral premotor cortex are HMAT's, Broca's area the Function selector's
    expect(REGION.get('sma')!.fns.map((f) => f.id)).toEqual(expect.arrayContaining(['ctx_fn_sma', 'ctx_fn_presma']));
    expect(REGION.get('operculum')!.fns.map((f) => f.id)).toEqual(expect.arrayContaining(['ctx_fn_broca', 'ctx_fn_pmv']));
    // the optic radiation's front loop is not in the bundle, and the card says so (regionCard's aside does for every
    // region that draws it; the temporal card's own text too)
    expect([...REGION.get('temporal')!.limits, ...REGION.get('temporal')!.tracts].some((x) => /Meyer/.test('text' in x ? x.text : x.why))).toBe(true);
  });

  it('the region references: cited, linked, labelled by their first author, none redefining a syndrome card’s', () => {
    const cited = new Set(REGIONS.flatMap((r) => [...r.mapped, ...r.deficits, ...r.course, ...r.limits, ...r.labels, ...r.fns, ...r.tracts].flatMap((c) => c.refIds ?? [])));
    for (const [id, r] of Object.entries(REG_REFS)) {
      expect(cited.has(id), `${id} is never cited`).toBe(true);
      expect(id in SYN_REFS, `${id} is a syndrome card’s already`).toBe(false);
      expect(r.url, id).toMatch(/^https:\/\/(doi\.org\/10\.|pmc\.ncbi\.nlm\.nih\.gov\/articles\/PMC)/);
      expect(CTX_REFS.get(id)!.shortLabel, id).toMatch(/^[A-Z][\p{L}’ -]+ \d{4}$/u);
      expect(r.citation.startsWith(CTX_REFS.get(id)!.shortLabel.replace(/ \d{4}$/, '')), id).toBe(true);
    }
    expect(SYNDROMES.length).toBe(12);
  });

  it('a region draws its areas see-through, the rest of the cortex as a ghost (never opaque), and its tracts', () => {
    for (const r of REGIONS) {
      const p = cortexPlan({ view: 'lateral', lobe: 'frontal', colour: 'plain', inflate: 0, fn: 'motor', syn: 'neglect', region: r.id });
      const own = [...r.labels, ...r.fns].map((x) => x.id);
      expect([...p.looks].filter(([, l]) => l === 'primary').map(([id]) => id).sort(), r.id).toEqual([...own].sort());
      for (const l of LABELS) if (!own.includes(l.id)) expect(p.looks.get(l.id), `${r.id}: ${l.id}`).toBe('ghost');
      expect(p.looks.get(MEDIAL_WALL)).toBe('ghost');
      expect([...p.looks.values()]).not.toContain('muted');
      expect([...p.tracts]).toEqual(r.tracts.map((t) => [t.id, t.dashed ? 'alt' : 'key']));
      // its gyri and sulci in the region colour, chosen clear of every tract a region draws (the palette check)
      expect([...(p.tokens ?? new Map())]).toEqual(r.labels.map((l) => [l.id, REGION_TOKEN]));
      expect(p.surfaceOpacity).toBe(REGION_SURFACE_OPACITY);
      expect(p.title).toBe(r.name);
      // everything the plan names is in the section's catalogue (the tracts by reference to the white-matter section's files)
      for (const id of [...p.looks.keys(), ...p.tracts.keys()]) expect(cortexScene.catalog.byId.has(id), id).toBe(true);
      for (const t of r.tracts) expect(cortexScene.catalog.byId.get(t.id)!.file, t.id).toMatch(/^assets\/wm\//);
      expect(viewLabels({ view: 'medial', lobe: null, region: r.id })).toEqual(r.labels.map((l) => l.id));
      for (const t of r.tracts) expect(shortName(t.id)).toBe(t.name);
    }
    // without a region, nothing is see-through and no tract is drawn
    const plain = cortexPlan({ view: 'lateral', lobe: null, colour: 'lobe', inflate: 0 });
    expect(plain.surfaceOpacity).toBeUndefined();
    expect(plain.tracts.size).toBe(0);
  });

  it('a link holds the region; it wins over a syndrome and a function group, opens its view and side, on the pial surface', () => {
    const r = REGIONS[1];
    const s = { ...defaultCortexState(), region: r.id, view: r.view, hemi: r.side };
    expect(decodeCortex(encodeCortex(s))).toEqual(s);
    expect(encodeCortex(s)).toContain(`r=${r.id}`);
    expect(decodeCortex('#/atlas?v=lateral&r=nonsense').region).toBeNull();
    const both = decodeCortex(`#/atlas?f=language&syn=neglect&lobe=frontal&inf=1&r=${r.id}`);
    expect([both.region, both.syn, both.fn, both.lobe, both.inflate, both.view, both.hemi]).toEqual([r.id, null, null, null, 0, r.view, r.side]);
    // a link's own view and side are kept
    expect(decodeCortex(`#/atlas?v=lateral&h=R&r=${r.id}`)).toMatchObject({ view: 'lateral', hemi: 'R' });
    // a selected tract is the region's
    expect(regionTract(r.id, r.tracts[0].id)).toBe(true);
    expect(regionTract(r.id, 'wm_fx')).toBe(false);
    expect(regionTract(null, r.tracts[0].id)).toBe(false);
  });
});
