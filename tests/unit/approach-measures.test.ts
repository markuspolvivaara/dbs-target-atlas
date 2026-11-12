import { describe, expect, it } from 'vitest';
import v3 from '../../src/data/generated/sbv3-approaches.json';
import v1 from '../../src/data/generated/sb-approaches.json';
import v3Manifest from '../../src/data/generated/sbv3-manifest.json';
import v1Manifest from '../../src/data/generated/sb-manifest.json';
import { meshSoup } from './glb';

/**
 * What a craniotomy's card says of its opening is measured on the bone removed as it is drawn
 * (pipeline/skullbase_v3_approach.py, Removed), not taken from the outline or the rule's parameters the cut was drawn
 * with. The audit's findings AP-04, AP-05 and AP-09: the LSO flap was given as 1482 mm² and "larger than the published
 * mean" (it measures less than the mean on the default model), the pterional's sphenoid ridge as drilled "to 12 mm
 * from the anterior clinoid process" (the bone removed ends 36 mm from it there), the orbitozygomatic piece as 22.3 ml
 * (the piece drawn is 18.9 ml), the suboccipital flap as "25 mm to each side" (it reaches 30).
 */
type Geom = { how: string; removedMl: number; removed: string; measured?: Record<string, number> };
const MODELS: [string, Record<string, Geom>, { structures: { id: string; file: string; derivation: string }[] }][] = [
  ['the default model (this CT)', v3 as unknown as Record<string, Geom>, v3Manifest as never],
  ['the Z-Anatomy model', v1 as unknown as Record<string, Geom>, v1Manifest as never],
];
const IDS = ['pterional', 'lso', 'interhemispheric', 'suboccipital', 'retrosigmoid', 'orbitozygomatic', 'far_lateral', 'kawase'];
const LSO_MEAN = 1275;   // mm², Cha 2012

/** A closed surface's volume (ml). */
function volumeMl(P: Float64Array, T: Uint32Array): number {
  let v = 0;
  for (let t = 0; t < T.length; t += 3) {
    const a = 3 * T[t], b = 3 * T[t + 1], c = 3 * T[t + 2];
    v += P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) + P[a + 1] * (P[b + 2] * P[c] - P[b] * P[c + 2]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c]);
  }
  return Math.abs(v) / 6000;
}

describe.each(MODELS)('craniotomies on %s: the cards give what the cut measures', (_name, geom, manifest) => {
  it('every opening has its measures, and no description is left with an unfilled value', () => {
    expect(Object.keys(geom).sort()).toEqual([...IDS].sort());
    for (const id of IDS) {
      const g = geom[id];
      expect(g.how, id).not.toContain('<<');
      expect(g.measured?.faceOnMm2, id).toBeGreaterThan(400);
      // the removed bone's own card carries the same words
      const it_ = manifest.structures.find((s) => s.id === g.removed)!;
      expect(it_.derivation, id).toBe(`The bone the ${(geom[id] as unknown as { name: string }).name.toLowerCase()} removes: ${g.removedMl} ml. ${g.how}`);
    }
  });

  it('the volume given is the volume of the piece that is drawn', async () => {
    for (const id of IDS) {
      const g = geom[id];
      const m = await meshSoup(manifest.structures.find((s) => s.id === g.removed)!.file);
      expect(Math.abs(volumeMl(m.P, m.T) - g.removedMl), `${id}: ${g.removedMl} ml stated`).toBeLessThan(0.2);
    }
  }, 60_000);

  it('the areas in the text are the measured ones, and the LSO is compared with the published mean as it measures', () => {
    for (const id of ['lso', 'interhemispheric', 'suboccipital', 'retrosigmoid', 'far_lateral']) {
      expect(geom[id].how, id).toContain(`covers about ${geom[id].measured!.faceOnMm2} mm² seen face on`);
    }
    const lso = geom.lso;
    const r = lso.measured!.faceOnMm2 / LSO_MEAN;
    const said = /mm² seen face on, (about the size of|(\d+) % (smaller|larger) than) the mean LSO craniotomy of 1275 mm²/.exec(lso.how);
    expect(said, lso.how).toBeTruthy();
    if (Math.abs(r - 1) < 0.05) expect(said![1]).toBe('about the size of');
    else {
      expect(said![3]).toBe(r < 1 ? 'smaller' : 'larger');
      expect(Number(said![2])).toBe(Math.round(Math.abs(100 * (r - 1))));
    }
    expect(lso.how).not.toContain('on purpose');
    // the outline it was drawn with is given too, as what it is
    expect(lso.how).toContain(`(${lso.measured!.outlineMm2} mm² seen face on as drawn)`);
  });

  it('the pterional says how near the bone removed comes to the anterior clinoid process; the suboccipital how far it reaches', () => {
    for (const id of ['pterional', 'orbitozygomatic']) {
      const m = geom[id].measured!;
      // (whole millimetres in the text: within half a millimetre of the measure, whichever way a half is rounded)
      const said = (re: RegExp) => Number(re.exec(geom[id].how)?.[1] ?? NaN);
      expect(Math.abs(said(/as cut, the bone removed ends (\d+) mm from the process/) - m.removedToClinoidMm), id).toBeLessThanOrEqual(0.5);
      expect(Math.abs(said(/(\d+) mm from the notch/) - m.frontalHoleFromNotchMm), id).toBeLessThanOrEqual(0.5);
      expect(Math.abs(said(/(\d+) mm from that landmark/) - m.keyholeFromLandmarkMm), id).toBeLessThanOrEqual(0.5);
    }
    const so = geom.suboccipital.measured!;
    const reach = /it reaches (\d+) mm to the left and (\d+) mm to the right of the midline/.exec(geom.suboccipital.how)!;
    expect(Math.abs(Number(reach[1]) - so.leftMm)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(Number(reach[2]) - so.rightMm)).toBeLessThanOrEqual(0.5);
    expect(geom.suboccipital.how).toContain(`faces ${so.facesBelowHorizontalDeg}° below the horizontal`);
    const rs = geom.retrosigmoid.measured!;
    expect(rs.toTransverseSinusMm).toBeGreaterThanOrEqual(0);
    if (rs.toTransverseSinusMm >= 0.05 && rs.toSigmoidSinusMm >= 0.05) {
      expect(geom.retrosigmoid.how).toContain(`comes within ${rs.toTransverseSinusMm.toFixed(1)} mm of the transverse sinus and ${rs.toSigmoidSinusMm.toFixed(1)} mm of the sigmoid`);
    } else expect(geom.retrosigmoid.how).toContain('as they are drawn');
  });
});

describe('craniotomies on the default model: what the audit measured', () => {
  const g = v3 as unknown as Record<string, Geom>;
  it('the LSO opening is not larger than the published mean; the ridge drilling stops far from the clinoid process', () => {
    expect(g.lso.measured!.faceOnMm2).toBeLessThan(LSO_MEAN);
    expect(g.pterional.measured!.removedToClinoidMm).toBeGreaterThan(30);
    expect(g.orbitozygomatic.removedMl).toBeLessThan(20);
    expect(g.suboccipital.measured!.leftMm).toBeGreaterThan(28);
  });
});
