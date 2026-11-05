import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
// (no page marker here: the Z-Anatomy model, Skull base v1)
import { ENDONASAL } from '../../src/skullbase/endonasal';

describe('endoscopic endonasal view on the Z-Anatomy model (Skull base v1)', () => {
  it('is v1’s own data: its sinus, a corridor in each side of the nose to it, and the fields as the browser loads them', () => {
    expect(ENDONASAL.file).toBe('assets/skullbase/endonasal.bin.gz');
    const raw = gunzipSync(readFileSync(new URL(`../../public/${ENDONASAL.file}`, import.meta.url)));
    expect(raw.length).toBe(ENDONASAL.dims[0] * ENDONASAL.dims[1] * ENDONASAL.dims[2] * ENDONASAL.params.fields.length);
    expect(ENDONASAL.sinus.volumeMl).toBeGreaterThan(1);
    expect(ENDONASAL.sinus.volumeMl).toBeLessThan(25);
    for (const side of ['L', 'R'] as const) {
      const c = ENDONASAL.corridor[side];
      // from the front of the nose, back to the sinus, on its own side of the midline at the start
      expect(c.points[0][1]).toBeGreaterThan(ENDONASAL.sinus.hi![1] + 20);
      expect(c.recess[1]).toBeLessThan(ENDONASAL.sinus.hi![1] + 6);
      expect(c.lengthMm).toBeLessThan(110);
    }
  });
  it('the steps are labelled in order and each holds something; Z-Anatomy’s hypophysis is the gland', () => {
    ENDONASAL.pieces.forEach((p, i) => { expect(p.label, p.id).toBeGreaterThanOrEqual(i + 1); expect(p.mm3, p.id).toBeGreaterThan(0); });
    expect(ENDONASAL.pieces.map((p) => p.id)).toEqual(expect.arrayContaining(['face', 'floor', 'dura', 'planum']));
    expect(ENDONASAL.hypophysis.gland.mm3).toBeGreaterThan(100);
    expect(ENDONASAL.hypophysis.adenoMm3).toBeGreaterThan(ENDONASAL.hypophysis.neuroMm3);
  });
});
