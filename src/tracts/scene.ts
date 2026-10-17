import manifestJson from '../data/generated/manifest.json';
import { ManifestSchema } from '../data/schema';
import type { Look } from '../viewer/materials';
import { makeCatalog, type SceneSource, type ScenePlan, type TractRole } from '../viewer/scene';
import { GROUP, TOPIC, WM, WM_MANIFEST } from './index';
import type { TractsState } from './state';

/**
 * The white-matter section as a scene source for the shared viewer: the HCP-1065 tracts,
 * plus from the DBS assets the cortex (ghost), the HMAT motor parcels named in the cards,
 * and a few deep nuclei as faint orientation landmarks.
 */
const DBS = ManifestSchema.parse(manifestJson);
/** deep grey matter shown as ghosts for orientation */
export const ORIENTATION_NUCLEI = ['thal', 'caudate', 'putamen', 'hippocampus'];
const PARCELS = new Set(WM.topics.flatMap((t) => t.parcels));
const CONTEXT = DBS.structures.filter((s) => s.id === 'cortex' || PARCELS.has(s.id) || ORIENTATION_NUCLEI.includes(s.id));

export interface TractPlan extends ScenePlan {
  group: string;
}

export function tractPlan(grpId: string, sel: string | null): TractPlan {
  const g = GROUP.get(grpId) ?? GROUP.get('language')!;
  const looks = new Map<string, Look>(ORIENTATION_NUCLEI.map((id) => [id, 'ghost']));
  const tracts = new Map<string, TractRole>(g.tractIds.map((id) => [id, 'key']));
  const parcels = new Map<string, 'key' | 'context'>();
  const t = sel ? TOPIC.get(sel) : undefined;
  if (t) {
    if (!tracts.has(t.id)) tracts.set(t.id, 'key');
    for (const p of t.parcels) parcels.set(p, 'key');
  }
  return {
    title: t ? `${t.name} (${g.name})` : g.name,
    accent: 'ctx', looks, tracts, parcels, markers: [],
    camera: g.camera, focusIds: t ? [t.id] : g.tractIds,
    minRadius: 85, cortex: true, labelTracts: true, group: g.id,
  };
}

export const tractsScene: SceneSource<TractsState, TractPlan> = {
  catalog: makeCatalog([...CONTEXT, ...WM_MANIFEST.structures], DBS.volumes, []),
  plan: (s) => tractPlan(s.grp, s.sel),
  planKey: (s) => `${s.grp}|${s.sel}`,
};

export const CONTEXT_STRUCTURES = CONTEXT;
