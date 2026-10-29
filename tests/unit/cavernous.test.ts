import { describe, expect, it } from 'vitest';
import data from '../../src/data/generated/sbv3-cavernous.json';
import { CAVERNOUS } from '../../src/skullbase/cavernous';

type V = [number, number, number];
const nerves = (data as unknown as { nerves: Record<'R' | 'L', Record<string, V[]>> }).nerves;
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V) => Math.hypot(...a);
/** a nerve's point nearest a coronal plane y (frame mm) */
const at = (P: V[], y: number) => P.reduce((b, p) => (Math.abs(p[1] - y) < Math.abs(b[1] - y) ? p : b));

describe('the cavernous sinus modelled on this CT (Skull base v3)', () => {
  for (const side of ['R', 'L'] as const) {
    const c = CAVERNOUS[side], s = side === 'R' ? 1 : -1;
    it(`${side}: a sinus and a cavernous carotid of plausible size, on its own side`, () => {
      expect(c.sinus.mm3).toBeGreaterThan(300);
      expect(c.sinus.mm3).toBeLessThan(3000);
      expect(c.carotid.lengthMm).toBeGreaterThan(10);
      expect(c.carotid.lengthMm).toBeLessThan(35);
      for (const p of c.carotid.line) expect(s * p[0]).toBeGreaterThan(0);
      // the clinoids above the petrous apex, the anterior in front of the posterior
      expect(c.landmarks.anteriorClinoid[1]).toBeGreaterThan(c.landmarks.posteriorClinoid[1]);
      expect(c.landmarks.posteriorClinoid[2]).toBeGreaterThan(c.landmarks.petrousApex[2]);
    });

    it(`${side}: the lateral wall's nerves in their order from above (III, IV, V1, V2); VI medial to them, by the carotid`, () => {
      const n = nerves[side];
      const y = (c.sinus.lo[1] + c.sinus.hi[1]) / 2;
      const z = (name: string) => at(n[name], y)[2];
      expect(z('Oculomotor nerve (III)')).toBeGreaterThan(z('Trochlear nerve (IV)'));
      expect(z('Trochlear nerve (IV)')).toBeGreaterThan(z('Ophthalmic nerve (V1)'));
      expect(z('Ophthalmic nerve (V1)')).toBeGreaterThan(z('Maxillary nerve (V2)'));
      const vi = at(n['Abducens nerve (VI)'], y), v1 = at(n['Ophthalmic nerve (V1)'], y);
      expect(s * vi[0]).toBeLessThan(s * v1[0]);
      const near = Math.min(...c.carotid.line.map((p) => norm(sub(p, vi))));
      expect(near).toBeLessThan(5);
    });

    it(`${side}: the ten triangles, none degenerate`, () => {
      expect(Object.keys(c.triangles).sort()).toEqual(['anterolateral', 'anteromedial', 'inferior', 'lateral', 'medial', 'middle', 'posterolateral', 'posteromedial', 'superior', 'superoposterior']);
      for (const [k, [a, b, d]] of Object.entries(c.triangles)) expect(norm(cross(sub(b as V, a as V), sub(d as V, a as V))) / 2, k).toBeGreaterThan(1);
    });
  }
});
