import type { Look } from '../viewer/materials';
import { makeCatalog, type SceneSource, type ScenePlan, type TractRole } from '../viewer/scene';
import { ARTERIES, BONES, BRAIN, VA_GROUP, VEINS } from './groups';
import { LESION, VA, VA_MANIFEST } from './index';
import type { VaState } from './state';

export interface VaPlan extends ScenePlan { group: string }

/** A view's lesion parts, and the normal vessels they stand in for. */
export function lesionParts(grp: string): { parts: string[]; replaced: Set<string> } {
  const g = VA_GROUP.get(grp)!;
  const parts = g.lesions.flatMap((l) => LESION.get(l)?.parts ?? []);
  return { parts, replaced: new Set(parts.map((p) => VA.get(p)?.replaces).filter((x): x is string => !!x)) };
}

export function vaPlan(s: VaState): VaPlan {
  const g = VA_GROUP.get(s.grp) ?? VA_GROUP.get('normal')!;
  const { parts, replaced } = lesionParts(g.id);
  const looks = new Map<string, Look>();
  const tracts = new Map<string, TractRole>();
  // in the angiogram the bone and the brain are subtracted away
  for (const id of BONES) looks.set(id, s.dsa.on ? 'hidden' : 'ghost');
  for (const id of BRAIN) looks.set(id, s.dsa.on || !g.brain ? 'hidden' : 'context');
  for (const id of ARTERIES) looks.set(id, replaced.has(id) ? 'hidden' : 'primary');
  for (const id of VEINS) looks.set(id, replaced.has(id) || !g.veins ? 'hidden' : 'primary');
  for (const id of parts) looks.set(id, 'primary');
  if (s.sel && VA.has(s.sel) && !looks.has(s.sel)) looks.set(s.sel, 'primary');
  const focus = parts.filter((p) => ['aneurysm', 'nidus', 'fistula'].includes(VA.get(p)?.category ?? ''));
  return {
    title: g.name, accent: 'electrode', looks, tracts, parcels: new Map(), markers: [],
    camera: g.camera, focusIds: focus.length ? focus : [...ARTERIES], minRadius: g.radius, group: g.id,
  };
}

export const vaScene: SceneSource<VaState, VaPlan> = {
  catalog: makeCatalog(VA_MANIFEST.structures, {}, []),
  plan: (s) => vaPlan(s),
  planKey: (s) => `${s.grp}|${s.sel}|${s.dsa.on}`,
};
