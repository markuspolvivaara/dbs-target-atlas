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

export function skullPlan(grpId: string, sel: string | null, also: readonly string[] = []): SkullPlan {
  const g = viewGroup(SB_GROUP.has(grpId) ? grpId : DEFAULT_GROUP, also);
  const looks = new Map<string, Look>();
  const tracts = new Map<string, TractRole>();
  const inGroup = new Set(g.structures);
  // a surgical view: its cut bones stand in for the whole ones, the bone removed is see-through; elsewhere both are hidden
  const replaced = new Set(g.structures.map((id) => SB.get(id)?.replaces).filter((x): x is string => !!x));
  for (const s of SB_MANIFEST.structures) {
    if (isApproachPart(s)) looks.set(s.id, !inGroup.has(s.id) ? 'hidden' : s.type === 'bone' ? 'primary' : 'ghost');
    else if (replaced.has(s.id)) looks.set(s.id, 'hidden');
    else if (s.type === 'bone') looks.set(s.id, inGroup.has(s.id) ? (g.kind === 'system' ? 'context' : 'primary') : g.kind === 'bone' ? 'ghost' : (g.boneLook ?? 'context'));
    else if (s.type === 'soft') looks.set(s.id, inGroup.has(s.id) ? 'primary' : 'hidden');
    else if (s.type === 'tube') looks.set(s.id, inGroup.has(s.id) ? 'primary' : 'hidden');
  }
  const lmSel = sel && sel.startsWith('lm_') ? sel : null;
  const lmIds = new Set(g.landmarks);
  if (lmSel) lmIds.add(lmSel);
  const st = sel ? SB.get(sel) : undefined;
  if (st && !(isApproachPart(st) && !inGroup.has(st.id)) && !replaced.has(st.id)) looks.set(st.id, 'primary');
  // a cranial nerve's own trunk ('Trigeminal nerve (V)'): all of that nerve lights up (its divisions and branches)
  if (st?.cranialNerve && /\([IVX]+\)$/.test(st.name)) {
    for (const x of SB_MANIFEST.structures) if (x.cranialNerve === st.cranialNerve) looks.set(x.id, 'primary');
  }
  return {
    title: g.name, accent: 'ctx', looks, tracts, parcels: new Map(),
    markers: [...lmIds].map((id) => ({ targetId: id, primary: true })),
    camera: g.camera,
    focusIds: g.focusIds ?? (g.focus ? [] : g.structures.filter((id) => SB.get(id)?.type === 'bone')),
    minRadius: g.radius, group: g.id,
  };
}

export const skullScene: SceneSource<SkullState, SkullPlan> = {
  catalog: makeCatalog(SB_MANIFEST.structures, {}, markers),
  plan: (s) => skullPlan(s.grp, s.sel, s.also),
  planKey: (s) => `${s.grp}|${s.also.join(',')}|${s.sel}`,
};
