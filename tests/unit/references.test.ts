import { describe, expect, it } from 'vitest';
import { REFERENCE_LISTS, doiOf, yearOf, type AnyReference } from '../../src/data/all-references';

// The details of the references themselves, in every section's list (the audit's roadmap, section 4: the DBS list had
// 14 references with wrong details, and nothing noticed). Whether each cited reference resolves, and whether each is
// used, is tested section by section. Run scripts/check-references.ts by hand to compare them with the records.

/** References with no DOI or PMID, and why: guidelines, regulatory records and web pages. A journal article must have one. */
const NO_IDENTIFIER: Record<string, string> = {
  'dbs/mds2024': 'a society’s web page', 'dbs/sid': 'a society’s web page', 'dbs/nct': 'a trial registry',
  'dbs/calgary': 'a guideline web page', 'dbs/fda2025': 'an FDA record',
  'dbs/fda1997': 'an FDA record', 'dbs/fda2002': 'an FDA record', 'dbs/fda2015pd': 'an FDA record', 'dbs/fdaabbott': 'an FDA record',
  'dbs/fdaboston': 'an FDA record', 'dbs/fda2003hde': 'an FDA record', 'dbs/fda2025dys': 'an FDA record', 'dbs/fda2018': 'an FDA record',
  'dbs/fdarns': 'an FDA record',
  'dbs-additions/fda1997': 'an FDA record', 'dbs-additions/fda2002': 'an FDA record', 'dbs-additions/fda2015pd': 'an FDA record',
  'dbs-additions/fdaabbott': 'an FDA record', 'dbs-additions/fdaboston': 'an FDA record', 'dbs-additions/fda2003hde': 'an FDA record',
  'dbs-additions/fda2025dys': 'an FDA record', 'dbs-additions/fda2018': 'an FDA record', 'dbs-additions/fdarns': 'an FDA record',
  'spine/isncsci2019': 'a classification worksheet', 'spine/aosurgeryref': 'a web reference', 'spine/aosurgeryrefpedicle': 'a web reference',
};

const all: AnyReference[] = Object.values(REFERENCE_LISTS).flat();
const key = (r: AnyReference) => `${r.list}/${r.id}`;
const dupes = <T>(xs: T[]) => [...new Set(xs.filter((x, i) => xs.indexOf(x) !== i))];

describe('reference details in every list', () => {
  it('gathers every section’s list', () => {
    expect(Object.keys(REFERENCE_LISTS).length).toBe(12);
    for (const [list, refs] of Object.entries(REFERENCE_LISTS)) expect(refs.length, list).toBeGreaterThan(0);
  });
  it('each id, DOI and PMID once in its list', () => {
    // (the approach list held Luzzi 2022 twice, the two entries differing only in the DOI's case)
    for (const [list, refs] of Object.entries(REFERENCE_LISTS)) {
      expect(dupes(refs.map((r) => r.id)), list).toEqual([]);
      expect(dupes(refs.map(doiOf).filter((d): d is string => !!d)), list).toEqual([]);
      expect(dupes(refs.map((r) => r.pmid).filter((p): p is string => !!p)), list).toEqual([]);
    }
  });
  it('a journal article has a DOI or a PMID; the others are named, with why', () => {
    const without = all.filter((r) => !doiOf(r) && !r.pmid && !/pubmed|europepmc|\/pmc\//i.test(r.url)).map(key);
    expect(without.sort()).toEqual(Object.keys(NO_IDENTIFIER).sort());
  });
  it('a year in every citation, and the short label’s year is the citation’s', () => {
    for (const r of all) {
      // (a web page may give none: the calgary guideline page)
      if (!NO_IDENTIFIER[key(r)]) expect(yearOf(r.citation), key(r)).not.toBeNull();
      const y = /\b(?:19|20)\d\d\b/.exec(r.shortLabel)?.[0];
      if (y) expect(r.citation, key(r)).toContain(y);
    }
  });
  it('the DOI in a reference’s address is the one in its citation', () => {
    for (const r of all) {
      const inUrl = doiOf({ url: r.url, citation: '' }), inCitation = doiOf({ url: '', citation: r.citation });
      if (inUrl && inCitation) expect(inUrl, key(r)).toBe(inCitation);
    }
  });
  it('a paper cited in several lists has the same year and the same PMID in each', () => {
    const byDoi = new Map<string, AnyReference[]>();
    for (const r of all) { const d = doiOf(r); if (d) byDoi.set(d, [...(byDoi.get(d) ?? []), r]); }
    for (const [d, rs] of byDoi) {
      expect(new Set(rs.map((r) => yearOf(r.citation))).size, d).toBe(1);
      expect(new Set(rs.map((r) => r.pmid).filter(Boolean)).size, d).toBeLessThanOrEqual(1);
    }
  });
});
