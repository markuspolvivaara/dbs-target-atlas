import { z } from 'zod';

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
 * and a little above, along a pterional craniotomy; 'frontolateral' more from in front and above, along a lateral
 * supraorbital craniotomy; 'vertex' from above and a little behind, down the interhemispheric fissure; 'suboccipital'
 * from behind and below, up into the cerebellomedullary fissure (skull-base section, surgical views).
 */
export const CameraPresetSchema = z.enum(['coronal', 'sagittal', 'axial', 'posteriorOblique', 'surgeon', 'lateral', 'medial', 'inferior', 'posterior', 'anterolateral', 'frontolateral', 'vertex', 'suboccipital']);
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
  /** Key into generated/coordinates.json; coordinates are never typed by hand. */
  coordKey: z.string(),
  mni: z.object({ left: Vec3, right: Vec3 }),
  kind: z.enum(['sweetSpot', 'atlasCoordinate']),
  refId: z.string(),
  method: z.string(),
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
  /** skull-base section: the cranial nerve (1-12) a nerve or nerve branch belongs to */
  cranialNerve: z.number().int().min(1).max(12).optional(),
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
  /** skull base v3: the surgical approach this structure belongs to (a cut bone, or the bone removed) */
  approach: z.string().optional(),
  /** skull base v3: the bone a cut bone replaces in its approach's view */
  replaces: z.string().optional(),
  /** skull base v3: carries morph target 0, the transsylvian opening (the brain, and the arteries that move with it) */
  morph: z.boolean().optional(),
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
  volumes: z.record(VolumeSchema),
  hcpAcknowledgement: z.string(),
  volumeSource: z.object({ source: z.string(), scaling: z.union([z.string(), z.record(z.string())]), licence: z.string(), citation: z.array(z.string()) }).passthrough(),
  datasets: z.record(z.object({
    name: z.string(), licence: z.string(), url: z.string(), citation: z.array(z.string()),
    citationUrls: z.array(z.string()), note: z.string().optional(), todo: z.string().optional(),
    refIds: z.array(z.string()).optional(),
  })),
});
export type Manifest = z.infer<typeof ManifestSchema>;

/** wm-manifest.json: the white-matter section's tracts (HCP-1065), separate from the DBS assets. */
export const WmManifestSchema = z.object({
  space: z.string(),
  generatedBy: z.string(),
  structures: z.array(ManifestStructureSchema),
  dataset: z.object({
    name: z.string(), licence: z.string(), url: z.string().url(), note: z.string(),
    citation: z.array(z.string()), citationUrls: z.array(z.string()),
  }),
  hcpAcknowledgement: z.string(),
});
export type WmManifest = z.infer<typeof WmManifestSchema>;

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
export type SbManifest = z.infer<typeof SbManifestSchema>;

const DatasetInfoSchema = z.object({
  name: z.string(), licence: z.string(), url: z.string().url(), note: z.string(), attribution: z.array(z.string()),
  citation: z.array(z.string()), citationUrls: z.array(z.string()),
});

/** bs-manifest.json: the brainstem section's structures in MNI space (Z-Anatomy fitted to the template; AAN 2.0). */
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
  }),
  datasets: z.record(DatasetInfoSchema),
  dataset: DatasetInfoSchema,
});
export type BsManifest = z.infer<typeof BsManifestSchema>;

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
export type CtxManifest = z.infer<typeof CtxManifestSchema>;

/** spine-manifest.json: the spine section's structures (one CT, VerSe + TotalSegmentator), in their own space. */
export const SpineManifestSchema = z.object({
  space: z.string(),
  /** content references by key (Crossref/PubMed-checked citations from pipeline/sources/citations.json) */
  references: z.record(z.object({ citation: z.string(), url: z.string().url() })),
  generatedBy: z.string(),
  structures: z.array(ManifestStructureSchema),
  dataset: z.object({
    name: z.string(), licence: z.string(), url: z.string().url(), note: z.string(),
    citation: z.array(z.string()), citationUrls: z.array(z.string()),
  }),
});
export type SpineManifest = z.infer<typeof SpineManifestSchema>;

export const CoordinateSchema = z.object({ L: Vec3, R: Vec3, method: z.string(), dataset: z.string() });
export const AcpcSchema = z.object({ AC: Vec3, PC: Vec3, MSP: Vec3, source: z.string(), url: z.string().url() });
