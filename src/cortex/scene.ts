import type { Look } from '../viewer/materials';
import { makeCatalog, type SceneSource, type ScenePlan } from '../viewer/scene';
import { CTX_MANIFEST, LABEL, LABELS, LOBE, MEDIAL_WALL } from './index';
import type { CortexState } from './state';
import { VIEW } from './views';

export interface CortexPlan extends ScenePlan { view: string }

/** The labels a view highlights: its labels, narrowed to one lobe when a lobe is picked. */
export function viewLabels(s: Pick<CortexState, 'view' | 'lobe'>): string[] {
  const v = VIEW.get(s.view) ?? VIEW.get('lateral')!;
  const inLobe = s.lobe ? new Set(LOBE.get(s.lobe)!.labels) : null;
  return v.labels.filter((id) => !inLobe || inLobe.has(id));
}

export function cortexPlan(s: Pick<CortexState, 'view' | 'lobe' | 'colour' | 'inflate'>): CortexPlan {
  const v = VIEW.get(s.view) ?? VIEW.get('lateral')!;
  const shown = new Set(viewLabels(s));
  const looks = new Map<string, Look>();
  for (const l of LABELS) looks.set(l.id, s.colour !== 'plain' && shown.has(l.id) ? 'primary' : 'muted');
  looks.set(MEDIAL_WALL, 'muted');
  const colours = s.colour === 'atlas' ? new Map(LABELS.map((l) => [l.id, l.atlasColour])) : undefined;
  return {
    title: `${v.name} view`, accent: 'ctx', looks, tracts: new Map(), parcels: new Map(), markers: [],
    // the insular view frames the insula; the others the whole hemisphere
    camera: v.camera, focusIds: v.id === 'insular' ? v.labels : [...LABEL.keys()], minRadius: v.id === 'insular' ? 75 : 95, colours,
    cutOpercula: v.cutOpercula && s.inflate < 0.5, view: v.id,
  };
}

const catalog = makeCatalog(CTX_MANIFEST.structures, {}, []);
catalog.anchors = new Map(LABELS.map((l) => [l.id, l.anchor]));

export const cortexScene: SceneSource<CortexState, CortexPlan> = {
  catalog,
  plan: (s) => cortexPlan(s),
  planKey: (s) => `${s.view}|${s.lobe}|${s.colour}|${s.inflate < 0.5 ? 'p' : 'i'}`,
};
