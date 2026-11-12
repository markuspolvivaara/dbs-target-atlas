import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import published from '../../src/data/generated/spine-published.json';
import { SP } from '../../src/spine';
import { crossCheckContent, TECHNIQUES } from '../../src/spine/content';
import { anglesOf, decodeField, direction, evaluate, grRobbins, movedEntry, SCREW_LEVELS, screwDefaults, screwKey, sdfAt, type ScrewSide, type TechniqueId, type V3 } from '../../src/spine/screw';
import { decodeSpine, defaultSpineState, encodeSpine, SCREW_RANGE } from '../../src/spine/state';

const DEEP_MAX = 5;   // vertices of a neighbour that may lie more than 1 mm inside a level's bone
function field(level: string) {
  const lv = SCREW_LEVELS[level];
  const raw = gunzipSync(readFileSync(new URL(`../../public/${lv.file}`, import.meta.url)));
  return decodeField(level, lv, raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
}

describe('virtual screw data (pipeline/spine_screw.py)', () => {
  it('covers C3-C6 (lateral mass), C7 (pedicle), T1-T12 (straight-forward, anatomic), L1-L5 (traditional, cortical) and S1 (tricortical); every structure at risk exists', () => {
    const T = Array.from({ length: 12 }, (_, i) => `T${i + 1}`);
    expect(Object.keys(SCREW_LEVELS)).toEqual(['C1', 'C2', 'C1-C2', 'C3', 'C4', 'C5', 'C6', 'C7', ...T, 'L1', 'L2', 'L3', 'L4', 'L5', 'S1']);
    expect(Object.keys(SCREW_LEVELS.C1.start)).toEqual(['c1lm']);
    expect(Object.keys(SCREW_LEVELS.C2.start).sort()).toEqual(['c2p', 'c2pars', 'c2tl', 'od']);
    expect(Object.keys(SCREW_LEVELS['C1-C2'].start)).toEqual(['ta']);
    for (const lv of ['C3', 'C4', 'C5', 'C6']) expect(Object.keys(SCREW_LEVELS[lv].start).sort(), lv).toEqual(['an', 'mg', 'rc']);
    expect(Object.keys(SCREW_LEVELS.C7.start)).toEqual(['cp']);
    for (const lv of T) expect(Object.keys(SCREW_LEVELS[lv].start).sort(), lv).toEqual(['at', 'st']);
    for (const lv of ['L1', 'L2', 'L3', 'L4', 'L5']) expect(Object.keys(SCREW_LEVELS[lv].start).sort(), lv).toEqual(['cbt', 'tt']);
    expect(Object.keys(SCREW_LEVELS.S1.start)).toEqual(['s1']);
    for (const lv of Object.values(SCREW_LEVELS)) for (const r of lv.risk) expect(SP.has(r.id), r.id).toBe(true);
    for (const t of Object.values(TECHNIQUES)) for (const l of t.levels) expect(SCREW_LEVELS[screwKey(l, t.id)]?.start[t.id], `${t.id} ${l}`).toBeTruthy();
    expect(crossCheckContent()).toEqual([]);
  });
  it('pedicle measurements sit near the published values (wide bounds: one subject)', () => {
    for (const lv of ['L1', 'L2', 'L3', 'L4', 'L5'] as const) {
      const pub = published.levels[lv];
      const wMin = Math.min(...Object.values(pub.widthRegionalMeans));
      for (const sd of ['L', 'R'] as const) {
        const p = SCREW_LEVELS[lv].pedicle![sd];
        expect(p.width, `${lv}${sd}`).toBeGreaterThan(wMin - 3);
        expect(p.transverseAngle, `${lv}${sd}`).toBeGreaterThan(0);
        expect(p.transverseAngle, `${lv}${sd}`).toBeLessThan(pub.transverseAngleNigeria.meanSd[0] + 2 * pub.transverseAngleNigeria.meanSd[1]);
      }
    }
  });
  it('an axis held to the published range lies inside it, says what the free fit gave, and costs less clearance than half a voxel', () => {
    // (the reviewer's decision of 12 November 2026: T1 on the left, and no other pedicle)
    const held = Object.entries(SCREW_LEVELS).flatMap(([lv, d]) => (['L', 'R'] as const).filter((sd) => d.pedicle?.[sd].held).map((sd) => `${lv}${sd}`));
    expect(held).toEqual(['T1L']);
    const p = SCREW_LEVELS.T1.pedicle!.L, k = p.held!;
    const means = Object.values((published.thoracic as Record<string, Record<string, Record<string, number>>>).T1.transverseAngleStudyMeans);
    expect(k.to).toEqual([Math.min(...means), Math.max(...means)]);
    expect(p.transverseAngle).toBeGreaterThanOrEqual(k.to[0]);
    expect(p.transverseAngle).toBeLessThanOrEqual(k.to[1]);
    // the free fit was outside the range (or there was nothing to hold), and its channel is the wider one, by little
    expect(k.freeTransverseAngle < k.to[0] || k.freeTransverseAngle > k.to[1]).toBe(true);
    expect(k.freeClearance).toBeGreaterThanOrEqual(k.clearance);
    expect(k.freeClearance - k.clearance).toBeLessThan(0.36);
    // the anatomic start screw runs along the held axis, as the card says
    expect(SCREW_LEVELS.T1.start.at!.L.dir).toEqual(p.dir);
    expect(SCREW_LEVELS.T1.start.at!.L.entry).toEqual(p.entry);
    // and the two sides of T1 now agree within a few degrees
    expect(Math.abs(p.transverseAngle - SCREW_LEVELS.T1.pedicle!.R.transverseAngle)).toBeLessThan(5);
  });
  it('thoracic pedicles sit near the published study means, and the start sizes follow the 80% rules', () => {
    for (let i = 1; i <= 12; i++) {
      const lv = `T${i}`;
      const pub = (published.thoracic as Record<string, Record<string, Record<string, number>>>)[lv];
      const lo = (k: string) => Math.min(...Object.values(pub[k])), hi = (k: string) => Math.max(...Object.values(pub[k]));
      for (const sd of ['L', 'R'] as const) {
        const p = SCREW_LEVELS[lv].pedicle![sd];
        expect(p.width, `${lv}${sd} width`).toBeGreaterThan(lo('widthStudyMeans') - 1.5);
        expect(p.width, `${lv}${sd} width`).toBeLessThan(hi('widthStudyMeans') + 2);
        expect(p.transverseAngle, `${lv}${sd} angle`).toBeGreaterThan(lo('transverseAngleStudyMeans') - 10);
        expect(p.transverseAngle, `${lv}${sd} angle`).toBeLessThan(hi('transverseAngleStudyMeans') + 10);
        for (const t of ['st', 'at'] as const) {
          const size = SCREW_LEVELS[lv].start[t]![sd].size;
          expect(size.diameter, `${lv}${sd} ${t}`).toBe(Math.max(3.5, Math.floor((0.8 * p.width) / 0.5) * 0.5));
          expect(size.length % 5, `${lv}${sd} ${t}`).toBe(0);
        }
      }
    }
  });
  it('a level’s bone is its own: the vertebra below does not lie inside it', async () => {
    // (the bone a screw is judged in reached up to 2 mm into its neighbours at the facet joints: a screw crossing a
    // joint read as still in bone, and widths measured across a joint took in the neighbour's articular process)
    const { meshSoup } = await import('./glb');
    const order = [...[1, 2, 3, 4, 5, 6, 7].map((i) => `C${i}`), ...Array.from({ length: 12 }, (_, i) => `T${i + 1}`), ...[1, 2, 3, 4, 5].map((i) => `L${i}`)];
    let total = 0;
    for (const lv of order.slice(0, -1)) {
      if (!SCREW_LEVELS[lv]) continue;
      const f = field(lv);
      const { P } = await meshSoup(SP.get(`sp_${order[order.indexOf(lv) + 1].toLowerCase()}`)!.file);
      const hi = f.origin.map((o, i) => o + (f.dims[i] - 1) * f.step);
      let deep = 0;
      for (let i = 0; i < P.length; i += 3) {
        const p: V3 = [P[i], P[i + 1], P[i + 2]];
        if (p.some((x, k) => x < f.origin[k] || x > hi[k])) continue;
        if (sdfAt(f, p) < -1) deep++;   // more than 1 mm inside (the field's own grid is 1 mm)
      }
      expect(deep, `vertices of the vertebra below more than 1 mm inside ${lv}'s bone`).toBeLessThanOrEqual(DEEP_MAX);
      total += deep;
    }
    expect(total).toBeLessThanOrEqual(3 * DEEP_MAX);
  }, 60_000);
  it('lateral mass screws start inside their lateral mass, angled laterally as the techniques say, clear of the vertebral artery', () => {
    for (const lv of ['C3', 'C4', 'C5', 'C6']) {
      const L = SCREW_LEVELS[lv];
      for (const sd of ['L', 'R'] as const) {
        const m = L.lateralMass![sd];
        expect(m.width, `${lv}${sd}`).toBeGreaterThan(5);
        expect(m.height, `${lv}${sd}`).toBeGreaterThan(5);
        for (const [t, lateral] of [['rc', 10], ['mg', 25], ['an', 30]] as const) {
          const st = L.start[t]![sd];
          expect(anglesOf(L, sd, st.dir).medial, `${lv}${sd} ${t}`).toBeCloseTo(-lateral, 1);
          expect(st.size.diameter).toBe(3.5);
          const va = L.check[`${t}.${sd}`].nearest.find((x) => x.id === 'sp_vertebral_artery');
          if (va) expect(va.mm, `${lv}${sd} ${t}`).toBeGreaterThan(0);
        }
        // An is 15 deg more cephalad than the perpendicular Roy-Camille screw
        expect(anglesOf(L, sd, L.start.an![sd].dir).cranial - anglesOf(L, sd, L.start.rc![sd].dir).cranial).toBeCloseTo(15, 1);
        // on this CT the perpendicular (Roy-Camille) path leaves the vertebra through the facet joint with the one
        // below, and the data says so; the Magerl path, parallel to the joints, does not. A start screw is as long
        // as the vertebra's own bone along its path, and never shorter than the tool's shortest
        expect(L.start.rc![sd].joint?.with, `${lv}${sd}`).toBe(`C${Number(lv.slice(1)) + 1}`);
        expect(L.start.rc![sd].joint!.at, `${lv}${sd}`).toBe(L.start.rc![sd].chord);
        expect(L.start.mg![sd].joint, `${lv}${sd}`).toBeUndefined();
        for (const t of ['rc', 'mg', 'an'] as const) {
          expect(L.start[t]![sd].size.length, `${lv}${sd} ${t}`).toBe(Math.max(Math.floor(L.start[t]![sd].chord!), SCREW_RANGE.length[0]));
        }
      }
    }
    // at C3 the joint is met after less than the shortest screw: the start screw is that one, 6 mm
    for (const sd of ['L', 'R'] as const) {
      expect(SCREW_LEVELS.C3.start.rc![sd].joint!.at).toBeLessThan(SCREW_RANGE.length[0]);
      expect(SCREW_LEVELS.C3.start.rc![sd].size.length).toBe(SCREW_RANGE.length[0]);
    }
    // C7: the measured pedicle axis sits within the published study means (Jiang 2024, Table 4: 27.1-41.1 deg)
    for (const sd of ['L', 'R'] as const) {
      const p = SCREW_LEVELS.C7.pedicle![sd];
      expect(p.transverseAngle).toBeGreaterThan(27.1 - 5);
      expect(p.transverseAngle).toBeLessThan(41.1 + 5);
      expect(['A', 'B']).toContain(SCREW_LEVELS.C7.check[`cp.${sd}`].grade);
    }
  });
  it('C1-C2: start screws sized by the published lengths, clear of the vertebral artery; the C2 isthmus is measured', () => {
    for (const sd of ['L', 'R'] as const) {
      for (const [lv, t, max] of [['C1', 'c1lm', 40], ['C2', 'c2p', 40], ['C2', 'c2pars', 18], ['C2', 'c2tl', 32], ['C1-C2', 'ta', 50]] as const) {
        const st = SCREW_LEVELS[lv].start[t]![sd];
        expect(st.size.diameter).toBe(3.5);
        expect(st.size.length, `${lv}${sd} ${t}`).toBeLessThanOrEqual(max);
        expect(st.size.length, `${lv}${sd} ${t}`).toBeGreaterThanOrEqual(8);
        const va = SCREW_LEVELS[lv].check[`${t}.${sd}`].nearest.find((x) => x.id === 'sp_vertebral_artery');
        if (va) expect(va.mm, `${lv}${sd} ${t}`).toBeGreaterThan(0);
      }
      // C2 pedicle 45 deg medial (the most convergent of the AO's 30-45) and the pars screw straight forward (AO), both
      // along their bone (grade A); the translaminar screw dorsal to ventral along its lamina, entering across the
      // midline, wholly in bone early on
      expect(anglesOf(SCREW_LEVELS.C2, sd, SCREW_LEVELS.C2.start.c2p![sd].dir).medial).toBeCloseTo(45, 1);
      expect(Math.abs(anglesOf(SCREW_LEVELS.C2, sd, SCREW_LEVELS.C2.start.c2pars![sd].dir).medial)).toBeLessThan(0.5);
      // (the pars screw enters just above the C2-C3 joint: against C2's own bone, without the rim of C3's articular
      // process that used to count as C2, its surface comes within half a millimetre of leaving it there)
      expect(SCREW_LEVELS.C2.check[`c2p.${sd}`].grade, `c2p.${sd}`).toBe('A');
      expect(['A', 'B'], `c2pars.${sd}`).toContain(SCREW_LEVELS.C2.check[`c2pars.${sd}`].grade);
      for (const k of ['medial', 'lateral', 'superior', 'inferior']) expect(SCREW_LEVELS.C2.check[`c2pars.${sd}`].breach[k] ?? 0, `c2pars.${sd} ${k}`).toBeLessThan(1);
      const tl = -anglesOf(SCREW_LEVELS.C2, sd, SCREW_LEVELS.C2.start.c2tl![sd].dir).medial;
      expect(tl).toBeGreaterThanOrEqual(25);
      expect(tl).toBeLessThanOrEqual(65);
      expect(SCREW_LEVELS.C2.check[`c2tl.${sd}`].seated).toBeLessThan(8);
      const m = SCREW_LEVELS.C2.isthmus![sd];
      expect(m.isthmusHeight).toBeGreaterThan(2);
      expect(m.groove.height).toBeGreaterThan(0);
    }
  });
  it('odontoid screw: one midline screw from the front of the axis to the apex of the dens, through its tip', () => {
    const lv = SCREW_LEVELS.C2;
    const st = lv.start.od!.L;
    expect(st.ventral).toBe(true);
    expect(lv.start.od!.R).toEqual(st);
    const { origin, ey } = lv.frame;
    expect(st.entry.reduce((a, x, i) => a + (x - origin[i]) * ey[i], 0)).toBeGreaterThan(5);   // in front of the body
    const a = anglesOf(lv, 'L', st.dir, 'od');
    expect(Math.abs(a.medial)).toBeLessThan(5);                                                   // Figà 2025: < 5 deg
    expect(direction(lv, 'L', a.medial, a.cranial, 'od').every((x, i) => Math.abs(x - st.dir[i]) < 1e-3)).toBe(true);
    expect(st.size.diameter).toBe(4);
    const ck = lv.check['od.L'];
    expect(ck.breach.anterior).toBeGreaterThan(0);                                                // through the apical cortex
    expect(ck.nearest.find((x) => x.id === 'sp_dural_sac')!.mm).toBeGreaterThan(0);
    expect(decodeSpine(encodeSpine({ ...defaultSpineState(), region: 'cervical', level: 'C2', screw: { ...screwDefaults('C2', 'od', 'L'), side: 'R' } })).screw!.side).toBe('L');
  });

  it('every start position fits the sliders (a start outside them would be clamped in the browser and in links)', () => {
    for (const t of Object.values(TECHNIQUES)) for (const lv of t.levels) for (const sd of t.midline ? ['L'] as const : ['L', 'R'] as const) {
      const d = screwDefaults(lv, t.id, sd);
      for (const k of ['medial', 'cranial', 'length', 'diameter'] as const) {
        const [lo, hi] = SCREW_RANGE[k];
        expect(d[k], `${lv} ${t.id} ${sd} ${k}`).toBeGreaterThanOrEqual(lo);
        expect(d[k], `${lv} ${t.id} ${sd} ${k}`).toBeLessThanOrEqual(hi);
      }
      expect(decodeSpine(encodeSpine({ ...defaultSpineState(), region: lv.startsWith('C') ? 'cervical' : lv.startsWith('T') ? 'thoracic' : 'lumbar', level: lv, screw: d })).screw, `${lv} ${t.id} ${sd}`).toEqual(d);
    }
  });
  it('the browser evaluation matches the pipeline reference for every start position', () => {
    for (const [name, lv] of Object.entries(SCREW_LEVELS)) {
      const f = field(name);
      for (const [key, ref] of Object.entries(lv.check)) {
        const [tech, sd] = key.split('.') as [TechniqueId, ScrewSide];
        const st = lv.start[tech]![sd];
        const r = evaluate(f, lv, sd, st.entry, st.dir, st.size.length, st.size.diameter / 2, 3, tech);
        expect(r.grade, `${name} ${key}`).toBe(ref.grade);
        expect(r.seated, `${name} ${key}`).toBeCloseTo(ref.seated, 5);
        for (const [dir, mm] of Object.entries(ref.breach)) expect(r.breach[dir as 'medial'], `${name} ${key} ${dir}`).toBeCloseTo(mm, 1);
        expect(r.nearest.map((x) => x.id), `${name} ${key}`).toEqual(ref.nearest.map((x) => x.id));
        r.nearest.forEach((x, i) => expect(x.mm, `${name} ${key} ${x.id}`).toBeCloseTo(ref.nearest[i].mm, 1));
      }
    }
  });
  it('angles round-trip, the field is negative inside the bone, and the grades follow Gertzbein-Robbins', () => {
    const lv = SCREW_LEVELS.L4;
    const d = direction(lv, 'L', 17, -8);
    const a = anglesOf(lv, 'L', d);
    expect(a.medial).toBeCloseTo(17, 2); // the frame is stored to 5 decimals
    expect(a.cranial).toBeCloseTo(-8, 2);
    const f = field('L4');
    expect(sdfAt(f, lv.pedicle!.L.isthmus)).toBeLessThan(-1);
    expect(sdfAt(f, [lv.sdf.origin[0], lv.sdf.origin[1], lv.sdf.origin[2]] as V3)).toBeGreaterThan(5);
    expect([0, 1.9, 2.1, 5, 7].map(grRobbins)).toEqual(['A', 'B', 'C', 'D', 'E']);
    // moving the entry keeps it on the bone surface
    const st = lv.start.tt!.L;
    const e = movedEntry(f, lv, 'L', st.entry, st.dir, 2, -1);
    expect(Math.abs(sdfAt(f, e))).toBeLessThan(0.3);
  });
});
