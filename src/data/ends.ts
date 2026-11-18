import endsJson from './generated/wm-ends.json';
import { WmEndsSchema, type BundleEnd, type ManifestStructure } from './schema';

/**
 * Where the white-matter section's bundles end on the cortex (pipeline/wm_ends.py, the site audit's B-007): read by the
 * white-matter section (its tract cards and the patches drawn in 3D) and by the cortex section (the tracts that end on
 * a label). The ends of an averaged bundle's streamlines, not connections: the cards say why, with sources.
 */
export const WM_ENDS = WmEndsSchema.parse(endsJson);

export type Side = 'L' | 'R';
export type BundleKey = 'L' | 'R' | 'M';

/** A label's name as the cortex section shows it (its shortName): the Destrieux name without parenthetical synonyms,
 * up to its first comma. (Kept here so that the white-matter section need not load the cortex section's data.) */
export function areaName(id: string): string {
  const n = WM_ENDS.areas[id];
  return n ? n.replace(/\s*\([^)]*\)/g, '').split(',')[0].replace(/\s+/g, ' ').trim() : id;
}

/** The patch of cortex where a tract's ends are densest, as a structure the viewer can draw (a cortical area). */
export const END_PATCHES: ManifestStructure[] = Object.entries(WM_ENDS.tracts).flatMap(([, t]) => t.patch ? [{
  id: t.patch.id, name: `${t.name}: where its streamlines end`, aliases: [], type: 'cortex' as const,
  file: t.patch.file, bytes: t.patch.bytes, colour: t.patch.colour, dataset: 'wmEnds',
  source: WM_ENDS.patches.source, licence: WM_ENDS.patches.licence,
  citation: WM_ENDS.patches.citation, citationUrls: WM_ENDS.patches.citationUrls, refIds: [],
  derivation: WM_ENDS.patches.derivation, centroid: t.patch.centroid,
}] : []);
export const END_PATCH = new Map(END_PATCHES.map((s) => [s.id, s]));
/** the patch drawn with a tract, if it has one */
export const patchOf = (tractId: string): string | null => WM_ENDS.tracts[tractId]?.patch?.id ?? null;

/** An end of a tract that lands on a label: which end, on which side, and its share of that end's cortical ends. For a
 * bundle across the midline each end lies in one hemisphere, so the end is not named. */
export interface EndHere { tract: string; name: string; abbr: string; end: string | null; side: Side; share: number }

/** Every tract end that lands on a label (at least the rule's minShare of that end's cortical ends), largest first. */
export function endsOn(areaId: string): EndHere[] {
  const out: EndHere[] = [];
  for (const [id, t] of Object.entries(WM_ENDS.tracts)) {
    for (const [key, b] of Object.entries(t.bundles) as [BundleKey, { ends: [BundleEnd, BundleEnd] }][]) {
      b.ends.forEach((e, i) => {
        for (const a of e.areas) if (a.id === areaId) out.push({ tract: id, name: t.name, abbr: t.abbr, end: key === 'M' ? null : t.ends[i], side: a.side, share: a.share });
      });
    }
  }
  return out.sort((p, q) => q.share - p.share);
}
