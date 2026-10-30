import { z } from 'zod';
import zaDefinitions from '../data/generated/sb-definitions.json';
import zaLandmarks from '../data/generated/sb-landmarks.json';
import zaManifest from '../data/generated/sb-manifest.json';
import zaRegions from '../data/generated/sb-regions.json';
import ctDefinitions from '../data/generated/sbct-definitions.json';
import ctLandmarks from '../data/generated/sbct-landmarks.json';
import ctManifest from '../data/generated/sbct-manifest.json';
import ctRegions from '../data/generated/sbct-regions.json';
import v3Approaches from '../data/generated/sbv3-approaches.json';
import v3Definitions from '../data/generated/sbv3-definitions.json';
import v3Fit from '../data/generated/sbv3-fit.json';
import v3Landmarks from '../data/generated/sbv3-landmarks.json';
import v3Manifest from '../data/generated/sbv3-manifest.json';
import { SbManifestSchema, type ManifestStructure } from '../data/schema';
import { APPROACH, APPROACH_REF } from './approaches';
import { FORAMEN_CONTENTS, FORAMEN_REF } from './foramina';

/**
 * Skull-base section data. Three models share the section's code: the Z-Anatomy model (BodyParts3D, CC BY-SA;
 * skullbase/), the detailed one (skullbase-ct/: a TopBrain CT angiogram with its labelled vessels, and the Z-Anatomy
 * nerves and landmarks fitted onto it), both from pipeline/skullbase_build.py, and the default one (skullbase/, model
 * "v3": the same CT with its anatomy made to fit it, pipeline/skullbase_v3.py). v1 is served from skullbase-v1/. A page picks
 * its model with <meta name="sb-model" content="ct"> (or "v3"). Coordinates: mm from the (fitted) hypophysial fossa.
 */
export type SbModel = 'zanatomy' | 'ct' | 'v3';
const META = typeof document !== 'undefined' ? document.querySelector<HTMLMetaElement>('meta[name="sb-model"]')?.content : undefined;
export const SB_MODEL: SbModel = META === 'ct' || META === 'v3' ? META : 'zanatomy';
const CT = SB_MODEL === 'ct';
const V3M = SB_MODEL === 'v3';
const manifestJson = V3M ? v3Manifest : CT ? ctManifest : zaManifest;
const landmarksJson = V3M ? v3Landmarks : CT ? ctLandmarks : zaLandmarks;
const definitionsJson = V3M ? v3Definitions : CT ? ctDefinitions : zaDefinitions;
const regionsJson = V3M ? [] : CT ? ctRegions : zaRegions;
export const SB_MANIFEST = SbManifestSchema.parse(manifestJson);
export const SB = new Map(SB_MANIFEST.structures.map((s) => [s.id, s]));

const V3 = z.tuple([z.number(), z.number(), z.number()]);
export const LandmarkSchema = z.object({
  id: z.string().regex(/^lm_[a-z0-9_]+$/),
  name: z.string(),
  bone: z.string(),
  part: z.string().nullable(),
  ras: V3,
  side: z.enum(['L', 'R', 'M']),
  boneFrom: z.string(),
  distanceToBoneMm: z.number(),
  /** located by the pipeline from what passes through it (a foramen the model does not label): how, and from which structures */
  how: z.string().optional(),
  from: z.array(z.string()).optional(),
  /** a cranial-floor landmark put on this CT's bone (pipeline/skullbase_v3_floor.py): how */
  placed: z.string().optional(),
});
export type Landmark = z.infer<typeof LandmarkSchema>;
export const LANDMARKS = z.array(LandmarkSchema).parse(landmarksJson);
export const LM = new Map(LANDMARKS.map((l) => [l.id, l]));

const DefinitionSchema = z.object({ text: z.string().min(1), url: z.string().url().nullable() });
/** Wikipedia-derived definitions shipped in Z-Anatomy (CC BY-SA 3.0), keyed by structure name. */
export const DEFINITIONS = z.record(DefinitionSchema).parse(definitionsJson);

const RegionSchema = z.object({
  landmark: z.string(),
  ras: V3,
  radiusMm: z.number(),
  structures: z.array(z.object({ id: z.string(), distanceMm: z.number() })),
  landmarks: z.array(z.string()),
});
export const REGIONS = z.array(RegionSchema).parse(regionsJson);

export type Kind = 'bone' | 'soft' | 'artery' | 'vein' | 'nerve' | 'labyrinth' | 'ossicle' | 'membrane' | 'brain' | 'hindbrain' | 'ventricle' | 'removed' | 'triangle' | 'tumour' | 'guide';
export const kindOf = (m: ManifestStructure): Kind => (m.category ?? 'bone') as Kind;
/** structures that belong to a surgical approach (a cut bone, or the bone removed): drawn only in that approach's view */
export const isApproachPart = (m: ManifestStructure): boolean => !!m.approach;

const ApproachGeomSchema = z.object({
  name: z.string(),
  /** the craniotomy's side, or M: on the midline */
  side: z.enum(['L', 'R', 'M']),
  /** how the opening was drawn on this skull (generated with the geometry) */
  how: z.string().min(1),
  removedMl: z.number().positive(),
  /** the bones it draws, each replacing the whole bone in the approach's view: those it cuts, and any whole bone within
   *  a few millimetres of the cut (remeshed with them so they meet on one surface) */
  bones: z.array(z.string()).min(1),
  /** of those, the bones it cuts */
  cutBones: z.array(z.string()).min(1),
  removed: z.string(),
  burrHoles: z.array(V3),
});
export type ApproachGeom = z.infer<typeof ApproachGeomSchema>;
/** The approaches cut out of this model's bone (Skull base v3 only: pipeline/skullbase_v3_approach.py). */
export const APPROACH_GEOM: Record<string, ApproachGeom> = V3M ? z.record(ApproachGeomSchema).parse(v3Approaches) : {};

/** Foramina Z-Anatomy does not label: the pipeline locates them in the Z-Anatomy model (marked by `how`), not on the CT. */
export const LOCATED_FORAMINA = ['Superior orbital fissure', 'Internal acoustic meatus', 'Stylomastoid foramen', 'Jugular foramen',
  'Carotid canal', 'Foramen lacerum', 'Cribriform plate'];
/** Landmarks this model does not show. */
export const NOT_YET_SHOWN = V3M ? [] : CT ? [...LOCATED_FORAMINA, 'Clivus'] : ['Clivus'];

const FitSchema = z.object({ specimen: z.string(), correlation: z.number(), scale: z.number(), mirrored: z.boolean(), checksHU: z.record(z.number()) });
const CrossSchema = z.object({ correlation: z.number(), scale: z.number().optional(), failed: z.boolean().optional(), distanceMm: z.record(z.number()).optional() });
/** The temporal-bone model's registration report (pipeline/skullbase_v3.py): how well specimen ALPHA fits each ear,
 * where two other ears put the same landmarks, and the facial nerve's segments measured on this model. */
export const V3_FIT = z.object({
  fit: z.record(FitSchema),
  crossCheck: z.record(z.record(CrossSchema)),
  facialSegmentsMm: z.record(z.object({ labyrinthine: z.number(), tympanic: z.number(), mastoid: z.number(), secondGenuAngle: z.number() })),
  relationsMm: z.record(z.object({ geniculateToCochlea: z.number(), geniculateToSuperiorCanal: z.number(), gspnLength: z.number(), gspnToCarotid: z.number() })),
  /** the cranial nerves routed through the CT: length drawn, bone crossed, distance from the fitted course, per side */
  nerves: z.record(z.record(z.object({ lengthMm: z.number(), boneCrossedMm: z.number(), maxFromFittedMm: z.number() }))),
  nerveChecks: z.object({
    mandibularNerveToOvaleHoleMm: z.record(z.number().nullable()),
    opticNerveToSegmentationMm: z.record(z.number()),
    jugularNervesToBulbMm: z.record(z.record(z.number())),
  }),
  sinuses: z.record(z.object({ lengthMm: z.number(), inLumenShare: z.number(), medianRadiusMm: z.number(), boneCrossedMm: z.number() })),
  /** the trigeminal ganglion placed on this CT from its foramina (Meckel's cave), per side */
  trigeminal: z.record(z.object({ meckel: z.array(z.number()), spanMm: z.number(), movedFromFittedMm: z.number() })).optional(),
  carotids: z.record(z.object({ lengthMm: z.number(), inLumenShare: z.number(), medianRadiusMm: z.number(), medianFromSpecimenMm: z.number() })),
  /** the template brain fitted into the CT and its transsylvian opening (pipeline/skullbase_brain.py) */
  brain: z.object({
    fit: z.object({
      tableMedianMm: z.number(), boneInsideHullShare: z.number(), vesselInCortexShare: z.number(),
      m2InsulaMedianMmR: z.number(), m2InCortexShareR: z.number(), m3FissureMedianMmR: z.number(), m3InCortexShareR: z.number(),
      m2InsulaMedianMmL: z.number(), m3FissureMedianMmL: z.number(), duraInCortexShare: z.number(),
      affineScale: z.array(z.number()), minRelativeVolume: z.number(), cavityMl: z.number(),
    }),
    clear: z.record(z.object({ inBoneWayBefore: z.number(), inVesselBefore: z.number(), acrossFalxBefore: z.number(), inBoneWayAfter: z.number(), inVesselAfter: z.number(),
      acrossFalxAfter: z.number(), maxMovedMm: z.number() })),
    crossedTriangles: z.record(z.object({ template: z.number(), fitted: z.number() })),
    open: z.object({ lipsFrontal: z.number(), lipsTemporal: z.number(), moved: z.number(), maxMovedMm: z.number(), crossedTriangles: z.number(), outsideCavityAfter: z.number() }),
    lift: z.object({ orbitalHandles: z.number(), insulaHandles: z.number(), moved: z.number(), maxMovedMm: z.number(), crossedTriangles: z.number(), outsideCavityAfter: z.number() }),
    /** the lateral supraorbital view's lift, along that approach's corridor */
    lsoLift: z.object({ orbitalHandles: z.number(), insulaHandles: z.number(), moved: z.number(), maxMovedMm: z.number(), crossedTriangles: z.number(), outsideCavityAfter: z.number() }),
    interhemispheric: z.object({
      moved: z.number(), fullyMoved: z.number(), maxMovedMm: z.number(), crossedTriangles: z.number(), outsideCavityAfter: z.number(),
      span: z.tuple([z.number(), z.number()]), callosumTopMm: z.tuple([z.number(), z.number()]),
    }),
    params: z.object({
      tableGapMm: z.number(), boneGapMm: z.number(), openFrontalMm: z.number(), openTemporalMm: z.number(), openRoiMm: z.number(),
      liftMm: z.number(), liftCoreMm: z.number(), liftReachMm: z.number(), liftInsulaShare: z.number(), lsoLiftMm: z.number(),
      interhemisphericMm: z.number(), interhemisphericFadeMm: z.number(), interhemisphericReachMm: z.number(), interhemisphericFlatMm: z.number(),
      interhemisphericAboveCallosumMm: z.number(),
    }),
    /** the anterior cerebral arteries TopBrain labels on this CT: which A3 segments, and how far the third artery's A2
     * starts from the anterior communicating artery */
    aca: z.object({ a3: z.array(z.enum(['R', 'L', 'third'])), thirdA2ToAcomMm: z.number().nullable() }),
    /** per artery and side: how far the opening and the lifts move it at most */
    vesselsMovedMaxMm: z.record(z.record(z.object({ open: z.number(), lift: z.number(), lsoLift: z.number() }))),
    m1LengthMm: z.record(z.number()),
  }).optional(),
  /** the cerebellum, brainstem and fourth ventricle fitted into the posterior fossa, and the telovelar shape
   * (pipeline/skullbase_pfossa.py) */
  pfossa: z.object({
    fit: z.object({
      tableMedianMm: z.number(), vesselInsideShare: z.number(), boneInsideHullShare: z.number(), tentoriumInsideShare: z.number(),
      minRelativeVolume: z.number(), affineScale: z.array(z.number()),
      before: z.object({ tableMedianMm: z.number(), vesselInsideShare: z.number() }),
    }),
    clear: z.object({ inVesselBefore: z.number(), inBoneBefore: z.number(), inVesselAfter: z.number(), inBoneAfter: z.number(), maxMovedMm: z.number() }),
    modelMl: z.number(),
    telovelar: z.object({ maxMovedMm: z.number(), inBoneAfter: z.number(), inVesselAfter: z.number(),
      tonsilToMedullaMm: z.object({ rest: z.number(), moved: z.number() }), vermisLiftMm: z.number(),
      uvulaToMedullaMm: z.object({ rest: z.number(), moved: z.number() }), inVentricle: z.object({ rest: z.number(), moved: z.number() }) }),
    /** the retrosigmoid shape: the right hemisphere drawn back from the petrous bone */
    retrosigmoid: z.object({ maxMovedMm: z.number(), moved: z.number(), inBoneAfter: z.number(), inVesselAfter: z.number(),
      meatusToCerebellumMm: z.object({ rest: z.number(), moved: z.number() }), inCorridor: z.object({ rest: z.number(), moved: z.number() }) }),
    params: z.object({ rsMm: z.number(), rsReachMm: z.number(), tableGapMm: z.number(), tableMinMm: z.number(), boneGapMm: z.number(), tvMm: z.number(), tvUp: z.number(), tvReachMm: z.number(),
      tvVermisMm: z.number(), tvVermisBack: z.number(), tvVermisReachMm: z.number() }),
  }).optional(),
  /** the skull completed beyond the CT's field of view, the face from the fitted model (pipeline/skullbase_v3_skull.py) */
  skull: z.object({
    fit: z.object({ scale: z.number(), warpedMedianMm: z.number() }),
    face: z.object({ medianBeforeMm: z.number(), medianAfterMm: z.number(), withinBefore: z.number(), withinAfter: z.number() }),
    edge: z.object({ medianBeforeMm: z.number(), medianAfterMm: z.number(), p90BeforeMm: z.number(), p90AfterMm: z.number() }),
    faceBones: z.array(z.string()), seamMm: z.number(), blendMm: z.number(), edgeFitMm: z.number(),
  }).optional(),
}).parse(v3Fit);

/** Definition for a structure or landmark name (paired structures use their base name). */
export function definitionFor(name: string): { text: string; url: string | null } | null {
  return DEFINITIONS[name] ?? DEFINITIONS[name.trim()] ?? null;
}

/** Cross-checks between the generated files. Returns a list of problems (empty = consistent). */
export function crossCheckSb(): string[] {
  const errs: string[] = [];
  const ids = new Set(SB_MANIFEST.structures.map((s) => s.id));
  for (const r of REGIONS) {
    for (const s of r.structures) if (!ids.has(s.id)) errs.push(`region ${r.landmark}: unknown structure ${s.id}`);
    for (const n of r.landmarks) if (!LANDMARKS.some((l) => l.name === n)) errs.push(`region ${r.landmark}: unknown landmark ${n}`);
  }
  const lmIds = LANDMARKS.map((l) => l.id);
  for (const id of lmIds) if (lmIds.indexOf(id) !== lmIds.lastIndexOf(id)) errs.push(`duplicate landmark id ${id}`);
  for (const n of NOT_YET_SHOWN) if (LANDMARKS.some((l) => l.name.toLowerCase() === n.toLowerCase())) errs.push(`${n} is now labelled: remove it from NOT_YET_SHOWN`);
  for (const l of LANDMARKS) if (l.how && !FORAMEN_CONTENTS[l.name]) errs.push(`located foramen ${l.name}: no sourced contents`);
  for (const cl of Object.values(FORAMEN_CONTENTS).flat()) for (const r of cl.refIds) if (!FORAMEN_REF.has(r)) errs.push(`foramen claim: unknown refId ${r}`);
  for (const [aid, g] of Object.entries(APPROACH_GEOM)) {
    const c = APPROACH.get(aid);
    if (!c) { errs.push(`approach ${aid}: no sourced content`); continue; }
    for (const id of [...g.bones, g.removed]) if (!ids.has(id)) errs.push(`approach ${aid}: unknown structure ${id}`);
    for (const id of g.bones) { const r = SB.get(id)?.replaces; if (!r || !ids.has(r)) errs.push(`approach ${aid}: ${id} replaces an unknown bone`); }
    for (const cl of c.sections.flatMap((x) => x.claims)) for (const r of cl.refIds) if (!APPROACH_REF.has(r)) errs.push(`approach ${aid}: unknown refId ${r}`);
    for (const n of c.context) if (!SB_MANIFEST.structures.some((s) => s.name === n)) errs.push(`approach ${aid}: unknown context structure ${n}`);
  }
  return errs;
}
