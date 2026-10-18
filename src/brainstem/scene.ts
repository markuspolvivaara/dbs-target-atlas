import type { Look } from '../viewer/materials';
import { makeCatalog, type SceneSource, type ScenePlan, type TractRole } from '../viewer/scene';
import { BS_GROUP } from './groups';
import { ALL, BS, kindOf, ofKind, VOLUMES } from './index';
import type { BsState } from './state';

export interface BsPlan extends ScenePlan { group: string }

const SURFACE = ofKind('surface');
const SURFACE_LOOK = { solid: 'primary', shell: 'shell', ghost: 'ghost' } as const;

export function bsPlan(grpId: string, sel: string | null): BsPlan {
  const g = BS_GROUP.get(grpId) ?? BS_GROUP.get('overview')!;
  const looks = new Map<string, Look>();
  const tracts = new Map<string, TractRole>();
  const role = (id: string, r: 'key' | 'context') => {
    if (BS.get(id)?.type === 'tract') tracts.set(id, r === 'key' ? 'key' : 'border');
    else looks.set(id, r === 'key' ? 'primary' : 'context');
  };
  for (const id of SURFACE) looks.set(id, SURFACE_LOOK[g.surface]);
  g.context.forEach((id) => role(id, 'context'));
  g.key.forEach((id) => role(id, 'key'));
  // the fourth ventricle would cover its own floor in the floor view
  if (g.region === 'floor') looks.set('bs_fourth_ventricle', 'hidden');
  const st = sel ? BS.get(sel) : undefined;
  if (st) {
    role(st.id, 'key');
    // an entry zone sits on the surface: make the surface solid when one is selected from another view
    if (kindOf(st.id) === 'sez' && g.surface !== 'solid') for (const id of SURFACE) looks.set(id, 'primary');
  }
  return {
    title: g.name, accent: 'bsSez', looks, tracts, parcels: new Map(), markers: [],
    camera: g.camera, focusIds: g.kind === 'zones' ? g.key : SURFACE,
    minRadius: g.radius, labelTracts: true, group: g.id,
  };
}

export const bsScene: SceneSource<BsState, BsPlan> = {
  catalog: makeCatalog(ALL, VOLUMES, []),
  plan: (s) => bsPlan(s.grp, s.sel),
  planKey: (s) => `${s.grp}|${s.sel}`,
};
