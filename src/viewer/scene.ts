import type { CameraPreset, ManifestStructure, VolumeInfo } from '../data/schema';
import type { Axis, Clip, ExtraLayerKey, Hemi, Layer, LayerKey, LeadAnchor, SliceSeq, V3 } from '../state';
import type { Look } from './materials';

/**
 * The contract between a section (DBS targets, white-matter tracts, ...) and the shared
 * 3D viewer. A section provides a catalogue of what can be drawn and a planner that turns
 * its own state into a scene plan; the viewer knows nothing else about the section.
 */

export type TractRole = 'key' | 'alt' | 'border';

/** What to draw and how, for one view. */
export interface ScenePlan {
  title: string;
  /** colour token used for markers without their own colour */
  accent: string;
  /** look of every mesh structure (nuclei, sweet-spot volumes, ...); missing = hidden */
  looks: Map<string, Look>;
  tracts: Map<string, TractRole>;
  parcels: Map<string, 'key' | 'context'>;
  markers: { targetId: string; primary: boolean }[];
  camera: CameraPreset;
  /** ids whose centroids the camera should frame */
  focusIds: string[];
  /** smallest framing radius in mm (long tracts span far more than their centroids) */
  minRadius?: number;
  /** load and show the whole cortex as a ghost even without highlighted cortical areas */
  cortex?: boolean;
  /** "All" name labels include the drawn tracts (at their centroids), not only highlighted nuclei */
  labelTracts?: boolean;
  /** colour per structure (hex), overriding its palette token (cortex section: atlas colours) */
  colours?: Map<string, string>;
  /** cortical surfaces: leave out the faces flagged as opercular (the insular view) */
  cutOpercula?: boolean;
}

/** Where to put a label on a cortical surface, on the pial and on the inflated surface (RAS mm, unit normals). */
export interface SurfaceAnchor { pial: V3; inflated: V3; nPial: V3; nInflated: V3 }

/** A point marker (target) the viewer can draw, label and place the lead on. */
export interface MarkerDef {
  id: string;
  label: string;
  structureId: string;
  mni: { left: V3; right: V3 };
  /** sides to draw (default both); a one-sided landmark draws a single point */
  sides?: ('L' | 'R')[];
  /** sphere radius in mm (default 0.8, primary 0.9: sized for deep-brain targets) */
  radius?: number;
  /** palette token of its own: also used when primary, instead of the ink colour */
  token?: string;
}

export interface Catalog {
  structures: ManifestStructure[];
  byId: Map<string, ManifestStructure>;
  volumes: Record<string, VolumeInfo>;
  markers: Map<string, MarkerDef>;
  /** structures drawn with extra emphasis when shown as context (landmarks) */
  landmarks: Set<string>;
  /** label anchors of cortical surfaces (cortex section) */
  anchors?: Map<string, Record<'L' | 'R', SurfaceAnchor>>;
}

/** The part of a section's state the viewer reads. Section states extend this. */
export interface ViewState {
  hemi: Hemi;
  cam: { preset: CameraPreset | null; pos?: V3; tgt?: V3 };
  layers: Record<LayerKey, Layer> & Partial<Record<ExtraLayerKey, Layer>>;
  clip: Record<Axis, Clip>;
  cutSide: 'none' | 'L' | 'R';
  sliceSeq: SliceSeq;
  lead: { spacing: 0.5 | 1.5; anchor: LeadAnchor; depth: number; ring: number; tilt: number; stim: boolean; contact: number; radius: number };
  sel: string | null;
  hidden: string[];
  /** remove every structure above this height (mm); the skull-base section uses it to lift off the calvaria */
  cutAbove?: number | null;
  /** remove every structure on the side of this plane that its normal points to (RAS mm); the spine section cuts
   * along a virtual screw with it */
  cutPlane?: { normal: [number, number, number]; point: [number, number, number] } | null;
  /** cortical surfaces: an unnamed morph target 0, pial (0) to inflated (1) (the viewer animates between them) */
  inflate?: number;
  /** named morph targets (a glTF mesh's extras.targetNames), 0..1 each: skull base v3's surgical shapes */
  morphs?: Record<string, number>;
}

export interface SceneSource<S extends ViewState, P extends ScenePlan = ScenePlan> {
  catalog: Catalog;
  plan(state: S): P;
  /** the plan is recomputed only when this key changes */
  planKey(state: S): string;
}

export function makeCatalog(structures: ManifestStructure[], volumes: Record<string, VolumeInfo>, markers: MarkerDef[], landmarks: Iterable<string> = []): Catalog {
  return {
    structures,
    byId: new Map(structures.map((s) => [s.id, s])),
    volumes,
    markers: new Map(markers.map((m) => [m.id, m])),
    landmarks: new Set(landmarks),
  };
}
