import { z } from '../zod';
import bsDefinitions from '../data/generated/bs-definitions.json';
import bsManifestJson from '../data/generated/bs-manifest.json';
import bsZones from '../data/generated/bs-zones.json';
import manifestJson from '../data/generated/manifest.json';
import wmManifestJson from '../data/generated/wm-manifest.json';
import { BsManifestSchema, ManifestSchema, WmManifestSchema, type ManifestStructure } from '../data/schema';
import { AAN_GENERAL, AAN_TRANSMITTER, HCP_ATLAS, NERVE_COMPONENTS, NOT_DRAWN, NUCLEI_LEVEL, NUCLEI_NOT_MODELLED, SEZ_GENERAL, SHARED_NUCLEI, TRACT_TEXT, ZONES } from './content';
import { BS_REFERENCES } from './references';
import { BsReferenceSchema, ClaimSchema, ZoneContentSchema, type Claim } from './schema';

/**
 * Brainstem section data. Its own structures (pipeline/brainstem_build.py) are in MNI space like the DBS and
 * white-matter sections, so it also shows a few of their structures: the red nucleus, substantia nigra,
 * subthalamic nucleus, thalamus and dentate nucleus (DBS atlases) and the brainstem tracts (HCP-1065). Four tracts
 * the HCP-1065 atlas lacks are its own structures, streamlines of the HCP-YA atlas (`category: 'tract'`).
 */
export const BS_MANIFEST = BsManifestSchema.parse(bsManifestJson);
const DBS = ManifestSchema.parse(manifestJson);
const WM = WmManifestSchema.parse(wmManifestJson);

/** deep nuclei from the DBS section's atlases, shown with the brainstem */
export const DBS_NUCLEI = ['rn', 'snr', 'snc', 'stn', 'thal', 'dentate'];
/** brainstem tracts from the white-matter section (HCP-1065) */
export const TRACTS = ['wm_cst', 'wm_cbt', 'wm_ml', 'wm_scp', 'wm_mcp', 'wm_icp', 'wm_rst', 'wm_drtt'];
export const CONTEXT: ManifestStructure[] = [
  ...DBS.structures.filter((s) => DBS_NUCLEI.includes(s.id)),
  ...WM.structures.filter((s) => TRACTS.includes(s.id)),
];
export const VOLUMES = DBS.volumes;
export const ALL: ManifestStructure[] = [...BS_MANIFEST.structures, ...CONTEXT];
export const BS = new Map(ALL.map((s) => [s.id, s]));
export const OWN = new Set(BS_MANIFEST.structures.map((s) => s.id));
/** the section's own tracts: streamlines of the HCP-YA atlas (the others are the white-matter section's, of HCP-1065) */
export const OWN_TRACTS = BS_MANIFEST.structures.filter((s) => s.category === 'tract').map((s) => s.id);
/** how each of them sits on this section's template, by side (measured by the build) */
export const TRACT_FIT = BS_MANIFEST.fit.tracts;
/** every cranial nerve a nucleus or nerve belongs to: a nucleus may serve several */
export const nervesOf = (s: ManifestStructure): number[] => s.cranialNerves ?? (s.cranialNerve ? [s.cranialNerve] : []);
/** the model's nuclei of a cranial nerve, those it shares with other nerves among them */
export const nucleiOf = (cn: number): ManifestStructure[] => BS_MANIFEST.structures.filter((s) => s.category === 'cnNucleus' && nervesOf(s).includes(cn));

const V3 = z.tuple([z.number(), z.number(), z.number()]);
const ZoneGeomSchema = z.object({
  id: z.string(), name: z.string(), region: z.enum(['midbrain', 'pons', 'floor', 'medulla']), kind: z.enum(['line', 'area']),
  construction: z.string(), anchor: z.object({ L: V3, R: V3 }),
});
const ZonesFileSchema = z.object({ zones: z.array(ZoneGeomSchema), measured: z.record(z.string(), z.unknown()) });
const ZF = ZonesFileSchema.parse(bsZones);
export const ZONE_GEOM = new Map(ZF.zones.map((g) => [g.id, g]));
export const MEASURED = ZF.measured;

export const BS_REFS = z.array(BsReferenceSchema).parse(BS_REFERENCES);
export const BS_REF = new Map(BS_REFS.map((r) => [r.id, r]));
export const ZONE_TEXT = new Map(z.array(ZoneContentSchema).parse(ZONES).map((t) => [t.id, t]));

const DefinitionSchema = z.object({ text: z.string().min(1), url: z.string().url().nullable() });
/**
 * Shipped definitions that are wrong on their face, corrected here (the site audit's D-020; the facial nerve's as the
 * skull base corrects it, C-009): the words replaced, or the text withdrawn, and why. The texts are CC BY-SA, so the
 * card says what was changed.
 */
export const BS_DEFINITION_EDITS: Record<string, { replace?: [string, string][]; withdraw?: boolean; why: string }> = {
  'Accessory nucleus of oculomotor nerve': { withdraw: true,
    why: 'The text shipped for the Edinger–Westphal nucleus was the oculomotor nucleus’s, which never mentions it; it is not shown.' },
  'Nucleus of oculomotor nerve': {
    replace: [[' Those of the posterior group are six in number, five of which are symmetrical on the two sides of the middle line, while the sixth is centrally placed and is common to the nerves of both sides.', '']],
    why: 'the last sentence, Gray’s Anatomy of 1918 on the number of its cell groups, removed.' },
  'Nucleus of trochlear nerve': {
    replace: [['The nucleus of the trochlear nerve () is', 'The nucleus of the trochlear nerve is'], [' (see diagram at right)', ''],
      [', which has a midbrain nucleus called the mesencephalic nucleus of trigeminal nerve, which functions in preserving dentition.', ', which has a midbrain nucleus, the mesencephalic nucleus of the trigeminal nerve.']],
    why: 'empty brackets, a reference to a diagram that is not here, and “which functions in preserving dentition” removed.' },
  'Trochlear nerve (IV)': { replace: [['The trochlear nerve (), also', 'The trochlear nerve, also']], why: 'empty brackets removed.' },
  'Basilar artery': { replace: [['The basilar artery () is', 'The basilar artery is']], why: 'empty brackets removed.' },
  'Facial nerve (VII)': { replace: [['The facial nerve (the labyrinthine segment) is', 'The facial nerve is']],
    why: '“(the labyrinthine segment)” removed after “The facial nerve”: that is one of the three segments of the nerve’s bony canal, not the nerve.' },
  'Superior salivatory nucleus': { replace: [[' They are located in the pontine tegmentum in the brainstem.', ' They are located in the brainstem.']],
    why: '“in the pontine tegmentum” removed: it holds for the superior nucleus only, and the model draws the inferior one in the medulla.' },
  'Inferior salivatory nucleus': { replace: [[' They are located in the pontine tegmentum in the brainstem.', ' They are located in the brainstem.']],
    why: '“in the pontine tegmentum” removed: it holds for the superior nucleus only, and the model draws the inferior one in the medulla.' },
};
/** Wikipedia-derived definitions shipped in Z-Anatomy (CC BY-SA 3.0), by structure name, with BS_DEFINITION_EDITS applied. */
export const DEFINITIONS: Record<string, { text: string; url: string | null; edited?: string }> = Object.fromEntries(
  Object.entries(z.record(z.string(), DefinitionSchema).parse(bsDefinitions)).flatMap(([name, d]) => {
    const e = BS_DEFINITION_EDITS[name];
    if (!e) return [[name, d]];
    if (e.withdraw) return [];
    const text = (e.replace ?? []).reduce((t, [a, b]) => t.replace(a, b), d.text);
    return [[name, { ...d, text, edited: e.why }]];
  }));

export type Kind = 'surface' | 'feature' | 'csf' | 'cnNucleus' | 'aan' | 'nerve' | 'artery' | 'sez' | 'dbs' | 'tract';
export function kindOf(id: string): Kind {
  const m = BS.get(id);
  if (!m) return 'feature';
  if (!OWN.has(id)) return m.type === 'tract' ? 'tract' : 'dbs';
  return (m.category ?? 'feature') as Kind;
}
export const KIND_LABEL: Record<Kind, string> = {
  surface: 'Brainstem', feature: 'Surface feature', csf: 'Fluid space', cnNucleus: 'Cranial nerve nucleus', aan: 'Arousal network nucleus',
  nerve: 'Cranial nerve', artery: 'Artery', sez: 'Safe entry zone', dbs: 'Deep nucleus', tract: 'Tract',
};
export const ofKind = (k: Kind) => ALL.filter((s) => kindOf(s.id) === k).map((s) => s.id);

/** Cross-checks between content, references and the generated files. Returns problems (empty = consistent). */
export function crossCheckBs(): string[] {
  const errs: string[] = [];
  const used = new Set<string>();
  const ref = (where: string, cl: Claim) => {
    ClaimSchema.parse(cl);
    cl.refIds.forEach((r) => { used.add(r); if (!BS_REF.has(r)) errs.push(`${where}: unknown refId '${r}'`); });
  };
  for (const g of ZF.zones) {
    const t = ZONE_TEXT.get(g.id);
    if (!t) { errs.push(`zone ${g.id}: no content`); continue; }
    [...t.borders, ...t.approach, ...t.risks, ...t.measures].forEach((cl) => ref(`zone ${g.id}`, cl));
    if (!BS.has(g.id)) errs.push(`zone ${g.id}: no structure in bs-manifest.json`);
  }
  for (const id of ZONE_TEXT.keys()) if (!ZONE_GEOM.has(id)) errs.push(`zone content ${id}: no geometry`);
  SEZ_GENERAL.forEach((cl) => ref('safe entry zones', cl));
  AAN_GENERAL.forEach((cl) => ref('arousal network', cl));
  NOT_DRAWN.forEach((n) => n.refIds.forEach((r) => { used.add(r); if (!BS_REF.has(r)) errs.push(`not drawn ${n.name}: unknown refId '${r}'`); }));
  for (const [abbr, cl] of Object.entries(AAN_TRANSMITTER)) {
    ref(`AAN ${abbr}`, cl);
    if (!BS_MANIFEST.structures.some((s) => s.abbr === abbr)) errs.push(`AAN ${abbr}: no structure`);
  }
  for (const s of BS_MANIFEST.structures.filter((x) => x.category === 'aan')) if (!AAN_TRANSMITTER[s.abbr ?? '']) errs.push(`${s.id}: no transmitter claim`);
  for (const [cn, cl] of Object.entries(NERVE_COMPONENTS)) ref(`nerve ${cn}`, cl);
  for (const s of BS_MANIFEST.structures.filter((x) => x.category === 'nerve')) if (!NERVE_COMPONENTS[s.cranialNerve ?? 0]) errs.push(`${s.id}: no components`);
  // a nerve has nuclei in the model, or sourced text saying which it has that the model lacks: never neither, never both
  for (const s of BS_MANIFEST.structures.filter((x) => x.category === 'nerve')) {
    const cn = s.cranialNerve ?? 0;
    if ((nucleiOf(cn).length > 0) === !!NUCLEI_NOT_MODELLED[cn]) errs.push(`${s.id}: nuclei in the model ${nucleiOf(cn).length}, 'not modelled' text ${!!NUCLEI_NOT_MODELLED[cn]}`);
  }
  for (const [cn, t] of Object.entries(NUCLEI_NOT_MODELLED)) t.claims.forEach((cl) => ref(`nuclei of nerve ${cn}`, cl));
  // a nucleus that serves several nerves says, from a source, what each has in it
  for (const s of BS_MANIFEST.structures.filter((x) => x.category === 'cnNucleus')) {
    if (!!s.cranialNerves !== !!SHARED_NUCLEI[s.id]) errs.push(`${s.id}: serves ${nervesOf(s).join(', ')}, shared-nucleus text ${!!SHARED_NUCLEI[s.id]}`);
    if (s.cranialNerves && !s.cranialNerves.includes(s.cranialNerve ?? 0)) errs.push(`${s.id}: listed under a nerve it does not serve`);
  }
  for (const [id, cl] of Object.entries(SHARED_NUCLEI)) cl.forEach((x) => ref(`shared nucleus ${id}`, x));
  // a nucleus moved in the source model says, from a source, at what level it lies
  for (const s of BS_MANIFEST.structures) if (!!s.movedMm !== !!NUCLEI_LEVEL[s.id]) errs.push(`${s.id}: moved ${s.movedMm ?? 0} mm, level text ${!!NUCLEI_LEVEL[s.id]}`);
  for (const [id, cl] of Object.entries(NUCLEI_LEVEL)) ref(`moved nucleus ${id}`, cl);
  // the HCP-YA tracts: each has its text and its measured fit
  HCP_ATLAS.forEach((cl) => ref('HCP-YA atlas', cl));
  for (const id of OWN_TRACTS) {
    const t = TRACT_TEXT[id];
    if (!t) { errs.push(`tract ${id}: no content`); continue; }
    [...t.claims, ...t.measures].forEach((cl) => ref(`tract ${id}`, cl));
    if (!TRACT_FIT[id]) errs.push(`tract ${id}: not measured against the template`);
  }
  for (const id of Object.keys(TRACT_TEXT)) if (!OWN_TRACTS.includes(id)) errs.push(`tract content ${id}: no structure`);
  for (const id of [...DBS_NUCLEI, ...TRACTS]) if (!BS.has(id)) errs.push(`context structure ${id} missing from its manifest`);
  for (const r of BS_REFS) if (!used.has(r.id)) errs.push(`reference ${r.id} is never cited`);
  const ids = BS_REFS.map((r) => r.id);
  for (const id of ids) if (ids.indexOf(id) !== ids.lastIndexOf(id)) errs.push(`duplicate reference ${id}`);
  return errs;
}

const problems = crossCheckBs();
if (problems.length) throw new Error('Brainstem content inconsistent:\n' + problems.join('\n'));
