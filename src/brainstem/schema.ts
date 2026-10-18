import { z } from 'zod';

/** Brainstem section content. Every claim carries the references it was checked against. */

export const BsReferenceSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+$/),
  shortLabel: z.string().min(1),
  citation: z.string().min(10),
  url: z.string().url(),
  pmid: z.string().regex(/^\d+$/),
  /** open-access full text the claims were checked against */
  pmcid: z.string().regex(/^PMC\d+$/).optional(),
});
export type BsReference = z.infer<typeof BsReferenceSchema>;

export const ClaimSchema = z.object({ text: z.string().min(1), refIds: z.array(z.string()).min(1) });
export type Claim = z.infer<typeof ClaimSchema>;

/** A safe entry zone's card: what the sources say about it (the geometry and how it was drawn are in bs-zones.json). */
export const ZoneContentSchema = z.object({
  id: z.string().regex(/^sez_[a-z_]+$/),
  summary: z.string().min(1),
  /** where it lies and what borders it */
  borders: z.array(ClaimSchema).min(1),
  /** surgical approaches that reach it */
  approach: z.array(ClaimSchema),
  /** structures at risk, and published outcomes */
  risks: z.array(ClaimSchema),
  /** measurements published for it */
  measures: z.array(ClaimSchema).default([]),
});
export type ZoneContent = z.output<typeof ZoneContentSchema>;
export type ZoneContentInput = z.input<typeof ZoneContentSchema>;
