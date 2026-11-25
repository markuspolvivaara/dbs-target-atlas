import { describe, expect, it } from 'vitest';
import { firstSentence, textGroups } from '../../src/ui/textview';
import type { ScenePlan } from '../../src/viewer/scene';
import type { Look } from '../../src/viewer/materials';

const plan = (looks: [string, Look][], extra: Partial<ScenePlan> = {}): ScenePlan => ({
  title: 'A view', accent: 'ctx', looks: new Map(looks), tracts: new Map(), parcels: new Map(), markers: [],
  camera: 'coronal', focusIds: [], ...extra,
} as ScenePlan);
const cat = {
  byId: new Map([['a', 'Alpha'], ['b', 'Beta'], ['c', 'Gamma'], ['t', 'A tract'], ['p', 'A gyrus']].map(([id, name]) => [id, { name } as never])),
  markers: new Map([['m', { label: 'A point' } as never]]),
};

describe('the text version of the 3D view', () => {
  it('groups what the view draws by the part it plays, each once, in the plan’s order', () => {
    const p = plan([['b', 'context'], ['a', 'primary'], ['c', 'alt'], ['x', 'hidden']],
      { tracts: new Map([['t', 'key' as never]]), parcels: new Map([['p', 'key']]), markers: [{ targetId: 'm', primary: true }] });
    const g = textGroups(p, cat, null);
    expect(g.map((x) => [x.title, x.items.map((i) => i.name)])).toEqual([
      ['Highlighted', ['Alpha']], ['Alternatives', ['Gamma']], ['Tracts', ['A tract']], ['Cortical areas', ['A gyrus']],
      ['Marked points', ['A point']], ['Shown for context', ['Beta']],
    ]);
  });
  it('lists only what is drawn when told what is, and a definition’s first sentence where there is one', () => {
    const p = plan([['a', 'primary'], ['b', 'primary'], ['c', 'ghost']]);
    const g = textGroups(p, cat, new Set(['a', 'c']), (id) => (id === 'a' ? 'The alpha. It is small.' : null));
    expect(g).toEqual([
      { title: 'Highlighted', items: [{ id: 'a', name: 'Alpha', note: 'The alpha.' }] },
      { title: 'Shown for context', items: [{ id: 'c', name: 'Gamma', note: null }] },
    ]);
    // drawn without a part in the plan (a section's whole-cortex shell): for context
    expect(textGroups(plan([['a', 'primary']]), cat, new Set(['a', 'p']))[1]).toEqual({ title: 'Shown for context', items: [{ id: 'p', name: 'A gyrus', note: null }] });
  });
  it('one line for a name shown twice in a group (a landmark on each side), with how many', () => {
    const two = { byId: cat.byId, markers: new Map([['m1', { label: 'Apex' } as never], ['m2', { label: 'Apex' } as never]]) };
    const g = textGroups(plan([], { markers: [{ targetId: 'm1', primary: true }, { targetId: 'm2', primary: true }] }), two, null);
    expect(g[0].items.map((i) => i.name)).toEqual(['Apex (2)']);
  });
  it('a first sentence: up to its end, not at an abbreviation’s full stop before a small letter, at most 240 characters', () => {
    expect(firstSentence('  The sulcus  lies here. It is deep. ')).toBe('The sulcus lies here.');
    expect(firstSentence('It is c. 5 mm long, e.g. in adults. Then more.')).toBe('It is c. 5 mm long, e.g. in adults.');
    const long = firstSentence(`${'word '.repeat(80)}end.`);
    expect(long.length).toBeLessThanOrEqual(240);
    expect(long.endsWith('…')).toBe(true);
  });
});
