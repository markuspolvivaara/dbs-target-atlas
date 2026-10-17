import { existsSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CONTENT, MANIFEST, crossCheck, parseContent } from '../../src/data';
import { CONTENT_REFERENCE_IDS } from '../../src/data/references';
import { IMAGING_ASIDE } from '../../src/data/imaging';
import { rows, words, signed, validate, fmt, CALC_NOTE, CALC_LEDE } from '../../src/data/calculator';
import { loadSource } from './source';
import { EPILEPSY_INDICATION, EPILEPSY_REFERENCES } from '../../src/data/epilepsy';
import { ADDITION_REFERENCES } from '../../src/data/additions';
import { plan } from '../../src/viewer/selection';

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
    // the original indications, in order, plus the researched epilepsy addition
    expect(CONTENT.indications.map((i) => i.id)).toEqual([...src.IND.map((i) => i.id), 'epi']);
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
    expect(CONTENT.imaging.map((m) => m.id)).toEqual([...src.IMG.map((m) => m.id), 'ant']);
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
    const epiClaims = new Set(EPILEPSY_INDICATION.evidence.map((e) => e.claim));
    for (const s of CONTENT.symptoms) for (const e of s.evidence) {
      const ok = s.indicationId === 'epi' ? epiClaims.has(e.claim) : corpus.includes(e.claim);
      expect(ok, `${s.id}: ${e.claim}`).toBe(true);
    }
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
      ...CONTENT.symptoms.flatMap((s) => [...s.structures, ...s.alternativeStructures, ...s.contextStructures, ...s.tracts, ...s.corticalAreas]),
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

describe('epilepsy (researched addition)', () => {
  const epiIds = new Set(EPILEPSY_REFERENCES.map((r) => r.id));
  it('is cited only with its own verified references and dataset citations', () => {
    const ind = CONTENT.indications.find((i) => i.id === 'epi')!;
    const used = [
      ...ind.evidence.flatMap((e) => e.refIds), ...ind.caveatRefIds,
      ...CONTENT.symptoms.filter((s) => s.indicationId === 'epi').flatMap((s) => [...s.evidence.flatMap((e) => e.refIds), ...s.noteRefIds]),
      ...CONTENT.imaging.filter((m) => m.id === 'ant').flatMap((m) => m.refIds),
    ];
    expect(used.filter((r) => !epiIds.has(r))).toEqual([]);
    for (const r of EPILEPSY_REFERENCES) {
      expect(r.topic).toBe('epi');
      expect(r.url).toMatch(/^https:\/\/doi\.org\/10\./);
      expect(r.citation).toContain(r.url.replace('https://doi.org/', 'doi:'));
    }
  });
  it('does not change any reference from the original page', () => {
    for (const k of Object.keys(src.R)) expect(epiIds.has(k), k).toBe(false);
  });
  it('places the ANT, its MTT junction and the CM where independent atlases put them', () => {
    const m = (id: string) => MANIFEST.structures.find((s) => s.id === id)!;
    const ant = m('ant').centroid!, cm = m('cm').centroid!, hip = m('hippocampus').centroid!;
    // ANT anterior and superior to CM; hippocampus far lateral and inferior (RAS)
    for (const side of ['L', 'R'] as const) {
      expect(ant[side][1]).toBeGreaterThan(cm[side][1]);
      expect(ant[side][2]).toBeGreaterThan(cm[side][2]);
      expect(Math.abs(hip[side][0])).toBeGreaterThan(Math.abs(ant[side][0]) + 10);
      expect(hip[side][2]).toBeLessThan(ant[side][2]);
    }
    const j = CONTENT.targets.find((t) => t.id === 't-ant-mtt')!;
    expect(j.kind).toBe('atlasCoordinate');
    // junction lies below the ANT centroid (the tract enters the ANT from below)
    expect(j.mni.left[2]).toBeLessThan(ant.L[2]);
  });
});

describe('optic tract (GPi landmark, researched addition)', () => {
  it('sits beneath the GPi on both sides', () => {
    const m = (id: string) => MANIFEST.structures.find((s) => s.id === id)!;
    for (const side of ['L', 'R'] as const) {
      expect(m('optic_tract').centroid![side][2]).toBeLessThan(m('gpi').centroid![side][2] - 5);
      expect(Math.sign(m('optic_tract').centroid![side][0])).toBe(side === 'L' ? -1 : 1);
    }
  });
  it('appears as a landmark whenever GPi is a target or alternative, and only then', () => {
    for (const ind of CONTENT.indications) {
      const p = plan(ind.id, null, true);
      const gpi = [...ind.primaryTargets, ...ind.alternativeTargets].some((t) => t === 'gpi' || t === 'gpi_sm');
      expect(p.looks.get('optic_tract') === 'context', ind.id).toBe(gpi);
      expect(plan(ind.id, null, false).looks.get('optic_tract'), ind.id).not.toBe('context');
    }
  });
  it('uses only its own verified references, distinct from the original ones', () => {
    const ids = ADDITION_REFERENCES.map((r) => r.id);
    for (const id of ids) expect(Object.keys(src.R)).not.toContain(id);
    const desc = CONTENT.structures.find((s) => s.id === 'optic_tract')!;
    expect(desc.description).toMatch(/optic tract/i);
    for (const r of desc.refIds.filter((r) => CONTENT.references.find((x) => x.id === r)?.topic !== 'atlas')) expect(ids).toContain(r);
  });
});

describe('red nucleus (STN landmark, researched addition)', () => {
  it('appears as a landmark whenever STN is a target or alternative, and only then', () => {
    for (const ind of CONTENT.indications) {
      const stn = [...ind.primaryTargets, ...ind.alternativeTargets].some((t) => t === 'stn' || t === 'stn_motor');
      expect(plan(ind.id, null, true).looks.get('rn') === 'context', ind.id).toBe(stn);
      expect(plan(ind.id, null, false).looks.get('rn'), ind.id).not.toBe('context');
    }
  });
  it('card cites only verified addition references, including the dissenting study', () => {
    const d = CONTENT.structures.find((s) => s.id === 'rn')!;
    const ids = ADDITION_REFERENCES.map((r) => r.id);
    expect(d.refIds).toEqual(expect.arrayContaining(['bejjani2000', 'andradesouza2005', 'danish2006']));
    for (const r of d.refIds.filter((r) => CONTENT.references.find((x) => x.id === r)?.topic !== 'atlas')) expect(ids).toContain(r);
  });
  it('lies posteromedial to the STN (RAS), as in the sources', () => {
    const m = (id: string) => MANIFEST.structures.find((s) => s.id === id)!.centroid!;
    for (const side of ['L', 'R'] as const) {
      expect(Math.abs(m('rn')[side][0])).toBeLessThan(Math.abs(m('stn')[side][0]));
      expect(m('rn')[side][1]).toBeLessThan(m('stn')[side][1]);
    }
  });
});

describe('STN non-motor zones', () => {
  it('are shown as context whenever the motor STN is the target', () => {
    for (const [ind, sym] of [['pd', null], ['pd', 'pd-tremor'], ['pd', 'pd-axial']] as const) {
      const p = plan(ind, sym, true);
      expect(p.looks.get('stn_motor')).toBe('primary');
      expect(p.looks.get('stn_assoc')).toBe('context');
      expect(p.looks.get('stn_limbic')).toBe('context');
    }
    // not in views where the STN is only an alternative
    expect(plan('gdys', null, true).looks.get('stn_assoc')).toBe('hidden');
  });
  it('lie anterior and medial to the motor zone (DISTAL)', () => {
    const c = (id: string) => MANIFEST.structures.find((s) => s.id === id)!.centroid!;
    for (const side of ['L', 'R'] as const) for (const z of ['stn_assoc', 'stn_limbic']) {
      expect(c(z)[side][1]).toBeGreaterThan(c('stn_motor')[side][1]);
      expect(Math.abs(c(z)[side][0])).toBeLessThan(Math.abs(c('stn_motor')[side][0]));
    }
  });
});

describe('Human Connectome Project terms', () => {
  it('flags the HCP-derived tracts and carries the required acknowledgement', () => {
    const conf = MANIFEST.structures.filter((s) => s.hcp === 'confirmed').map((s) => s.id).sort();
    expect(conf).toEqual(['cst', 'ml', 'sw_dyt', 'sw_pd', 'sw_pd_m1', 'sw_pd_pm', 'sw_pd_sma', 'sw_ts']);
    expect(MANIFEST.hcpAcknowledgement).toMatch(/^Data were provided \[in part\] by the Human Connectome Project, WU-Minn Consortium \(Principal Investigators: David Van Essen and Kamil Ugurbil; 1U54MH091657\)/);
    expect(MANIFEST.datasets.hcp.citation.length).toBe(3);
  });
  it('NOTICE and ATTRIBUTION.md include the acknowledgement', async () => {
    const { readFileSync } = await import('node:fs');
    for (const f of ['../../NOTICE', '../../ATTRIBUTION.md'])
      expect(readFileSync(new URL(f, import.meta.url), 'utf8').replace(/\s+/g, ' ')).toContain(MANIFEST.hcpAcknowledgement);
  });
});
