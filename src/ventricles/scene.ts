import type { Look } from '../viewer/materials';
import { makeCatalog, type MarkerDef, type SceneSource, type ScenePlan, type TractRole } from '../viewer/scene';
import { BONES, BRAIN, VE_GROUP } from './groups';
import { LANDMARKS, VE, VE_MANIFEST } from './index';
import type { VeState } from './state';

export interface VePlan extends ScenePlan { group: string }

const boneOf = (name: string) => VE_MANIFEST.structures.find((s) => s.name === name)?.id ?? '';
/** the skull's landmarks as one-sided points (Kocher's points, the meatus, the projected canthi, bregma) */
const markers: MarkerDef[] = LANDMARKS.map((l) => ({
  id: l.id, label: l.name, structureId: boneOf(l.id.startsWith('lm_meatus') ? 'Temporal bone' : 'Frontal bone'),
  mni: { left: l.ras, right: l.ras }, sides: [l.side === 'L' ? 'L' : 'R'], radius: 1.6,
}));

/** the landmarks a catheter view draws: its Kocher's point, both meatus and canthi, bregma */
export function catheterMarkers(s: VeState): string[] {
  const side = s.cath.side.toLowerCase();
  return ['lm_bregma', `lm_kocher_${s.cath.kocher}_${side}`, 'lm_meatus_r', 'lm_meatus_l', 'lm_canthus_r', 'lm_canthus_l'];
}

export function vePlan(s: VeState): VePlan {
  const g = VE_GROUP.get(s.grp) ?? VE_GROUP.get('ventricles')!;
  const looks = new Map<string, Look>();
  const tracts = new Map<string, TractRole>();
  for (const id of BONES) looks.set(id, g.bone);
  for (const id of BRAIN) looks.set(id, g.brain ?? 'hidden');
  for (const id of g.key) looks.set(id, 'primary');
  if (s.sel && VE.has(s.sel)) looks.set(s.sel, 'primary');
  return {
    title: g.name, accent: 'electrode', looks, tracts, parcels: new Map(),
    markers: g.catheter ? catheterMarkers(s).map((id) => ({ targetId: id, primary: id.startsWith('lm_kocher') })) : [],
    camera: g.camera, focusIds: g.key, minRadius: g.radius, group: g.id,
  };
}

export const veScene: SceneSource<VeState, VePlan> = {
  catalog: makeCatalog(VE_MANIFEST.structures, {}, markers),
  plan: (s) => vePlan(s),
  planKey: (s) => `${s.grp}|${s.sel}|${s.cath.side}|${s.cath.kocher}`,
};
