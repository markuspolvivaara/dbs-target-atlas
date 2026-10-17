import { IND, MAN, MANIFEST, SYM, TGT } from '../data';
import type { Indication, Symptom } from '../data/schema';
import type { AppState } from '../state';
import type { Look } from './materials';
import { makeCatalog, type SceneSource, type ScenePlan, type TractRole } from './scene';

export type { TractRole };

/** Nested structures: when a child is highlighted its parent becomes a translucent shell. */
export const PARENT: Record<string, string> = {
  stn_motor: 'stn', stn_assoc: 'stn', stn_limbic: 'stn', gpi_sm: 'gpi',
  vim: 'thal', vo: 'thal', cm: 'thal', pf: 'thal', ant: 'thal',
};

/** Shown only when referenced; never ghosted (they overlap their parent). */
const SUBREGIONS = new Set(['stn_motor', 'stn_assoc', 'stn_limbic', 'gpi_sm']);

/**
 * Structures whose content text names the pyramidal tract and medial lemniscus
 * as borders (IMG, Vim: "DRTT, with the pyramidal tract and medial lemniscus as
 * borders in dual-tract models"). Border tracts are shown when these are targets.
 */
const BORDER_TRIGGERS = new Set(['vim', 'psa']);

/**
 * Landmark volumes shown when borders are on: the optic tract beneath the
 * posteroventral GPi, the red nucleus beside the STN (sources in additions.ts).
 */
const GPI_TRIGGERS = new Set(['gpi', 'gpi_sm']);
/** The red nucleus as a landmark around STN targets (sources in additions.ts). */
const STN_TRIGGERS = new Set(['stn', 'stn_motor']);
export const LANDMARKS = new Set(['optic_tract', 'rn']);


/** DBS scene plan: the generic plan plus the indication / symptom it was made for. */
export interface Plan extends ScenePlan {
  indication: Indication;
  symptom: Symptom | null;
}

/** The target marker the lead is placed on: the first primary marker of the view. */
export function primaryTargetId(indId: string, symId: string | null): string | null {
  const ind = IND.get(indId);
  if (!ind) return null;
  const sym = symId ? SYM.get(symId) : null;
  if (sym) return sym.targetId;
  return ind.targetMarkers[0] ?? null;
}

export function plan(indId: string, symId: string | null, borders: boolean): Plan {
  const ind = IND.get(indId) ?? IND.get('pd')!;
  const sym = symId ? SYM.get(symId) ?? null : null;
  const looks = new Map<string, Look>();
  const tracts = new Map<string, TractRole>();
  const parcels = new Map<string, 'key' | 'context'>();

  const nuclei = [...MAN.values()].filter((m) => m.type === 'nucleus').map((m) => m.id);
  for (const id of nuclei) looks.set(id, SUBREGIONS.has(id) ? 'hidden' : 'ghost');
  for (const m of MAN.values()) if (m.type === 'target') looks.set(m.id, 'hidden');

  const primary = sym ? sym.structures : ind.primaryTargets;
  const alts = sym ? sym.alternativeStructures : ind.alternativeTargets;
  const context = sym ? sym.contextStructures : ind.contextStructures;
  for (const id of context) if (MAN.get(id)?.type === 'nucleus') looks.set(id, 'context');
  for (const id of alts) looks.set(id, 'alt');
  for (const id of primary) looks.set(id, 'primary');
  // When the motor STN is the highlighted target, also show the rest of the nucleus as context:
  // the DISTAL associative and limbic zones lie anterior and medial to it (the part a lead
  // aimed at the dorsolateral STN should not drift into).
  if (looks.get('stn_motor') === 'primary') {
    for (const z of ['stn_assoc', 'stn_limbic']) if (looks.get(z) === 'hidden') looks.set(z, 'context');
  }
  // parents of highlighted children become shells
  for (const [child, parent] of Object.entries(PARENT)) {
    const l = looks.get(child);
    if ((l === 'primary' || l === 'alt') && (looks.get(parent) === 'primary' || looks.get(parent) === 'ghost')) {
      looks.set(parent, 'shell');
    }
  }

  const keyTracts = sym ? sym.tracts : ind.keyTracts;
  const altTracts = sym ? [] : ind.alternativeTracts;
  for (const t of altTracts) tracts.set(t, 'alt');
  for (const t of keyTracts) tracts.set(t, 'key');
  const triggers = [...primary, ...alts];
  if (borders && triggers.some((id) => BORDER_TRIGGERS.has(id))) {
    for (const t of ['cst', 'ml']) if (!tracts.has(t)) tracts.set(t, 'border');
  }
  if (borders && triggers.some((id) => GPI_TRIGGERS.has(id))) looks.set('optic_tract', 'context');
  if (borders && triggers.some((id) => STN_TRIGGERS.has(id)) && looks.get('rn') === 'ghost') looks.set('rn', 'context');

  for (const a of sym ? sym.corticalAreas : ind.corticalAreas) parcels.set(a, 'key');

  const markers: Plan['markers'] = [];
  if (sym) {
    if (sym.targetId) markers.push({ targetId: sym.targetId, primary: true });
  } else {
    ind.targetMarkers.forEach((t) => markers.push({ targetId: t, primary: true }));
    ind.alternativeMarkers.forEach((t) => markers.push({ targetId: t, primary: false }));
  }
  if (!sym) for (const v of ind.extraVolumes) looks.set(v, 'context');
  for (const m of markers) {
    const tg = TGT.get(m.targetId);
    // translucent so the marker sphere at its centroid stays visible
    if (tg?.kind === 'sweetSpot') looks.set(tg.structureId, m.primary ? 'context' : 'alt');
  }

  return {
    title: sym ? `${ind.name}: ${sym.name}` : ind.name,
    accent: ind.accent,
    looks, tracts, parcels, markers,
    camera: sym ? sym.camera : ind.camera,
    focusIds: [...primary, ...alts],
    indication: ind,
    symptom: sym,
  };
}

/** The DBS section as a scene source for the shared viewer. */
export const dbsScene: SceneSource<AppState, Plan> = {
  catalog: makeCatalog(MANIFEST.structures, MANIFEST.volumes, [...TGT.values()], LANDMARKS),
  plan: (s) => plan(s.ind, s.sym, s.borders),
  planKey: (s) => `${s.ind}|${s.sym}|${s.borders}`,
};
