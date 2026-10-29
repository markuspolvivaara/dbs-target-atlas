import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { ENDO_STOPS, ENDO_STOP_MM, ENDO_TARGET, ENDONASAL, ScopePath, SinusVolume, type EndoSide } from '../../src/skullbase/endonasal';

/** The volume as the browser loads it (the asset, decompressed). */
function volume(): SinusVolume {
  const gz = readFileSync(new URL(`../../public/${ENDONASAL.file}`, import.meta.url));
  const raw = gunzipSync(gz);
  return new SinusVolume(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
}

/** As the panel drills: the scope as far as it goes, the burr along its line in 0.25-mm steps, up to `steps` a round. */
function drillOn(vol: SinusVolume, path: ScopePath, rounds: number, steps = 6): { depths: number[]; stop: string | null } {
  const depths: number[] = [];
  let stop: string | null = null;
  for (let r = 0; r < rounds && !stop; r++) {
    const d = path.reach(vol);
    depths.push(d);
    const { tip, dir } = path.pose(d);
    const ray = new THREE.Ray(tip, dir);
    for (let k = 0; k < steps; k++) {
      const hit = vol.hit(ray, 70);
      if (!hit) break;
      if (hit.stop) { stop = hit.stop; break; }
      vol.carve(hit.point.clone().addScaledVector(dir, 0.25 - 1.5));
    }
  }
  return { depths, stop };
}

describe('endoscopic endonasal view (Skull base v3)', () => {
  it('the CT: a sphenoid sinus of plausible size, and a corridor in each side of the nose to its front', () => {
    expect(ENDONASAL.sinus.volumeMl).toBeGreaterThan(5);
    expect(ENDONASAL.sinus.volumeMl).toBeLessThan(25);
    for (const side of ['L', 'R'] as EndoSide[]) {
      const c = ENDONASAL.corridor[side];
      // from the entry (the front of the scan) back to the sinus's front, on its own side of the midline at first
      expect(c.points[0][1]).toBeGreaterThan(30);
      expect(Math.sign(c.points[0][0])).toBe(side === 'R' ? 1 : -1);
      expect(c.recess[1]).toBeLessThan(28);
      expect(c.recess[1]).toBeGreaterThan(15);
      expect(c.lengthMm).toBeGreaterThan(8);
      expect(c.openedMm).toBeLessThan(c.lengthMm);
    }
  });

  it('the scope’s path: along the corridor, then straight on to the sella from its pivot', () => {
    for (const side of ['L', 'R'] as EndoSide[]) {
      const p = new ScopePath(side);
      expect(p.pose(0).tip.toArray()).toEqual(ENDONASAL.corridor[side].points[0]);
      expect(p.pose(p.length).tip.distanceTo(new THREE.Vector3(...ENDO_TARGET))).toBeLessThan(1e-6);
      // continuous at the pivot, and past it straight along the way it looks
      expect(p.pose(p.pivotMm - 0.01).tip.distanceTo(p.pose(p.pivotMm + 0.01).tip)).toBeLessThan(0.05);
      const a = p.pose(p.pivotMm + 2), b = p.pose(p.pivotMm + 6);
      expect(b.tip.clone().sub(a.tip).normalize().dot(a.dir)).toBeCloseTo(1, 5);
      // turned, it pivots there
      const t = p.pose(p.pivotMm + 5, 20, 0);
      expect(t.tip.distanceTo(p.pose(p.pivotMm).tip)).toBeCloseTo(5, 5);
    }
  });

  it('undrilled, the scope stops before the sinus: the sphenoid’s front wall (and its narrow ostium) are in the way', () => {
    const vol = volume();
    for (const side of ['L', 'R'] as EndoSide[]) {
      const p = new ScopePath(side);
      const d = p.reach(vol);
      expect(d).toBeGreaterThan(3);
      expect(d).toBeLessThan(p.pivotMm + 3);
      expect(vol.inAir(p.pose(d).tip)).toBe(true);
    }
  });

  it('drilling where the scope looks opens its way into the sinus; the burr then stops at the sellar contents, clear of the carotids', () => {
    for (const side of ['L', 'R'] as EndoSide[]) {
      const vol = volume(), p = new ScopePath(side);
      const before = p.reach(vol);
      expect(p.inSinus(before)).toBe(false);
      const { depths, stop } = drillOn(vol, p, 25);
      expect(stop).toBe('sellar');
      // into the sinus, well past the pivot, with the sella a few mm ahead
      const after = p.reach(vol);
      expect(after).toBeGreaterThan(before + 10);
      expect(after).toBeGreaterThan(p.pivotMm + 10);
      expect(p.inSinus(after)).toBe(true);
      expect(depths.length).toBeLessThan(15);
      expect(vol.removedMm3.bone).toBeGreaterThan(5);
      // where the burr rests it keeps its distance from everything it must not enter
      const { tip, dir } = p.pose(after);
      const hit = vol.hit(new THREE.Ray(tip, dir), 70)!;
      const c = vol.clearance(hit.point.clone().addScaledVector(dir, -1.5));
      for (const k of ENDO_STOPS) expect(c[k], k).toBeGreaterThan(-1e-6 - ENDO_STOP_MM);
      expect(c.vessel).toBeGreaterThan(1);
    }
  });

  it('the burr does not pass a hole narrower than itself: it widens it', () => {
    const vol = volume(), p = new ScopePath('R');
    const d = p.reach(vol), { tip, dir } = p.pose(d);
    const ray = new THREE.Ray(tip, dir);
    // a 1-mm channel along the line through the front wall (narrower than the 3-mm burr)
    for (let t = 0; t < 12; t += 0.25) vol.carve(tip.clone().addScaledVector(dir, t), 1);
    const hit = vol.hit(ray, 70)!;
    // the burr comes to rest at the wall, not beyond it in the sinus
    expect(hit.t).toBeLessThan(6);
    expect(hit.stop).toBeUndefined();
  });
});

describe('endonasal pieces taken away step by step', () => {
  it('the pieces in the order of the operation, each of some size', () => {
    expect(ENDONASAL.pieces.map((p) => p.id)).toEqual(['face', 'septa', 'floor', 'dura', 'cs_R', 'cs_L', 'planum', 'clivus']);
    ENDONASAL.pieces.forEach((p, i) => { expect(p.label).toBe(i + 1); expect(p.mm3, p.id).toBeGreaterThan(50); });
  });

  it('the scope points at the sinus’s front wall; taking it away lets the scope into the sinus', () => {
    for (const side of ['L', 'R'] as EndoSide[]) {
      const vol = volume(), p = new ScopePath(side);
      const d = p.reach(vol), { tip, dir } = p.pose(d);
      const at = vol.surface(new THREE.Ray(tip, dir), 70)!;
      expect(vol.pieceAt(at, dir)?.id).toBe('face');
      vol.removePiece('face');
      expect(vol.removed.has('face')).toBe(true);
      const after = p.reach(vol);
      expect(after).toBeGreaterThan(d + 1);
      expect(p.inSinus(after), side).toBe(true);
      // gone: it is no longer pointed at
      expect(vol.pieceAt(at, dir)?.id).not.toBe('face');
      // with the sinus's septa gone too, on to near the sella
      vol.removePiece('septa');
      expect(p.reach(vol), side).toBeGreaterThan(p.pivotMm + 10);
    }
  });

  it('nothing opens next to a carotid (but the cavernous sinus, opened onto it), and undo puts a piece back', () => {
    const vol = volume();
    const before = vol.snapshot();
    const pieces = ENDONASAL.pieces.filter((pc) => !pc.id.startsWith('cs_'));
    for (const pc of pieces) vol.removePiece(pc.id);
    expect(vol.removed.size).toBe(pieces.length);
    const iso = ENDONASAL.params.fieldIso, step = ENDONASAL.params.distStepMm;
    let opened = 0;
    for (let x = 0; x < vol.fields.solid.length; x++) {
      if (vol.stops.vessel[x] * step < 0.5 && before.solid[x] >= iso && vol.fields.solid[x] < iso) opened++;
    }
    expect(opened).toBe(0);
    vol.restore(before);
    expect(vol.removed.size).toBe(0);
    expect(vol.fields.solid).toEqual(before.solid);
  });

  it('a piece taken away is put back as it was, the others staying away', () => {
    const vol = volume();
    const orig = vol.snapshot();
    vol.removePiece('face');
    const faceOnly = vol.snapshot();
    vol.removePiece('floor');
    vol.putBack('floor');
    expect(vol.removed.has('floor')).toBe(false);
    expect(vol.removed.has('face')).toBe(true);
    expect(vol.fields.solid).toEqual(faceOnly.solid);
    expect(vol.removedMm3.bone).toBeCloseTo(faceOnly.removed.bone, 6);
    vol.putBack('face');
    expect(vol.fields.solid).toEqual(orig.solid);
    expect(vol.removedMm3.bone).toBeCloseTo(0, 6);
  });
});

describe('the hypophysis modelled in this CT’s fossa', () => {
  it('a gland of normal size under the diaphragma, its posterior lobe a part of it', () => {
    const hy = ENDONASAL.hypophysis;
    // (Paudel 2025, 21–30 years: 9.4 x 12.3 x 5.4 mm; the model fills this CT's fossa)
    expect(hy.gland.widthMm).toBeGreaterThan(9); expect(hy.gland.widthMm).toBeLessThan(16);
    expect(hy.gland.lengthMm).toBeGreaterThan(7); expect(hy.gland.lengthMm).toBeLessThan(14);
    expect(hy.gland.heightMm).toBeGreaterThan(3); expect(hy.gland.heightMm).toBeLessThan(9);
    expect(hy.neuroMm3).toBeGreaterThan(0.05 * hy.gland.mm3);
    expect(hy.neuroMm3).toBeLessThan(0.4 * hy.gland.mm3);
    expect(hy.diaphragma.tuberculum[1]).toBeGreaterThan(hy.diaphragma.dorsum[1]);
  });

  it('the sellar floor stops short of it; opening the dura shows it to the scope', () => {
    const vol = volume(), p = new ScopePath('R');
    for (const id of ['face', 'septa', 'floor']) vol.removePiece(id);
    const look = () => { const d = p.reach(vol), { tip, dir } = p.pose(d); return { at: vol.surface(new THREE.Ray(tip, dir), 70)!, dir }; };
    const glandSeen = () => {
      const { at, dir } = look();
      const q = at.clone().applyMatrix4(vol.toIjk);
      return vol.glandAt(q, dir.clone().negate());
    };
    expect(glandSeen()).toBe(0);
    vol.removePiece('dura');
    expect(glandSeen()).toBe(1);
  });
});

describe('drilling down onto the carotid (an exercise in anatomy)', () => {
  it('the burr lays the carotid’s wall bare on each side, touching it, never into its lumen', () => {
    const vol = volume(), p = new ScopePath('R');
    for (const id of ['face', 'septa']) vol.removePiece(id);
    const tip = p.pose(Math.min(p.reach(vol), p.pivotMm + 8)).tip;
    const before = vol.fields.solid.slice();
    for (const side of [-1, 1]) {
      // the carotid's lumen nearest the scope on this side (below the clinoids)
      let best: THREE.Vector3 | null = null, bd = Infinity;
      const q = new THREE.Vector3();
      for (let i = 0; i < vol.nx; i++) for (let j = 0; j < vol.ny; j++) for (let k = 0; k < vol.nz; k++) {
        if (vol.stops.vessel[(i * vol.ny + j) * vol.nz + k] !== 0) continue;
        q.set(i, j, k).applyMatrix4(vol.toRas);
        if (Math.sign(q.x) !== side || Math.abs(q.x) < 4 || q.z > 12) continue;
        const d = q.distanceTo(tip);
        if (d < bd) { bd = d; best = q.clone(); }
      }
      const dir = best!.clone().sub(tip).normalize(), ray = new THREE.Ray(tip.clone(), dir);
      let stop: string | undefined;
      for (let n = 0; n < 300 && !stop; n++) {
        const hit = vol.hit(ray, 70);
        if (!hit) break;
        stop = hit.stop;
        if (!stop) vol.carve(hit.point.clone().addScaledVector(dir, 0.25 - 1.5));
        else expect(vol.clearance(hit.point.clone().addScaledVector(dir, -1.5)).vessel).toBeLessThan(0.15);
      }
      expect(stop, side > 0 ? 'right' : 'left').toBe('vessel');
    }
    const iso = ENDONASAL.params.fieldIso;
    let opened = 0;
    for (let x = 0; x < before.length; x++) if (vol.stops.vessel[x] === 0 && before[x] >= iso && vol.fields.solid[x] < iso) opened++;
    expect(opened).toBe(0);
  });
});
