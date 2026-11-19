import type { Look } from '../viewer/materials';
import { makeCatalog, type MarkerDef, type SceneSource, type ScenePlan, type TractRole } from '../viewer/scene';
import { DEFAULT_GROUP, SB_GROUP, viewGroup } from './groups';
import { isApproachPart, LANDMARKS, SB, SB_MANIFEST } from './index';
import type { SkullState } from './state';

export interface SkullPlan extends ScenePlan { group: string }

const markers: MarkerDef[] = LANDMARKS.map((l) => ({
  id: l.id, label: l.name, structureId: SB_MANIFEST.structures.find((s) => s.name === l.bone && !isApproachPart(s))?.id ?? '',
  mni: { left: l.ras, right: l.ras }, sides: [l.side === 'L' ? 'L' : 'R'],
}));

/** clinoidectomy: the view's anterior clinoidectomy switch is on (its clinoid process drawn as bone removed); ridgeDrilled: its
 * sphenoid ridge drilled (the drilled bone drawn as bone removed; off, as bone) */
export function skullPlan(grpId: string, sel: string | null, also: readonly string[] = [], clinoidectomy = false, ridgeDrilled = true): SkullPlan {
  const g = viewGroup(SB_GROUP.has(grpId) ? grpId : DEFAULT_GROUP, also);
  const looks = new Map<string, Look>();
  const tracts = new Map<string, TractRole>();
  const inGroup = new Set(g.structures);
  const ghost = new Set(g.ghost ?? []), shell = new Set(g.shell ?? []);
  // a surgical view: its cut bones stand in for the whole ones, the bone removed is see-through; elsewhere both are hidden
  const replaced = new Set(g.structures.map((id) => SB.get(id)?.replaces).filter((x): x is string => !!x));
  for (const s of SB_MANIFEST.structures) {
    if (isApproachPart(s)) looks.set(s.id, !inGroup.has(s.id) ? 'hidden' : s.clinoid && clinoidectomy ? 'ghost' : s.ridge ? (ridgeDrilled ? 'ghost' : 'primary') : s.type === 'bone' || s.category === 'guide' ? 'primary' : 'ghost');
    else if (replaced.has(s.id)) looks.set(s.id, 'hidden');
    else if (s.type === 'bone') looks.set(s.id, inGroup.has(s.id) ? (g.kind === 'system' ? 'context' : 'primary') : g.kind === 'bone' ? 'ghost' : (g.boneLook ?? 'context'));
    else if (s.type === 'soft') looks.set(s.id, inGroup.has(s.id) ? (shell.has(s.id) || ghost.has(s.id) ? 'context' : 'primary') : 'hidden');
    else if (s.type === 'tube') looks.set(s.id, inGroup.has(s.id) ? 'primary' : 'hidden');
  }
  const lmSel = sel && sel.startsWith('lm_') ? sel : null;
  const lmIds = new Set(g.landmarks);
  if (lmSel) lmIds.add(lmSel);
  const st = sel ? SB.get(sel) : undefined;
  if (st && !(isApproachPart(st) && !inGroup.has(st.id)) && !replaced.has(st.id)) looks.set(st.id, 'primary');
  // a cranial nerve's own trunk ('Trigeminal nerve (V)'): all of that nerve lights up (its divisions and branches)
  if (st?.cranialNerve && /\([IVX]+\)$/.test(st.name)) {
    // (not a tumour view's moved copy outside its view, nor the part a copy stands in for)
    for (const x of SB_MANIFEST.structures) if (x.cranialNerve === st.cranialNerve && (!x.pushedFrom || inGroup.has(x.id)) && !replaced.has(x.id)) looks.set(x.id, 'primary');
  }
  // a tumour view: the untouched left half of each part whose moved copy holds the right half only
  const onlySide = new Map<string, 'L' | 'R'>();
  for (const [part, copy] of g.keepLeft ?? []) {
    const look = looks.get(copy);
    if (!look || look === 'hidden') continue;
    looks.set(part, look);
    onlySide.set(part, 'L');
  }
  return {
    title: g.name, accent: 'ctx', looks, tracts, parcels: new Map(), onlySide,
    markers: [...lmIds].map((id) => ({ targetId: id, primary: true })),
    camera: g.camera,
    focusIds: g.focusIds ?? (g.focus ? [] : g.structures.filter((id) => SB.get(id)?.type === 'bone')),
    minRadius: g.radius, group: g.id,
  };
}

export const skullScene: SceneSource<SkullState, SkullPlan> = {
  catalog: makeCatalog(SB_MANIFEST.structures, {}, markers),
  // (a switch's link holds it only when it differs from the view's default: a view that has the ridge switch opens with
  // it on, so a state without it on has the ridge intact)
  plan: (s) => skullPlan(s.grp, s.sel, s.also, (s.morphs.clinoid ?? 0) >= 0.5, (s.morphs.ridge ?? 0) >= 0.5),
  planKey: (s) => `${s.grp}|${s.also.join(',')}|${s.sel}|${(s.morphs.clinoid ?? 0) >= 0.5 ? 'clinoidectomy' : ''}|${(s.morphs.ridge ?? 0) >= 0.5 ? 'drilled' : 'intact'}`,
};
