import { z } from 'zod';
import { IMAGING } from './imaging';
import { INDICATIONS } from './indications';
import { REFERENCES } from './references';
import { ImagingSchema, IndicationSchema, ReferenceSchema, StructureSchema, SymptomSchema, TargetSchema } from './schema';
import type { Imaging, Indication, Reference, Structure, Symptom, Target } from './schema';
import { MANIFEST, STRUCTURES } from './structures';
import { SYMPTOMS } from './symptoms';
import { TARGETS } from './targets';

export interface Content {
  references: Reference[];
  indications: Indication[];
  symptoms: Symptom[];
  targets: Target[];
  structures: Structure[];
  imaging: Imaging[];
}

/** Parse every content collection with zod; throws on the first invalid record. */
export function parseContent(): Content {
  return {
    references: z.array(ReferenceSchema).parse(REFERENCES),
    indications: z.array(IndicationSchema).parse(INDICATIONS),
    symptoms: z.array(SymptomSchema).parse(SYMPTOMS),
    targets: z.array(TargetSchema).parse(TARGETS),
    structures: z.array(StructureSchema).parse(STRUCTURES),
    imaging: z.array(ImagingSchema).parse(IMAGING),
  };
}

/** Cross-reference checks. Returns a list of problems (empty = consistent). */
export function crossCheck(c: Content): string[] {
  const errs: string[] = [];
  const refs = new Set(c.references.map((r) => r.id));
  const ids = new Set(MANIFEST.structures.map((s) => s.id));
  const tracts = new Set(MANIFEST.structures.filter((s) => s.type === 'tract').map((s) => s.id));
  const cortex = new Set(MANIFEST.structures.filter((s) => s.type === 'cortex').map((s) => s.id));
  const targets = new Set(c.targets.map((t) => t.id));
  const inds = new Set(c.indications.map((i) => i.id));
  const syms = new Set(c.symptoms.map((s) => s.id));
  const MAN = new Map(MANIFEST.structures.map((s) => [s.id, s]));
  const ref = (where: string, id: string) => { if (!refs.has(id)) errs.push(`${where}: unknown refId '${id}'`); };
  const has = (where: string, id: string, set: Set<string>, what: string) => {
    if (!set.has(id)) errs.push(`${where}: ${what} '${id}' not in manifest/content`);
  };
  const dup = (what: string, list: { id: string }[]) => {
    const seen = new Set<string>();
    for (const x of list) { if (seen.has(x.id)) errs.push(`duplicate ${what} id '${x.id}'`); seen.add(x.id); }
  };
  dup('reference', c.references); dup('indication', c.indications); dup('symptom', c.symptoms);
  dup('target', c.targets); dup('structure', c.structures);

  for (const i of c.indications) {
    const w = `indication ${i.id}`;
    i.evidence.forEach((e) => e.refIds.forEach((r) => ref(w, r)));
    i.caveatRefIds.forEach((r) => ref(w, r));
    [...i.primaryTargets, ...i.alternativeTargets, ...i.contextStructures].forEach((s) => has(w, s, ids, 'structure'));
    [...i.keyTracts, ...i.alternativeTracts].forEach((t) => has(w, t, tracts, 'tract'));
    i.corticalAreas.forEach((a) => has(w, a, cortex, 'cortical area'));
    [...i.targetMarkers, ...i.alternativeMarkers].forEach((t) => has(w, t, targets, 'target'));
    i.symptomIds.forEach((s) => has(w, s, syms, 'symptom'));
    i.extraVolumes.forEach((v) => { if (MAN.get(v)?.type !== 'target') errs.push(`${w}: extra volume '${v}' is not a sweet-spot volume`); });
  }
  for (const s of c.symptoms) {
    const w = `symptom ${s.id}`;
    has(w, s.indicationId, inds, 'indication');
    if (!c.indications.find((i) => i.id === s.indicationId)?.symptomIds.includes(s.id)) errs.push(`${w}: not listed by its indication`);
    s.evidence.forEach((e) => e.refIds.forEach((r) => ref(w, r)));
    s.noteRefIds.forEach((r) => ref(w, r));
    [...s.structures, ...s.alternativeStructures, ...s.contextStructures].forEach((x) => has(w, x, ids, 'structure'));
    s.tracts.forEach((t) => has(w, t, tracts, 'tract'));
    s.corticalAreas.forEach((a) => has(w, a, cortex, 'cortical area'));
    if (s.targetId) has(w, s.targetId, targets, 'target');
  }
  for (const t of c.targets) {
    has(`target ${t.id}`, t.structureId, ids, 'structure');
    ref(`target ${t.id}`, t.refId);
    if (t.kind === 'sweetSpot' && !MANIFEST.structures.find((s) => s.id === t.structureId && s.type === 'target'))
      errs.push(`target ${t.id}: sweetSpot must point to a sweet-spot volume`);
  }
  for (const s of c.structures) s.refIds.forEach((r) => ref(`structure ${s.id}`, r));
  for (const m of c.imaging) {
    has(`imaging ${m.id}`, m.structureId, ids, 'structure');
    m.refIds.forEach((r) => ref(`imaging ${m.id}`, r));
  }
  return errs;
}

export const CONTENT: Content = parseContent();
const problems = crossCheck(CONTENT);
if (problems.length) throw new Error('Content cross-check failed:\n' + problems.join('\n'));

export const byId = <T extends { id: string }>(list: T[]) => new Map(list.map((x) => [x.id, x]));
export const REF = byId(CONTENT.references);
export const IND = byId(CONTENT.indications);
export const SYM = byId(CONTENT.symptoms);
export const TGT = byId(CONTENT.targets);
export const STRUCT = byId(CONTENT.structures);
export const MAN = byId(MANIFEST.structures);
export { MANIFEST };
