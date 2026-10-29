import { z } from 'zod';
import vaManifestJson from '../data/generated/va-manifest.json';
import vaLesionsJson from '../data/generated/va-lesions.json';
import { VaManifestSchema } from '../data/schema';
import { BsReferenceSchema, ClaimSchema, type Claim } from '../brainstem/schema';
import { ANEURYSM_SITES, AVM_NIDUS, AVM_OTHER, AVM_WHAT, BLISTER, CCF, CCF_VEINS, DAVF, FUSIFORM, SPETZLER_MARTIN, SPETZLER_PONCE } from './content';
import { VA_REFERENCES } from './references';

/**
 * Vascular section data (pipeline/vascular_build.py), in Skull base v2's frame: this CT angiogram's arteries and veins
 * (Skull base v3's), the lesions drawn onto them by rule, the skull and the fitted brain; every vessel with the time
 * contrast reaches it in the schematic angiogram.
 */
export const VA_MANIFEST = VaManifestSchema.parse(vaManifestJson);
export const VA = new Map(VA_MANIFEST.structures.map((s) => [s.id, s]));
export const DSA = VA_MANIFEST.dsa;

const V3 = z.tuple([z.number(), z.number(), z.number()]);
const LesionSchema = z.object({
  id: z.string(), kind: z.enum(['aneurysm', 'avm', 'davf', 'ccf']), name: z.string(), parts: z.array(z.string()).min(1),
  type: z.enum(['saccular', 'fusiform', 'blister']).optional(), parent: z.string().optional(), branch: z.string().nullable().optional(),
  side: z.string().optional(), domeDiameterMm: z.number().optional(), neckMm: z.number().optional(), lengthMm: z.number().optional(),
  widestMm: z.number().optional(), arteryMm: z.number().optional(), baseMm: z.number().optional(), heightMm: z.number().optional(),
  location: z.string().optional(), nidusMm: z.number().optional(),
  sm: z.object({ size: z.number(), eloquence: z.number(), deep: z.number(), grade: z.number() }).optional(),
  feeders: z.array(z.string()).optional(),
  drainage: z.array(z.union([z.string(), z.object({ vessel: z.string(), kind: z.enum(['superficial', 'deep']) })])).optional(),
  borden: z.number().optional(), barrow: z.enum(['A', 'B', 'C', 'D']).optional(),
  siteMm: V3.optional(), fistulaMm: V3.optional(), centreMm: V3.optional(),
}).passthrough();
export type Lesion = z.infer<typeof LesionSchema>;
export const LESIONS = z.object({ lesions: z.array(LesionSchema) }).parse(vaLesionsJson).lesions;
export const LESION = new Map(LESIONS.map((l) => [l.id, l]));

export const VA_REFS = z.array(BsReferenceSchema).parse(VA_REFERENCES);
export const VA_REF = new Map(VA_REFS.map((r) => [r.id, r]));

export type Kind = 'artery' | 'vein' | 'bone' | 'brain' | 'aneurysm' | 'nidus' | 'feeder' | 'drainer' | 'fistula';
export const kindOf = (id: string): Kind => {
  const st = VA.get(id);
  const c = st?.category;
  if (c === 'artery' || c === 'vein' || c === 'brain' || c === 'aneurysm' || c === 'nidus' || c === 'feeder' || c === 'drainer' || c === 'fistula') return c;
  return 'bone';
};
export const KIND_LABEL: Record<Kind, string> = {
  artery: 'Artery (this CT angiogram)', vein: 'Vein or sinus (this CT angiogram)', bone: 'Bone (this CT)', brain: 'Brain (fitted template)',
  aneurysm: 'Aneurysm (drawn)', nidus: 'Nidus (drawn)', feeder: 'Feeding artery (drawn)', drainer: 'Draining vein (drawn)', fistula: 'Fistula (drawn)',
};

/** The Spetzler–Ponce class of a Spetzler–Martin grade (Hofman 2018). */
export const ponceClass = (grade: number): 'A' | 'B' | 'C' => (grade <= 2 ? 'A' : grade === 3 ? 'B' : 'C');

/** Cross-checks between content, references and the generated files. Returns problems (empty = consistent). */
export function crossCheckVa(): string[] {
  const errs: string[] = [];
  const used = new Set<string>();
  const all: Claim[] = [...ANEURYSM_SITES, ...FUSIFORM, ...BLISTER, ...AVM_WHAT, ...AVM_NIDUS, ...SPETZLER_MARTIN, ...SPETZLER_PONCE, ...AVM_OTHER, ...DAVF, ...CCF, ...CCF_VEINS];
  for (const cl of all) {
    ClaimSchema.parse(cl);
    for (const r of cl.refIds) { used.add(r); if (!VA_REF.has(r)) errs.push(`unknown refId ${r}`); }
  }
  for (const r of VA_REFS) if (!used.has(r.id)) errs.push(`reference ${r.id} is never cited`);
  for (const l of LESIONS) for (const p of l.parts) if (!VA.has(p)) errs.push(`lesion ${l.id}: unknown part ${p}`);
  for (const s of VA_MANIFEST.structures) if (s.replaces && !VA.has(s.replaces)) errs.push(`${s.id} replaces an unknown ${s.replaces}`);
  return errs;
}

const problems = crossCheckVa();
if (problems.length) throw new Error('Vascular content inconsistent:\n' + problems.join('\n'));
