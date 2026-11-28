import { z } from '../zod';

/** Identifier: lowercase, digits, dash, underscore, colon. */
const Id = z.string().regex(/^[a-z0-9_:-]+$/);
const Vec3 = z.tuple([z.number(), z.number(), z.number()]);

export const TopicSchema = z.enum(['net', 'pd', 'tremor', 'dyst', 'ts', 'epi', 'img', 'atlas']);
export type Topic = z.infer<typeof TopicSchema>;

export const ReferenceSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+$/),
  shortLabel: z.string().min(1),
  citation: z.string().min(10),
  url: z.string().url(),
  topic: TopicSchema,
});
export type Reference = z.infer<typeof ReferenceSchema>;

export const EvidenceSchema = z.object({
  claim: z.string().min(1),
  refIds: z.array(z.string()).min(1),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

/**
 * 'lateral' / 'medial' look at the shown hemisphere from outside / from the midline (white-matter section);
 * 'inferior' looks up at the skull base from below (skull-base section); 'posterior' looks at the brainstem from behind
 * (the floor of the fourth ventricle, brainstem section); 'anterolateral' looks at the shown side from in front, the side
 * and a little above, along a pterional craniotomy; 'frontolateral' more from in front and above (a frontal
 * ventriculostomy); 'supraorbital' down a lateral supraorbital craniotomy's corridor over the orbital roof; 'vertex' from above and a little behind, down the interhemispheric fissure; 'suboccipital'
 * from behind and below, up into the cerebellomedullary fissure; 'retrosigmoid' from behind the sigmoid sinus along the
 * petrous bone into the cerebellopontine angle; 'orbitozygomatic' from the side and in front but lower than
 * 'anterolateral', up under the frontal lobe; 'farLateral' from behind, the side and below, along the medulla to the front
 * of the foramen magnum; 'subtemporal' from the side and above, under the lifted temporal lobe onto the middle fossa floor
 * (skull-base section, surgical views). Skull base v3's surgical views have their own: 'pterional', 'orbitozygomaticFront',
 * 'vertexFront', 'retrosigmoidLateral' and 'farLateralLow' (Viewer.goPreset); 'subtemporalLow' looks from the side, a
 * little behind and below, along the middle fossa floor under the lifted temporal lobe to the tentorial edge (the
 * subtemporal view, both models). 'aim' puts the camera exactly where the view's plan says (ScenePlan.aim: a place measured
 * on the model, the trigeminal neuralgia views'), framed from below ('inferior') when the plan has none.
 */
export const CameraPresetSchema = z.enum(['coronal', 'sagittal', 'axial', 'posteriorOblique', 'surgeon', 'lateral', 'medial', 'inferior', 'posterior', 'anterolateral', 'frontolateral', 'supraorbital', 'vertex', 'suboccipital', 'retrosigmoid', 'orbitozygomatic', 'farLateral', 'subtemporal', 'retrosigmoidLevel', 'subtemporalLow',
  'pterional', 'orbitozygomaticFront', 'vertexFront', 'retrosigmoidLateral', 'farLateralLow', 'aim']);
export type CameraPreset = z.infer<typeof CameraPresetSchema>;

/** A rendered structure: nucleus, cortical area, tract or sweet-spot volume. */
export const StructureSchema = z.object({
  id: Id,
  name: z.string(),
  aliases: z.array(z.string()),
  /** bone and soft (soft-tissue mesh) are used by the skull-base section */
  type: z.enum(['nucleus', 'cortex', 'tract', 'target', 'bone', 'soft', 'surface', 'tube']),
  colour: z.string(), // palette token
  meshFile: z.string().regex(/^assets\/(meshes|tracts)\/[a-z0-9_]+\.glb$/),
  /** Text taken from the attached content only; null when the content says nothing about it. */
  description: z.string().nullable(),
  refIds: z.array(z.string()),
});
export type Structure = z.infer<typeof StructureSchema>;

export const TargetSchema = z.object({
  id: Id,
  label: z.string(),
  structureId: Id,
  /** Key into generated/coordinates.json, for the coordinates the pipeline computes (absent for published ones). */
  coordKey: z.string().optional(),
  mni: z.object({ left: Vec3, right: Vec3 }),
  /** sweetSpot: a published stimulation map's point; publishedTarget: a surgical target a cited paper prints;
   *  atlasCoordinate: a nucleus centroid, for orientation, not a surgical target. */
  kind: z.enum(['sweetSpot', 'publishedTarget', 'atlasCoordinate']),
  refId: z.string(),
  /** Further sources of the same point (the Voa/Vop junction: two papers). */
  moreRefIds: z.array(z.string()).default([]),
  method: z.string(),
  /** Where the point lies against what is drawn, when that needs saying (the tremor hotspot outside the Vim). */
  note: z.string().optional(),
  /** Absent until a sourced typical trajectory is available (see TODO in README). */
  trajectory: z.object({ ringDeg: z.number(), arcDeg: z.number(), refId: z.string() }).optional(),
});
export type Target = z.infer<typeof TargetSchema>;

export const SymptomSchema = z.object({
  id: Id,
  indicationId: Id,
  name: z.string(),
  summary: z.string(),
  structures: z.array(Id),
  alternativeStructures: z.array(Id).default([]),
  /** Shown translucent for orientation; neither target nor alternative. */
  contextStructures: z.array(Id).default([]),
  tracts: z.array(Id),
  corticalAreas: z.array(Id),
  targetId: Id.nullable(),
  evidence: z.array(EvidenceSchema),
  /** Plain statement shown on the card when the shown geometry is a stand-in. */
  note: z.string().optional(),
  noteRefIds: z.array(z.string()).default([]),
  camera: CameraPresetSchema.default('coronal'),
});
export type Symptom = z.infer<typeof SymptomSchema>;
export type SymptomInput = z.input<typeof SymptomSchema>;

export const IndicationSchema = z.object({
  id: Id,
  label: z.string(),
  name: z.string(),
  accent: z.string(),
  symptomIds: z.array(Id),
  primaryTargets: z.array(Id).min(1),
  alternativeTargets: z.array(Id),
  contextStructures: z.array(Id),
  keyTracts: z.array(Id),
  alternativeTracts: z.array(Id),
  corticalAreas: z.array(Id),
  targetMarkers: z.array(Id),
  alternativeMarkers: z.array(Id),
  /** Published sweet-spot volumes shown as context without a point marker (their largest region is not in the named target). */
  extraVolumes: z.array(Id).default([]),
  /** Published sweet-spot volumes from stimulation of an alternative target, in the alternative look, without a point
   *  marker (Hollunder 2024's dystonia map, from subthalamic DBS, in the pallidal dystonia view). */
  alternativeVolumes: z.array(Id).default([]),
  /** Structures never drawn in this indication's views (not even as ghosts or landmarks). */
  omit: z.array(Id).default([]),
  target: z.string(),
  alternatives: z.string(),
  why: z.string(),
  howToChoose: z.string(),
  imaging: z.string(),
  caveat: z.string(),
  caveatRefIds: z.array(z.string()),
  evidence: z.array(EvidenceSchema).min(1),
  /** Circuit elements named in the content that have no distributed tract file. */
  missingTracts: z.array(z.string()).default([]),
  camera: CameraPresetSchema.default('coronal'),
});
export type Indication = z.infer<typeof IndicationSchema>;
export type IndicationInput = z.input<typeof IndicationSchema>;

export const ImagingSchema = z.object({
  id: Id,
  structureId: Id,
  label: z.string(),
  title: z.string(),
  accent: z.string(),
  sequences: z.array(z.object({ name: z.string(), note: z.string() })),
  noSequences: z.string().optional(),
  tract: z.string(),
  note: z.string(),
  refIds: z.array(z.string()).min(1),
});
export type Imaging = z.infer<typeof ImagingSchema>;

// ---- generated pipeline output
/** one side of a v2 nerve's skull-base measure (ManifestStructureSchema.atOpening), mm */
const BySide = z.object({ L: z.number(), R: z.number() });
const atOpeningSide = z.object({ boneMm: z.number().min(0), solidMm: z.number().min(0), airMm: z.number().min(0), apartMm: z.number().nullable() });
export const ManifestStructureSchema = z.object({
  id: Id,
  name: z.string(),
  aliases: z.array(z.string()),
  /** bone and soft (soft-tissue mesh) are used by the skull-base section, surface (a cortical label) by the cortex section */
  type: z.enum(['nucleus', 'cortex', 'tract', 'target', 'bone', 'soft', 'surface', 'tube']),
  role: z.enum(['tract', 'border', 'response']).optional(),
  file: z.string(),
  bytes: z.number().int().positive(),
  colour: z.object({ token: z.string(), light: z.string(), dark: z.string() }),
  dataset: z.string(),
  source: z.string(),
  licence: z.string(),
  citation: z.array(z.string()),
  citationUrls: z.array(z.string()),
  refIds: z.array(z.string()),
  derivation: z.string(),
  category: z.string().optional(),
  hcp: z.enum(['confirmed', 'likely']).optional(),
  /** skull-base section: share of the line inside the cranial bones' convex hull (measured) */
  intracranialFraction: z.number().optional(),
  /** skull base, the Z-Anatomy model: how much of a vessel's or nerve's tube lies inside the model's bone meshes
   * (pipeline/skullbase_v1_inbone.py): the share of its surface vertices more than 0.5 mm inside one, the deepest
   * (mm), and the bones concerned. Present where the share is at least 5 % or the deepest at least 2 mm */
  inBone: z.object({ share: z.number().min(0).max(1), deepestMm: z.number(), bones: z.array(z.string()) }).optional(),
  /** skull base v2 (the CT model): a fitted nerve measured against the CT where it crosses the skull base
   * (pipeline/skullbase_ct_openings.py). Over the first stretchMm of its course, by side: the length in the bone the
   * model draws (solidMm of it at 400 HU or more), in a sinus's air, and there the median distance to the default
   * model's nerve (routedId), routed through the CT's openings. Present where bone and air reach 2 mm on a side */
  atOpening: z.object({ stretchMm: z.number(), routedId: z.string(), R: atOpeningSide, L: atOpeningSide }).optional(),
  /** skull-base section: the cranial nerve (1-12) a nerve or nerve branch belongs to */
  cranialNerve: z.number().int().min(1).max(12).optional(),
  /** brainstem section: every cranial nerve a nucleus serves, where it serves more than one (`cranialNerve` is the
   * one it is listed under) */
  cranialNerves: z.array(z.number().int().min(1).max(12)).min(2).optional(),
  /** skull-base section: the arterial system an artery is listed under (its trunk's name) */
  system: z.string().optional(),
  /** layer the structure belongs to when its type alone does not say (spine section) */
  layer: z.enum(['nuclei', 'tracts', 'cortex', 'targets', 'discs', 'vessels', 'viscera']).optional(),
  /** spine section: vertebral level ('L4', 'L4-L5') and region */
  level: z.string().optional(),
  region: z.enum(['cervical', 'thoracic', 'lumbar', 'ccj']).optional(),
  /** drawn by rule from the anatomy and published descriptions, not segmented: the UI must say so */
  schematic: z.boolean().optional(),
  /** skull base, detailed model: carried over from the Z-Anatomy model fitted onto the CT, so its position is approximate */
  fitted: z.boolean().optional(),
  /** brainstem: how far (mm) a nucleus was moved in the source model before the fit, where the model has it out of place
   *  (the nuclei of the third and fourth nerves; its card says why) */
  movedMm: z.number().optional(),
  /** skull base v3: the surgical approach this structure belongs to (a cut bone, or the bone removed) */
  approach: z.string().optional(),
  /** skull base v3: the bone a cut bone replaces in its approach's view */
  replaces: z.string().optional(),
  /** skull base: the anterior clinoid process of a view with an anterior clinoidectomy switch, a piece of its own (bone
   *  until the switch takes it) */
  clinoid: z.boolean().optional(),
  /** skull base: the bone a surgical view's drilling of the sphenoid ridge takes, a piece of its own (drawn as bone removed,
   *  or as bone with the view's switch for the ridge off) */
  ridge: z.boolean().optional(),
  /** skull base v3: carries morph target 0, the transsylvian opening (the brain, and the arteries that move with it) */
  morph: z.boolean().optional(),
  /** skull base v3: a tumour drawn by rule (its family and grade or site) */
  tumour: z.object({ family: z.string(), grade: z.string() }).optional(),
  /** skull base v3: a part of the fitted brain pushed aside by a tumour, for that tumour's view (with `replaces`) */
  tumourView: z.string().optional(),
  /** skull base v3: a copy for one surgical view only (the temporal lobe held up in the Kawase view), with `replaces` */
  forView: z.string().optional(),
  /** skull base v3: drawn only in this herniation view ('herniation_tonsillar'): a moved copy of a part (with `replaces`,
   *  `pushedFrom`, `copySides` and one morph target named for the view's shape: at 0 the part as it is, at 1 the shape
   *  drawn by rule) or a guide drawn for it (McRae's line) */
  herniationView: z.string().optional(),
  /** a copy's source: the structure's own file it was made from (shipped) */
  pushedFrom: z.string().optional(),
  /** skull base: the halves a tumour view's moved copy holds, where it holds both (a midline tumour's vessels); without
   *  it a copy holds the right half only and the part's own left half is drawn beside it (SbGroup.keepLeft) */
  copySides: z.array(z.enum(['L', 'R'])).optional(),
  /** skull base v3: the pipeline's own input for this structure before it was joined to its neighbour
   *  (skullbase_v3_junctions.py) or cleared of the brainstem (skullbase_v3_clearance.py), which a re-run starts from. A
   *  file in pipeline/data/build, not shipped (the shipped file is `file`) */
  joinedFrom: z.string().optional(),
  clearedFrom: z.string().optional(),
  /** vascular section: the lesion (view) a lesion's part belongs to; with `replaces`, a vessel it changes in that view */
  lesion: z.string().optional(),
  /** brainstem section: the part of the brainstem a safe entry zone lies on */
  bsRegion: z.enum(['midbrain', 'pons', 'floor', 'medulla']).optional(),
  /** brainstem section: the atlas's abbreviation (arousal network nuclei) */
  abbr: z.string().optional(),
  /** white-matter section: core (surgical essentials), extended, or posterior fossa */
  tier: z.enum(['core', 'extended', 'fossa']).optional(),
  centroid: z.object({ L: Vec3, R: Vec3 }).nullable(),
  surfaceCentroid: z.object({ L: Vec3, R: Vec3 }).optional(),
  streamlines: z.object({ L: z.number(), R: z.number() }).optional(),
  sourceStreamlines: z.object({ L: z.number(), R: z.number() }).optional(),
  /** white-matter section: a tract drawn as a shell, not as streamlines (pipeline/wm_shell.py): the surface round the
   * voxels of a population atlas's map where the bundle passed in at least `level` of the people in whom it was found
   * (`subjects`). Measured on it, by side: its volume, its greatest thickness, how far from the midline it ends, how
   * near it comes to the medial geniculate body (the brainstem section's) and to Heschl's gyrus (the cortex section's
   * label), and how far from the gyrus the lateral ends of
   * HCP-1065's withdrawn bundle lay (their median) */
  shell: z.object({
    level: z.number().gt(0).lt(1), subjects: BySide, volumeMl: BySide, thickestMm: BySide, medialEndMm: BySide,
    mgbNearestMm: BySide, heschlNearestMm: BySide, hcp1065EndsMm: BySide,
  }).optional(),
});
export type ManifestStructure = z.infer<typeof ManifestStructureSchema>;

export const VolumeSchema = z.object({
  file: z.string(),
  dims: Vec3,
  origin: Vec3,
  spacing: z.number(),
  bytes: z.number(),
});
export type VolumeInfo = z.infer<typeof VolumeSchema>;

export const ManifestSchema = z.object({
  space: z.string(),
  generatedBy: z.string(),
  structures: z.array(ManifestStructureSchema),
  volumes: z.record(z.string(), VolumeSchema),
  hcpAcknowledgement: z.string(),
  volumeSource: z.object({ source: z.string(), scaling: z.union([z.string(), z.record(z.string(), z.string())]), licence: z.string(), citation: z.array(z.string()) }).passthrough(),
  datasets: z.record(z.string(), z.object({
    name: z.string(), licence: z.string(), url: z.string(), citation: z.array(z.string()),
    citationUrls: z.array(z.string()), note: z.string().optional(), todo: z.string().optional(),
    refIds: z.array(z.string()).optional(),
  })),
});

/** wm-manifest.json: the white-matter section's tracts (HCP-1065's streamlines; `shellDataset`: the atlas a tract drawn
 * as a shell comes from), separate from the DBS assets. */
export const WmManifestSchema = z.object({
  space: z.string(),
  generatedBy: z.string(),
  structures: z.array(ManifestStructureSchema),
  dataset: z.object({
    name: z.string(), licence: z.string(), url: z.string().url(), note: z.string(),
    citation: z.array(z.string()), citationUrls: z.array(z.string()),
  }),
  shellDataset: z.object({
    name: z.string(), licence: z.string(), url: z.string().url(), note: z.string(),
    citation: z.array(z.string()), citationUrls: z.array(z.string()),
  }),
  hcpAcknowledgement: z.string(),
});

/** One end of a white-matter bundle (pipeline/wm_ends.py): the share of its streamlines' ends at the cerebral cortex and
 * at the medial wall (which is not cortex), and of those at the cortex, the share on each Destrieux label holding at
 * least the rule's minShare (the rest summed). */
const BundleEndSchema = z.object({
  atCortex: z.number().min(0).max(1), atMedialWall: z.number().min(0).max(1),
  areas: z.array(z.object({ id: Id, side: z.enum(['L', 'R']), share: z.number().min(0).max(1) })),
  rest: z.number().min(0).max(1),
});
const BundleSchema = z.object({ streamlines: z.number().int().positive(), ends: z.tuple([BundleEndSchema, BundleEndSchema]) });
const EndPatchSideSchema = z.object({ ends: z.number().int().positive(), endsInPatch: z.number().min(0).max(1), areaCm2: z.number().positive(), faces: z.number().int().positive() });
/** wm-ends.json: where the white-matter section's bundles end on the cortex section's surface (pipeline/wm_ends.py, the
 * site audit's B-007). A tract's bundles are a side's (L, R) or one across the midline (M); each has two ends, named
 * in `ends` (front and back, upper and lower ...). `patch`: the cortex where a tract's ends are densest, drawn in 3D. */
export const WmEndsSchema = z.object({
  generatedBy: z.string(),
  source: z.string(),
  patches: z.object({ source: z.string(), licence: z.string(), citation: z.array(z.string()), citationUrls: z.array(z.string()), derivation: z.string() }),
  rule: z.object({
    reachMm: z.number(), outsideMm: z.number(), minShare: z.number(), endMinShare: z.number(), patchShare: z.number(),
    patchMinEnds: z.number(), patchMinShare: z.number(), smoothSteps: z.number(), surfaceEdgeMm: z.number(),
  }),
  /** the Destrieux labels named, with their names */
  areas: z.record(Id, z.string()),
  tracts: z.record(Id, z.object({
    name: z.string(), abbr: z.string(), ends: z.tuple([z.string(), z.string()]),
    bundles: z.object({ L: BundleSchema.optional(), R: BundleSchema.optional(), M: BundleSchema.optional() }),
    patch: z.object({
      id: Id, file: z.string(), bytes: z.number().int().positive(),
      colour: z.object({ token: z.string(), light: z.string(), dark: z.string() }),
      centroid: z.object({ L: Vec3, R: Vec3 }),
      L: EndPatchSideSchema.optional(), R: EndPatchSideSchema.optional(),
    }).nullable(),
  })),
});
export type WmEnds = z.infer<typeof WmEndsSchema>;
export type BundleEnd = z.infer<typeof BundleEndSchema>;

/** sb-manifest.json: the skull-base section's structures (Z-Anatomy / BodyParts3D), in their own space. */
export const SbManifestSchema = z.object({
  space: z.string(),
  generatedBy: z.string(),
  structures: z.array(ManifestStructureSchema),
  /** artery systems in the order the page lists them */
  arterySystems: z.array(z.string()),
  dataset: z.object({
    name: z.string(), licence: z.string(), url: z.string().url(), note: z.string(), attribution: z.array(z.string()),
    citation: z.array(z.string()), citationUrls: z.array(z.string()),
  }),
});

const DatasetInfoSchema = z.object({
  name: z.string(), licence: z.string(), url: z.string().url(), note: z.string(), attribution: z.array(z.string()),
  citation: z.array(z.string()), citationUrls: z.array(z.string()),
});

/** ve-manifest.json: the ventricles section's structures in Skull base v2's frame (this CT's ventricles, its bone and
 * the template brain fitted into it). */
export const VeManifestSchema = z.object({
  space: z.string(),
  generatedBy: z.string(),
  structures: z.array(ManifestStructureSchema),
  dataset: DatasetInfoSchema,
});

/** va-manifest.json: the vascular section (pipeline/vascular_build.py): this CT angiogram's vessels and the lesions drawn
 * on them, each with its timing in the schematic angiogram (per vertex, in its GLB), and that angiogram's phases. */
export const VaManifestSchema = z.object({
  space: z.string(),
  generatedBy: z.string(),
  structures: z.array(ManifestStructureSchema),
  dataset: DatasetInfoSchema,
  dsa: z.object({
    tMaxS: z.number(), artSpanS: z.number(), venStartS: z.number(), venSpanS: z.number(), dwellArtS: z.number(), dwellVenS: z.number(),
    arterialS: z.tuple([z.number(), z.number()]), venousS: z.tuple([z.number(), z.number()]),
  }),
});

/** How one side of a tract of the HCP-YA atlas sits on this section's template (brainstem_build.py tract_fit): the
 * atlas is in another ICBM-152 space and its streamlines are drawn without a shift, so this is measured. The
 * streamlines drawn and the number the atlas's file holds; of their points (one per millimetre, so a share of points
 * is a share of length): how many lie at the fitted brainstem's levels, the share of those inside the fitted
 * brainstem, more than 1 mm outside it, the farthest outside (mm) and the share in the model's fourth ventricle or
 * aqueduct; the share of all of them that are fluid on the T2 template; the streamlines' extent along z (mm) and
 * their lengths (mm: shortest, median, longest); and the check of the file's coordinates: the share of the points
 * in the atlas's grid that lie in the atlas's own volume of the tract, the same share had they been read from the
 * voxel's corner as the TrackVis format has it, and the share below the grid. */
const TractFitSchema = z.object({
  streamlines: z.number().int().positive(), sourceStreamlines: z.number().int().positive(), points: z.number().int().positive(),
  zMm: z.tuple([z.number(), z.number()]), lengthMm: z.tuple([z.number(), z.number(), z.number()]),
  atBrainstemLevels: z.number().int().positive(), insideShare: z.number().min(0).max(1), outsideOver1mmShare: z.number().min(0).max(1),
  outsideMaxMm: z.number().min(0), inVentricleShare: z.number().min(0).max(1), fluidShare: z.number().min(0).max(1),
  inOwnVolumeShare: z.number().min(0.99).max(1), cornerReadShare: z.number().min(0).max(1), belowGridShare: z.number().min(0).max(1),
});
export type TractFit = z.infer<typeof TractFitSchema>;

/** bs-manifest.json: the brainstem section's structures in MNI space (Z-Anatomy fitted to the template; AAN 2.0; four
 * tracts of the HCP-YA tractography atlas). */
export const BsManifestSchema = z.object({
  space: z.string(),
  generatedBy: z.string(),
  structures: z.array(ManifestStructureSchema),
  /** how well the Z-Anatomy brainstem was fitted to the template (pipeline/brainstem_fit.py) */
  fit: z.object({
    scale: z.number(), rotationDeg: z.number(), similarityMatchedShare: z.number(), similarityMedianMm: z.number(),
    warpedMatchedShare: z.number(), warpedMedianMm: z.number(), warpedP90Mm: z.number(),
    /** share of the HCP-1065 corticospinal tract inside the fitted pons and medulla between cstLevels (MNI z) */
    cstInsideShare: z.number(), cstLevels: z.tuple([z.number(), z.number()]),
    /** the fitted surface against the T2 template itself (brainstem_build.py wall_check): the share of its vertices
     * within 1 mm of the brainstem's own tissue-fluid boundary and of the far wall of the cistern, the signed median
     * distance to its own boundary (mm, negative: the model outside it), the shares of the surface and of the solid
     * that are fluid on the template, of the model's fourth ventricle that is fluid there, and the largest share of an
     * arousal network nucleus inside that ventricle; the model's width against the template tissue's at four levels */
    ownWallWithin1mmShare: z.number(), farWallWithin1mmShare: z.number(), ownWallSignedMedianMm: z.number(),
    surfaceInFluidShare: z.number(), solidFluidShare: z.number(), ventricleFluidShare: z.number(),
    aanInVentricleMaxShare: z.number(), aanInVentricleWorst: z.string(),
    widths: z.array(z.object({ part: z.string(), z: z.number(), modelMm: z.number(), templateMm: z.number().nullable() })).min(1),
    /** the tracts of the HCP-YA atlas, by structure id and side */
    tracts: z.record(z.string(), z.object({ L: TractFitSchema, R: TractFitSchema })),
  }),
  datasets: z.record(z.string(), DatasetInfoSchema),
  dataset: DatasetInfoSchema,
});

/** ctx-manifest.json: the cortex section's labels (Destrieux on the Lead-DBS template surface), in MNI space. */
export const CtxManifestSchema = z.object({
  space: z.string(),
  generatedBy: z.string(),
  structures: z.array(ManifestStructureSchema),
  dataset: z.object({
    name: z.string(), licence: z.string(), url: z.string().url(), note: z.string(),
    citation: z.array(z.string()), citationUrls: z.array(z.string()),
  }),
});

/** spine-manifest.json: the spine section's structures (one CT, VerSe + TotalSegmentator), in their own space. */
export const SpineManifestSchema = z.object({
  space: z.string(),
  /** content references by key (Crossref/PubMed-checked citations from pipeline/sources/citations.json) */
  references: z.record(z.string(), z.object({ citation: z.string(), url: z.string().url() })),
  generatedBy: z.string(),
  structures: z.array(ManifestStructureSchema),
  dataset: z.object({
    name: z.string(), licence: z.string(), url: z.string().url(), note: z.string(),
    citation: z.array(z.string()), citationUrls: z.array(z.string()),
  }),
});

export const CoordinateSchema = z.object({ L: Vec3, R: Vec3, method: z.string(), dataset: z.string() });
export const AcpcSchema = z.object({ AC: Vec3, PC: Vec3, MSP: Vec3, source: z.string(), url: z.string().url() });
