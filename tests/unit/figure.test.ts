import { describe, expect, it } from 'vitest';
import { captionText, wrap } from '../../src/ui/figure';

// "Save image" (the audit's roadmap, figure export): the caption's text and its line breaking
describe('the saved image’s caption', () => {
  const credits = {
    items: [
      { source: 'HCP-1065 tractography atlas', licence: 'CC BY-SA 4.0' },
      { source: 'DISTAL Medium (Ewert 2017)', licence: 'GPL-3.0' },
      { source: 'CIT168 subcortical atlas', licence: 'GPL-3.0' },
    ],
    templateSlices: false,
  };
  const date = new Date(2026, 10, 19);
  it('in full: each licence once, with the sources it covers; the view, the date and its link first', () => {
    const c = captionText(credits, 'full', 'Arcuate fasciculus · White-matter tracts', 'https://openneuroatlas.net/tracts/#/atlas?sel=wm_af', 'https://openneuroatlas.net/tracts/#/credits', date);
    expect(c.title).toBe('Arcuate fasciculus · White-matter tracts');
    expect(c.lines[0]).toBe('Open Neuroanatomy Atlas, saved 19 November 2026. This view: https://openneuroatlas.net/tracts/#/atlas?sel=wm_af');
    expect(c.lines.slice(1)).toEqual([
      'HCP-1065 tractography atlas. Licence: CC BY-SA 4.0.',
      'DISTAL Medium (Ewert 2017); CIT168 subcortical atlas. Licence: GPL-3.0.',
    ]);
  });
  it('short: the sources and the credits page; the templates’ notice whenever slices are drawn', () => {
    const c = captionText({ ...credits, templateSlices: true }, 'short', 't', 'h', 'https://openneuroatlas.net/dbs/#/credits', date);
    expect(c.lines[1]).toBe('Sources: HCP-1065 tractography atlas; DISTAL Medium (Ewert 2017); CIT168 subcortical atlas. Licences and attribution: https://openneuroatlas.net/dbs/#/credits');
    expect(c.lines[2]).toMatch(/^MRI slices: ICBM 2009b nonlinear asymmetric templates\. Copyright \(C\) 1993–2004 Louis Collins/);
    expect(captionText({ ...credits, templateSlices: true }, 'full', 't', 'h', 'c', date).lines.at(-1)).toMatch(/^MRI slices:/);
    expect(captionText(credits, 'full', 't', 'h', 'c', date).lines.some((l) => /MRI slices/.test(l))).toBe(false);
  });
  it('lists the cards’ references last, a reference to a line, when asked', () => {
    const c = captionText(credits, 'full', 't', 'h', 'c', date, ['Catani M. One. 2005.', 'Yeh FC. Two. 2022.']);
    expect(c.lines.at(-1)).toBe('References cited in the cards:\nCatani M. One. 2005.\nYeh FC. Two. 2022.');
    expect(captionText(credits, 'full', 't', 'h', 'c', date).lines.some((l) => /References/.test(l))).toBe(false);
  });
  it('breaks lines between words, a word longer than the line on its own', () => {
    const ctx = { measureText: (t: string) => ({ width: t.length }) as TextMetrics };
    expect(wrap(ctx, 'one two three four', 9)).toEqual(['one two', 'three', 'four']);
    expect(wrap(ctx, 'a https://openneuroatlas.net/tracts/ b', 10)).toEqual(['a', 'https://openneuroatlas.net/tracts/', 'b']);
    expect(wrap(ctx, '', 10)).toEqual([]);
  });
});
