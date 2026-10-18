import { z } from 'zod';
import levelsJson from '../data/generated/spine-levels.json';
import { SP_MANIFEST } from './index';

/**
 * Measured lumbar geometry (pipeline/spine_build.py: one CT, see Sources) and the sourced statements the cards show.
 * Statements are paraphrased from the cited papers; every refId is a key of the manifest's references.
 */
const V3 = z.tuple([z.number(), z.number(), z.number()]);
const Dims = z.object({ width: z.number(), depth: z.number(), area: z.number() });
const Foramen = z.object({ height: z.number(), width: z.number(), area: z.number() }).nullable();
export const LevelGeomSchema = z.object({
  level: z.string(),
  pair: z.string(),
  bodyCentre: V3,
  canal: Dims.nullable(),
  foramen: z.object({ L: Foramen, R: Foramen }),
  discCentre: V3,
  discHeightMm: z.number().optional(),
  lesions: z.object({
    L: z.object({ paracentral: V3, foraminal: V3, farlateral: V3, foraminalEstimated: z.boolean() }),
    R: z.object({ paracentral: V3, foraminal: V3, farlateral: V3, foraminalEstimated: z.boolean() }),
  }).optional(),
});
export type LevelGeom = z.infer<typeof LevelGeomSchema>;
export const LUMBAR_GEOM = z.object({ lumbar: z.array(LevelGeomSchema) }).parse(levelsJson).lumbar;
export const GEOM_BY_PAIR = new Map(LUMBAR_GEOM.map((g) => [g.pair, g]));
export const GEOM_BY_LEVEL = new Map(LUMBAR_GEOM.map((g) => [g.level, g]));

export interface Statement { text: string; refIds: string[] }

export const STATEMENTS = {
  rootRule: {
    text: 'At a lumbar level the root of the upper vertebra leaves the canal beneath its pedicle (the exiting root), while the next root runs past the disc in the lateral recess (the traversing root): at L5–S1, for example, L5 is the exiting and S1 the traversing root.',
    refIds: ['hwang2019', 'merckaert2015'],
  },
  ganglia: {
    text: 'The dorsal root ganglia grow larger from L1 to S1. The S1 root leaves the dural sac more cranially and more vertically than the others, and its ganglion, the largest, more often lies inside the canal.',
    refIds: ['hasegawa1996'],
  },
  lesionParacentral: {
    text: 'A paracentral herniation lies against the traversing root: either between the dura and the root (axillary) or in front of it (pre-radicular).',
    refIds: ['osman2021'],
  },
  lesionLateral: {
    text: 'A herniation in or beyond the foramen (extreme lateral, intra- or extraforaminal) lies in front of the exiting root.',
    refIds: ['luebbers2025'],
  },
  dermatomes: {
    text: 'Published dermatome maps disagree: textbooks show the early maps, the very different map of Keegan and Garrett (1948), or neither, and an evidence-based review found current maps inaccurate. The chart therefore shows only the key sensory points of the international standard (ISNCSCI), placed where its worksheet marks them, not a full map.',
    refIds: ['downs2011', 'lee2008', 'isncsci2019'],
  },
  isncsci: {
    text: 'Key muscles and other movements by root as listed on the ISNCSCI worksheet (the standard for neurological examination in spinal cord injury).',
    refIds: ['isncsci2019', 'rupp2021'],
  },
  grades: {
    text: 'Breach grades after Gertzbein and Robbins: A no breach, B up to 2 mm, C 2–4 mm, D 4–6 mm, E more than 6 mm; the direction is medial, lateral, cranial or caudal.',
    refIds: ['gertzbein1990', 'miyamoto2025'],
  },
  screwMethod: {
    text: 'Breach here: how far the screw’s surface reaches beyond the bone surface of this CT (the surface drawn), once the screw is wholly inside the bone; the entry through the dorsal cortex does not count, and a tip through the anterior cortex is listed apart. Distances run from the screw’s surface to the surfaces of the structures at risk; the roots and ganglia are schematic, and so are the distances to them.',
    refIds: [],
  },
  pedicleMethod: {
    text: 'Measured on this CT, outer cortex to outer cortex through the pedicle’s axis: the narrowest width (across the axis, in the endplate plane) and the narrowest height (along the vertebra’s axis) at the isthmus. The axis is the widest straight bony channel through the isthmus (from 14 mm behind it to 30 mm into the body); angles are in the vertebra’s own frame (the endplate plane, the midline from the canal centre to the body centre). At L5 the pedicle merges with the transverse process on this CT, which widens the measured width on the right.',
    refIds: [],
  },
  published: {
    text: 'Published: pedicle width and height as the range of regional means in a systematic review; the transverse angle (between the pedicle axis and the midline) as mean ± SD in CT studies of 37 adults in Mexico and 287 in Nigeria.',
    refIds: ['wang2023', 'moncadahabib2025', 'nkwerem2024'],
  },
  sac: {
    text: 'On CT the spinal cord, conus, cauda equina and CSF cannot be told apart; the segmentation follows the contents of the canal, i.e. the dural sac and what it holds. In this subject it ends within the sacrum (measured).',
    refIds: [],
  },
} satisfies Record<string, Statement>;

/** Root function from the ISNCSCI worksheet (rev. 04/2019): key muscle, the other movements it lists for the root
 * (non-key muscles, used to tell AIS B from C), and where the worksheet marks the key sensory point. */
export interface RootFunction { keyMuscle: string | null; otherMovements: string[]; sensoryPoint: SensoryPoint }
/** Chart position of a key sensory point on the left leg: anterior or posterior view, x/y in the chart's 0-100 frame
 * (body-chart.ts; front view medial towards x = 0, back view lateral towards x = 0). */
export interface SensoryPoint { view: 'front' | 'back'; x: number; y: number }
export const ROOT_FUNCTION: Record<string, RootFunction> = {
  L1: { keyMuscle: null, otherMovements: [], sensoryPoint: { view: 'front', x: 52, y: 13 } },
  L2: { keyMuscle: 'Hip flexors', otherMovements: ['Hip adduction'], sensoryPoint: { view: 'front', x: 50, y: 28 } },
  L3: { keyMuscle: 'Knee extensors', otherMovements: ['Hip external rotation'], sensoryPoint: { view: 'front', x: 39, y: 50 } },
  L4: { keyMuscle: 'Ankle dorsiflexors', otherMovements: ['Hip extension, abduction and internal rotation', 'Knee flexion', 'Ankle inversion and eversion', 'Toe MP and IP extension'], sensoryPoint: { view: 'front', x: 43, y: 86 } },
  L5: { keyMuscle: 'Long toe extensors', otherMovements: ['Hallux and toe DIP and PIP flexion and abduction'], sensoryPoint: { view: 'front', x: 53, y: 97 } },
  S1: { keyMuscle: 'Ankle plantar flexors', otherMovements: ['Hallux adduction'], sensoryPoint: { view: 'back', x: 44, y: 94 } },
};

export type LesionZone = 'paracentral' | 'foraminal' | 'farlateral';
export const LESION_ZONES: [LesionZone, string][] = [['paracentral', 'Paracentral'], ['foraminal', 'Foraminal'], ['farlateral', 'Far lateral']];
/** The root a lesion at a lumbar disc affects: paracentral -> the traversing (lower) root; foraminal or far lateral ->
 * the exiting (upper) root (STATEMENTS.rootRule, lesionParacentral, lesionLateral). */
export function affectedRoot(pair: string, zone: LesionZone): string {
  const [up, down] = pair.split('-');
  return zone === 'paracentral' ? down : up;
}

/** Virtual-screw techniques: how the start position and the start size are set (spine_screw.py does it). */
export interface Technique { id: 'tt' | 'cbt' | 's1'; name: string; levels: string[]; start: Statement; size: Statement; note?: Statement }
export const TECHNIQUES: Record<Technique['id'], Technique> = {
  tt: {
    id: 'tt', name: 'Traditional trajectory', levels: ['L1', 'L2', 'L3', 'L4', 'L5'],
    start: {
      text: 'Traditional-trajectory screws follow the anatomical axis of the pedicle into the vertebral body. Start position here: through the pedicle’s isthmus at its transverse angle measured on this CT, parallel to the superior endplate (a choice for the start: the measured axis tilts towards the superior articular process), entering where it leaves the dorsal bone.',
      refIds: ['matsukawa2017'],
    },
    size: { text: 'Start size 6.5 × 45 mm, the traditional-trajectory screws of a cyclic-loading comparison quoted in the review.', refIds: ['matsukawa2017'] },
  },
  cbt: {
    id: 'cbt', name: 'Cortical bone trajectory', levels: ['L1', 'L2', 'L3', 'L4', 'L5'],
    start: {
      text: 'The cortical bone trajectory starts at the inferomedial border of the pedicle (5 o’clock on the left, 7 o’clock on the right, seen from behind) and runs about 25–26° cranially and 8–9° laterally at every lumbar level; the angles used are the per-level means of the morphometric study quoted by Zhao 2021.',
      refIds: ['matsukawa2017', 'zhao2021'],
    },
    size: {
      text: 'Start size: the reference diameter for the level (4.0 mm at L1, 4.5 mm at L2, 5.5 mm at L3–L5) and the length rule of Zhao 2021, the trajectory length on this CT (until the screw would reach the cortex) rounded down to 20, 25, 30 or 35 mm.',
      refIds: ['zhao2021'],
    },
  },
  s1: {
    id: 's1', name: 'S1 tricortical', levels: ['S1'],
    start: {
      text: 'Tricortical S1 screws run parallel to the S1 superior endplate with about 20° medial convergence towards the apex of the promontory, the tip through the anterior cortex there; ideal screws start at the lateral border of the S1 pedicle and end in the promontory at the midline. Here the axis lies 5 mm under the endplate and the two tips sit just either side of the midline (drawing choices).',
      refIds: ['koeck2026', 'jenkins2026'],
    },
    size: { text: 'Start size 5.5 mm, as in the cadaver study, and long enough to reach the anterior cortex at the promontory on this CT.', refIds: ['koeck2026'] },
    note: {
      text: 'In the cadaver study the common iliac vein was the vessel at most risk; the screw tips lay a mean 9.4 mm (right) and 12 mm (left) from the iliac vessels.',
      refIds: ['koeck2026'],
    },
  },
};

/** Cross-checks: every statement's references exist; every measured level has a structure. */
export function crossCheckContent(): string[] {
  const errs: string[] = [];
  for (const [k, st] of Object.entries(STATEMENTS)) for (const r of st.refIds) if (!SP_MANIFEST.references[r]) errs.push(`${k}: unknown reference ${r}`);
  for (const t of Object.values(TECHNIQUES)) {
    for (const st of [t.start, t.size, t.note]) for (const r of st?.refIds ?? []) if (!SP_MANIFEST.references[r]) errs.push(`${t.id}: unknown reference ${r}`);
  }
  return errs;
}
