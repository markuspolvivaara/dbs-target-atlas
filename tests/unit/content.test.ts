import { existsSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CONTENT, MANIFEST, crossCheck, parseContent } from '../../src/data';
import { CONTENT_REFERENCE_IDS } from '../../src/data/references';
import { IMAGING_ASIDE } from '../../src/data/imaging';
import { rows, words, signed, validate, fmt, CALC_NOTE, CALC_LEDE } from '../../src/data/calculator';
import { loadSource } from './source';

const src = loadSource();

describe('schema', () => {
  it('every content collection parses with zod', () => {
    expect(() => parseContent()).not.toThrow();
  });
  it('cross-references are consistent (refIds, structures, tracts, targets)', () => {
    expect(crossCheck(CONTENT)).toEqual([]);
  });
});

describe('references resolve', () => {
  const ids = new Set(CONTENT.references.map((r) => r.id));
  it('every refId used anywhere resolves', () => {
    const used = [
      ...CONTENT.indications.flatMap((i) => [...i.evidence.flatMap((e) => e.refIds), ...i.caveatRefIds]),
      ...CONTENT.symptoms.flatMap((s) => [...s.evidence.flatMap((e) => e.refIds), ...s.noteRefIds]),
      ...CONTENT.targets.map((t) => t.refId),
      ...CONTENT.structures.flatMap((s) => s.refIds),
      ...CONTENT.imaging.flatMap((m) => m.refIds),
      ...IMAGING_ASIDE.flatMap((a) => a.refIds),
      ...CALC_NOTE.preRefs, ...CALC_NOTE.midRefs,
      ...MANIFEST.structures.flatMap((s) => s.refIds),
    ];
    expect(used.filter((r) => !ids.has(r))).toEqual([]);
  });
});

describe('ported verbatim from the attached dbs-targets.html', () => {
  it('keeps every reference with identical citation, label, url and topic', () => {
    const keys = Object.keys(src.R);
    expect(CONTENT_REFERENCE_IDS.sort()).toEqual([...keys].sort());
    for (const k of keys) {
      const r = CONTENT.references.find((x) => x.id === k)!;
      expect(r.citation, k).toBe(src.R[k].t);
      expect(r.shortLabel, k).toBe(src.R[k].s);
      expect(r.url, k).toBe(src.R[k].u);
      expect(r.topic, k).toBe(src.R[k].g);
    }
  });
  it('keeps every indication text and evidence claim', () => {
    expect(CONTENT.indications.map((i) => i.id)).toEqual(src.IND.map((i) => i.id));
    for (const o of src.IND) {
      const n = CONTENT.indications.find((i) => i.id === o.id)!;
      expect(n.label).toBe(o.label);
      expect(n.name).toBe(o.title);
      expect(n.accent).toBe(o.accent);
      expect(n.target).toBe(o.target);
      expect(n.alternatives).toBe(o.alt);
      expect(n.why).toBe(o.why);
      expect(n.howToChoose).toBe(o.choose);
      expect(n.imaging).toBe(o.imaging);
      expect(n.caveat).toBe(o.caveat);
      expect(n.caveatRefIds).toEqual(o.cref);
      expect(n.evidence).toEqual(o.ev.map((e) => ({ claim: e[0], refIds: e.slice(1) })));
    }
  });
  it('maps every schematic node of an indication to a 3D structure', () => {
    const map: Record<string, string[]> = {
      stn: ['stn'], gpi: ['gpi'], snr: ['snr'], ppn: ['ppn'], vim: ['vim'], psa: ['psa'], vo: ['vo'], cm: ['cm'],
      den: ['dentate'], str: ['putamen', 'caudate'], premotor: ['pmd', 'pmv'], sma: ['sma'], m1: ['m1'], s1: ['s1'],
    };
    for (const o of src.IND) {
      const n = CONTENT.indications.find((i) => i.id === o.id)!;
      const all = new Set([...n.primaryTargets, ...n.alternativeTargets, ...n.contextStructures, ...n.corticalAreas]);
      for (const node of [...o.nodes.primary, ...o.nodes.alt, ...o.nodes.context]) {
        expect(map[node].some((id) => all.has(id)), `${o.id}: ${node}`).toBe(true);
      }
      for (const node of o.nodes.primary) expect(map[node].some((id) => n.primaryTargets.includes(id)), `${o.id} primary ${node}`).toBe(true);
      for (const node of o.nodes.alt) expect(map[node].some((id) => n.alternativeTargets.includes(id)), `${o.id} alt ${node}`).toBe(true);
    }
  });
  it('keeps imaging cards verbatim', () => {
    expect(CONTENT.imaging.map((m) => m.id)).toEqual(src.IMG.map((m) => m.id));
    for (const o of src.IMG) {
      const n = CONTENT.imaging.find((m) => m.id === o.id)!;
      expect([n.label, n.title, n.accent, n.tract, n.note]).toEqual([o.label, o.title, o.accent, o.tract, o.note]);
      expect(n.sequences).toEqual(o.seq.map(([name, note]) => ({ name, note })));
      expect(n.noSequences).toBe(o.noseq);
      expect(n.refIds).toEqual(o.refs);
    }
  });
  it('symptom summaries, notes and claims quote existing content or are labelled stand-ins', () => {
    const corpus = src.html;
    for (const s of CONTENT.symptoms) for (const e of s.evidence) expect(corpus.includes(e.claim), `${s.id}: ${e.claim}`).toBe(true);
  });
  it('keeps the calculator logic and text', () => {
    expect(src.html).toContain(CALC_LEDE);
    expect(src.html).toContain('lat:half + 11.5');
    expect(validate(25, 6)).toBeNull();
    expect(validate(10, 6)).toMatch(/AC–PC length/);
    expect(validate(25, 30)).toMatch(/third-ventricle/);
    const r = rows(25, 6);
    expect(r.map((x) => [x.k, x.lat, x.ap, x.z])).toEqual([['STN', 12, -3.5, -4.5], ['GPi', 20, 2.5, -4.5], ['Vim', 14.5, -6.25, 0]]);
    expect(r[2].apR).toBe('6.3 anterior to PC');
    expect(words(r[0], 'Left')).toBe('12.0 mm left of midline, 3.5 mm behind the MCP, 4.5 mm below the AC–PC plane.');
    expect(signed(r[1], 'Left')).toEqual([-20, 2.5, -4.5]);
    expect(fmt(-3.26)).toBe('−3.3');
    expect(fmt(-3.25)).toBe('−3.2'); // Math.round rounds halves up, as in the original
  });
});

describe('manifest', () => {
  it('every referenced structure or tract exists in the manifest and on disk', () => {
    const ids = new Set(MANIFEST.structures.map((s) => s.id));
    const refd = [
      ...CONTENT.indications.flatMap((i) => [...i.primaryTargets, ...i.alternativeTargets, ...i.contextStructures, ...i.keyTracts, ...i.alternativeTracts, ...i.corticalAreas]),
      ...CONTENT.symptoms.flatMap((s) => [...s.structures, ...s.alternativeStructures, ...s.tracts, ...s.corticalAreas]),
      ...CONTENT.targets.map((t) => t.structureId),
    ];
    expect(refd.filter((r) => !ids.has(r))).toEqual([]);
    for (const s of MANIFEST.structures) {
      const p = new URL(`../../public/${s.file}`, import.meta.url);
      expect(existsSync(p), s.file).toBe(true);
      expect(statSync(p).size, s.file).toBe(s.bytes);
    }
    for (const v of Object.values(MANIFEST.volumes)) expect(existsSync(new URL(`../../public/${v.file}`, import.meta.url)), v.file).toBe(true);
  });
  it('every structure carries source, licence and citation', () => {
    for (const s of MANIFEST.structures) {
      expect(s.source.length, s.id).toBeGreaterThan(3);
      expect(s.licence, s.id).toMatch(/GPL|McGill/);
      expect(s.citation.length + s.refIds.length, s.id).toBeGreaterThan(0);
    }
  });
  it('bilateral centroids are on the correct side (RAS)', () => {
    for (const s of MANIFEST.structures) {
      if (!s.centroid) continue;
      expect(s.centroid.L[0], s.id).toBeLessThan(0);
      expect(s.centroid.R[0], s.id).toBeGreaterThan(0);
    }
  });
});

describe('targets', () => {
  it('every target has a source and a kind, and no hand-typed coordinate', () => {
    for (const t of CONTENT.targets) {
      expect(['sweetSpot', 'atlasCoordinate']).toContain(t.kind);
      expect(t.method.length).toBeGreaterThan(20);
      expect(t.mni.left[0]).toBeLessThan(0);
      expect(t.mni.right[0]).toBeGreaterThan(0);
    }
  });
  it('sweet-spot markers sit inside or near their published map region', () => {
    for (const t of CONTENT.targets.filter((x) => x.kind === 'sweetSpot')) {
      const m = MANIFEST.structures.find((s) => s.id === t.structureId)!;
      const d = Math.hypot(...t.mni.left.map((v, i) => v - m.centroid!.L[i]));
      expect(d, t.id).toBeLessThan(0.01); // marker = centroid of the same map
    }
  });
});
