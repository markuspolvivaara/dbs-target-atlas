import { z } from '../zod';
import { SB_MODEL } from './model';

/**
 * The herniation views' geometry, measured on skull base v3 by pipeline/skullbase_v3_herniation.py
 * (src/data/generated/sbv3-herniation.json; v1 and v2 have none): the tonsillar view's McRae's line (basion to
 * opisthion), the tonsils' lowest points against it at rest and at the slider's full, their gap to the medulla, the
 * checks the step ran on its copies (none in bone at any slider value, nothing entered, no fold, the posterior inferior
 * cerebellar arteries outside the moved tonsils), the copies it made and the view's two cameras. Coordinates are the model's mm
 * (x right, y front, z up); belowLineMm is positive below the line. The shape is an illustration drawn by rule, not a
 * simulation. Loaded with the page's own model chunk (data-v3.ts), so v1's and v2's pages do not ship it.
 */
const V3 = z.tuple([z.number(), z.number(), z.number()]);
const Pose = z.object({ position: V3, target: V3 });
const Tip = z.object({ point: V3, belowLineMm: z.number() });
const Tips = z.object({ L: Tip, R: Tip });
export const TonsillarSchema = z.object({
  /** the design depth of the tonsils' lowest points below McRae's line at full (their mean), mm */
  descentMm: z.number().positive(),
  basion: V3, opisthion: V3, mcraeLengthMm: z.number().positive(),
  tonsilTips: z.object({ rest: Tips, full: Tips }),
  /** the tonsils' nearest approach to the medulla, mm: at rest, at full, and the least at any slider value checked */
  medullaGapMm: z.object({ rest: z.number(), full: z.number(), minAnyT: z.number() }),
  /** each tonsil's nearest approach to the medulla at full from its part below McRae's line, mm */
  medullaGapBelowLineMm: z.object({ L: z.number(), R: z.number() }),
  /** copy vertices in the CT's bone field at any slider value checked that were not there at rest */
  boneVerticesAnyT: z.number().int(),
  /** the least gap from any moving copy vertex to the drawn bone meshes at any slider value checked, mm */
  boneMeshGapMinMm: z.number(),
  boneMeshNearAtRest: z.object({ pointsStartingNearer: z.number().int(), leastGapMm: z.number().nullable(), mostCloserThanAtRestMm: z.number() }),
  /** no tissue triangle turns over (none but slivers near it) and no pair of neighbouring points closes at
   * params.closingLimit mm per mm or faster, on the moves as written */
  foldFree: z.boolean(),
  /** the fastest any two points of one copy within 2 mm of each other close as the slider moves, mm per mm of the slider's
   * travel (at 1 they would meet at full) */
  slopeMax: z.number(),
  /** tissue triangles (tonsils, hemispheres, vermis) that turn over at a slider value checked */
  trianglesTurnedOver: z.number().int(),
  /** pairs of neighbouring points closing at params.closingLimit or faster */
  closingPairs: z.number().int(),
  copies: z.array(z.object({ id: z.string(), replaces: z.string(), name: z.string(), maxMoveMm: z.number() })).min(1),
  picaOutsideTonsilsAnyT: z.boolean(),
  /** the structures a copy enters (crosses more than at rest) at a slider value checked: none */
  structuresEntered: z.array(z.string()),
  /** copy vertices whose straight path crosses a wall's surface */
  pathsCrossingAnything: z.number().int(),
  cameras: z.object({ sagittal: Pose, posterior: Pose }),
  /** the rule's own numbers (the step's report) */
  params: z.object({
    descentAlongCanalMm: z.number(), reachMm: z.number(), squeeze: z.number(), forwardMm: z.number(),
    boneGapMm: z.number(), stemGapMm: z.number(), vertebralGapMm: z.number(),
    behindSlope: z.number(), aheadSlope: z.number(), sideSlope: z.number(), closingLimit: z.number(),
    checkedAt: z.array(z.number()), inBoneAtRest: z.number().int(), stretchMax: z.number(),
    flippedTriangles: z.number().int(), trianglesNearlyTurnedOver: z.number().int(), sliverMm: z.number(), flipMarginMm: z.number(),
    sliverTriangles: z.number().int(), tubeTrianglesTurnedOver: z.number().int(),
    pointsCutShort: z.number().int(), pointsHeldByChecks: z.number().int(), wallsChecked: z.number().int(),
    posteriorElevationDeg: z.number(),
    /** where a copy already crosses a neighbour at rest (the fitted parts do): crossing triangle pairs at rest, at full
     * and at most at any slider value checked, per copy, neighbour and side */
    wallsTouched: z.record(z.string(), z.object({ rest: z.number().int(), full: z.number().int(), maxAnyT: z.number().int() })),
    /** two copies that overlap at rest (the fitted parts do), per copy and side: points of either inside the other (rule
     * 'inside'), or crossing triangle pairs where one is not closed ('crossings'), at rest, at full and at most; the
     * vermis's two halves, one part, are reported only ('same part') */
    copiesCrossing: z.record(z.string(), z.object({ rule: z.string(), rest: z.number().int(), full: z.number().int(), max: z.number().int(),
      /** (rule 'inside') the most points of either copy newly inside the other at any slider value */
      newlyInsideMax: z.number().int().optional() }).passthrough()),
  }).passthrough(),
});
export const HerniationSchema = z.object({ tonsillar: TonsillarSchema });
export type Herniation = z.infer<typeof HerniationSchema>;
export type Tonsillar = Herniation['tonsillar'];

const PAGE = SB_MODEL === 'v3' ? await import('./data-v3') : null;
/** The page's model's herniation geometry (v3 only; null on v1 and v2). */
export const HERNIATION: Herniation | null = PAGE ? HerniationSchema.parse(PAGE.default.herniation) : null;

/** The tonsillar herniation view: its group id, its shape (the copies' morph target and the slider) and its guide. */
export const HN_TONSILLAR = { view: 'herniation_tonsillar', name: 'Tonsillar herniation', morph: 'tonsillar', guide: 'hn_mcrae_line' } as const;
/** How much further off than the step placed them the view's cameras stand (the step framed the tonsils and the
 * medulla alone, at a square aspect; the stage shows the foramen magnum's rim and the cerebellum round them too). */
export const HN_CAMERA_BACK = 1.6;
/** A camera of the report's, moved back along its own line of sight by HN_CAMERA_BACK: the same target and direction. */
export function hnPose(p: { position: readonly number[]; target: readonly number[] }): { position: [number, number, number]; target: [number, number, number] } {
  const t = [p.target[0], p.target[1], p.target[2]] as [number, number, number];
  return { position: t.map((x, k) => Math.round((x + (p.position[k] - x) * HN_CAMERA_BACK) * 100) / 100) as [number, number, number], target: t };
}
/** The plane the view is cut at (the left half removed): sagittal, 3.5 mm left of the frame's midline, so that McRae's line
 * (drawn from the basion, 2.7 mm left of it, to the opisthion) is not cut while the left tonsil is. */
export const HN_SAGITTAL_CUT_X = -3.5;
/** A gap or a small length of the report's to the hundredth of a mm, as the report gives it (0.25, not 0.3). */
export const hnMm = (n: number): string => String(Math.round(n * 100) / 100).replace('-', '−');
