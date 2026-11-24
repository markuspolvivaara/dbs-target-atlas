import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import * as THREE from 'three';
// (no page marker here: the Z-Anatomy model, Skull base v1)
import { ENDO_STANDOFF_MM, ENDONASAL, ScopePath, SinusVolume } from '../../src/skullbase/endonasal';
import { SB_MANIFEST } from '../../src/skullbase';
import { SB_GROUP } from '../../src/skullbase/groups';
import { XRAY } from '../../src/ui/skullbase-endonasal';

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
  it('the scope has room all the way to the sinus, and the burr opens its way in', () => {
    // (it stopped 26 mm in on both sides: under Z-Anatomy’s nasal bones the way was a slit 2–3 mm high against the
    // closure in front of the bones, less than the clear core the scope needs; nothing tested how far it went)
    const raw = gunzipSync(readFileSync(new URL(`../../public/${ENDONASAL.file}`, import.meta.url)));
    for (const side of ['L', 'R'] as const) {
      const vol = new SinusVolume(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
      const p = new ScopePath(side), opened = ENDONASAL.corridor[side].openedMm;
      const d = p.reach(vol);
      expect(d, side).toBeGreaterThan(opened - 2 * ENDO_STANDOFF_MM - 3);
      expect(d, side).toBeLessThan(p.pivotMm + 3);
      expect(p.inSinus(d), side).toBe(false);
      // as the panel drills: the burr along the scope's line, the scope following as far as it has room.
      // (Z-Anatomy's way comes to the sinus from below and beside it, not at its front wall: taking that piece away
      // opens nothing in the scope's line, the burr does)
      let stop: string | undefined;
      for (let round = 0; round < 25 && !stop; round++) {
        const { tip, dir } = p.pose(p.reach(vol));
        const ray = new THREE.Ray(tip, dir);
        for (let k = 0; k < 6; k++) {
          const hit = vol.hit(ray, 70);
          if (!hit) break;
          if (hit.stop) { stop = hit.stop; break; }
          vol.carve(hit.point);
        }
      }
      expect(stop, side).toBe('sellar');
      const after = p.reach(vol);
      expect(after, side).toBeGreaterThan(d + 10);
      expect(p.inSinus(after), side).toBe(true);
    }
  });
  it('says how wide the opened way is as drawn; Z-Anatomy’s gland is measured without its stalk and against the diaphragma', () => {
    for (const side of ['L', 'R'] as const) {
      // (the audit's MC-16) the way is opened to corridorMm across, but against the septum it is tighter in places:
      // the panel says the measured width, so it must be there, and no wider than the width it was opened to
      const f = ENDONASAL.corridor[side].freeMm!;
      expect(f, side).toBeDefined();
      expect(f.least, side).toBeGreaterThan(1);
      expect(f.least, side).toBeLessThanOrEqual(f.median);
      expect(f.median, side).toBeLessThanOrEqual(ENDONASAL.corridorMm + 0.5);
      expect(f.underShare, side).toBeGreaterThanOrEqual(0);
      expect(f.underShare, side).toBeLessThanOrEqual(1);
    }
    // (the audit's AP-11) Z-Anatomy's two lobes go on above the gland as a narrow neck: it is the stalk, and the gland
    // is measured without it. The gland's two parts, above and below the diaphragma's level, add up to its height
    const hy = ENDONASAL.hypophysis, g = hy.gland, below = g.belowDiaphragma!;
    expect(below).toBeDefined();
    expect(g.aboveDiaphragmaMm!).toBeGreaterThan(0);
    expect(below.heightMm).toBeGreaterThan(3);
    expect(below.heightMm).toBeLessThan(g.heightMm);
    expect(below.heightMm + g.aboveDiaphragmaMm!).toBeCloseTo(g.heightMm, 0);
    expect(below.mm3).toBeLessThan(g.mm3);
    // the gland is what the two lobes enclose together (it was once measured as a hollow skin, each lobe's surface a
    // voxel thick): the lobes fill it, and it is as wide as its meshes are
    expect(hy.adenoMm3 + hy.neuroMm3).toBeCloseTo(g.mm3, 0);
    const lobes = SB_MANIFEST.structures.filter((s) => ['sb_adenohypophysis', 'sb_neurohypophysis'].includes(s.id));
    expect(lobes).toHaveLength(2);
    expect(g.mm3).toBeGreaterThan(0.4 * g.widthMm * g.lengthMm * g.heightMm);   // (an ellipsoid fills 52 % of its box)
    // the stalk: named on the model, above the gland, far narrower than it
    const stalk = hy.stalk!;
    expect('fromZ' in stalk).toBe(true);
    if (!('fromZ' in stalk)) return;
    expect(hy.stalkMm3).toBeGreaterThan(5);
    expect(hy.stalkMm3).toBeLessThan(0.2 * g.mm3);
    expect(stalk.widthMm).toBeLessThan(0.5 * g.widthMm);
    expect(stalk.heightMm).toBeGreaterThan(2);
    const item = SB_MANIFEST.structures.find((s) => s.name === 'Pituitary stalk')!;
    expect(item, 'the stalk is one of v1’s structures').toBeDefined();
    for (const side of ['L', 'R'] as const) {
      expect(item.centroid![side][2]).toBeGreaterThan(stalk.fromZ);
      for (const l of lobes) expect(l.centroid![side][2], l.id).toBeLessThan(stalk.fromZ);
    }
  });
  it('each see-through group lights something on this model, the hypophysis with its stalk', () => {
    // (the Hypophysis group listed v3's names for the lobes only, and lit nothing on v1)
    const names = SB_GROUP.get('endonasal')!.structures.map((id) => SB_MANIFEST.structures.find((s) => s.id === id)!.name);
    for (const [id, , list] of XRAY) expect(names.filter((n) => list.includes(n)).length, id).toBeGreaterThan(0);
    const hyp = XRAY.find(([id]) => id === 'hypophysis')![2];
    for (const n of ['Adenohypophysis', 'Neurohypophysis', 'Pituitary stalk']) { expect(names, n).toContain(n); expect(hyp, n).toContain(n); }
  });
});
