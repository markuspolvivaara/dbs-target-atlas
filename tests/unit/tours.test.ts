import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TOURS } from '../../src/skullbase/tours';
import { APPROACH } from '../../src/skullbase/approaches';
import { SB_GROUP } from '../../src/skullbase/groups';
import { decodeSkull, encodeSkull } from '../../src/skullbase/state';

// the default model's structures (the tours' views are in it)
const V3 = new Set((JSON.parse(readFileSync(new URL('../../src/data/generated/sbv3-manifest.json', import.meta.url), 'utf8')) as { structures: { id: string }[] }).structures.map((s) => s.id));

describe('teaching tours (skull base)', () => {
  it('each step’s text is a sentence already on its approach card, with the same sources: nothing new is said', () => {
    for (const t of TOURS) {
      const ap = APPROACH.get(t.approach)!;
      expect(ap, t.id).toBeTruthy();
      const claims = ap.sections.flatMap((x) => x.claims);
      for (const st of t.steps) {
        const c = claims.find((x) => x.text === st.text);
        expect(c, `${t.id}: "${st.title}"`).toBeTruthy();
        expect(st.refIds, `${t.id}: "${st.title}"`).toEqual(c!.refIds);
      }
    }
  });
  it('each step is one of the approach’s own views, its selection in the model', () => {
    for (const t of TOURS) {
      expect(t.steps.length, t.id).toBeGreaterThanOrEqual(2);
      for (const st of t.steps) {
        const s = decodeSkull(`#/atlas?${st.link}`);
        expect(SB_GROUP.get(s.grp)?.approach, `${t.id}: ${st.link}`).toBe(t.approach);
        if (s.sel) expect(V3.has(s.sel), `${t.id}: ${s.sel}`).toBe(true);
      }
    }
  });
  it('the link holds the tour and its step', () => {
    const t = TOURS[0];
    const s = { ...decodeSkull(`#/atlas?${t.steps[2].link}`), tour: t.id, ts: 3 };
    const back = decodeSkull(encodeSkull(s));
    expect([back.tour, back.ts]).toEqual([t.id, 3]);
    expect(encodeSkull(s)).toMatch(/[?&]tour=pterional&ts=3\b/);
    // a link without a tour has none; a broken step number is the first
    expect(decodeSkull('#/atlas?g=transsylvian').tour).toBeNull();
    expect(decodeSkull('#/atlas?g=transsylvian&tour=pterional&ts=x').ts).toBe(1);
  });
});
