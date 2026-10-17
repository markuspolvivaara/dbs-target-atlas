import type { CameraPreset, ManifestStructure, VolumeInfo } from '../data/schema';
import type { Axis, Clip, Hemi, Layer, LayerKey, LeadAnchor, SliceSeq, V3 } from '../state';
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
}

/** A point marker (target) the viewer can draw, label and place the lead on. */
export interface MarkerDef {
  id: string;
  label: string;
  structureId: string;
  mni: { left: V3; right: V3 };
}

export interface Catalog {
  structures: ManifestStructure[];
  byId: Map<string, ManifestStructure>;
  volumes: Record<string, VolumeInfo>;
  markers: Map<string, MarkerDef>;
  /** structures drawn with extra emphasis when shown as context (landmarks) */
  landmarks: Set<string>;
}

/** The part of a section's state the viewer reads. Section states extend this. */
export interface ViewState {
  hemi: Hemi;
  cam: { preset: CameraPreset | null; pos?: V3; tgt?: V3 };
  layers: Record<LayerKey, Layer>;
  clip: Record<Axis, Clip>;
  cutSide: 'none' | 'L' | 'R';
  sliceSeq: SliceSeq;
  lead: { spacing: 0.5 | 1.5; anchor: LeadAnchor; depth: number; ring: number; tilt: number; stim: boolean; contact: number; radius: number };
  sel: string | null;
  hidden: string[];
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
