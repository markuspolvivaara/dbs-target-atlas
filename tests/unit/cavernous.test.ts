import { describe, expect, it } from 'vitest';
import data from '../../src/data/generated/sbv3-cavernous.json';
import { CAVERNOUS_V1, CAVERNOUS_V3 as CAVERNOUS } from '../../src/skullbase/cavernous';
import sbManifest from '../../src/data/generated/sb-manifest.json';
import v3Manifest from '../../src/data/generated/sbv3-manifest.json';
import { APPROACH_REF, APPROACHES, CAVERNOUS_INFO, triangleClaims, TRIANGLES } from '../../src/skullbase/approaches';

type V = [number, number, number];
const nerves = (data as unknown as { nerves: Record<'R' | 'L', Record<string, V[]>> }).nerves;
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V) => Math.hypot(...a);
/** a nerve's point nearest a coronal plane y (frame mm) */
const at = (P: V[], y: number) => P.reduce((b, p) => (Math.abs(p[1] - y) < Math.abs(b[1] - y) ? p : b));

describe('the cavernous sinus modelled on this CT (Skull base v3)', () => {
  it('the two sides are of like size (the right one was half as large again as the left, by the part of it in air)', () => {
    const r = CAVERNOUS.R.sinus.mm3 / CAVERNOUS.L.sinus.mm3;
    expect(r).toBeGreaterThan(0.75);
    expect(r).toBeLessThan(1.33);
  });
  for (const side of ['R', 'L'] as const) {
    const c = CAVERNOUS[side], s = side === 'R' ? 1 : -1;
    it(`${side}: a sinus and a cavernous carotid of plausible size, on its own side`, () => {
      expect(c.sinus.mm3).toBeGreaterThan(300);
      expect(c.sinus.mm3).toBeLessThan(3000);
      // none of it in the sphenoid sinus's air (a third of the right one was: the sinus's lateral wall is too thin there
      // for the CT's bone mask, and "off the bone" alone let the venous space run on into the air)
      const sinus = (data as unknown as { sinus: Record<'R' | 'L', { airShare: number; offAirMm: number }> }).sinus[side];
      expect(sinus.airShare).toBeLessThanOrEqual(0.01);
      expect(sinus.offAirMm).toBeGreaterThan(0.5);
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

describe('the cavernous sinus on the Z-Anatomy model (Skull base v1)', () => {
  for (const side of ['R', 'L'] as const) {
    const c = CAVERNOUS_V1[side], s = side === 'R' ? 1 : -1;
    it(`${side}: Z-Anatomy's sinus and carotid on its own side; the ten triangles, each a real triangle near the sinus`, () => {
      expect(c.sinus.mm3).toBeGreaterThan(300);
      expect(c.sinus.mm3).toBeLessThan(4000);
      for (const p of c.carotid.line) expect(s * p[0]).toBeGreaterThan(0);
      expect(c.landmarks.anteriorClinoid[1]).toBeGreaterThan(c.landmarks.posteriorClinoid[1]);
      expect(Object.keys(c.triangles).length).toBe(10);
      const mid = c.sinus.lo.map((v, i) => (v + c.sinus.hi[i]) / 2) as V;
      for (const [k, t] of Object.entries(c.triangles)) {
        const area = norm(cross(sub(t[1] as V, t[0] as V), sub(t[2] as V, t[0] as V))) / 2;
        expect(area, k).toBeGreaterThan(1);
        for (const p of t) expect(norm(sub(p as V, mid)), k).toBeLessThan(45);
      }
    });
  }
});

// The site audit's C-019 (the owner's choices of 16 November 2026: an open review's list for all ten triangles, with what
// the five anterior ones show from three routes; on each triangle's card and in the view's text; the hypoglossal canal as
// the limit of the far lateral approach's condylar drilling, with what the amount drilled does to stability).
describe('what the ten triangles hold (audit C-019)', () => {
  const KEYS = ['superoposterior', 'superior', 'middle', 'inferior', 'anteromedial', 'anterolateral', 'posterolateral', 'posteromedial', 'lateral', 'medial'];
  const ANTERIOR = ['superior', 'middle', 'inferior', 'anteromedial', 'anterolateral'];

  it('every triangle drawn, on the CT and on Z-Anatomy, has its contents; the five anterior ones also by route', () => {
    expect(Object.keys(TRIANGLES)).toEqual(KEYS);
    for (const [prefix, man] of [['tb', v3Manifest], ['sb', sbManifest]] as const) {
      const ids = man.structures.filter((x) => x.category === 'triangle').map((x) => x.id);
      expect(ids.map((id) => id.replace(`${prefix}_triangle_`, '')).sort(), prefix).toEqual([...KEYS].sort());
      for (const id of ids) {
        const k = id.replace(`${prefix}_triangle_`, '');
        expect(triangleClaims(id), id).toEqual([TRIANGLES[k].holds, ...(ANTERIOR.includes(k) ? [TRIANGLES[k].byRoute!] : [])]);
      }
    }
    expect(Object.keys(TRIANGLES).filter((k) => TRIANGLES[k].byRoute)).toEqual(ANTERIOR);
    expect(triangleClaims('tb_carotid')).toEqual([]);
    for (const t of Object.values(TRIANGLES)) {
      expect(t.holds.refIds[0]).toBe('chavezherrera2023');
      if (t.byRoute) expect(t.byRoute.refIds).toEqual(['corvino2023']);
      for (const cl of [t.holds, ...(t.byRoute ? [t.byRoute] : [])]) for (const r of cl.refIds) expect(APPROACH_REF.has(r), r).toBe(true);
    }
  });

  it('the contents are the sources’ own', () => {
    expect(TRIANGLES.superoposterior.holds.text).toMatch(/oculomotor nerve enters the roof of the sinus.*horizontal part of the cavernous carotid/);
    expect(TRIANGLES.superior.holds.text).toMatch(/only once the anterior clinoid process is drilled away.*optic strut in front, the clinoid segment of the carotid medially and the roof of the sinus behind/);
    expect(TRIANGLES.middle.holds.text).toMatch(/posterior bend of the cavernous carotid.*meningohypophyseal trunk.*inferolateral trunk/);
    expect(TRIANGLES.inferior.holds.text).toMatch(/origin of the meningohypophyseal trunk and the cavernous part of the abducens nerve/);
    expect(TRIANGLES.anteromedial.holds.text).toMatch(/superior orbital and ophthalmic veins, the abducens nerve and the sphenoid sinus/);
    expect(TRIANGLES.anterolateral.holds.text).toMatch(/lateral wing of the sphenoid sinus, the Vidian nerve and the pterygoid region/);
    expect(TRIANGLES.posterolateral.holds.text).toMatch(/petrous carotid.*greater and lesser petrosal nerves, the tensor tympani, the Eustachian tube and the middle meningeal artery/);
    expect(TRIANGLES.posteromedial.holds.text).toMatch(/anterior petrosectomy.*posterior fossa/);
    expect(TRIANGLES.lateral.holds.text).toMatch(/porus trigeminus/);
    expect(TRIANGLES.medial.holds.text).toMatch(/posterior genu of the carotid and the dorsal meningeal artery.*Dorello’s canal/);
    // Corvino 2023, Table 1: Parkinson's triangle from the three routes
    expect(TRIANGLES.inferior.byRoute!.text).toMatch(/transcranially.*posterior bend of the cavernous carotid with the meningohypophyseal trunk, and the abducens nerve; transorbitally the upper half and posterior bend.*endonasally the inferolateral trunk and the abducens nerve/);
    expect(TRIANGLES.superior.byRoute!.text).toMatch(/after an anterior clinoidectomy, the clinoid carotid between its upper and lower dural rings; endonasally the optic strut or optico-carotid recess/);
  });

  it('the view’s text gives the borders, then the contents of all ten, then the anterior five by route', () => {
    const titles = CAVERNOUS_INFO.sections.map((x) => x.title);
    const i = titles.indexOf('The triangles');
    expect(titles.slice(i, i + 3)).toEqual(['The triangles', 'What each triangle holds', 'The anterior triangles by route']);
    expect(CAVERNOUS_INFO.sections[i + 1].claims).toEqual(KEYS.map((k) => TRIANGLES[k].holds));
    const routes = CAVERNOUS_INFO.sections[i + 2].claims;
    expect(routes[0].text).toMatch(/^Three routes to the sinus were compared on five specimens \(10 sides\)/);
    expect(routes.slice(1)).toEqual(ANTERIOR.map((k) => TRIANGLES[k].byRoute));
  });

  it('the far lateral approach names the hypoglossal canal as the limit of the condylar drilling, and what more drilling costs', () => {
    const claims = APPROACHES.find((a) => a.id === 'far_lateral')!.sections.find((x) => x.title === 'The craniectomy')!.claims;
    const i = claims.findIndex((cl) => /posterior 30–40 % of the occipital condyle/.test(cl.text));
    expect(claims[i + 1].text).toBe('The hypoglossal canal is the anterior limit of the condylar drilling. Drilling the posterior third leaves the craniovertebral junction’s mechanics unchanged; drilling the posterior half or more generally makes it unstable and calls for fixation.');
    expect(claims[i + 1].refIds).toEqual(['luzzi2022', 'payman2022', 'pai2018']);
  });
});
