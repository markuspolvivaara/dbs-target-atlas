import { z } from '../zod';
import dbsManifestJson from '../data/generated/manifest.json';
import { VolumeSchema } from '../data/schema';
import type { Look } from '../viewer/materials';
import { makeCatalog, type SceneSource, type ScenePlan } from '../viewer/scene';
import { CTX_MANIFEST, FUNCTIONS, LABEL, LABELS, LOBE, MEDIAL_WALL } from './index';
import type { CortexState } from './state';
import { REGION, REGION_TRACTS } from './regions';
import { SYNDROME } from './syndromes';
import { VIEW } from './views';

export interface CortexPlan extends ScenePlan { view: string }

/** The labels a view highlights: a chosen surgical region's or syndrome's; else the view's labels, narrowed to one lobe
 * when a lobe is picked. */
export function viewLabels(s: Pick<CortexState, 'view' | 'lobe'> & Partial<Pick<CortexState, 'syn' | 'region'>>): string[] {
  const rg = s.region ? REGION.get(s.region) : undefined;
  if (rg) return rg.labels.map((l) => l.id);
  const sy = s.syn ? SYNDROME.get(s.syn) : undefined;
  if (sy) return sy.labels.map((l) => l.id);
  const v = VIEW.get(s.view) ?? VIEW.get('lateral')!;
  const inLobe = s.lobe ? new Set(LOBE.get(s.lobe)!.labels) : null;
  return v.labels.filter((id) => !inLobe || inLobe.has(id));
}

/** how opaque a surgical region's own areas are drawn, so that its tracts show through them */
export const REGION_SURFACE_OPACITY = 0.5;

export function cortexPlan(s: Pick<CortexState, 'view' | 'lobe' | 'colour' | 'inflate'> & Partial<Pick<CortexState, 'fn' | 'syn' | 'region'>>): CortexPlan {
  const rg = s.region ? REGION.get(s.region) : undefined;
  if (rg) return regionPlan(rg, s.inflate);
  const v = VIEW.get(s.view) ?? VIEW.get('lateral')!;
  const shown = new Set(viewLabels(s));
  const looks = new Map<string, Look>();
  const sy = s.syn ? SYNDROME.get(s.syn) : undefined;
  // (a syndrome's areas are drawn whatever the colour mode: they are the point of the view)
  for (const l of LABELS) looks.set(l.id, (s.colour !== 'plain' || sy) && shown.has(l.id) ? 'primary' : 'muted');
  looks.set(MEDIAL_WALL, 'muted');
  // functional areas: the group's drawn over the labels, which step back; with a syndrome, the HMAT areas it names
  const synFns = new Set(sy?.fns?.map((f) => f.id));
  for (const f of FUNCTIONS) looks.set(f.id, (sy ? synFns.has(f.id) : s.fn === f.group) ? 'primary' : 'hidden');
  if (s.fn && !sy) for (const l of LABELS) looks.set(l.id, 'muted');
  const colours = s.colour === 'atlas' ? new Map(LABELS.map((l) => [l.id, l.atlasColour])) : undefined;
  return {
    title: sy ? sy.name : `${v.name} view`, accent: 'ctx', looks, tracts: new Map(), parcels: new Map(), markers: [],
    // the insular view frames the insula; the others the whole hemisphere
    camera: v.camera, focusIds: v.id === 'insular' ? v.labels : [...LABEL.keys()], minRadius: v.id === 'insular' ? 75 : 95, colours,
    cutOpercula: v.cutOpercula && s.inflate < 0.5, view: v.id,
  };
}

/** A surgical region: its areas in colour and see-through, the rest of the cortex a ghost, its tracts drawn through
 * them (on the pial surface: the tracts do not follow the inflated one). */
function regionPlan(rg: NonNullable<ReturnType<typeof REGION.get>>, inflate: number): CortexPlan {
  const v = VIEW.get(rg.view)!;
  const own = new Set([...rg.labels, ...rg.fns].map((x) => x.id));
  const looks = new Map<string, Look>();
  for (const l of LABELS) looks.set(l.id, own.has(l.id) ? 'primary' : 'ghost');
  looks.set(MEDIAL_WALL, 'ghost');
  for (const f of FUNCTIONS) looks.set(f.id, own.has(f.id) ? 'primary' : 'hidden');
  return {
    title: rg.name, accent: 'ctx', looks, tracts: new Map(rg.tracts.map((t) => [t.id, 'key'])), parcels: new Map(), markers: [],
    camera: v.camera, focusIds: v.id === 'insular' ? v.labels : [...LABEL.keys()], minRadius: v.id === 'insular' ? 75 : 95,
    cutOpercula: v.cutOpercula && inflate < 0.5, view: v.id, surfaceOpacity: REGION_SURFACE_OPACITY, labelTracts: true,
  };
}

// the MRI templates' slice volumes (the DBS section's: the surface is the same template's, so they line up with the pial
// surface, not with the inflated one)
const VOLUMES = z.record(z.string(), VolumeSchema).parse((dbsManifestJson as { volumes: unknown }).volumes);
// (with the white-matter section's tracts the surgical regions draw: by reference to that section's files)
const catalog = makeCatalog([...CTX_MANIFEST.structures, ...REGION_TRACTS], VOLUMES, []);
catalog.anchors = new Map(LABELS.map((l) => [l.id, l.anchor]));

export const cortexScene: SceneSource<CortexState, CortexPlan> = {
  catalog,
  plan: (s) => cortexPlan(s),
  planKey: (s) => `${s.view}|${s.lobe}|${s.fn}|${s.syn}|${s.region}|${s.colour}|${s.inflate < 0.5 ? 'p' : 'i'}`,
};
