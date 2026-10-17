import type { Look } from '../viewer/materials';
import { makeCatalog, type MarkerDef, type SceneSource, type ScenePlan, type TractRole } from '../viewer/scene';
import { SB_GROUP } from './groups';
import { LANDMARKS, SB, SB_MANIFEST } from './index';
import type { SkullState } from './state';

export interface SkullPlan extends ScenePlan { group: string }

const markers: MarkerDef[] = LANDMARKS.map((l) => ({
  id: l.id, label: l.name, structureId: SB_MANIFEST.structures.find((s) => s.name === l.bone)?.id ?? '',
  mni: { left: l.ras, right: l.ras }, sides: [l.side === 'L' ? 'L' : 'R'],
}));

export function skullPlan(grpId: string, sel: string | null): SkullPlan {
  const g = SB_GROUP.get(grpId) ?? SB_GROUP.get('floor')!;
  const looks = new Map<string, Look>();
  const tracts = new Map<string, TractRole>();
  const inGroup = new Set(g.structures);
  for (const s of SB_MANIFEST.structures) {
    if (s.type === 'bone') looks.set(s.id, inGroup.has(s.id) ? (g.kind === 'system' ? 'context' : 'primary') : g.kind === 'bone' ? 'ghost' : 'context');
    else if (s.type === 'soft') looks.set(s.id, inGroup.has(s.id) ? 'primary' : 'hidden');
    else if (inGroup.has(s.id)) tracts.set(s.id, 'key');
  }
  const lmSel = sel && sel.startsWith('lm_') ? sel : null;
  const lmIds = new Set(g.landmarks);
  if (lmSel) lmIds.add(lmSel);
  const st = sel ? SB.get(sel) : undefined;
  if (st?.type === 'tract') tracts.set(st.id, 'key');
  if (st && st.type !== 'tract') looks.set(st.id, 'primary');
  return {
    title: g.name, accent: 'ctx', looks, tracts, parcels: new Map(),
    markers: [...lmIds].map((id) => ({ targetId: id, primary: true })),
    camera: g.camera,
    focusIds: g.focus ? [] : g.structures.filter((id) => SB.get(id)?.type === 'bone'),
    minRadius: g.radius, labelTracts: g.kind === 'region', group: g.id,
  };
}

export const skullScene: SceneSource<SkullState, SkullPlan> = {
  catalog: makeCatalog(SB_MANIFEST.structures, {}, markers),
  plan: (s) => skullPlan(s.grp, s.sel),
  planKey: (s) => `${s.grp}|${s.sel}`,
};
