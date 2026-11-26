import { z } from '../zod';
import { SB_MODEL } from './model';

/**
 * The trigeminal neuralgia views' geometry, measured on each model by pipeline/skullbase_trigeminal.py
 * (src/data/generated/sbv3-trigeminal.json, sb-trigeminal.json; v2 has none): the points they add as landmarks, the
 * microvascular decompression's root entry zone, camera and neighbours (v3 only: on Z-Anatomy the root enters the front of
 * the pons, which hides it from the retrosigmoid side), and the percutaneous needle along Härtel's trigeminal axis, from
 * Meckel's cave (v3; on v1 the trigeminal nerve's run down to the foramen, 12 mm beyond it) out through the right foramen ovale, with the
 * foramen's measured size. Coordinates are each model's own mm (x right, y front, z up). Loaded with the page's own model
 * chunk (data-v3.ts, data-v1.ts), so a page does not ship the other model's file.
 */
const V3 = z.tuple([z.number(), z.number(), z.number()]);
const Pose = z.object({ position: V3, target: V3 });
/** a point the views add (index.ts LandmarkSchema's shape; index.ts parses it again with that schema) */
const TnLandmark = z.object({
  id: z.string().regex(/^lm_[a-z0-9_]+$/), name: z.string(), bone: z.string(), part: z.string().nullable(), ras: V3,
  side: z.enum(['L', 'R', 'M']), boneFrom: z.string(), distanceToBoneMm: z.number(), placed: z.string().min(1),
});
const Mvd = z.object({
  side: z.literal('R'),
  /** where the trigeminal nerve as drawn meets the pons */
  rootEntry: V3,
  /** the nerve's point nearest the superior petrosal sinus, and the length along the nerve from the root entry to it */
  porus: V3, cisternalMm: z.number(),
  /** inside the posterior fossa along the petrous ridge, aimed at the root entry */
  camera: Pose, cameraToRootMm: z.number(),
  /** share of the camera-facing surface of the root's first 10 mm the camera sees (the retrosigmoid shape at 1), % */
  rootVisiblePct: z.number(),
  /** from the root entry down to the centre of the retrosigmoid opening */
  craniotomyBelowRootMm: z.number(),
  arteries: z.array(z.object({ name: z.string(), toRootMm: z.number(), where: z.string() })).min(1),
  nerves: z.array(z.object({ name: z.string(), fromRootMm: z.number(), belowMm: z.number() })),
});
const Needle = z.object({
  side: z.literal('R'),
  outer: V3, crossing: V3, tip: V3,
  tipAt: z.enum(['Meckel\'s cave', 'the trigeminal nerve']),
  ovaleCentre: V3, crossingFromCentreMm: z.number(),
  tipBeyondCrossingMm: z.number(), outerBelowCrossingMm: z.number(),
  angles: z.object({ fromVerticalDeg: z.number(), medialDeg: z.number(), backwardDeg: z.number() }),
  boneCrossedMm: z.number(),
  /** the largest radius of a rod along it that no bone enters (the drawn shaft is no thicker), mm */
  clearanceMm: z.number().positive(),
  /** within 6 mm: atMm along the line from the crossing, positive outward (down), negative inward (up) */
  nearest: z.array(z.object({ name: z.string(), mm: z.number(), atMm: z.number() })),
  lateralAim: z.object({ lineAheadOfMeatusMm: z.number(), eminenceAheadOfMeatusMm: z.number() }),
  views: z.object({ along: Pose, overview: Pose }),
  openingSeenAlongMm2: z.number(),
});
const Size = z.object({ lengthMm: z.number(), widthMm: z.number(), areaMm2: z.number(), how: z.string().min(1) });
export const TrigeminalSchema = z.object({
  model: z.enum(['v3', 'zanatomy']),
  landmarks: z.array(TnLandmark),
  mvd: Mvd.nullable(),
  needle: Needle,
  ovale: Size.extend({ side: z.literal('R'), ct: Size.nullable() }),
});
export type Trigeminal = z.infer<typeof TrigeminalSchema>;
export type NeedlePath = Trigeminal['needle'];
export type MvdGeometry = NonNullable<Trigeminal['mvd']>;

const PAGE = SB_MODEL === 'v3' ? await import('./data-v3') : SB_MODEL === 'zanatomy' ? await import('./data-v1') : null;
/** The page's model's trigeminal neuralgia geometry (null on v2). */
export const TRIGEMINAL: Trigeminal | null = PAGE ? TrigeminalSchema.parse(PAGE.default.trigeminal) : null;

/** The needle as the legend, the text version and a link's hid= name it. */
export const NEEDLE_ID = 'tn_needle';
export const NEEDLE_NAME = 'Needle path (drawn by rule)';
