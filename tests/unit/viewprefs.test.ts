import { describe, expect, it } from 'vitest';
import { parsePrefs } from '../../src/viewer/viewprefs';

describe('view options kept in the browser', () => {
  it('reads back what was stored, and puts defaults for anything missing or unknown', () => {
    expect(parsePrefs({})).toEqual({ fadeOthers: false, legend: 'float', legendShut: false });
    expect(parsePrefs(null)).toEqual({ fadeOthers: false, legend: 'float', legendShut: false });
    expect(parsePrefs({ fadeOthers: true, legend: 'dock', legendShut: true })).toEqual({ fadeOthers: true, legend: 'dock', legendShut: true });
    // (a value from a newer or broken page)
    expect(parsePrefs({ legend: 'left', legendShut: 'yes', fadeOthers: 1 })).toEqual({ fadeOthers: false, legend: 'float', legendShut: false });
  });
});
