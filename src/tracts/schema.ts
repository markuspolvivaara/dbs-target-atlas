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

export const TractTypeSchema = z.enum(['association', 'projection', 'commissural']);
export type TractType = z.infer<typeof TractTypeSchema>;

export const TractTopicSchema = z.object({
  /** also the structure id in wm-manifest.json */
  id: Id,
  name: z.string(),
  abbr: z.string(),
  aliases: z.array(z.string()),
  type: TractTypeSchema,
  summary: z.string().min(1),
  /** course and position */
  course: z.array(ClaimSchema).min(1),
  /** cortical and subcortical connections described in the literature */
  connections: z.array(ClaimSchema).min(1),
  functions: z.array(ClaimSchema).min(1),
  /** effects of damage or of stimulation during surgery */
  deficits: z.array(ClaimSchema),
  surgery: z.array(ClaimSchema),
  /** about this atlas's version of the tract (yield, asymmetry, what is not shown) */
  atlas: z.array(ClaimSchema),
  /** cortical areas (DBS-section HMAT parcels) highlighted with the tract; named in its cited connections */
  parcels: z.array(Id).default([]),
});
export type TractTopic = z.output<typeof TractTopicSchema>;
export type TractTopicInput = z.input<typeof TractTopicSchema>;

export const CameraSchema = z.enum(['lateral', 'medial', 'coronal', 'axial', 'posteriorOblique']);

export const TractGroupSchema = z.object({
  id: Id,
  kind: z.enum(['function', 'anatomy', 'all']),
  name: z.string(),
  tractIds: z.array(Id).min(1),
  /** why these tracts belong together */
  rationale: z.array(ClaimSchema),
  hemi: z.enum(['L', 'R', 'both']),
  camera: CameraSchema,
});
export type TractGroup = z.infer<typeof TractGroupSchema>;
