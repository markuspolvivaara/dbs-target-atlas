import { z } from 'zod';
import bsDefinitions from '../data/generated/bs-definitions.json';
import bsManifestJson from '../data/generated/bs-manifest.json';
import bsZones from '../data/generated/bs-zones.json';
import manifestJson from '../data/generated/manifest.json';
import wmManifestJson from '../data/generated/wm-manifest.json';
import { BsManifestSchema, ManifestSchema, WmManifestSchema, type ManifestStructure } from '../data/schema';
import { AAN_GENERAL, AAN_TRANSMITTER, NERVE_COMPONENTS, NOT_DRAWN, SEZ_GENERAL, ZONES } from './content';
import { BS_REFERENCES } from './references';
import { BsReferenceSchema, ClaimSchema, ZoneContentSchema, type Claim } from './schema';

/**
 * Brainstem section data. Its own structures (pipeline/brainstem_build.py) are in MNI space like the DBS and
 * white-matter sections, so it also shows a few of their structures: the red nucleus, substantia nigra,
 * subthalamic nucleus, thalamus and dentate nucleus (DBS atlases) and the brainstem tracts (HCP-1065).
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

const V3 = z.tuple([z.number(), z.number(), z.number()]);
const ZoneGeomSchema = z.object({
  id: z.string(), name: z.string(), region: z.enum(['midbrain', 'pons', 'floor', 'medulla']), kind: z.enum(['line', 'area']),
  construction: z.string(), anchor: z.object({ L: V3, R: V3 }),
});
const ZonesFileSchema = z.object({ zones: z.array(ZoneGeomSchema), measured: z.record(z.unknown()) });
const ZF = ZonesFileSchema.parse(bsZones);
export const ZONE_GEOM = new Map(ZF.zones.map((g) => [g.id, g]));
export const MEASURED = ZF.measured;

export const BS_REFS = z.array(BsReferenceSchema).parse(BS_REFERENCES);
export const BS_REF = new Map(BS_REFS.map((r) => [r.id, r]));
export const ZONE_TEXT = new Map(z.array(ZoneContentSchema).parse(ZONES).map((t) => [t.id, t]));

const DefinitionSchema = z.object({ text: z.string().min(1), url: z.string().url().nullable() });
/** Wikipedia-derived definitions shipped in Z-Anatomy (CC BY-SA 3.0), by structure name. */
export const DEFINITIONS = z.record(DefinitionSchema).parse(bsDefinitions);

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
  for (const id of [...DBS_NUCLEI, ...TRACTS]) if (!BS.has(id)) errs.push(`context structure ${id} missing from its manifest`);
  for (const r of BS_REFS) if (!used.has(r.id)) errs.push(`reference ${r.id} is never cited`);
  const ids = BS_REFS.map((r) => r.id);
  for (const id of ids) if (ids.indexOf(id) !== ids.lastIndexOf(id)) errs.push(`duplicate reference ${id}`);
  return errs;
}

const problems = crossCheckBs();
if (problems.length) throw new Error('Brainstem content inconsistent:\n' + problems.join('\n'));
