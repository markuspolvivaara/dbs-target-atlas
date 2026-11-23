import { z } from '../zod';
import { WM_ENDS } from '../data/ends';
import wmManifestJson from '../data/generated/wm-manifest.json';
import { WmManifestSchema } from '../data/schema';
import { ENDS_CAVEATS, GENERAL, GROUPS, TOPICS } from './content';
import { WM_REFERENCES } from './references';
import { ClaimSchema, TractGroupSchema, TractTopicSchema, WmReferenceSchema, type Claim, type TractGroup, type TractTopic, type WmReference } from './schema';

export const WM_MANIFEST = WmManifestSchema.parse(wmManifestJson);

export interface WmContent {
  references: WmReference[];
  topics: TractTopic[];
  groups: TractGroup[];
  general: Claim[];
  /** what the measured ends of a bundle's streamlines can and cannot say */
  endsCaveats: Claim[];
}

export function parseWmContent(): WmContent {
  return {
    references: z.array(WmReferenceSchema).parse(WM_REFERENCES),
    topics: z.array(TractTopicSchema).parse(TOPICS),
    groups: z.array(TractGroupSchema).parse(GROUPS),
    general: z.array(ClaimSchema).parse(GENERAL),
    endsCaveats: z.array(ClaimSchema).parse(ENDS_CAVEATS),
  };
}

const claimsOf = (t: TractTopic): Claim[] => [...t.course, ...t.connections, ...t.functions, ...t.deficits, ...t.surgery, ...t.atlas];

/** Cross-reference checks. Returns a list of problems (empty = consistent). */
export function crossCheckWm(c: WmContent): string[] {
  const errs: string[] = [];
  const refs = new Set(c.references.map((r) => r.id));
  const used = new Set<string>();
  const ref = (where: string, cl: Claim) => cl.refIds.forEach((r) => { used.add(r); if (!refs.has(r)) errs.push(`${where}: unknown refId '${r}'`); });
  const tracts = new Set(WM_MANIFEST.structures.map((s) => s.id));
  const topics = new Set(c.topics.map((t) => t.id));
  const dup = (what: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) { if (seen.has(id)) errs.push(`duplicate ${what} '${id}'`); seen.add(id); }
  };
  dup('reference', c.references.map((r) => r.id));
  dup('reference pmid', c.references.map((r) => r.pmid));
  dup('topic', c.topics.map((t) => t.id));
  dup('group', c.groups.map((g) => g.id));
  for (const t of c.topics) {
    if (!tracts.has(t.id)) errs.push(`topic ${t.id}: no tract with this id in wm-manifest.json`);
    claimsOf(t).forEach((cl) => ref(`topic ${t.id}`, cl));
  }
  for (const id of tracts) if (!topics.has(id)) errs.push(`tract ${id}: no topic card`);
  for (const g of c.groups) {
    g.tractIds.forEach((id) => { if (!topics.has(id)) errs.push(`group ${g.id}: unknown tract '${id}'`); });
    g.rationale.forEach((cl) => ref(`group ${g.id}`, cl));
  }
  for (const tier of ['core', 'extended', 'fossa'] as const) {
    const ids = new Set(c.topics.filter((t) => t.tier === tier).map((t) => t.id));
    const all = c.groups.find((g) => g.kind === 'all' && g.tier === tier);
    if (!all || all.tractIds.length !== ids.size || !all.tractIds.every((id) => ids.has(id))) errs.push(`the "all" group of the ${tier} tier must list exactly its tracts`);
    for (const g of c.groups.filter((x) => x.tier === tier)) for (const id of g.tractIds) if (!ids.has(id)) errs.push(`group ${g.id} (${tier}) lists ${id} from the other tier`);
  }
  for (const t of c.topics) {
    const m = WM_MANIFEST.structures.find((s) => s.id === t.id);
    if (m && m.tier !== t.tier) errs.push(`topic ${t.id}: tier ${t.tier} but the pipeline built it as ${m.tier}`);
  }
  c.general.forEach((cl) => ref('general', cl));
  c.endsCaveats.forEach((cl) => ref('ends', cl));
  for (const r of c.references) if (!used.has(r.id)) errs.push(`reference ${r.id} is never cited`);
  // every tract's ends are measured (pipeline/wm_ends.py), and no other's; a shell has no streamlines, so no ends
  const shells = new Set(WM_MANIFEST.structures.filter((s) => s.shell).map((s) => s.id));
  for (const s of WM_MANIFEST.structures) if ((s.type === 'tract') === !!s.shell) errs.push(`tract ${s.id}: streamlines or a shell, one of the two`);
  for (const id of tracts) if (!shells.has(id) && !WM_ENDS.tracts[id]) errs.push(`tract ${id}: its ends are not measured (wm-ends.json)`);
  for (const id of Object.keys(WM_ENDS.tracts)) if (!tracts.has(id)) errs.push(`wm-ends.json: unknown tract '${id}'`);
  return errs;
}

export const WM = parseWmContent();
const problems = crossCheckWm(WM);
if (problems.length) throw new Error('White-matter content inconsistent:\n' + problems.join('\n'));

export const WM_REF = new Map(WM.references.map((r) => [r.id, r]));
export const TOPIC = new Map(WM.topics.map((t) => [t.id, t]));
export const GROUP = new Map(WM.groups.map((g) => [g.id, g]));
export const WM_MAN = new Map(WM_MANIFEST.structures.map((s) => [s.id, s]));
/** a tract drawn as a shell (a mesh), not as streamlines */
export const isShell = (id: string): boolean => !!WM_MAN.get(id)?.shell;

/** The tracts of a group that are not drawn until asked for (TractTopic.offAtFirst), but for the one whose card is
 * open: what a view's hidden list holds before the reader has touched an eye. */
export function hiddenAtFirst(grpId: string, sel: string | null): string[] {
  return (GROUP.get(grpId)?.tractIds ?? []).filter((id) => TOPIC.get(id)?.offAtFirst && id !== sel);
}

