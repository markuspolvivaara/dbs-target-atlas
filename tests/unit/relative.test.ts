import { describe, expect, it } from 'vitest';
import { landmarkLabel, offsetWords } from '../../src/ui/relative';
import { decodeSkull, defaultSkullState, encodeSkull } from '../../src/skullbase/state';
import { decodeVe, defaultVeState, encodeVe } from '../../src/ventricles/state';

// The roadmap's "coordinate readout relative to a chosen landmark": the read-out gives a pointed position from a
// landmark the reader picks, in the patient's directions (the frames are right-anterior-superior, in mm)
describe('positions from a chosen landmark', () => {
  it('names a landmark with its side', () => {
    expect(landmarkLabel({ name: 'Foramen ovale', side: 'R' })).toBe('Foramen ovale (right)');
    expect(landmarkLabel({ name: 'Foramen ovale', side: 'L' })).toBe('Foramen ovale (left)');
    expect(landmarkLabel({ name: 'Bregma', side: 'M' })).toBe('Bregma');
  });
  it('says right or left, in front or behind, above or below, and the straight distance', () => {
    expect(offsetWords({ x: 3, y: -4, z: 12 }, [0, 0, 0])).toBe('3.0 mm right · 4.0 mm behind · 12.0 mm above · 13.0 mm in a straight line');
    expect(offsetWords({ x: -2, y: 6.25, z: -1 }, [1, 1, 1])).toBe('3.0 mm left · 5.3 mm in front · 2.0 mm below · 6.4 mm in a straight line');
    // (no direction for a distance that rounds to nothing)
    expect(offsetWords({ x: 5, y: 5.01, z: 5 }, [5, 5, 5])).toBe('0 mm across · 0 mm front to back · 0 mm up or down · 0.0 mm in a straight line');
  });
  it('keeps the landmark in a link, on the skull base and the ventricles', () => {
    const s = { ...defaultSkullState(), from: 'lm_foramen_ovale_r' };
    expect(encodeSkull(s)).toContain('fr=lm_foramen_ovale_r');
    expect(decodeSkull(encodeSkull(s)).from).toBe('lm_foramen_ovale_r');
    expect(decodeSkull(encodeSkull(defaultSkullState())).from).toBeNull();
    // (a link's value that is no landmark id is dropped: the page then checks it names a landmark)
    expect(decodeSkull('#/atlas?g=floor&fr=<b>').from).toBeNull();
    const v = { ...defaultVeState(), from: 'lm_bregma' };
    expect(decodeVe(encodeVe(v)).from).toBe('lm_bregma');
    expect(decodeVe(encodeVe(defaultVeState())).from).toBeNull();
  });
});
