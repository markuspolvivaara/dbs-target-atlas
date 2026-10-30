import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

async function modules() {
  vi.resetModules();
  const g = globalThis as unknown as { document?: unknown };
  const had = 'document' in g;
  if (!had) g.document = { createElement: () => ({}) };
  const index = await import('../../src/vascular');
  const groups = await import('../../src/vascular/groups');
  const scene = await import('../../src/vascular/scene');
  const state = await import('../../src/vascular/state');
  if (!had) delete g.document;
  return { index, groups, scene, state };
}

describe('vascular section', async () => {
  const { index: I, groups: G, scene: S, state: T } = await modules();

  it('parses, and its content, references and lesions agree', () => {
    expect(I.crossCheckVa()).toEqual([]);
    expect(I.LESIONS.filter((l) => l.kind === 'aneurysm')).toHaveLength(8);
    expect(I.LESIONS.filter((l) => l.kind === 'avm').map((l) => l.id)).toEqual(['avm1', 'avm3', 'avm5']);
    for (const g of G.VA_GROUPS) for (const l of g.lesions) expect(I.LESION.has(l), `${g.id}: ${l}`).toBe(true);
  });

  it('grades each drawn AVM as Spetzler–Martin does: size bands, eloquence and deep drainage add up', () => {
    for (const l of I.LESIONS.filter((x) => x.kind === 'avm')) {
      const sm = l.sm!;
      const size = l.nidusMm! < 30 ? 1 : l.nidusMm! <= 60 ? 2 : 3;          // under 3 cm, 3-6 cm, over 6 cm (Naranbhai 2023)
      expect(sm.size, l.id).toBe(size);
      const deep = (l.drainage ?? []).some((d) => typeof d !== 'string' && d.kind === 'deep');
      expect(sm.deep, l.id).toBe(deep ? 1 : 0);
      expect(sm.grade, l.id).toBe(sm.size + sm.eloquence + sm.deep);
    }
    expect(I.LESION.get('avm1')!.sm!.grade).toBe(1);
    expect(I.LESION.get('avm3')!.sm!.grade).toBe(3);
    expect(I.LESION.get('avm5')!.sm!.grade).toBe(5);
    expect([1, 2, 3, 4, 5].map(I.ponceClass)).toEqual(['A', 'A', 'B', 'C', 'C']);     // Hofman 2018
  });

  it('draws each nidus as a network of its graded size: compact for I and III, diffuse for V, with a fistulous channel', () => {
    for (const l of I.LESIONS.filter((x) => x.kind === 'avm')) {
      const n = (l as unknown as { nidus: { measuredMm: number; type: string; plexiform: number; fistulous: number } }).nidus;
      expect(Math.abs(n.measuredMm - l.nidusMm!), l.id).toBeLessThanOrEqual(0.05 * l.nidusMm!);
      expect(n.type, l.id).toBe(l.id === 'avm5' ? 'diffuse' : 'compact');
      expect(n.plexiform, l.id).toBeGreaterThan(90);
      expect(n.fistulous, l.id).toBeGreaterThanOrEqual(1);
    }
  });

  it('draws the fistulas by type: Barrow A and D, Borden II', () => {
    expect(I.LESION.get('ccfa')!.barrow).toBe('A');
    expect(I.LESION.get('ccfd')!.barrow).toBe('D');
    expect(I.LESION.get('davf')!.borden).toBe(2);
    // a direct fistula fills the ophthalmic veins early, and dilated
    expect(I.LESION.get('ccfa')!.parts.some((p) => p.endsWith('superior_ophthalmic_vein'))).toBe(true);
  });

  it('shows a lesion in place of the vessels it changes, and hides bone and brain in the angiogram', () => {
    const s = T.defaultVaState();
    s.grp = 'avm3';
    const p = S.vaPlan(s);
    const { parts, replaced } = S.lesionParts('avm3');
    for (const id of parts) expect(p.looks.get(id), id).toBe('primary');
    for (const id of replaced) expect(p.looks.get(id), id).toBe('hidden');
    expect(p.looks.get(G.BRAIN[0])).toBe('context');
    s.dsa.on = true;
    const q = S.vaPlan(s);
    expect(q.looks.get(G.BRAIN[0])).toBe('hidden');
    expect(q.looks.get(G.BONES[0])).toBe('hidden');
  });

  it('outlines a fistula, its reflux and the sinus, with the normal vessels stepped back; not in the angiogram', () => {
    const s = T.defaultVaState();
    s.grp = 'davf';
    const p = S.vaPlan(s);
    expect(p.outline?.[0]).toBe('va_davf__fistula');
    expect(p.outline).toEqual(expect.arrayContaining(['va_davf__inferior_anastomotic_vein_of_labbe', 'va_davf__transverse_sinus', 'va_davf__sigmoid_sinus']));
    expect(p.outline).not.toContain('va_davf__feeders');
    expect(p.looks.get(G.ARTERIES[0])).toBe('context');
    expect(p.focusIds).toContain('va_davf__inferior_anastomotic_vein_of_labbe');
    s.dsa.on = true;
    const q = S.vaPlan(s);
    expect(q.outline).toBeUndefined();
    expect(q.looks.get(G.ARTERIES[0])).toBe('primary');
    s.grp = 'avm3'; s.dsa.on = false;
    expect(S.vaPlan(s).outline).toBeUndefined();
  });

  it('times the angiogram: arteries, then veins; a lesion’s veins before the normal venous phase', () => {
    const d = I.DSA;
    expect(d.arterialS[1]).toBeLessThan(d.venStartS);
    expect(d.venousS[0]).toBeGreaterThanOrEqual(d.venStartS);
    // every vessel and lesion GLB carries its timing
    for (const id of I.LESION.get('avm3')!.parts) {
      const f = `public/${I.VA.get(id)!.file}`;
      expect(existsSync(f), f).toBe(true);
      expect(readFileSync(f).includes(Buffer.from('_ARRIVAL')), f).toBe(true);
    }
  });

  it('grading tables: the classes, the drawn rows and the counts agree', async () => {
    const T2 = await import('../../src/vascular/grading');
    const roman = ['I', 'II', 'III', 'IV', 'V'];
    for (const r of T2.SM_GRADES.rows) expect(r.cells[1], r.cells[0]).toBe(I.ponceClass(roman.indexOf(r.cells[0]) + 1));
    for (const r of T2.SM_GRADES.rows.filter((x) => x.drawn)) expect(roman[I.LESION.get(r.drawn!)!.sm!.grade - 1]).toBe(r.cells[0]);
    for (const r of T2.SUPP_POINTS.rows.filter((x) => x.drawn)) {
      const n = (I.LESION.get(r.drawn!) as unknown as { nidus: { type: string } }).nidus;
      expect(r.cells[1]).toBe(n.type);
    }
    // Hafez 2019: 200 patients in each table; each percentage is its count's
    for (const t of [T2.SM_GRADES, T2.SUPP_GRADES]) {
      let total = 0;
      for (const r of t.rows) {
        const m = /(\d+) % \((\d+) of (\d+)\)/.exec(r.cells[r.cells.length - 1])!;
        expect(Math.round((100 * Number(m[2])) / Number(m[3])), `${t.id} ${r.cells[0]}`).toBe(Number(m[1]));
        total += Number(m[3]);
      }
      expect(total, t.id).toBe(200);
    }
    expect(T.decodeVa('#/grading').page).toBe('grading');
  });

  it('shows a treatment in place of its aneurysm: clip and coils stop the filling, a flow diverter slows it', () => {
    const s = T.defaultVaState();
    s.grp = 'aneurysms';
    expect(I.TREATMENTS.map((x) => x.id)).toEqual(['clip', 'coil', 'fd']);
    for (const t of I.TREATMENTS) {
      s.treat = t.id;
      const p = S.vaPlan(s);
      const treats = (t as unknown as { treats: string }).treats;
      expect(p.looks.get(`va_${treats}__sac`), t.id).toBe('hidden');
      for (const part of t.parts) expect(p.looks.get(part), part).not.toBe('hidden');
    }
    s.treat = 'fd';
    expect(S.vaPlan(s).looks.get('va_fd__device')).toBe('alt');
    // a treatment is the Aneurysms view's alone
    s.grp = 'avm1';
    expect(S.lesionParts('avm1', 'clip').parts.some((x) => x.startsWith('va_clip'))).toBe(false);
  });

  it('draws the circle of Willis variants on the right, in place of this CT’s own arteries', () => {
    for (const [grp, seg] of [['fetal', 'va_posterior_cerebral_artery_p1_p2'], ['a1hypo', 'va_anterior_cerebral_artery_a1_a2']] as const) {
      const s = T.defaultVaState();
      s.grp = grp;
      const p = S.vaPlan(s);
      expect(p.looks.get(seg), grp).toBe('hidden');
      expect(p.looks.get(`va_${grp}__${seg.slice(3)}`), grp).toBe('primary');
    }
  });

  it('round-trips its state through the link', () => {
    const s = T.defaultVaState();
    s.grp = 'ccfa'; s.dsa = { on: true, t: 1.4 }; s.layers.cortex.opacity = 0.3; s.layers.nuclei.on = false; s.sel = 'va_ccfa__fistula';
    s.treat = 'coil';
    const t = T.decodeVa(T.encodeVa(s));
    expect(t.treat).toBe('coil');
    expect(t.grp).toBe('ccfa');
    expect(t.dsa).toEqual({ on: true, t: 1.4 });
    expect(t.layers.cortex.opacity).toBeCloseTo(0.3);
    expect(t.layers.nuclei.on).toBe(false);
    expect(t.sel).toBe('va_ccfa__fistula');
  });
});
