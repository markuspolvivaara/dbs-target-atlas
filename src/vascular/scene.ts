import type { Look } from '../viewer/materials';
import { makeCatalog, type SceneSource, type ScenePlan, type TractRole } from '../viewer/scene';
import { ARTERIES, BONES, BRAIN, VA_GROUP, VEINS } from './groups';
import { LESION, VA, VA_MANIFEST } from './index';
import type { VaState } from './state';

export interface VaPlan extends ScenePlan { group: string }

/** A view's lesion parts (with the treatment shown, in the Aneurysms view), and the vessels or parts they stand in for. */
export function lesionParts(grp: string, treat = ''): { parts: string[]; replaced: Set<string> } {
  const g = VA_GROUP.get(grp)!;
  const lesions = [...g.lesions, ...(g.kind === 'aneurysm' && treat ? [treat] : [])];
  const all = lesions.flatMap((l) => LESION.get(l)?.parts ?? []);
  const replaced = new Set(all.map((p) => VA.get(p)?.replaces).filter((x): x is string => !!x));
  return { parts: all.filter((p) => !replaced.has(p)), replaced };
}

/** A fistula's own parts, outlined as a selection is (the fistula first, then the veins it fills: the reflux, the
 * sinus): not in the angiogram, where an outline would show a vessel before it fills. */
export function outlined(kind: string, parts: string[]): string[] | undefined {
  if (kind !== 'fistula') return undefined;
  const cat = (id: string) => VA.get(id)?.category ?? '';
  return [...parts.filter((p) => cat(p) === 'fistula'), ...parts.filter((p) => cat(p) === 'drainer' || cat(p) === 'vein')];
}

export function vaPlan(s: VaState): VaPlan {
  const g = VA_GROUP.get(s.grp) ?? VA_GROUP.get('normal')!;
  const { parts, replaced } = lesionParts(g.id, s.treat);
  const looks = new Map<string, Look>();
  const tracts = new Map<string, TractRole>();
  // in the angiogram the bone and the brain are subtracted away
  for (const id of BONES) looks.set(id, s.dsa.on ? 'hidden' : 'ghost');
  for (const id of BRAIN) looks.set(id, s.dsa.on || !g.brain ? 'hidden' : 'context');
  // in a fistula's view (not the angiogram) the normal vessels step back, the fistula's own parts outlined in front
  const normal: Look = g.kind === 'fistula' && !s.dsa.on ? 'context' : 'primary';
  for (const id of ARTERIES) looks.set(id, replaced.has(id) ? 'hidden' : normal);
  for (const id of VEINS) looks.set(id, replaced.has(id) || !g.veins ? 'hidden' : normal);
  for (const id of replaced) looks.set(id, 'hidden');      // (an aneurysm treated: its copy as treated in its place)
  // (a flow diverter drawn see-through, its artery and the neck inside it)
  for (const id of parts) looks.set(id, id === 'va_fd__device' ? 'alt' : 'primary');
  if (s.sel && VA.has(s.sel) && !looks.has(s.sel)) looks.set(s.sel, 'primary');
  // framed: the lesion itself (and a fistula's reflux, which is its danger)
  const focus = parts.filter((p) => ['aneurysm', 'nidus', 'fistula', ...(g.kind === 'fistula' ? ['drainer'] : [])].includes(VA.get(p)?.category ?? ''));
  return {
    title: g.name, accent: 'electrode', looks, tracts, parcels: new Map(), markers: [],
    // (a variant's view: the arteries it changes)
    camera: g.camera, focusIds: focus.length ? focus : parts.length ? parts : [...ARTERIES], minRadius: g.radius, group: g.id,
    outline: s.dsa.on ? undefined : outlined(g.kind, parts),
  };
}

export const vaScene: SceneSource<VaState, VaPlan> = {
  catalog: makeCatalog(VA_MANIFEST.structures, {}, []),
  plan: (s) => vaPlan(s),
  planKey: (s) => `${s.grp}|${s.sel}|${s.dsa.on}|${s.treat}`,
};
