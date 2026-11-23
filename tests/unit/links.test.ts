import { describe, expect, it } from 'vitest';
import { decode, encode } from '../../src/state';
import { decodeBs, encodeBs } from '../../src/brainstem/state';
import { decodeCortex, encodeCortex } from '../../src/cortex/state';
import { decodeSkull, encodeSkull } from '../../src/skullbase/state';
import { decodeSpine, encodeSpine } from '../../src/spine/state';
import { decodeTracts, encodeTracts } from '../../src/tracts/state';
import { decodeVa, encodeVa } from '../../src/vascular/state';
import { decodeVe, encodeVe } from '../../src/ventricles/state';
import { okCamera } from '../../src/viewer/scene';

/**
 * Hostile or broken links (the site audit's P2S-12 and P2S-13): a camera name that is a property of every object, and
 * camera numbers no scene can hold, open the section's own view instead of throwing or drawing NaN.
 */
const SECTIONS: [string, (h: string) => { cam: unknown; opacity?: Record<string, number> }][] = [
  ['dbs', (h) => decode(h)],
  ['tracts', (h) => decodeTracts(h).state],
  ['cortex', decodeCortex],
  ['brainstem', decodeBs],
  ['ventricles', decodeVe],
  ['vascular', decodeVa],
  ['skull base', decodeSkull],
  ['spine', decodeSpine],
];

describe('links that name no real view', () => {
  it.each(SECTIONS)('%s: c=constructor, toString, __proto__ and hasOwnProperty open the default camera', (_name, dec) => {
    const plain = dec('#/atlas').cam;
    for (const c of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf']) {
      expect(() => dec(`#/atlas?c=${c}`), c).not.toThrow();
      expect(dec(`#/atlas?c=${c}`).cam, c).toEqual(plain);
    }
  });

  it.each(SECTIONS)('%s: camera numbers out of every scene, or a camera on its own target, are ignored', (_name, dec) => {
    const plain = dec('#/atlas').cam;
    for (const c of ['1e308,0,0,0,0,0', '0,0,0,0,0,1e308', '5000,0,0,0,0,0', '10,20,30,10,20,30', 'NaN,0,0,0,0,0', 'Infinity,0,0,0,0,0'])
      expect(dec(`#/atlas?c=${c}`).cam, c).toEqual(plain);
    expect(dec('#/atlas?c=120,-40,30,0,-10,5').cam).toEqual({ preset: null, pos: [120, -40, 30], tgt: [0, -10, 5] });
  });

  it.each(SECTIONS)('%s: an opacity named __proto__ stays an entry of its own', (_name, dec) => {
    const s = dec('#/atlas?sop=__proto__:0.5,constructor:0.25');
    expect(Object.getPrototypeOf(s.opacity)).toBe(Object.prototype);
    expect(Object.keys(s.opacity ?? {}).sort()).toEqual(['__proto__', 'constructor']);
  });

  it('okCamera', () => {
    expect(okCamera([1, 2, 3, 4, 5, 6])).toBe(true);
    expect(okCamera([1, 2, 3, 4, 5])).toBe(false);
    expect(okCamera([3001, 0, 0, 0, 0, 0])).toBe(false);
    expect(okCamera([0, 0, 0, 0, 0.5, 0])).toBe(false);
  });
});

describe('a measured distance in a link (the audit\'s UI-13)', () => {
  // (each section's decode and encode, as its page uses them)
  const ROUND: [string, (h: string) => string][] = [
    ['dbs', (h) => encode(decode(h))],
    ['tracts', (h) => encodeTracts(decodeTracts(h).state)],
    ['cortex', (h) => encodeCortex(decodeCortex(h))],
    ['brainstem', (h) => encodeBs(decodeBs(h))],
    ['ventricles', (h) => encodeVe(decodeVe(h))],
    ['vascular', (h) => encodeVa(decodeVa(h))],
    ['skull base', (h) => encodeSkull(decodeSkull(h))],
    ['spine', (h) => encodeSpine(decodeSpine(h))],
  ];
  const m = (hash: string) => new URLSearchParams(hash.split('?')[1] ?? '').get('m');
  it.each(ROUND)('%s: its two points survive the link, to a hundredth of a millimetre', (_name, round) => {
    expect(m(round('#/atlas?m=12.34,-5.6,7,-20.01,3,0.5'))).toBe('12.34,-5.6,7,-20.01,3,0.5');
    expect(m(round('#/atlas'))).toBeNull();
  });
  it.each(ROUND)('%s: five numbers, a word, an empty place or a point outside every scene is no measurement', (_name, round) => {
    for (const bad of ['1,2,3,4,5', '1,2,3,4,5,x', '1,2,,4,5,6', '1,2,3,4,5,1e9', '1,2,3,4,5,6,7', 'NaN,0,0,0,0,0', '']) expect(m(round(`#/atlas?m=${bad}`)), bad).toBeNull();
  });
  it('the sections read it into the view\'s state as two points', () => {
    for (const [, dec] of SECTIONS) expect((dec('#/atlas?m=1,2,3,4,5,6') as { measured?: number[][] }).measured).toEqual([[1, 2, 3], [4, 5, 6]]);
  });
});

describe('a slice plane whose value is not a number', () => {
  // (the cortex had left such a plane off, the others showed it where it stands by default: one rule now)
  it.each<[string, (h: string) => { clip: Record<string, { on: boolean; mm: number }> }]>([['dbs', decode], ['tracts', (h) => decodeTracts(h).state], ['cortex', decodeCortex], ['brainstem', decodeBs]])(
    '%s: is shown at its own position', (_name, dec) => {
      const plain = dec('#/atlas').clip.axial.mm;
      expect(dec('#/atlas?ax=abc').clip.axial).toEqual({ on: true, mm: plain });
      expect(dec('#/atlas?ax=-4.5').clip.axial).toEqual({ on: true, mm: -4.5 });
    });
});

describe('the endonasal view\'s endoscope and pieces in a link (the audit\'s UI-13)', () => {
  const q = (hash: string) => new URLSearchParams(hash.split('?')[1] ?? '');
  it('the nostril, the depth, the turns, the picture and the pieces taken away survive the link', () => {
    const out = q(encodeSkull(decodeSkull('#/atlas?g=endonasal&sc=L,14.25,6,-4.5,20&ev=3d&rm=face,septa')));
    expect([out.get('sc'), out.get('ev'), out.get('rm')]).toEqual(['L,14.25,6,-4.5,20', '3d', 'face,septa']);
    expect(decodeSkull('#/atlas?g=endonasal&sc=R,2,0,0,0').endo).toEqual({ side: 'R', depth: 2, yaw: 0, pitch: 0, roll: 0, big: true, removed: [] });
  });
  it('only in that view, and only a scope a link could mean; its numbers are held, its pieces are ids, once each', () => {
    expect(decodeSkull('#/atlas?sc=L,14,6,-4,20&rm=face').endo).toBeUndefined();
    expect(decodeSkull('#/atlas?g=endonasal').endo).toBeUndefined();
    for (const bad of ['X,1,2,3,4', 'L,1,2,3', 'L,a,2,3,4', 'L,1,2,3,4,5', 'L,,2,3,4', 'L,1e3,2,3,4', 'constructor,1,2,3,4'])
      expect(decodeSkull(`#/atlas?g=endonasal&sc=${bad}`).endo, bad).toBeUndefined();
    expect(decodeSkull('#/atlas?g=endonasal&sc=R,900,200,-200,999&rm=face,face,cs_R,a-b,__proto__,')).toEqual(expect.objectContaining({
      endo: { side: 'R', depth: 300, yaw: 90, pitch: -90, roll: 180, big: true, removed: ['face', 'cs_R', '__proto__'] } }));
  });
});

describe('what a link named that the section does not have (P1-24)', async () => {
  const { lostFromLink } = await import('../../src/ui/linknote');
  it('names the page, the view and the structure it did not find, and nothing when all were found', () => {
    expect(lostFromLink('#/grading', { page: 'atlas' }, { g: 'grp' })).toEqual(['the page “grading”']);
    expect(lostFromLink('#/atlas?g=knosp_3b&sel=sb_vomer', { page: 'atlas', grp: 'pterional', sel: 'sb_vomer' }, { g: 'grp', sel: 'sel' }))
      .toEqual(['the view “knosp_3b”']);
    expect(lostFromLink('#/atlas?r=lumbar&lv=T5', { page: 'atlas', region: 'lumbar', level: null }, { r: 'region', lv: 'level' })).toEqual(['the level “T5”']);
    expect(lostFromLink('#/atlas?g=pterional&sel=sb_vomer', { page: 'atlas', grp: 'pterional', sel: 'sb_vomer' }, { g: 'grp', sel: 'sel' })).toEqual([]);
    expect(lostFromLink('', { page: 'atlas' }, { g: 'grp' })).toEqual([]);
  });
});
