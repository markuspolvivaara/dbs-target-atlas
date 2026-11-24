/**
 * Checks every reference the site cites against the bibliographic record: Europe PMC by PMID or DOI, and Crossref by
 * DOI for papers Europe PMC does not hold. For each, the first author, the year and the title in the site's citation
 * are compared with the record's, and the record's identifiers with the site's. Prints a table of what differs and of
 * what could not be found. It needs the network, so it is run by hand, not in CI (the audit's roadmap, section 4).
 *
 * Use: node scripts/run-ts.mjs scripts/check-references.ts [out.md]
 *
 * Each record found is kept in scripts/.cache/references.json (not in git), so a run that stops (Europe PMC can take
 * 20 s or more to answer at times) is taken up where it stopped; delete the file to look everything up again.
 *
 * It sends only the references' identifiers (PMID, DOI) to Europe PMC and Crossref, under a generic client name.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { REFERENCE_LISTS, doiOf, yearOf, type AnyReference } from '../src/data/all-references';

const AGENT = 'OpenNeuroAtlas-reference-check/1.0';
const PAUSE_MS = 150;
const TIMEOUT_MS = 60_000;
const CACHE = 'scripts/.cache/references.json';

interface Rec { source: string; title: string; year: string | null; firstAuthor: string | null; doi: string | null; pmid: string | null; pmcid: string | null }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function json(url: string): Promise<unknown | null> {
  for (let tries = 0; tries < 3; tries++) {
    try {
      // (each request given TIMEOUT_MS: one that hung held the whole run)
      const res = await fetch(url, { headers: { 'User-Agent': AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (res.status === 404) return null;
      if (res.ok) return await res.json();
    } catch { /* (tried again below) */ }
    await sleep(1000 * (tries + 1));
  }
  return null;
}

async function europePmc(query: string): Promise<Rec | null> {
  const d = await json(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?format=json&resultType=lite&pageSize=1&query=${encodeURIComponent(query)}`) as
    { resultList?: { result?: { title?: string; pubYear?: string; authorString?: string; doi?: string; pmid?: string; pmcid?: string }[] } } | null;
  const r = d?.resultList?.result?.[0];
  if (!r) return null;
  return { source: 'Europe PMC', title: r.title ?? '', year: r.pubYear ?? null, firstAuthor: surname(r.authorString ?? '') || null,
    doi: r.doi?.toLowerCase() ?? null, pmid: r.pmid ?? null, pmcid: r.pmcid ?? null };
}

async function crossref(doi: string): Promise<Rec | null> {
  const d = await json(`https://api.crossref.org/works/${encodeURIComponent(doi)}`) as
    { message?: { title?: string[]; issued?: { 'date-parts'?: number[][] }; 'published-print'?: { 'date-parts'?: number[][] }; author?: { family?: string; name?: string }[]; DOI?: string } } | null;
  const m = d?.message;
  if (!m) return null;
  // (the print issue's year, which citations give; "issued" is the earliest date, often the online one a year before)
  const y = m['published-print']?.['date-parts']?.[0]?.[0] ?? m.issued?.['date-parts']?.[0]?.[0];
  return { source: 'Crossref', title: m.title?.[0] ?? '', year: y ? String(y) : null, firstAuthor: m.author?.[0]?.family ?? m.author?.[0]?.name ?? null,
    doi: m.DOI?.toLowerCase() ?? null, pmid: null, pmcid: null };
}

/** a surname as written before the initials, "da Silva AC" → "da Silva" */
const surname = (s: string) => s.split(',')[0].trim().replace(/\s+[A-Z][A-Za-z-]{0,3}$/, '');
const entities = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
/** letters and digits only, lower case, accents taken off */
const norm = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/<[^>]+>/g, '').replace(/[^a-z0-9]+/g, '');

/**
 * What differs between a citation and its record. A record's year one before the citation's is not counted: it is
 * nearly always the online date of a paper whose print issue came the next year, the year citations give; those are
 * listed apart (in `early`).
 */
function compare(r: AnyReference, rec: Rec, early: string[]): string[] {
  const out: string[] = [];
  const first = surname(r.citation);
  // (one name may be cut short at a space, "De" for "De Benedictis", by a record kept from an earlier run)
  const [a, b] = [norm(first), norm(rec.firstAuthor ?? '')];
  if (b && !a.startsWith(b) && !b.startsWith(a)) out.push(`first author: "${first}" here, "${rec.firstAuthor}" in the record`);
  const y = yearOf(r.citation);
  if (rec.year && y && Number(rec.year) === Number(y) - 1) early.push(`${r.list}/${r.id} (${y}; ${rec.year} in ${rec.source})`);
  else if (rec.year && y !== rec.year) out.push(`year: ${y} here, ${rec.year} in the record`);
  const t = norm(entities(rec.title).replace(/\.$/, ''));
  if (t && !norm(r.citation).includes(t)) out.push(`title: the record's "${rec.title}" is not in the citation`);
  const doi = doiOf(r);
  if (rec.doi && doi && rec.doi !== doi) out.push(`DOI: ${doi} here, ${rec.doi} in the record`);
  if (rec.pmid && r.pmid && rec.pmid !== r.pmid) out.push(`PMID: ${r.pmid} here, ${rec.pmid} in the record`);
  if (rec.pmcid && r.pmcid && rec.pmcid !== r.pmcid) out.push(`PMCID: ${r.pmcid} here, ${rec.pmcid} in the record`);
  return out;
}

async function main(): Promise<void> {
  const all = Object.values(REFERENCE_LISTS).flat();
  // (one look-up per paper: the same DOI or PMID in several lists is checked once, its findings given for each)
  const seen = new Map<string, Rec | null>(existsSync(CACHE) ? Object.entries(JSON.parse(readFileSync(CACHE, 'utf8')) as Record<string, Rec | null>) : []);
  // (only records found are kept: a paper not found, perhaps because the server did not answer, is asked again next time)
  const save = () => { mkdirSync('scripts/.cache', { recursive: true }); writeFileSync(CACHE, JSON.stringify(Object.fromEntries([...seen].filter(([, r]) => r)))); };
  console.error(`${seen.size} records kept from an earlier run`);
  const rows: string[] = [];
  const missing: string[] = [];
  const noId: string[] = [];
  const early: string[] = [];
  let checked = 0;
  for (const r of all) {
    const doi = doiOf(r);
    const key = r.pmid ? `pmid:${r.pmid}` : doi ? `doi:${doi}` : null;
    if (!key) { noId.push(`${r.list}/${r.id}`); continue; }
    if (!seen.has(key)) {
      let rec = r.pmid ? await europePmc(`EXT_ID:${r.pmid} AND SRC:MED`) : await europePmc(`DOI:"${doi}"`);
      if (!rec && doi) rec = await crossref(doi);
      seen.set(key, rec);
      save();
      await sleep(PAUSE_MS);
      checked++;
      if (checked % 25 === 0) console.error(`${checked} looked up (${new Date().toISOString().slice(11, 19)})`);
    }
    const rec = seen.get(key)!;
    if (!rec) { missing.push(`| ${r.list} | ${r.id} | ${r.pmid ? `PMID ${r.pmid}` : `DOI ${doi}`} |`); continue; }
    for (const f of compare(r, rec, early)) rows.push(`| ${r.list} | ${r.id} | ${f.replace(/\|/g, '/')} | ${rec.source} |`);
  }
  const md = [
    `# Reference check (${new Date().toISOString().slice(0, 10)})`, '',
    `${all.length} references in ${Object.keys(REFERENCE_LISTS).length} lists; ${seen.size} papers (${checked} looked up in this run); ${rows.length} differences; ` +
    `${missing.length} not found; ${noId.length} without a DOI or PMID (guidelines, regulatory records, web pages: not looked up).`, '',
    '## Differences', '', '| List | Id | What differs | Record |', '|---|---|---|---|', ...rows, '',
    '## Not found', '', '| List | Id | Looked up by |', '|---|---|---|', ...missing, '',
    '## Without a DOI or PMID', '', noId.join(', '), '',
    '## The record a year earlier (online before print; not counted as differences)', '', early.join(', ') || 'None.', '',
  ].join('\n');
  const out = process.argv[3];
  if (out) writeFileSync(out, md);
  else console.log(md);
}

try {
  await main();
} catch (e) {
  console.error('check-references stopped:', e);
  process.exitCode = 1;
}
