import { IND, MAN, SYM, TGT } from '../data';
import type { CameraPreset, Indication, Symptom } from '../data/schema';
import type { Look } from './materials';

/** Nested structures: when a child is highlighted its parent becomes a translucent shell. */
export const PARENT: Record<string, string> = {
  stn_motor: 'stn', stn_assoc: 'stn', stn_limbic: 'stn', gpi_sm: 'gpi',
  vim: 'thal', vo: 'thal', cm: 'thal', pf: 'thal',
};

/** Shown only when referenced; never ghosted (they overlap their parent). */
const SUBREGIONS = new Set(['stn_motor', 'stn_assoc', 'stn_limbic', 'gpi_sm']);

/**
 * Structures whose content text names the pyramidal tract and medial lemniscus
 * as borders (IMG, Vim: "DRTT, with the pyramidal tract and medial lemniscus as
 * borders in dual-tract models"). Border tracts are shown when these are targets.
 */
const BORDER_TRIGGERS = new Set(['vim', 'psa']);

export type TractRole = 'key' | 'alt' | 'border';

export interface Plan {
  title: string;
  accent: string;
  looks: Map<string, Look>; // nuclei + sweet-spot volumes
  tracts: Map<string, TractRole>;
  parcels: Map<string, 'key' | 'context'>;
  markers: { targetId: string; primary: boolean }[];
  camera: CameraPreset;
  /** ids whose bounding volume the camera should frame */
  focusIds: string[];
  indication: Indication;
  symptom: Symptom | null;
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
  const context = sym ? [] : ind.contextStructures;
  for (const id of context) if (MAN.get(id)?.type === 'nucleus') looks.set(id, 'context');
  for (const id of alts) looks.set(id, 'alt');
  for (const id of primary) looks.set(id, 'primary');
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

  for (const a of sym ? sym.corticalAreas : ind.corticalAreas) parcels.set(a, 'key');

  const markers: Plan['markers'] = [];
  if (sym) {
    if (sym.targetId) markers.push({ targetId: sym.targetId, primary: true });
  } else {
    ind.targetMarkers.forEach((t) => markers.push({ targetId: t, primary: true }));
    ind.alternativeMarkers.forEach((t) => markers.push({ targetId: t, primary: false }));
  }
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
