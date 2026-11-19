import { describe, expect, it } from 'vitest';
import { decode } from '../../src/state';
import { decodeBs } from '../../src/brainstem/state';
import { decodeCortex } from '../../src/cortex/state';
import { decodeSkull } from '../../src/skullbase/state';
import { decodeSpine } from '../../src/spine/state';
import { decodeTracts } from '../../src/tracts/state';
import { decodeVa } from '../../src/vascular/state';
import { decodeVe } from '../../src/ventricles/state';
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
