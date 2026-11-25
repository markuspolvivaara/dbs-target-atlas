/**
 * A text version of the 3D view, for a reader who cannot use the canvas (the audit's UI-20 and its roadmap, section 3):
 * what the view draws, grouped by the part each structure plays in it, each with the first sentence of its definition
 * where the section has one. Built from the view's own plan and what the viewer draws, so it cannot go stale. It says
 * nothing the cards do not: no "what touches what", which the site has no data for.
 */
import { h } from './h';
import type { Catalog, ScenePlan } from '../viewer/scene';

export interface TextItem { id: string; name: string; note: string | null }
export interface TextGroup { title: string; items: TextItem[] }

/** A text's first sentence (at most 240 characters), for one line per structure. */
export function firstSentence(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ');
  const s = t.split(/(?<=[.!?])\s+(?=[A-Z(“"])/)[0];
  return s.length > 240 ? `${s.slice(0, 237).replace(/\s+\S*$/, '')}…` : s;
}

const LOOK_GROUP: Record<string, string> = {
  primary: 'Highlighted', alt: 'Alternatives', context: 'Shown for context', shell: 'Shown for context',
  ghost: 'Shown for context', muted: 'Shown for context',
};

/**
 * The groups for a view: its highlighted structures, alternatives, those shown for context, tracts, cortical areas and
 * marked points, in the plan's order; only what is drawn (`shown`: the viewer's drawn ids; null: the plan's alone), each
 * once. `define` gives a structure's definition text (its first sentence is used).
 */
export function textGroups(plan: ScenePlan, cat: Pick<Catalog, 'byId' | 'markers'>, shown: Set<string> | null,
  define?: (id: string, name: string) => string | null | undefined): TextGroup[] {
  const groups = new Map<string, TextItem[]>();
  const seen = new Set<string>();
  const add = (title: string, id: string, name: string) => {
    if (seen.has(id) || (shown && !shown.has(id))) return;
    seen.add(id);
    const d = define?.(id, name);
    groups.set(title, [...(groups.get(title) ?? []), { id, name, note: d ? firstSentence(d) : null }]);
  };
  const nameOf = (id: string) => cat.byId.get(id)?.name ?? id;
  for (const look of ['primary', 'alt', 'context', 'shell', 'ghost', 'muted']) {
    for (const [id, l] of plan.looks) if (l === look) add(LOOK_GROUP[look], id, nameOf(id));
  }
  for (const id of plan.tracts.keys()) add('Tracts', id, nameOf(id));
  for (const [id] of plan.parcels) add('Cortical areas', id, nameOf(id));
  for (const m of plan.markers) add('Marked points', m.targetId, cat.markers.get(m.targetId)?.label ?? m.targetId);
  // what is drawn without a part in the plan's lists (the whole cortex as a faint shell, `plan.cortex`): context
  for (const id of shown ?? []) add('Shown for context', id, cat.markers.get(id)?.label ?? nameOf(id));
  // (the same name twice in a group, a landmark on each side: one line, with how many)
  const merged = (items: TextItem[]): TextItem[] => {
    const by = new Map<string, TextItem[]>();
    for (const it of items) by.set(it.name, [...(by.get(it.name) ?? []), it]);
    return [...by.values()].map((xs) => (xs.length === 1 ? xs[0] : { ...xs[0], name: `${xs[0].name} (${xs.length})` }));
  };
  const order = ['Highlighted', 'Alternatives', 'Tracts', 'Cortical areas', 'Marked points', 'Shown for context'];
  return order.filter((t) => groups.has(t)).map((title) => ({ title, items: merged(groups.get(title)!) }));
}

/** The dialog's content: the view's name, a word on what this is, and the groups as headed lists. */
export function textViewContent(title: string, groups: TextGroup[]): HTMLElement[] {
  const n = groups.reduce((a, g) => a + g.items.length, 0);
  return [
    h('h2', { id: 'textview-title', tabindex: '-1' }, `Text version: ${title}`),
    h('p', { class: 'textview-note' }, n
      ? `What the 3D view draws now: ${n} ${n === 1 ? 'structure' : 'structures'}, by the part each plays in the view. The panel’s cards say more about each; definitions are the first sentence of each card’s, with their sources there.`
      : 'The 3D view draws nothing at the moment.'),
    ...groups.flatMap((g) => [
      h('h3', {}, `${g.title} (${g.items.length})`),
      h('ul', { class: 'textview-list' }, ...g.items.map((it) => h('li', {}, h('strong', {}, it.name), it.note ? `: ${it.note}` : ''))),
    ]),
  ];
}
