import { describe, expect, it } from 'vitest';
import { crossCheckCtx, CTX_REFS, FUNCTIONS, LABEL, LABELS } from '../../src/cortex';
import { cortexPlan, viewLabels } from '../../src/cortex/scene';
import { decodeCortex, defaultCortexState, encodeCortex } from '../../src/cortex/state';
import { SYN_GROUPS, SYN_REFS, SYNDROME, SYNDROMES } from '../../src/cortex/syndromes';
import { TOPICS } from '../../src/tracts/content';

// the module plan's addition 1: syndromes as a way into the cortex (src/cortex/syndromes.ts)
describe('cortex syndromes', () => {
  it('the owner’s first set: aphasias and alexia, attention and praxis, vision; no dementia group', () => {
    expect(SYN_GROUPS.map((g) => g.id)).toEqual(['aphasia', 'attention', 'visual']);
    for (const g of SYN_GROUPS) expect(SYNDROMES.some((s) => s.group === g.id), g.id).toBe(true);
    expect(new Set(SYNDROMES.map((s) => s.id)).size).toBe(SYNDROMES.length);
  });

  it('every label is a Destrieux label, every sentence has a source, every source is listed', () => {
    expect(crossCheckCtx()).toEqual([]);
    for (const s of SYNDROMES) {
      expect(s.labels.length + (s.fns?.length ?? 0), s.id).toBeGreaterThan(0);
      expect(new Set(s.labels.map((l) => l.id)).size, `${s.id}: a label twice`).toBe(s.labels.length);
      for (const l of s.labels) {
        expect(LABEL.has(l.id), `${s.id}: ${l.id}`).toBe(true);
        expect(l.why.length, `${s.id}: ${l.id} without a reason`).toBeGreaterThan(3);
      }
      // HMAT's areas, drawn vertex by vertex, where the sources name one (the owner: the premotor areas are the SMA and
      // pre-SMA, drawn as such)
      for (const f of s.fns ?? []) {
        expect(FUNCTIONS.find((x) => x.id === f.id)?.basis, `${s.id}: ${f.id}`).toBe('hmat');
        expect(f.why.length, `${s.id}: ${f.id} without a reason`).toBeGreaterThan(3);
      }
      for (const c of [...s.signs, ...s.areas, ...s.firmness]) {
        expect(c.refIds.length, `${s.id}: “${c.text}”`).toBeGreaterThan(0);
        for (const r of c.refIds) expect(CTX_REFS.has(r), `${s.id}: ${r}`).toBe(true);
        // a sentence, ending as one
        expect(c.text, s.id).toMatch(/^[A-Z“(].*[.)]$/s);
      }
    }
    // every syndrome reference is cited somewhere, with a DOI or PMC link
    const cited = new Set(SYNDROMES.flatMap((s) => [...s.signs, ...s.areas, ...s.firmness].flatMap((c) => c.refIds)));
    for (const [id, r] of Object.entries(SYN_REFS)) {
      expect(cited.has(id), `${id} is never cited`).toBe(true);
      expect(r.url, id).toMatch(/^https:\/\/(doi\.org\/10\.|pmc\.ncbi\.nlm\.nih\.gov\/articles\/PMC|europepmc\.org\/)/);
      expect(CTX_REFS.get(id)!.shortLabel, id).toMatch(/^[A-Z][\p{L}’ -]+ \d{4}$/u);
      // the label is the citation's first author's surname
      expect(r.citation.startsWith(CTX_REFS.get(id)!.shortLabel.replace(/ \d{4}$/, '')), id).toBe(true);
    }
  });

  it('the tracts named are the white-matter section’s, by its ids and names', () => {
    const topic = new Map(TOPICS.map((t) => [t.id, t.name]));
    for (const s of SYNDROMES) for (const t of s.tracts) expect(topic.get(t.id), `${s.id}: ${t.id}`).toBe(t.name);
  });

  it('a syndrome draws its labels and HMAT areas and nothing else in colour, whatever the colour mode', () => {
    for (const s of SYNDROMES) {
      const fns = new Set(s.fns?.map((f) => f.id));
      for (const colour of ['lobe', 'plain'] as const) {
        const p = cortexPlan({ view: 'lateral', lobe: null, colour, inflate: 0, fn: 'language', syn: s.id });
        const primary = [...p.looks].filter(([, l]) => l === 'primary').map(([id]) => id).sort();
        expect(primary, `${s.id} ${colour}`).toEqual([...s.labels.map((l) => l.id), ...fns].sort());
        expect(FUNCTIONS.every((f) => p.looks.get(f.id) === (fns.has(f.id) ? 'primary' : 'hidden'))).toBe(true);
        expect(p.title).toBe(s.name);
      }
      expect(viewLabels({ view: 'medial', lobe: 'frontal', syn: s.id }).sort()).toEqual(s.labels.map((l) => l.id).sort());
    }
    expect(LABELS.length).toBe(74);
  });

  it('a link holds the syndrome; an unknown one is dropped; a syndrome wins over a function group', () => {
    const id = SYNDROMES[0].id;
    const s = { ...defaultCortexState(), syn: id, hemi: SYNDROME.get(id)!.side };
    expect(decodeCortex(encodeCortex(s))).toEqual(s);
    expect(encodeCortex(s)).toContain(`syn=${id}`);
    expect(decodeCortex('#/atlas?v=lateral&syn=nonsense').syn).toBeNull();
    const both = decodeCortex(`#/atlas?v=lateral&f=language&syn=${id}`);
    expect([both.syn, both.fn]).toEqual([id, null]);
  });
});
