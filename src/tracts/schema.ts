import { z } from 'zod';

/** White-matter section content. Every claim carries the references it was checked against. */

const Id = z.string().regex(/^[a-z0-9_]+$/);

export const WmReferenceSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+$/),
  shortLabel: z.string().min(1),
  citation: z.string().min(10),
  url: z.string().url(),
  pmid: z.string().regex(/^\d+$/),
});
export type WmReference = z.infer<typeof WmReferenceSchema>;

export const ClaimSchema = z.object({
  text: z.string().min(1),
  refIds: z.array(z.string()).min(1),
});
export type Claim = z.infer<typeof ClaimSchema>;

/**
 * Core: the tracts that matter most in tumour and epilepsy surgery. Extended: further supratentorial
 * tracts. Posterior fossa: cerebellar and brainstem pathways. Each set is shown separately.
 */
export const TierSchema = z.enum(['core', 'extended', 'fossa']);
export type Tier = z.infer<typeof TierSchema>;

export const TractTypeSchema = z.enum(['association', 'projection', 'commissural', 'cerebellar']);
export type TractType = z.infer<typeof TractTypeSchema>;

export const TractTopicSchema = z.object({
  /** also the structure id in wm-manifest.json */
  id: Id,
  name: z.string(),
  abbr: z.string(),
  aliases: z.array(z.string()),
  type: TractTypeSchema,
  tier: TierSchema,
  summary: z.string().min(1),
  /** course and position */
  course: z.array(ClaimSchema).min(1),
  /** cortical and subcortical connections described in the literature */
  connections: z.array(ClaimSchema).min(1),
  /** may be empty for extended tracts whose function the sources do not establish */
  functions: z.array(ClaimSchema),
  /** effects of damage or of stimulation during surgery */
  deficits: z.array(ClaimSchema),
  surgery: z.array(ClaimSchema),
  /** about this atlas's version of the tract (yield, asymmetry, what is not shown) */
  atlas: z.array(ClaimSchema),
  /** cortical areas (DBS-section HMAT parcels) highlighted with the tract; named in its cited connections */
  parcels: z.array(Id).default([]),
  /** measurements made by this project's pipeline (no literature claim, so no reference) */
  measured: z.array(z.string()).default([]),
});
export type TractTopic = z.output<typeof TractTopicSchema>;
export type TractTopicInput = z.input<typeof TractTopicSchema>;

export const CameraSchema = z.enum(['lateral', 'medial', 'coronal', 'axial', 'posteriorOblique']);

export const TractGroupSchema = z.object({
  id: Id,
  kind: z.enum(['function', 'anatomy', 'all']),
  tier: TierSchema,
  name: z.string(),
  tractIds: z.array(Id).min(1),
  /** why these tracts belong together */
  rationale: z.array(ClaimSchema),
  hemi: z.enum(['L', 'R', 'both']),
  camera: CameraSchema,
  /** smallest framing radius in mm (default: whole hemisphere) */
  radius: z.number().positive().optional(),
});
export type TractGroup = z.infer<typeof TractGroupSchema>;
