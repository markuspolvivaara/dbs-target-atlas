import type { Look } from '../viewer/materials';
import { makeCatalog, type MarkerDef, type SceneSource, type ScenePlan } from '../viewer/scene';
import { affectedRoot, LESION_ZONES, LUMBAR_GEOM } from './content';
import { discBelow, LEVEL_ORDER, SP, SP_MANIFEST, vertebraOf } from './index';
import { REGION } from './regions';
import type { SpineState } from './state';

export interface SpinePlan extends ScenePlan { region: string; level: string | null }

/**
 * The region's structures are drawn; a selected level's vertebra (and the disc below it) stays solid while the
 * other bones of the region step back.
 */
export function spinePlan(s: Pick<SpineState, 'region' | 'level' | 'sel'> & Partial<Pick<SpineState, 'lesion' | 'screw' | 'cut' | 'approach'>>): SpinePlan {
  const r = REGION.get(s.region) ?? REGION.get('lumbar')!;
  const inRegion = new Set(r.structures);
  const focus = new Set<string>();
  if (s.level) {
    const v = vertebraOf(s.level);
    const d = discBelow(s.level);
    if (v) focus.add(v.id);
    if (d) focus.add(d.id);
  }
  const looks = new Map<string, Look>();
  for (const st of SP_MANIFEST.structures) {
    // the junction is another CT: nothing of the whole-spine CT is drawn with it, not even as a ghost
    if (!inRegion.has(st.id)) { looks.set(st.id, st.category === 'vertebra' && r.id !== 'ccj' ? 'ghost' : 'hidden'); continue; }
    const bone = st.category === 'vertebra' || st.category === 'bone';
    looks.set(st.id, !s.level || focus.has(st.id) || !bone ? 'primary' : 'context');
  }
  // a lesion: the root it affects stands out, the other roots step back, and the herniation is marked
  const lesionRoot = s.lesion ? `sp_root_${affectedRoot(s.lesion.pair, s.lesion.zone).toLowerCase()}` : null;
  if (lesionRoot) for (const st of SP_MANIFEST.structures) {
    if (inRegion.has(st.id) && (st.category === 'root' || st.category === 'ganglion')) looks.set(st.id, st.id === lesionRoot || st.id === lesionRoot.replace('root', 'drg') ? 'primary' : 'context');
  }
  // a dorsal approach to the disc below the level: the two vertebrae at the disc turn see-through; the disc, the dural
  // sac and the level's root stand out, the other roots step back
  if (s.approach && s.level) {
    const next = LEVEL_ORDER[LEVEL_ORDER.indexOf(s.level) + 1];
    for (const lv of [s.level, next]) { const v = lv ? vertebraOf(lv) : undefined; if (v) looks.set(v.id, 'context'); }
    const acdf = s.approach.id === 'acdf';
    // dorsal: the level's own root stands out; anterior: the neck's vessels and viscera do, the roots step back
    const root = `sp_root_${s.level.toLowerCase()}`;
    for (const st of SP_MANIFEST.structures) {
      if (!inRegion.has(st.id)) continue;
      if (st.category === 'root' || st.category === 'ganglion') looks.set(st.id, !acdf && (st.id === root || st.id === root.replace('root', 'drg')) ? 'primary' : 'context');
      if (acdf && (st.category === 'vessel' || st.category === 'viscera')) looks.set(st.id, 'primary');
      if (acdf && st.category === 'muscle') looks.set(st.id, st.id.startsWith('sp_prevertebral') ? 'primary' : 'context');
    }
  }
  // a virtual screw: its bone turns see-through (unless cut open) so the screw shows
  const screwBone = s.screw && s.level ? vertebraOf(s.level) : undefined;
  if (screwBone) looks.set(screwBone.id, s.cut === 'screw' ? 'primary' : 'context');
  if (s.sel && SP.has(s.sel)) looks.set(s.sel, 'primary');
  const focusIds = s.level ? [...focus] : r.id === 'ccj' ? r.structures.filter((id) => SP.get(id)?.category === 'bone')
    : r.structures.filter((id) => SP.get(id)?.category === 'vertebra' || id === 'sp_sacrum');
  return {
    title: s.level ? `${s.level}` : r.title, accent: 'spSafe', looks, tracts: new Map(), parcels: new Map(),
    markers: [
      ...(s.lesion ? [{ targetId: lesionMarkerId(s.lesion.pair, s.lesion.zone, s.lesion.side), primary: true }] : []),
    ],
    camera: r.camera, focusIds, minRadius: s.level ? 50 : r.id === 'ccj' ? 85 : 150, region: r.id, level: s.level,
  };
}

/** Schematic herniation positions at each lumbar disc, per kind and side (measured on this CT, see content.ts). */
export const LESION_MARKERS: MarkerDef[] = LUMBAR_GEOM.flatMap((g) => !g.lesions ? [] : (['L', 'R'] as const).flatMap((sd) =>
  LESION_ZONES.map(([z, name]) => ({
    id: lesionMarkerId(g.pair, z, sd), label: `${name} herniation ${g.pair} (${sd === 'L' ? 'left' : 'right'}, schematic position)`,
    structureId: '', mni: { left: g.lesions![sd][z], right: g.lesions![sd][z] }, sides: [sd], radius: 2.5, token: 'spRisk',
  }))));
export function lesionMarkerId(pair: string, zone: string, side: string): string {
  return `sp_les_${pair.toLowerCase().replace('-', '_')}_${zone}_${side.toLowerCase()}`;
}

export const spineScene: SceneSource<SpineState, SpinePlan> = {
  catalog: makeCatalog(SP_MANIFEST.structures, {}, LESION_MARKERS),
  plan: (s) => spinePlan(s),
  planKey: (s) => `${s.region}|${s.level}|${s.sel}|${s.lesion ? JSON.stringify(s.lesion) : ''}|${s.screw ? 'screw' : ''}|${s.cut}|${s.approach ? s.approach.id + s.approach.side : ''}`,
};
