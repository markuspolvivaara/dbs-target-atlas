/**
 * Every section's reference list in one form, for the reference checks (tests/unit/references.test.ts and
 * scripts/check-references.ts). Not used by the site itself.
 */
import { REFERENCES } from './references';
import { EPILEPSY_REFERENCES } from './epilepsy';
import { ADDITION_REFERENCES } from './additions';
import { BS_REFERENCES } from '../brainstem/references';
import { WM_REFERENCES } from '../tracts/references';
import { VE_REFERENCES } from '../ventricles/references';
import { VA_REFERENCES } from '../vascular/references';
import { FORAMEN_REFS } from '../skullbase/foramina';
import { TB_REFS } from '../skullbase/temporal';
import { APPROACH_REFS } from '../skullbase/approaches';
import { SP_REFS } from '../spine';
import { CTX_REFS } from '../cortex';

export interface AnyReference {
  list: string;
  id: string;
  shortLabel: string;
  citation: string;
  url: string;
  pmid?: string;
  pmcid?: string;
}

type Raw = { id: string; shortLabel: string; citation: string; url: string; pmid?: string; pmcid?: string };
const from = (list: string, refs: Iterable<Raw>): AnyReference[] =>
  [...refs].map((r) => ({ list, id: r.id, shortLabel: r.shortLabel, citation: r.citation, url: r.url, pmid: r.pmid, pmcid: r.pmcid }));

/** Each list as its section keeps it (the DBS list and its additions and epilepsy lists apart, as they are kept). */
export const REFERENCE_LISTS: Record<string, AnyReference[]> = {
  dbs: from('dbs', REFERENCES),
  'dbs-epilepsy': from('dbs-epilepsy', EPILEPSY_REFERENCES),
  'dbs-additions': from('dbs-additions', ADDITION_REFERENCES),
  brainstem: from('brainstem', BS_REFERENCES),
  tracts: from('tracts', WM_REFERENCES),
  ventricles: from('ventricles', VE_REFERENCES),
  vascular: from('vascular', VA_REFERENCES),
  'skullbase-foramina': from('skullbase-foramina', FORAMEN_REFS),
  'skullbase-temporal': from('skullbase-temporal', TB_REFS),
  'skullbase-approaches': from('skullbase-approaches', APPROACH_REFS),
  spine: from('spine', [...SP_REFS].map(([id, r]) => ({ id, ...r }))),
  cortex: from('cortex', [...CTX_REFS].map(([id, r]) => ({ id, ...r }))),
};

/** A reference's DOI, from its address or its citation, lower case (DOIs are case-insensitive). */
export function doiOf(r: Pick<AnyReference, 'url' | 'citation'>): string | null {
  const m = /10\.\d{4,9}\/[^\s"<>]+/.exec(`${r.url} ${r.citation}`);
  return m ? m[0].replace(/[.,;)]+$/, '').toLowerCase() : null;
}

/** The year a citation gives: the first four-digit year after the authors (19xx or 20xx). */
export function yearOf(citation: string): string | null {
  const m = /\b(19|20)\d\d\b/.exec(citation);
  return m ? m[0] : null;
}
