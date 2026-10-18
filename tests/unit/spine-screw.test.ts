import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import published from '../../src/data/generated/spine-published.json';
import { SP } from '../../src/spine';
import { crossCheckContent, TECHNIQUES } from '../../src/spine/content';
import { anglesOf, decodeField, direction, evaluate, grRobbins, movedEntry, SCREW_LEVELS, sdfAt, type ScrewSide, type TechniqueId, type V3 } from '../../src/spine/screw';

function field(level: string) {
  const lv = SCREW_LEVELS[level];
  const raw = gunzipSync(readFileSync(new URL(`../../public/${lv.file}`, import.meta.url)));
  return decodeField(level, lv, raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
}

describe('virtual screw data (pipeline/spine_screw.py)', () => {
  it('covers L1-L5 with both techniques and S1 with the tricortical screw; every structure at risk exists', () => {
    expect(Object.keys(SCREW_LEVELS)).toEqual(['L1', 'L2', 'L3', 'L4', 'L5', 'S1']);
    for (const lv of ['L1', 'L2', 'L3', 'L4', 'L5']) expect(Object.keys(SCREW_LEVELS[lv].start).sort(), lv).toEqual(['cbt', 'tt']);
    expect(Object.keys(SCREW_LEVELS.S1.start)).toEqual(['s1']);
    for (const lv of Object.values(SCREW_LEVELS)) for (const r of lv.risk) expect(SP.has(r.id), r.id).toBe(true);
    for (const t of Object.values(TECHNIQUES)) for (const l of t.levels) expect(SCREW_LEVELS[l]?.start[t.id], `${t.id} ${l}`).toBeTruthy();
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
  it('the browser evaluation matches the pipeline reference for every start position', () => {
    for (const [name, lv] of Object.entries(SCREW_LEVELS)) {
      const f = field(name);
      for (const [key, ref] of Object.entries(lv.check)) {
        const [tech, sd] = key.split('.') as [TechniqueId, ScrewSide];
        const st = lv.start[tech]![sd];
        const r = evaluate(f, lv, sd, st.entry, st.dir, st.size.length, st.size.diameter / 2);
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
