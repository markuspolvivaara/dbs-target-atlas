import { z } from '../zod';
import v3Approaches from '../data/generated/sbv3-approaches.json';
import zaApproaches from '../data/generated/sb-approaches.json';
import zaV1Fit from '../data/generated/sb-v1fit.json';
import v3Fit from '../data/generated/sbv3-fit.json';
import { SbManifestSchema, type ManifestStructure } from '../data/schema';
import { APPROACH, APPROACH_REF, APPROACHES, V1_ABSENT, V1_NAMES } from './approaches';
import { FORAMEN_CONTENTS, FORAMEN_REF, PASSAGES } from './foramina';
import { TB_NOTES } from './temporal';
import { SB_MODEL, type SbModel } from './model';
import { TRIGEMINAL } from './trigeminal';

/**
 * Skull-base section data. Three models share the section's code: the Z-Anatomy model (BodyParts3D, CC BY-SA;
 * skullbase/), the detailed one (skullbase-ct/: a TopBrain CT angiogram with its labelled vessels, and the Z-Anatomy
 * nerves and landmarks fitted onto it), both from pipeline/skullbase_build.py, and the default one (skullbase/, model
 * "v3": the same CT with its anatomy made to fit it, pipeline/skullbase_v3.py). v1 is served from skullbase-v1/. A page picks
 * its model with <meta name="sb-model" content="ct"> (or "v3"). Coordinates: mm from the (fitted) hypophysial fossa.
 */
export { SB_MODEL, type SbModel } from './model';
const CT = SB_MODEL === 'ct';
const V3M = SB_MODEL === 'v3';
// The page's own model's manifest, landmarks, definitions and regions: a chunk per model, so that a page does not
// load (and validate) the other two models' (they were 60 to 77 % of the data in its script; the audit's P1-07). The
// smaller files read across models (the fits, cavernous sinus, endonasal and tumour data) stay in the page's script.
const PAGE_DATA = await (V3M ? import('./data-v3') : CT ? import('./data-ct') : import('./data-v1'));
const manifestJson = PAGE_DATA.default.manifest;
const landmarksJson = PAGE_DATA.default.landmarks;
const definitionsJson = PAGE_DATA.default.definitions;
const regionsJson = PAGE_DATA.default.regions;
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
// (with the points the trigeminal neuralgia views add, src/skullbase/trigeminal.ts: labels, picking, cards, "Measure
// positions from here" and the text version then work for them as for the model's own)
export const LANDMARKS = z.array(LandmarkSchema).parse([...(landmarksJson as unknown[]), ...(TRIGEMINAL?.landmarks ?? [])]);
// (Z-Anatomy spells it "Supercilliary arch": shown corrected, and its definition found under the corrected name)
for (const l of LANDMARKS) if (l.name === 'Supercilliary arch') l.name = 'Superciliary arch';
export const LM = new Map(LANDMARKS.map((l) => [l.id, l]));

const DefinitionSchema = z.object({ text: z.string().min(1), url: z.string().url().nullable() });
/**
 * Shipped definitions that are wrong on their face, corrected here for every model (the site audit's C-009): the words
 * replaced, or the text withdrawn, and why. The texts are CC BY-SA, so the card says what was changed.
 */
export const DEFINITION_EDITS: Record<string, { old?: string; new?: string; replace?: [string, string][]; withdraw?: boolean; why: string }> = {
  'Facial nerve (VII)': { old: 'The facial nerve (the labyrinthine segment) is', new: 'The facial nerve is',
    why: '“(the labyrinthine segment)” removed after “The facial nerve”: that is one of the three segments of the nerve’s bony canal, not the nerve.' },
  'Callosomarginal artery': { withdraw: true,
    why: 'The text shipped for this artery described the A2 segment of the anterior cerebral artery, not the callosomarginal artery; it is not shown.' },
  // (the audit's C-017: sinuses called "areas beneath the brain"; the meatus's text shown for the nerves in it)
  'Inferior sagittal sinus': { old: 'is an area beneath the brain which allows', new: 'is a dural venous sinus, which allows',
    why: '“an area beneath the brain” replaced by “a dural venous sinus”: it runs in the lower edge of the falx, above the corpus callosum.' },
  'Straight sinus': { old: 'is an area within the skull beneath the brain.', new: 'is a dural venous sinus.',
    why: '“an area within the skull beneath the brain” replaced by “a dural venous sinus”.' },
  'Transverse sinus': { old: 'are two areas beneath the brain which allow', new: 'are two dural venous sinuses, which allow',
    why: '“two areas beneath the brain” replaced by “two dural venous sinuses”.' },
  'Superior petrosal sinus': { old: 'one of the dural venous sinuses located beneath the brain.', new: 'one of the dural venous sinuses.',
    why: '“located beneath the brain” removed.' },
  'Jugular foramen': { old: 'and sigmoid sinus vein pass', new: 'and sigmoid sinus pass', why: '“sigmoid sinus vein” corrected to “sigmoid sinus”.' },
  'Nerves in the internal acoustic meatus (VII, VIII)': { withdraw: true,
    why: 'The text shipped for these nerves was the internal acoustic meatus’s, which defines the canal; it is shown on the meatus’s card only.' },
};
/** Artefacts of the export, cleaned in every text (the audit's C-017): empty brackets where a pronunciation was,
 * reference marks ("[1]") and figure references ("[Fig. 1]"), section headings in capitals run into the text
 * ("… bone. STRUCTURE The …"), a dropped letter. */
export function tidyDefinition(t: string): string {
  return t.replace(/ \(\)/g, '').replace(/\[\d+\]/g, '').replace(/ ?\[Fig\.? ?\d*\]/g, '')
    .replace(/(^|[.:] )(?:[A-Z]{3,}[ :]+)+(?=[A-Z][a-z])/g, '$1').replace(/\bbeneath th /g, 'beneath the ');
}
/** Wikipedia-derived definitions shipped in Z-Anatomy (CC BY-SA 3.0), keyed by structure name, with DEFINITION_EDITS applied. */
export const DEFINITIONS: Record<string, { text: string; url: string | null; edited?: string }> = Object.fromEntries(
  Object.entries(z.record(z.string(), DefinitionSchema).parse(definitionsJson)).flatMap(([name, d]) => {
    // (Z-Anatomy's misspelt name, found under the corrected one: the audit's C-016)
    const key = name === 'Supercilliary arch' ? 'Superciliary arch' : name;
    const t = { ...d, text: tidyDefinition(d.text) };
    const e = DEFINITION_EDITS[name];
    if (!e) return [[key, t]];
    if (e.withdraw) return [];
    const pairs: [string, string][] = e.replace ?? (e.old ? [[e.old, e.new!]] : []);
    return pairs.some(([a]) => t.text.includes(a)) ? [[key, { ...t, text: pairs.reduce((x, [a, b]) => x.replace(a, b), t.text), edited: e.why }]] : [[key, t]];
  }));

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
  /** outlines drawn on the bone in its view (the Kawase rhomboid) */
  guides: z.array(z.string()).optional(),
  /** a view with an anterior clinoidectomy switch: the clinoid process's own piece (bone until the switch takes it), ml */
  clinoid: z.string().optional(),
  clinoidMl: z.number().positive().optional(),
  /** a view with a switch for its sphenoid ridge: the drilled ridge's own piece (bone removed until the switch puts it back), ml */
  ridge: z.string().optional(),
  ridgeMl: z.number().positive().optional(),
  /** what this model measures for it (the Kawase rhomboid's sides, the bone drilled) */
  measured: z.record(z.string(), z.number()).optional(),
});
export type ApproachGeom = z.infer<typeof ApproachGeomSchema>;
/** The approaches cut out of this model's bone (Skull base v3 only: pipeline/skullbase_v3_approach.py). */
export const APPROACH_GEOM: Record<string, ApproachGeom> = V3M ? z.record(z.string(), ApproachGeomSchema).parse(v3Approaches)
  : SB_MODEL === 'zanatomy' ? z.record(z.string(), ApproachGeomSchema).parse(zaApproaches) : {};
/** The geometry a surgical view is drawn through: its own, or the craniotomy it borrows (the microvascular
 * decompression's, the retrosigmoid one). */
export const geomOf = (aid: string): ApproachGeom | undefined => APPROACH_GEOM[APPROACH.get(aid)?.geom ?? aid];
/** v1's own brain and posterior fossa (pipeline/skullbase_v1_brain.py, skullbase_v1_pfossa.py): what their clearances
 * and shapes moved */
export const V1_FIT = z.object({
  brain: z.object({ cavityMl: z.number(), clear: z.record(z.string(), z.object({ inBoneWayBefore: z.number(), inBoneWayAfter: z.number(), maxMovedMm: z.number() })) }).passthrough(),
  pfossa: z.object({ clear: z.object({ inBoneBefore: z.number(), inBoneAfter: z.number(), inVesselBefore: z.number(), inVesselAfter: z.number(), maxMovedMm: z.number() }) }).passthrough(),
}).parse(zaV1Fit);

/** Foramina Z-Anatomy does not label: the pipeline locates them in the Z-Anatomy model (marked by `how`), not on the CT. */
export const LOCATED_FORAMINA = ['Superior orbital fissure', 'Internal acoustic meatus', 'Stylomastoid foramen', 'Jugular foramen',
  'Carotid canal', 'Foramen lacerum', 'Cribriform plate'];
/** Landmarks this model does not show. */
export const NOT_YET_SHOWN = V3M ? [] : CT ? [...LOCATED_FORAMINA, 'Clivus'] : ['Clivus'];

const FitSchema = z.object({ specimen: z.string(), correlation: z.number(), scale: z.number(), mirrored: z.boolean(), checksHU: z.record(z.string(), z.number()) });
const CrossSchema = z.object({ correlation: z.number(), scale: z.number().optional(), failed: z.boolean().optional(), distanceMm: z.record(z.string(), z.number()).optional() });
/** The temporal-bone model's registration report (pipeline/skullbase_v3.py): how well specimen ALPHA fits each ear,
 * where two other ears put the same landmarks, and the facial nerve's segments measured on this model. */
export const V3_FIT = z.object({
  fit: z.record(z.string(), FitSchema),
  crossCheck: z.record(z.string(), z.record(z.string(), CrossSchema)),
  facialSegmentsMm: z.record(z.string(), z.object({ labyrinthine: z.number(), tympanic: z.number(), mastoid: z.number(), secondGenuAngle: z.number() })),
  relationsMm: z.record(z.string(), z.object({ geniculateToCochlea: z.number(), geniculateToSuperiorCanal: z.number(), gspnLength: z.number(), gspnToCarotid: z.number() })),
  /** the cranial nerves routed through the CT: length drawn, bone crossed, distance from the fitted course, per side */
  // (maxFromGuideMm: a nerve led along another's route, the accessory beside the vagus at the jugular foramen: from that guide)
  nerves: z.record(z.string(), z.record(z.string(), z.object({ lengthMm: z.number(), boneCrossedMm: z.number(), maxFromFittedMm: z.number(), maxFromGuideMm: z.number().optional() }))),
  nerveChecks: z.object({
    mandibularNerveToOvaleHoleMm: z.record(z.string(), z.number().nullable()),
    opticNerveToSegmentationMm: z.record(z.string(), z.number()),
    jugularNervesToBulbMm: z.record(z.string(), z.record(z.string(), z.number())),
  }),
  sinuses: z.record(z.string(), z.object({ lengthMm: z.number(), inLumenShare: z.number(), medianRadiusMm: z.number(), boneCrossedMm: z.number() })),
  /** the trigeminal ganglion placed on this CT from its foramina (Meckel's cave), per side */
  trigeminal: z.record(z.string(), z.object({ meckel: z.array(z.number()), spanMm: z.number(), movedFromFittedMm: z.number() })).optional(),
  carotids: z.record(z.string(), z.object({ lengthMm: z.number(), inLumenShare: z.number(), medianRadiusMm: z.number(), medianFromSpecimenMm: z.number() })),
  /** the template brain fitted into the CT and its transsylvian opening (pipeline/skullbase_brain.py) */
  brain: z.object({
    fit: z.object({
      tableMedianMm: z.number(), boneInsideHullShare: z.number(), vesselInCortexShare: z.number(),
      m2InsulaMedianMmR: z.number(), m2InCortexShareR: z.number(), m3FissureMedianMmR: z.number(), m3InCortexShareR: z.number(),
      m2InsulaMedianMmL: z.number(), m3FissureMedianMmL: z.number(), duraInCortexShare: z.number(),
      affineScale: z.array(z.number()), minRelativeVolume: z.number(), cavityMl: z.number(),
    }),
    clear: z.record(z.string(), z.object({ inBoneWayBefore: z.number(), inVesselBefore: z.number(), acrossFalxBefore: z.number(), inBoneWayAfter: z.number(), inVesselAfter: z.number(),
      acrossFalxAfter: z.number(), maxMovedMm: z.number() })),
    crossedTriangles: z.record(z.string(), z.object({ template: z.number(), fitted: z.number() })),
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
    vesselsMovedMaxMm: z.record(z.string(), z.record(z.string(), z.object({ open: z.number(), lift: z.number(), lsoLift: z.number() }))),
    m1LengthMm: z.record(z.string(), z.number()),
    /** the tentorium the cerebrum's fit and the hindbrain's share: a surface through this CT's own transverse sinuses,
     * straight sinus and petrous ridges (pipeline/skullbase_v3_tentorium.py), and how far the fitted Z-Anatomy
     * tentorium, which the fits used before, lies from those */
    tentorium: z.object({
      anchors: z.object({ transverseSinus: z.number(), straightSinus: z.number(), petrousRidge: z.number() }),
      anchorMissMm: z.object({ median: z.number(), max: z.number() }),
      fittedAboveTransverseSinusRMm: z.number(), fittedAboveTransverseSinusLMm: z.number(),
      fittedBelowStraightSinusMm: z.object({ median: z.number(), max: z.number() }),
    }).optional(),
  }).optional(),
  /** the petrosal sinuses laid onto this CT's bone (pipeline/skullbase_v3_petrosal.py), by sinus id and side */
  petrosal: z.record(z.string(), z.record(z.string(), z.object({ lengthMm: z.number(), inBoneMm: z.number(), inBoneBeforeMm: z.number() }))).optional(),
  /** the smoothed fitted courses' corners (turns of more than 70 degrees over 4 mm), by artery and side */
  fittedCourses: z.record(z.string(), z.record(z.string(), z.object({ cornersOver70: z.number(), sharpestDeg: z.number() }))).optional(),
  /** every vessel and nerve against the bone as drawn: the share of its surface vertices more than 0.25 mm inside it */
  drawnBone: z.record(z.string(), z.record(z.string(), z.object({ share: z.number(), deepestMm: z.number() }))).optional(),
  /** the cerebrum and the cerebellum as built, against each other and the tentorium between them (on a 1 mm grid) */
  tentorium: z.object({
    overlapMl: z.number(), cerebrumUnderSheetMl: z.number(), cerebellumOverSheetMl: z.number(),
    sinusInCerebrumShare: z.number(), sinusInCerebellumShare: z.number(),
  }).optional(),
  /** the cerebellum, brainstem and fourth ventricle fitted into the posterior fossa, and the telovelar shape
   * (pipeline/skullbase_pfossa.py) */
  pfossa: z.object({
    fit: z.object({
      tableMedianMm: z.number(), vesselInsideShare: z.number(), boneInsideHullShare: z.number(), tentoriumInsideShare: z.number(),
      /** how far the hull lies from its place under the tentorium (the median) */
      tentoriumMedianMm: z.number().optional(),
      /** the share of this CT's cistern points (fluid along the posterior fossa's bone) that lie inside the model */
      cisternInsideShare: z.number().optional(),
      /** this CT's fourth-ventricle fluid outside the fitted fourth ventricle (share of its points; the furthest, mm) */
      ventricleFluidOutsideShare: z.number().optional(), ventricleFluidOutsideMaxMm: z.number().optional(),
      minRelativeVolume: z.number(), affineScale: z.array(z.number()),
      before: z.object({ tableMedianMm: z.number(), vesselInsideShare: z.number(), cisternInsideShare: z.number().optional(), ventricleFluidOutsideShare: z.number().optional() }),
    }),
    clear: z.object({ inVesselBefore: z.number(), inBoneBefore: z.number(), inVesselAfter: z.number(), inBoneAfter: z.number(), maxMovedMm: z.number() }),
    modelMl: z.number(),
    /** the fluid this CT shows within 8 mm of the posterior fossa's bone (its cisterns), ml */
    cisternMl: z.number().optional(),
    ventricleFluidMl: z.number().optional(),
    telovelar: z.object({ maxMovedMm: z.number(), inBoneAfter: z.number(), inVesselAfter: z.number(),
      tonsilToMedullaMm: z.object({ rest: z.number(), moved: z.number() }), vermisLiftMm: z.number(),
      uvulaToMedullaMm: z.object({ rest: z.number(), moved: z.number() }), inVentricle: z.object({ rest: z.number(), moved: z.number() }) }),
    /** the retrosigmoid shape: the right hemisphere drawn back from the petrous bone */
    retrosigmoid: z.object({ maxMovedMm: z.number(), moved: z.number(), inBoneAfter: z.number(), inVesselAfter: z.number(),
      meatusToCerebellumMm: z.object({ rest: z.number(), moved: z.number() }), inCorridor: z.object({ rest: z.number(), moved: z.number() }) }),
    /** the far lateral shape: the right tonsil and biventral lobule lifted superomedially */
    farLateral: z.object({ maxMovedMm: z.number(), moved: z.number(), inBoneAfter: z.number(), inVesselAfter: z.number(),
      tonsilLowestZMm: z.object({ rest: z.number(), lifted: z.number() }),
      vertebralGapMm: z.object({ rest: z.number(), lifted: z.number() }).optional() }),
    /** the far lateral view's second shape: the same parts drawn straight back */
    farLateralBack: z.object({ maxMovedMm: z.number(), moved: z.number(), inBoneAfter: z.number(), inVesselAfter: z.number(),
      tonsilFrontYMm: z.object({ rest: z.number(), back: z.number() }), medullaGapMm: z.object({ rest: z.number(), back: z.number() }),
      vertebralGapMm: z.object({ rest: z.number(), back: z.number() }).optional() }),
    params: z.object({ rsMm: z.number(), rsReachMm: z.number(), flMm: z.number(), flMedial: z.number(), flReachMm: z.number(), flBackMm: z.number(), tableGapMm: z.number(), tableMinMm: z.number(), boneGapMm: z.number(), tvMm: z.number(), tvUp: z.number(), tvReachMm: z.number(),
      tvVermisMm: z.number(), tvVermisBack: z.number(), tvVermisReachMm: z.number() }),
  }).optional(),
  /** the skull completed beyond the CT's field of view, the face from the fitted model (pipeline/skullbase_v3_skull.py) */
  skull: z.object({
    fit: z.object({ scale: z.number(), warpedMedianMm: z.number() }),
    face: z.object({ medianBeforeMm: z.number(), medianAfterMm: z.number(), withinBefore: z.number(), withinAfter: z.number() }),
    edge: z.object({ medianBeforeMm: z.number(), medianAfterMm: z.number(), p90BeforeMm: z.number(), p90AfterMm: z.number() }),
    faceBones: z.array(z.string()), seamMm: z.number(), blendMm: z.number(), edgeFitMm: z.number(),
    /** the CT's thin-bone rule left out inside the cavernous sinuses (finding MB-06) */
    thinRuleOutOfSinuses: z.object({ droppedMl: z.number() }).passthrough().optional(),
    /** the courses the skull is carved round: per file and side, the share of the tube's surface under the bone before and after */
    cleared: z.record(z.string(), z.record(z.string(), z.object({ marginMm: z.number(), insideBefore: z.number(), insideAfter: z.number(), carvedMl: z.number() }).passthrough())).optional(),
  }).optional(),
}).parse(v3Fit);

/** Definition for a structure or landmark name (paired structures use their base name). */
export function definitionFor(name: string): { text: string; url: string | null; edited?: string } | null {
  return DEFINITIONS[name] ?? DEFINITIONS[name.trim()] ?? null;
}

/** Cross-checks between the generated files. Returns a list of problems (empty = consistent). */
/** Names the notes (FORAMEN_CONTENTS, TB_NOTES, PASSAGES) are keyed by that a model does not draw or label, by model. */
const NOT_IN_MODEL: Record<SbModel, Set<string>> = {
  // the default model: three openings Z-Anatomy's notes name that this CT's landmarks do not (its openings' cards read
  // PASSAGES and TB_NOTES)
  v3: new Set(['Stylomastoid foramen', 'Internal opening of carotid canal', 'Cribriform plate']),
  // v2: the CT's own openings and floor landmarks only (no ear, no brainstem floor)
  ct: new Set([
    'Superior orbital fissure', 'Internal acoustic meatus', 'Stylomastoid foramen', 'Jugular foramen',
    'External opening of carotid canal', 'Internal opening of carotid canal', 'Foramen lacerum', 'Cribriform plate',
    'Facial colliculus', 'Hypoglossal trigone', 'Vagal trigone', 'Vestibular area', 'Obex',
    'Median sulcus of fourth ventricle', 'Trigeminal ganglion',
    'Internal carotid artery (petrous and lacerum parts)', 'Chorda tympani',
    'Nerves in the internal acoustic meatus (VII, VIII)', 'Greater petrosal nerve', 'Geniculate ganglion',
    'Second genu of facial nerve', 'Fundus of internal acoustic meatus', 'Bone over the superior semicircular canal',
  ]),
  // v1: Z-Anatomy's temporal bone has none of these as structures of their own
  zanatomy: new Set([
    'Trigeminal ganglion', 'Internal carotid artery (petrous and lacerum parts)', 'Chorda tympani',
    'Nerves in the internal acoustic meatus (VII, VIII)',
  ]),
};

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
  // a located opening says what passes through it: on the Z-Anatomy models' cards from FORAMEN_CONTENTS, on the default
  // model's from PASSAGES or the temporal-bone notes (ui/skullbase-atlas.ts). (Checked against FORAMEN_CONTENTS alone,
  // the default model gave 13 false alarms and was therefore never checked.)
  const sourced = (name: string) => (SB_MODEL === 'v3' ? !!(PASSAGES[name] || TB_NOTES[name]) : !!FORAMEN_CONTENTS[name]);
  // (Meckel's cave is located on the CT like the foramina, but it is a recess of the dura, not an opening)
  const recess = new Set(['Meckel\'s cave']);
  for (const l of LANDMARKS) if (l.how && !recess.has(l.name) && !sourced(l.name)) errs.push(`located foramen ${l.name} (${l.side}): no sourced contents`);
  for (const cl of Object.values(FORAMEN_CONTENTS).flat()) for (const r of cl.refIds) if (!FORAMEN_REF.has(r)) errs.push(`foramen claim: unknown refId ${r}`);
  // the notes keyed by name: a key that names nothing in this model is used nowhere, and passed silently (the audit's
  // P1-25); the ones each model is known not to have are listed in NOT_IN_MODEL
  const named = new Set([...LANDMARKS.map((l) => l.name), ...SB_MANIFEST.structures.map((s) => s.name)]);
  const absent = NOT_IN_MODEL[SB_MODEL];
  for (const [what, table] of [['FORAMEN_CONTENTS', FORAMEN_CONTENTS], ['TB_NOTES', TB_NOTES], ['PASSAGES', PASSAGES]] as const)
    for (const k of Object.keys(table)) if (!named.has(k) && !absent.has(k)) errs.push(`${what}: "${k}" names nothing in this model`);
  for (const k of absent) if (named.has(k)) errs.push(`"${k}" is in this model now: remove it from NOT_IN_MODEL`);
  for (const [aid, g] of Object.entries(APPROACH_GEOM)) {
    const c = APPROACH.get(aid);
    if (!c) { errs.push(`approach ${aid}: no sourced content`); continue; }
    for (const id of [...g.bones, g.removed]) if (!ids.has(id)) errs.push(`approach ${aid}: unknown structure ${id}`);
    for (const id of g.bones) { const r = SB.get(id)?.replaces; if (!r || !ids.has(r)) errs.push(`approach ${aid}: ${id} replaces an unknown bone`); }
    for (const cl of c.sections.flatMap((x) => x.claims)) for (const r of cl.refIds) if (!APPROACH_REF.has(r)) errs.push(`approach ${aid}: unknown refId ${r}`);
    for (const n of c.context) {
      if (SB_MODEL === 'zanatomy' && V1_ABSENT.has(n)) continue;
      const own = SB_MODEL === 'zanatomy' ? V1_NAMES[n] ?? n : n;
      if (!SB_MANIFEST.structures.some((s) => s.name === own)) errs.push(`approach ${aid}: unknown context structure ${own}`);
    }
  }
  // the views drawn through another's craniotomy (the microvascular decompression): that geometry, their references and
  // context, and the structures they list first; the trigeminal neuralgia views' numbers
  const ownName = (n: string) => (SB_MODEL === 'zanatomy' ? V1_NAMES[n] ?? n : n);
  for (const a of APPROACHES) {
    if (!a.geom || a.geom === a.id || (a.models && !a.models.includes(SB_MODEL)) || !Object.keys(APPROACH_GEOM).length) continue;
    if (!APPROACH_GEOM[a.geom]) { errs.push(`approach ${a.id}: no geometry ${a.geom}`); continue; }
    for (const cl of a.sections.flatMap((x) => x.claims)) for (const r of cl.refIds) if (!APPROACH_REF.has(r)) errs.push(`approach ${a.id}: unknown refId ${r}`);
    for (const n of [...a.context, ...(a.key ?? [])]) {
      if (SB_MODEL === 'zanatomy' && V1_ABSENT.has(n)) continue;
      if (!SB_MANIFEST.structures.some((s) => s.name === ownName(n))) errs.push(`approach ${a.id}: unknown structure ${ownName(n)}`);
    }
    for (const n of a.landmarks ?? []) if (!LANDMARKS.some((l) => l.name === n)) errs.push(`approach ${a.id}: unknown landmark ${n}`);
  }
  for (const a of APPROACHES) for (const n of a.key ?? []) if (!a.context.includes(n)) errs.push(`approach ${a.id}: ${n} is listed first but not drawn (context)`);
  const T = TRIGEMINAL;
  if (T) {
    if (T.model !== SB_MODEL) errs.push(`trigeminal: the ${T.model} file on the ${SB_MODEL} page`);
    const nums: [string, number][] = [];
    const walk = (path: string, v: unknown) => {
      if (typeof v === 'number') nums.push([path, v]);
      else if (Array.isArray(v)) v.forEach((x, i) => walk(`${path}[${i}]`, x));
      else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(`${path}.${k}`, x);
    };
    walk('needle', T.needle);
    walk('ovale', T.ovale);
    if (T.mvd) walk('mvd', T.mvd);
    for (const [path, v] of nums) if (!Number.isFinite(v)) errs.push(`trigeminal: ${path} is not a finite number`);
    if (T.needle.boneCrossedMm !== 0) errs.push(`trigeminal: the needle crosses ${T.needle.boneCrossedMm} mm of bone`);
    for (const x of [...T.needle.nearest, ...(T.mvd?.arteries ?? []), ...(T.mvd?.nerves ?? [])])
      if (!SB_MANIFEST.structures.some((s) => s.name === x.name)) errs.push(`trigeminal: unknown structure ${x.name}`);
    if (SB_MODEL === 'zanatomy' && T.mvd) errs.push('trigeminal: v1 has no decompression view (the owner\'s decision of 26 November 2026)');
  }
  return errs;
}
