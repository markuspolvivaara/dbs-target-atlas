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

/** 'lateral' / 'medial' look at the shown hemisphere from outside / from the midline (white-matter section). */
export const CameraPresetSchema = z.enum(['coronal', 'sagittal', 'axial', 'posteriorOblique', 'surgeon', 'lateral', 'medial']);
export type CameraPreset = z.infer<typeof CameraPresetSchema>;

/** A rendered structure: nucleus, cortical area, tract or sweet-spot volume. */
export const StructureSchema = z.object({
  id: Id,
  name: z.string(),
  aliases: z.array(z.string()),
  type: z.enum(['nucleus', 'cortex', 'tract', 'target']),
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
  type: z.enum(['nucleus', 'cortex', 'tract', 'target']),
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

export const CoordinateSchema = z.object({ L: Vec3, R: Vec3, method: z.string(), dataset: z.string() });
export const AcpcSchema = z.object({ AC: Vec3, PC: Vec3, MSP: Vec3, source: z.string(), url: z.string().url() });
