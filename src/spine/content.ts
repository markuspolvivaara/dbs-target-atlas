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
  /** false where the foramen's size is not reported (thoracic: the rib heads form part of its wall) */
  foramenMeasured: z.boolean().optional(),
  lesions: z.object({
    L: z.object({ paracentral: V3, foraminal: V3, farlateral: V3, foraminalEstimated: z.boolean() }),
    R: z.object({ paracentral: V3, foraminal: V3, farlateral: V3, foraminalEstimated: z.boolean() }),
  }).optional(),
});
export type LevelGeom = z.infer<typeof LevelGeomSchema>;
const TransverseForamen = z.object({ area: z.number(), width: z.number(), depth: z.number() }).nullable();
const LEVELS = z.object({
  lumbar: z.array(LevelGeomSchema), thoracic: z.array(LevelGeomSchema), cervical: z.array(LevelGeomSchema),
  /** the vertebral artery's entry level per side (inferred from the foramina's size) and the foramina transversaria
   * measured at C1-C7 (the enclosed area, an underestimate; width and depth) */
  vertebralArtery: z.object({
    entry: z.object({ L: z.string(), R: z.string() }),
    foramina: z.record(z.object({ L: TransverseForamen, R: TransverseForamen, medialGap: z.number().optional() })),
  }),
  /** the level each laryngeal landmark projects to on this CT */
  neckLandmarks: z.object({
    hyoid: z.object({ level: z.string() }), thyroidCartilage: z.object({ level: z.string() }), cricoidInferior: z.object({ level: z.string() }),
  }),
  /** the craniocervical junction, from its own CT (pipeline/spine_ccj.py): landmarks in its midsagittal plane (mm from
   * the tip of the dens) and the measurements between them */
  ccj: z.object({
    slab: z.number(), note: z.string(), clivusMm: z.number(), axialPoints: z.number(),
    /** the midsagittal CT the card draws the measurements on: anterior on the left; `left` and `top` are the scene y
     * and z (mm) of its left and top edges */
    image: z.object({ file: z.string(), width: z.number(), height: z.number(), pxPerMm: z.number(), left: z.number(), top: z.number(), slab: z.number() }),
    landmarks: z.object({
      densTip: V3, basion: V3, opisthion: V3, adi: z.tuple([V3, V3]), padi: z.tuple([V3, V3]), axialLine: z.tuple([V3, V3]), clivusLine: z.tuple([V3, V3]),
    }),
    measurements: z.object({ adi: z.number(), padi: z.number(), mcrae: z.number(), densBelowMcRae: z.number(), bdi: z.number(), bai: z.number(), cca: z.number() }),
    /** each value's range with the plane moved up to 1 mm to either side */
    range: z.record(z.tuple([z.number(), z.number()])),
  }),
}).parse(levelsJson);
export const CCJ = LEVELS.ccj;
export const LUMBAR_GEOM = LEVELS.lumbar;
export const THORACIC_GEOM = LEVELS.thoracic;
export const CERVICAL_GEOM = LEVELS.cervical;
export const VERTEBRAL_ARTERY = LEVELS.vertebralArtery;
export const NECK_LANDMARKS = LEVELS.neckLandmarks;
/** The craniocervical junction's measurements (Fidan 2026's definitions, on its midsagittal CT): what each is, its value
 * on this CT and the published normal values. The lines each draws are its landmarks in CCJ.landmarks. */
export type CcjMeasureId = 'adi' | 'padi' | 'mcrae' | 'bdi' | 'bai' | 'cca';
export interface CcjMeasure { id: CcjMeasureId; name: string; short: string; unit: 'mm' | '°'; definition: Statement; normal: Statement }
const FIDAN: Statement['refIds'] = ['fidan2026'];
export const CCJ_MEASURES: CcjMeasure[] = [
  {
    id: 'adi', name: 'Atlanto-dens interval (ADI)', short: 'ADI', unit: 'mm',
    definition: { text: 'From the anterior arch of C1 to the closest anterior point of the dens, in the midsagittal plane.', refIds: FIDAN },
    normal: { text: 'In 500 adults on CT: median 1.45 mm (0.36–2.92 mm). Normal values of up to 3.5 mm are quoted in adults, and over 10 mm points to rupture of the transverse ligament.', refIds: FIDAN },
  },
  {
    id: 'padi', name: 'Posterior atlanto-dens interval (PADI)', short: 'PADI', unit: 'mm',
    definition: { text: 'From the posterior border of the dens to the closest point of the posterior arch of C1: the space for the cord at C1–C2.', refIds: FIDAN },
    normal: { text: 'In 500 adults on CT: median 19.31 mm (13.11–26.81 mm), larger in men. A threshold of more than 14 mm (on radiographs) is quoted, and values under 19 mm have been linked with neurological symptoms.', refIds: FIDAN },
  },
  {
    id: 'mcrae', name: 'McRae’s line (foramen magnum)', short: 'McRae', unit: 'mm',
    definition: { text: 'From the basion to the opisthion: the anteroposterior diameter of the foramen magnum. Here also the distance of the dens’s tip below it.', refIds: FIDAN },
    normal: { text: 'In 500 adults on CT: median 36.15 mm (28.53–43.11 mm), larger in men. It typically exceeds 30 mm without symptoms, and values below 25 mm often go with neurological symptoms; in two series no dens tip lay above the line.', refIds: FIDAN },
  },
  {
    id: 'bdi', name: 'Basion–dens interval (BDI)', short: 'BDI', unit: 'mm',
    definition: { text: 'From the basion to the tip of the dens.', refIds: FIDAN },
    normal: { text: 'In 500 adults on CT: median 5.33 mm (1.66–9.34 mm), no difference between the sexes. Over 9 mm has been taken to suggest injury (controls 4.7 ± 1.7 mm).', refIds: FIDAN },
  },
  {
    id: 'bai', name: 'Basion–axial interval (BAI)', short: 'BAI', unit: 'mm',
    definition: { text: 'From the basion to the rostral extension of the posterior axial line, the line along the back of the C2 body; used to assess vertical translocation.', refIds: FIDAN },
    normal: { text: 'In 500 adults on CT: median 7.14 mm (2.54–11.34 mm), slightly larger in men.', refIds: FIDAN },
  },
  {
    id: 'cca', name: 'Clivus–canal angle (Wackenheim)', short: 'Clivus–canal', unit: '°',
    definition: { text: 'Between the posterior surface of the clivus and the posterior axial line along the back of the dens; used to assess the risk of brainstem compression.', refIds: FIDAN },
    normal: { text: 'In 500 adults on CT: median 154.14° (116.03–179.62°).', refIds: FIDAN },
  },
];

// T12-L1 and C7-T1 are in two chains each: the thoracic entry for T12-L1 and the cervical one for C7-T1 (measured as
// the cervical foramina are) are the ones used
const ALL_GEOM = [...LUMBAR_GEOM, ...THORACIC_GEOM, ...CERVICAL_GEOM];
export const GEOM_BY_PAIR = new Map(ALL_GEOM.map((g) => [g.pair, g]));
export const GEOM_BY_LEVEL = new Map(ALL_GEOM.map((g) => [g.level, g]));
/** The root that leaves at the motion segment below a level: lumbar and thoracic, the level's own (below its pedicle);
 * cervical, the next one's (above that pedicle), and C8 below C7. */
export function exitingRoot(level: string): string {
  if (!level.startsWith('C')) return level;
  const n = Number(level.slice(1));
  return `C${n + 1}`;
}

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
  thoracicForamen: {
    text: 'The heads of the ribs and their joint capsules form part of the anteroinferior wall of the T1–T10 foramina; a rib head can seem to form the foramen’s floor (a “false foramen”), and the true foramen shows only once the rib head and its facet are removed.',
    refIds: ['gkasdaris2016'],
  },
  thoracicNerve: {
    text: 'Thoracic spinal nerves leave through the upper part of the foramen. In a CT study the rib head and neck reached into the space between the transverse processes at every segment from T2–T3 to T11–T12, most in the mid-thoracic segments, so a path to the foramen runs between the rib neck and the lamina.',
    refIds: ['wangr2021'],
  },
  cervicalRootRule: {
    text: 'There are eight cervical roots and seven cervical vertebrae: each root from C1 to C7 runs out on the groove of the transverse process of the vertebra of its number (leaving above that vertebra), and C8 emerges between C7 and T1. The roots pass forwards and outwards through the lower part of the foramen; the vertebral artery lies in front of the root.',
    refIds: ['moreno2021'],
  },
  cervicalRootDisc: {
    text: 'In cadavers the C5 roots left over the middle of their disc, the C6 and C7 roots crossed its proximal part, and the C8 root hardly overlapped the C7–T1 disc. The foramen is funnel-shaped and narrowest at its entrance, where the roots were compressed: in front by discs and uncovertebral osteophytes, behind by the superior articular process and the ligamentum flavum.',
    refIds: ['tanaka2000'],
  },
  cervicalForamen: {
    text: 'Here the cervical foramina are found in planes across an axis turned 30° forwards from lateral (they open obliquely forwards) and only place the schematic roots; their size is not given, because the measurement was built for the lumbar foramina.',
    refIds: [],
  },
  vaSegments: {
    text: 'The vertebral artery is described in four segments: V1 from its origin to the foramen transversarium it enters (usually C6 or C5), V2 up through the foramina to C2, V3 behind the lateral mass of the atlas, and V4 inside the dura from the foramen magnum. In a meta-analysis (62 studies, 32,153 vessels) 94.1% arose from the subclavian artery and 92.0% entered the foramen of C6; 7.94% were hypoplastic.',
    refIds: ['tudose2023'],
  },
  vaEntry: {
    text: 'In CT angiography the artery entered the C6 foramen in 94.9% of 700 vessels and C4, C5 or C7 in the rest; in another series C6 in 93.0% of 500, with C5 the commonest variant (5.0%). Foramina that carry the artery are larger than those that do not, which is how its entry level is inferred on this CT (no contrast).',
    refIds: ['hong2008', 'bruneau2006'],
  },
  vaGroove: {
    text: 'Behind the superior articular process of the atlas, the lateral surface of its posterior arch carries the groove of the vertebral artery (V3), with the C1 dorsal ramus in front of the artery. Ossification over the groove (ponticulus posticus, turning it into an arcuate foramen) was found in 16% in a meta-analysis.',
    refIds: ['vigo2020', 'valenzuela2026'],
  },
  vaHighRiding: {
    text: 'A high-riding vertebral artery narrows the C2 isthmus and endangers C2 screws; under the usual definition (C2 isthmus height ≤ 5 mm and/or internal height ≤ 2 mm) a meta-analysis found at least one in 28.5% of people in general populations and 20.3% of sides.',
    refIds: ['tudose2026'],
  },
  lateralMassRisk: {
    text: 'Angling a lateral mass screw laterally lowers the risk to the vertebral artery, angling it cranially the risk of violating the facet joint; a cranially pointed screw that is too long can reach the exiting root above.',
    refIds: ['joaquim2018'],
  },
  lateralMassMethod: {
    text: 'Measured on this CT from behind: the medial border where the lamina’s slope meets the lateral mass’s face, the lateral border at its outer edge, the upper and lower borders at the facet joint lines (the borders as Rathinavelu 2021 defines them); the facet joints’ inclination from planes fitted to their joint surfaces, in the vertebra’s frame.',
    refIds: ['rathinavelu2021'],
  },
  hrva: {
    text: 'A high-riding vertebral artery is usually defined on sagittal CT about 3 mm lateral to the lateral border of the spinal canal: a C2 isthmus height (the pars between the superior articular facet and the artery’s groove) of 5 mm or less and/or an internal height (the bone next to the groove) of 2 mm or less. C1–C2 posterior fusion carries the highest risk of vertebral artery injury in the cervical spine (1.35%), most of it from C1 lateral mass and C2 pedicle screws.',
    refIds: ['kucherina2026'],
  },
  hrvaMethod: {
    text: 'Measured on this CT: the isthmus height as the narrowest height of the axis’s bone between the superior articular surface and the inferior facet, on the plane 3 mm lateral to the canal’s lateral border; the bone over the groove at the foramen transversarium itself, from its roof to the superior articular surface, because on this CT the groove does not reach that plane.',
    refIds: [],
  },
  publishedC7: {
    text: 'Published: the C7 pedicle axis on CT in 53 patients (the sagittal angle there to the horizontal of the image, not to the endplate) and the means of nine earlier studies.',
    refIds: ['jiang2024'],
  },
  grades: {
    text: 'Breach grades after Gertzbein and Robbins: A no breach, B up to 2 mm, C 2–4 mm, D 4–6 mm, E more than 6 mm; the direction is medial, lateral, cranial or caudal.',
    refIds: ['gertzbein1990', 'miyamoto2025'],
  },
  screwMethod: {
    text: 'Breach here: how far the screw’s surface reaches beyond the bone surface of this CT (the surface drawn), once the screw is wholly inside the bone; the entry through the dorsal cortex does not count, and a tip through the anterior cortex is listed apart. Distances run from the screw’s surface to the surfaces of the structures at risk; the roots and ganglia are schematic, and so are the distances to them. Only structures drawn here are checked: no pleura, lung or vessels.',
    refIds: [],
  },
  pedicleMethod: {
    text: 'Measured on this CT, outer cortex to outer cortex through the pedicle’s axis: the narrowest width (across the axis, in the endplate plane) and the narrowest height (along the vertebra’s axis) at the isthmus. The axis is the widest straight bony channel through the isthmus, from 14 mm behind it to 30 mm into the body (thoracic: from 5 mm behind it to 25 mm; the pedicle is short and the bone behind it runs obliquely); angles are in the vertebra’s own frame (the endplate plane, the midline from the canal centre to the body centre). At L5 the pedicle merges with the transverse process on this CT, which widens the measured width on the right.',
    refIds: [],
  },
  published: {
    text: 'Published: pedicle width and height as the range of regional means in a systematic review; the transverse angle (between the pedicle axis and the midline) as mean ± SD in CT studies of 37 adults in Mexico and 287 in Nigeria.',
    refIds: ['wang2023', 'moncadahabib2025', 'nkwerem2024'],
  },
  publishedThoracic: {
    text: 'Published: the range of the mean values of the studies that Verma 2020 tabulates beside its own 20 dry vertebral columns (3 to 9 studies per value and level). There the sagittal angle is the angle between the pedicle axis and the upper border of the vertebral body.',
    refIds: ['verma2020'],
  },
  fill: {
    text: 'Recommended ratios of screw diameter to pedicle width range from 80% to 125%; perforations were fewest at 80%, the ratio recommended for less experienced surgeons.',
    refIds: ['mandelka2023'],
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
export interface Technique {
  id: 'tt' | 'cbt' | 's1' | 'st' | 'at' | 'rc' | 'mg' | 'an' | 'cp' | 'c1lm' | 'c2p' | 'c2pars' | 'c2tl' | 'ta' | 'od';
  name: string; levels: string[]; start: Statement; size: Statement; note?: Statement;
  /** the bone a screw that is not a pedicle screw lies in (lateral mass, pars, lamina...): such screws are not graded
   * after Gertzbein and Robbins, their readout gives the breach's direction and depth only */
  within?: string;
  /** the far cortex is meant to be crossed (bicortical screws) */
  bicortical?: boolean;
  /** one screw in the midline (no side to choose; its angle and entry move to the left or right) */
  midline?: boolean;
  /** not offered (kept, to be offered again later): one technique per region is shown */
  hidden?: boolean;
  /** what its breaches' directions are called when they are not the vertebra's (a screw running up the dens) */
  breachWords?: Partial<Record<'medial' | 'lateral' | 'superior' | 'inferior', string>>;
}
const LATERAL_MASS_LEVELS = ['C3', 'C4', 'C5', 'C6'];
const LATERAL_MASS_SIZE: Statement = {
  text: 'Start size: 3.5 mm screws, as in the series, long enough on this CT to reach the far cortex of the lateral mass (bicortical), rounded down to the millimetre. Published safe lengths: 14–15 mm for Roy-Camille and 15–16 mm for Magerl screws.',
  refIds: ['rathinavelu2021'],
};
const THORACIC_LEVELS = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12'];
const THORACIC_SIZE: Statement = {
  text: 'Start size by the rules a review summarises: diameter 80% of the pedicle’s outer width measured here, rounded down to 0.5 mm and no less than 3.5 mm (the smallest screw offered here); length rounded down to 5 mm so that the tip reaches no further than 80% of the vertebral body’s depth, against anterior perforation (the depth measured here along the screw, from the back of the body to its anterior cortex).',
  refIds: ['mandelka2023'],
};
const THORACIC_FREEHAND: Statement = {
  text: 'Freehand entry points in published series vary by level. One uniform technique starts about 3 mm caudal to the junction of the lateral margin of the superior articular process and the transverse process, aims about 30° medially at T1–T2 and 20° at T3–T12, and stays orthogonal to the dorsal curvature of the spine; another series aims parallel to the superior endplate. In the reviewed series lateral breaches were more common than medial ones, and breaches of 2–4 mm were held to be safe in patients without symptoms.',
  refIds: ['avila2016'],
};
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
  st: {
    id: 'st', name: 'Pedicle screw', levels: THORACIC_LEVELS,
    start: {
      text: 'The straight-forward trajectory runs parallel to the vertebral endplate, the anatomic one along the true axis of the pedicle; in a cadaver comparison the straight-forward screws had 39% more maximum insertional torque and 27% more pullout strength. Start position here: through the pedicle’s isthmus at its transverse angle measured on this CT, parallel to the superior endplate, entering where it leaves the dorsal bone; where a narrow pedicle’s measured axis falls outside the range of the published study means for its level (it can turn outwards), at their mean instead.',
      refIds: ['lehman2003', 'verma2020'],
    },
    size: THORACIC_SIZE,
    note: THORACIC_FREEHAND,
  },
  at: {
    id: 'at', name: 'Anatomic trajectory', levels: THORACIC_LEVELS, hidden: true,
    start: {
      text: 'The anatomic trajectory follows the true axis of the pedicle; after a straight-forward screw had broken through the medial wall, a screw in the anatomic trajectory reached 62% of the original maximum insertional torque in cadavers, enough for a salvage. Start position here: along the pedicle axis measured on this CT, entering where it leaves the dorsal bone.',
      refIds: ['lehman2003', 'lehmankuklo2003'],
    },
    size: THORACIC_SIZE,
    note: THORACIC_FREEHAND,
  },
  rc: {
    id: 'rc', name: 'Roy-Camille', levels: LATERAL_MASS_LEVELS, within: 'lateral mass', bicortical: true, hidden: true,
    start: {
      text: 'Roy-Camille: entry at the midpoint of the lateral mass, about 10° lateral, perpendicular to the lateral mass’s surface. Start position here: the midpoint of the lateral mass’s posterior face as measured on this CT, perpendicular to a plane fitted to that face, 10° lateral.',
      refIds: ['joaquim2018'],
    },
    size: LATERAL_MASS_SIZE,
    note: { text: 'Compared with the Magerl technique, Roy-Camille screws violated nerve roots less often but facet joints more often, and they are shorter.', refIds: ['joaquim2018'] },
  },
  mg: {
    id: 'mg', name: 'Lateral mass screw (Magerl)', levels: LATERAL_MASS_LEVELS, within: 'lateral mass', bicortical: true,
    start: {
      text: 'Magerl: entry 1 mm medial and 1 mm cranial to the midpoint of the lateral mass, 20–30° lateral, parallel to the adjacent facet joints. Start position here: 25° lateral, parallel to the mean inclination of the facet joints above and below as measured on this CT.',
      refIds: ['joaquim2018'],
    },
    size: LATERAL_MASS_SIZE,
    note: { text: 'Magerl screws can be longer and violate the facet joint less often than Roy-Camille screws; in a cadaver comparison with deliberately long (20 mm) screws they violated a nerve in 95%, against 60% for the An technique.', refIds: ['joaquim2018'] },
  },
  an: {
    id: 'an', name: 'An', levels: LATERAL_MASS_LEVELS, within: 'lateral mass', bicortical: true, hidden: true,
    start: {
      text: 'An: entry 1 mm medial to the midpoint of the lateral mass, 30° lateral, 15° cephalad. Start position here: the cephalad angle taken from the perpendicular to the lateral mass’s face measured on this CT.',
      refIds: ['joaquim2018'],
    },
    size: LATERAL_MASS_SIZE,
    note: { text: 'With deliberately long (20 mm) screws in cadavers, the An technique violated a nerve root less often (60%) than the Magerl (95%) and Anderson (90%) techniques.', refIds: ['joaquim2018'] },
  },
  cp: {
    id: 'cp', name: 'C7 pedicle screw', levels: ['C7'],
    start: {
      text: 'Cervical pedicle screws (Abumi): entry slightly lateral to the midpoint of the lateral mass, close to the lower edge of the facet joint above, 25–45° medial, parallel to the upper endplate at C5–C7. Start position here: through the pedicle’s isthmus at its transverse angle measured on this CT, parallel to the superior endplate, entering where it leaves the dorsal bone.',
      refIds: ['joaquim2018'],
    },
    size: {
      text: 'Start size 3.5 mm (the series used 3.5 or 4.0 mm, chosen on the preoperative CT), as long as the trajectory to the anterior cortex on this CT, rounded down to the millimetre.',
      refIds: ['jiang2024'],
    },
    note: {
      text: 'At C7 the lateral mass is small and the vertebral artery usually does not run in the foramen transversarium, so pedicle screws are commonly used there; a C7 lateral mass screw easily violates the C7–T1 facet joint.',
      refIds: ['joaquim2018', 'rathinavelu2021'],
    },
  },
  c1lm: {
    id: 'c1lm', name: 'C1 lateral mass', levels: ['C1'], within: 'lateral mass', bicortical: true,
    start: {
      text: 'C1 lateral mass screw: entry in the midportion of the lateral mass, often 4–6 mm lateral to its medial border, at its junction with the lower edge of the posterior arch (clear of the C1–C2 joint), about 15° medial, aimed on the lateral view at the anterior tubercle of C1. Start position here: 5 mm lateral to the lateral mass’s medial border as measured on this CT, just under the arch, aimed at the anterior tubercle measured on this CT.',
      refIds: ['joaquim2020'],
    },
    size: { text: 'Start size 3.5 mm, bicortical: to the far cortex of the lateral mass on this CT, rounded down to the millimetre. A longer screw can reach the internal carotid artery.', refIds: ['joaquim2020', 'singh2022'] },
    note: { text: 'C1 lateral mass screws are demanding, with risks to the vertebral artery, of venous bleeding and of C2 neuropathy (the C2 root crosses the entry; it is not drawn here).', refIds: ['joaquim2020'] },
  },
  c2p: {
    id: 'c2p', name: 'C2 pedicle', levels: ['C2'],
    start: {
      text: 'C2 pedicle screw: one description enters 7 mm lateral and 5 mm caudal to where lines along the lamina’s upper border and the canal’s lateral border cross, 30° medial and 20° cranial, to the pedicle’s anterior cortex; another 2 mm lateral to where the lamina’s upper border meets the pars’s mediolateral midline, 30–45° medial, aimed in the sagittal plane at the lower half of the atlas’s anterior tubercle. Start position here: 45° medial (the most convergent of 30–45°), the entry 5 mm caudal to the lamina’s upper border and as far lateral as keeps the most bone around the screw on this CT (10 mm lateral to the canal’s border, 3 mm lateral of the first description’s entry; the more lateral the entry, the more a screw can converge), cranially along the pedicle the same way (the AO entry at the lamina’s border itself would leave the pedicle superiorly on this CT).',
      refIds: ['kendirlioglu2026', 'aosurgeryref'],
    },
    size: { text: 'Start size 3.5 mm, up to 27 mm (3D-printed models of 38 patients averaged 26.8 mm; a unicortical screw over 20 mm is typically adequate), the tip at least 1 mm short of where it would leave the bone on this CT.', refIds: ['kendirlioglu2026', 'aosurgeryref'] },
    note: { text: 'Up to 20% of people have C2 pedicles too small for a screw; with a high-riding vertebral artery the corridor narrows further.', refIds: ['joaquim2020', 'kucherina2026'] },
  },
  c2pars: {
    id: 'c2pars', name: 'C2 pars', levels: ['C2'], within: 'pars',
    start: {
      text: 'C2 pars screw: the entry 3–4 mm above the C2–C3 facet joint at the midpoint of the pars mediolaterally, the trajectory as dorsal as possible without perforating the pars’s dorsal cortex — essentially a short transarticular screw. Start position here: that entry as measured on this CT, straight forward, cranially along the pars’s own axis (the angle that keeps the most bone around the screw on this CT; hugging the dorsal cortex would be about 20° steeper). Other descriptions angle it 10–23° medially and 42–45° cranially from a more medial entry.',
      refIds: ['aosurgeryref', 'singh2022', 'kendirlioglu2026'],
    },
    size: { text: 'Start size 3.5 mm, up to 18 mm (a unicortical screw over 16 mm is typically adequate; series used 14–18 mm), the tip at least 1 mm short of where it would leave the bone on this CT.', refIds: ['aosurgeryref', 'singh2022'] },
    note: { text: 'With its shorter, more medial course a pars screw avoids the vertebral artery’s groove in many cases, which makes it a common choice with a high-riding artery; some pars are too small to take a screw.', refIds: ['kucherina2026', 'aosurgeryref'] },
  },
  c2tl: {
    id: 'c2tl', name: 'C2 translaminar', levels: ['C2'], within: 'lamina',
    start: {
      text: 'C2 translaminar (Wright): each screw enters at the junction of the spinous process and the opposite lamina — the left screw’s entry higher, the right one’s lower, so they cross — and runs from dorsal to ventral along the lamina. The laminar angle (the lamina’s axis to the midline) measured 49.4 ± 3.0° on CT in 357 laminae. Start position here: the lamina’s own axis on this CT, the line through its core that keeps the most bone around it, entered where it meets the bone across the midline.',
      refIds: ['singh2022', 'zhou2022'],
    },
    size: { text: 'Start size 3.5 mm (two 3.5 mm screws need a C2 spinous process about 9 mm high), up to 32 mm, the laminar length measured from the opposite junction to the lateral mass’s cortex (31.8 mm), the tip at least 1 mm short of where it would leave the bone on this CT; the laminae were 6.1 mm thick on average.', refIds: ['singh2022', 'zhou2022'] },
    note: { text: 'Translaminar screws avoid the pedicle and the vertebral artery entirely.', refIds: ['kucherina2026'] },
  },
  ta: {
    id: 'ta', name: 'C1–C2 transarticular', levels: ['C2'], within: 'axis and atlas',
    start: {
      text: 'C1–C2 transarticular (Magerl): from an entry 3–5 mm above the C2–C3 junction in a medial position, steeper than a pars screw, through the C2 pars across the atlanto-axial joint into the lateral mass of C1, aimed on the lateral view at the anterior arch of C1; 3D-printed models averaged 11.4° medial. Start position here: 2.5 mm lateral of and 4 mm above the medial end of the C2–C3 facet joint line on this CT, 10° medial, aimed at the anterior tubercle; the joint is counted as bone for this screw, which is meant to cross it.',
      refIds: ['joaquim2020', 'jannelli2025', 'kendirlioglu2026'],
    },
    size: { text: 'Start size 3.5 mm, the tip at least 1 mm short of where it would leave the atlas on this CT; average lengths of 20–30 mm are quoted.', refIds: ['joaquim2020'] },
    note: { text: 'Too cranial a screw can violate the occipito-atlantal joint, too caudal holds C1 poorly, too medial endangers the cord and too lateral the vertebral artery. About 22% of patients were not suited to it, and its vertebral artery risk is higher than other C2 techniques’.', refIds: ['joaquim2020', 'singh2022'] },
  },
  od: {
    id: 'od', name: 'Odontoid (anterior)', levels: ['C2'], within: 'axis', bicortical: true, midline: true,
    // the screw's line is 'anterior' (its far cortex: the apex); its front and back walls are 'superior' / 'inferior'
    breachWords: { superior: 'anterior', inferior: 'posterior', medial: 'right', lateral: 'left' },
    start: {
      text: 'Anterior odontoid screw (type II fractures), through an anterior neck approach: a guide wire from the anteroinferior aspect of the C2 body towards the apex of the dens, at 25–30° in the sagittal plane and within 5° of the midline; on the lateral view the entry is at the anterior edge of the endplate. Start position here: in the midline, from the bone of the axis furthest forwards and down in its midsagittal plane to the centre of the dens’s tip on this CT. Its angles are read looking backwards: straight back is 0°, cranial positive.',
      refIds: ['figa2025', 'loganathan2023', 'sung2018'],
    },
    size: {
      text: 'Start size 4 mm (the diameter most used), as long as the line from the entry to the apex on this CT, rounded up, so the tip engages the apical cortex: penetrating it is recommended for the lag effect (bicortical). One series used lag screws of 34–42 mm; on CT the entry-to-apex length averaged 39.2 ± 2.6 mm in 55 adults, and screws several millimetres longer are needed to penetrate the tip.',
      refIds: ['gonzalezvargas2026', 'figa2025', 'sung2018'],
    },
    note: {
      text: 'Beyond the apex the ventral dura lay 7.7 ± 1.7 mm away along the screw’s line, but only 2.1 ± 3.2 mm beyond the posterior end of the dens’s tip: a trajectory aimed further back leaves less margin. Severe kyphosis, a comminuted odontoid base or an unfavourable fracture line can make the anterior approach unsuitable.',
      refIds: ['sung2018', 'figa2025'],
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

/** Dorsal approaches to a thoracic disc: what each removes, from the published technique descriptions. */
export type ApproachId = 'tp' | 'ctv' | 'le';
export interface Approach {
  id: ApproachId; name: string;
  /** the step of Kshettry 2015's successive resections that corresponds (spine-published.json approachExposure) */
  exposureStep: 'transpedicular' | 'costotransversectomy' | 'lateralExtracavitary';
  /** drawing choice: the view's angle from straight behind towards the approach side (deg); only the order is sourced */
  viewAngle: number;
  removes: Statement;
}
export const APPROACHES: Record<ApproachId, Approach> = {
  tp: {
    id: 'tp', name: 'Transpedicular', exposureStep: 'transpedicular', viewAngle: 25,
    removes: {
      text: 'In a published transpedicular (transdural) series: a laminectomy at the disc and one level above and below, the facets above and below on the approach side, and the whole pedicle. The exiting root at the level was tied off and cut outside the dura in 3 of 7 patients, for a better view.',
      refIds: ['komaitis2025'],
    },
  },
  ctv: {
    id: 'ctv', name: 'Costotransversectomy', exposureStep: 'costotransversectomy', viewAngle: 45,
    removes: {
      text: 'In a published series: the rib head is freed from the costovertebral joint, and the rib for 5 cm from its head and the transverse process are removed, which opens a lateral view of the vertebral body; the pleura must be spared. Followed medially, the intercostal neurovascular bundle leads to the pedicle, which is removed to expose the side of the dural sac. Transient intercostal neuralgia followed in 3 of 10 patients.',
      refIds: ['scoscina2023'],
    },
  },
  le: {
    id: 'le', name: 'Lateral extracavitary', exposureStep: 'lateralExtracavitary', viewAngle: 65,
    removes: {
      text: 'The lateral extracavitary approach, first described for trauma, reaches the spine from behind and ventrolaterally. In a modified version: laminectomies, the facets around the disc spaces, and on the approach side the transverse processes, short segments of the ribs and the rib heads are removed, after a plane is opened between the pleura and the rib; nerve roots are sacrificed to widen the working space.',
      refIds: ['mozaffari2024', 'jandial2012'],
    },
  },
};
export const APPROACH_STATEMENTS = {
  choice: {
    text: 'Mostly lateral thoracic disc herniations can often be removed through a unilateral transfacet or transpedicular approach; anterior and anterolateral ones are mostly reached transthoracically or posterolaterally (costotransversectomy, lateral extracavitary); more calcified or midline ones may need approaches from both sides and a fusion. Laminectomy is no longer used for thoracic disc herniations: it carries a risk of paralysis.',
    refIds: ['epstein2023'],
  },
  exposure: {
    text: 'Share of the ventral canal’s width seen without retracting the dural sac, in 4 cadavers after each of five successive resections (laminectomy, 50% medial facetectomy, transpedicular, costotransversectomy, lateral extracavitary). Each step also widened the lateral approach angle, except the lateral extracavitary one at T1–T2.',
    refIds: ['kshettry2015'],
  },
  adamkiewicz: {
    text: 'The artery of Adamkiewicz, the main supply of the anterior thoracolumbar spinal cord, was present in 84.6% of people in a meta-analysis (60 studies, 5437 subjects): mostly a single artery (87.4%), on the left (76.6%), arising between T8 and L1 (89%). It is not drawn here.',
    refIds: ['taterra2019'],
  },
  view: {
    text: 'View: from behind and towards the approach side, more lateral for each approach in this order (the angles are a drawing choice); the vertebrae at the disc are drawn see-through so the disc, the dural sac and the roots show.',
    refIds: [],
  },
} satisfies Record<string, Statement>;
/** The anterior (Smith-Robinson) approach to a subaxial cervical disc. */
export const ACDF_STATEMENTS = {
  plane: {
    text: 'Through the platysma, the corridor is opened bluntly between the sternocleidomastoid and the carotid sheath laterally and the trachea, oesophagus, strap muscles and recurrent laryngeal nerve medially; these are retracted medially and the sheath laterally. The longus colli is then lifted off on either side of the midline.',
    refIds: ['hasan2025', 'arumalla2021'],
  },
  side: {
    text: 'The right recurrent laryngeal nerve loops around the subclavian artery and ascends higher and more obliquely; the left loops around the aortic arch and ascends in the tracheo-oesophageal groove, which is why a left-sided approach is often chosen. Palsy rates after ACDF did not differ much: 1.9% from the right, 1.8% from the left. A left-sided exposure low in the neck can injure the thoracic duct, which arches behind the carotid sheath at C7.',
    refIds: ['hasan2025', 'arumalla2021'],
  },
  nerves: {
    text: 'Nerve injuries of the anterior approach: recurrent laryngeal nerve 0.9–8.3% transient and under 1% permanent; C5 palsy 4.6–10%; Horner’s syndrome (the sympathetic chain, with dissection too far lateral) 0.1–0.5%; the superior laryngeal nerve with high (C2–C4) exposures. The nerves and the sympathetic chain are not drawn here.',
    refIds: ['hasan2025'],
  },
  landmarks: {
    text: 'Classic landmarks (Hoppenfeld): the hyoid at C3, the thyroid cartilage at the C4–C5 disc, the cricoid at C6. With the neck slightly extended, as in surgery, they lay most often at C2–C3, C4 and C5–C6, and on MRI the hyoid ranged from C2–C3 to C4–C5 and the cricoid’s lower margin from C4–C5 to C7–T1: a level should be checked on the patient’s imaging.',
    refIds: ['siribumrungwong2018', 'alicandri2020'],
  },
  approachByLandmark: {
    text: 'One suggested scheme: above the hyoid a high prevascular retrovisceral approach; between the hyoid and the cricoid’s lower margin the standard (Cloward) approach; below the cricoid the standard approach, from the left preferred.',
    refIds: ['alicandri2020'],
  },
  measured: {
    text: 'Measured on this CT: each landmark projected perpendicularly onto the spine (the hyoid’s and thyroid cartilage’s centres, the cricoid’s lowest point), to the vertebral body or disc nearest along the spine’s axis; and the width between the medial edges of the left and right foramina transversaria, in which the vertebral arteries run from their entry level up.',
    refIds: [],
  },
  view: {
    text: 'View: from in front and to the approach side (a drawing choice); the vessels and the viscera are shown, the vertebrae at the disc see-through.',
    refIds: [],
  },
} satisfies Record<string, Statement>;

/** A posterior cervical (keyhole) foraminotomy, drilled on this CT's two vertebrae at a foramen. */
export const FORAMINOTOMY_STATEMENTS = {
  vpoint: {
    text: 'The keyhole starts at the V-point: where the inferior margin of the upper lamina, the medial junction of the inferior and superior articular processes, and the superior margin of the lower lamina meet. In one endoscopic technique a 3-mm diamond burr marks it, takes the upper lamina first (it lies over the joint), and the foraminotomy proceeds from the lamina–facet junction.',
    refIds: ['zhang2020'],
  },
  facet: {
    text: 'The medial half of the facet joint is removed to free the root. Removing 50% of the facet or more lowered the segment’s torsional stiffness markedly in a biomechanical study, so less than half is resected; removing up to 5 mm of the lateral mass is considered safe. In one en-bloc technique the inferior articular process is removed first, then the medial half of the superior articular process is cut in grooves and lifted out.',
    refIds: ['kang2022'],
  },
  drawn: {
    text: 'Here: a round 4-mm burr (a drawing choice) takes bone away from this CT’s two vertebrae (each its CT surface, as drawn elsewhere); the disc between them is not drawn while drilling. Its clearance is measured to the dural sac (segmented on this CT) and to the roots and the vertebral arteries (both schematic, drawn through the measured foramina). Cut bone is coloured by the CT’s density; where little bone is left over a structure, its colour shows through. Bone is simply taken away: nothing of the tissue’s behaviour is simulated.',
    refIds: [],
  },
} satisfies Record<string, Statement>;

/** Kshettry 2015's region for a thoracic disc below `level` (T12 and its disc fall in T11-T12). */
export function exposureRegion(level: string): 'T1-T2' | 'T3-T6' | 'T7-T10' | 'T11-T12' {
  const n = Number(level.slice(1));
  return n <= 2 ? 'T1-T2' : n <= 6 ? 'T3-T6' : n <= 10 ? 'T7-T10' : 'T11-T12';
}

/** Cross-checks: every statement's references exist; every measured level has a structure. */
export function crossCheckContent(): string[] {
  const errs: string[] = [];
  for (const [k, st] of Object.entries(STATEMENTS)) for (const r of st.refIds) if (!SP_MANIFEST.references[r]) errs.push(`${k}: unknown reference ${r}`);
  for (const t of Object.values(TECHNIQUES)) {
    for (const st of [t.start, t.size, t.note]) for (const r of st?.refIds ?? []) if (!SP_MANIFEST.references[r]) errs.push(`${t.id}: unknown reference ${r}`);
  }
  for (const st of [...Object.values(APPROACHES).map((a) => a.removes), ...Object.values(APPROACH_STATEMENTS), ...Object.values(ACDF_STATEMENTS), ...Object.values(FORAMINOTOMY_STATEMENTS)]) {
    for (const r of st.refIds) if (!SP_MANIFEST.references[r]) errs.push(`approach: unknown reference ${r}`);
  }
  return errs;
}
