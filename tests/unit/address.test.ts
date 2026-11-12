import { describe, expect, it } from 'vitest';
import { addressSync } from '../../src/ui/address';

/** A window's address, as far as the page's address keeping uses it: replaceState sets the hash, as in a browser. */
function fakeWindow(hash: string) {
  const location = { hash };
  const written: string[] = [];
  return { location, written, history: { replaceState: (_d: unknown, _u: string, url: string) => { location.hash = url; written.push(url); } } };
}

describe('a section page’s address', () => {
  it('is written when the view changes, and not when it already says so', () => {
    const w = fakeWindow('#/atlas?g=a');
    const a = addressSync(w);
    a.write('#/atlas?g=b');
    expect(w.location.hash).toBe('#/atlas?g=b');
    a.write('#/atlas?g=b');
    expect(w.written).toEqual(['#/atlas?g=b']);
  });
  it('is not written over a hash the page has not read yet: a link followed just before a write was due is not undone', () => {
    const w = fakeWindow('#/imaging?t=vim');
    const a = addressSync(w);
    // the reader follows a link: the address changes at once, the page's hashchange handler has not run yet
    w.location.hash = '#/coords';
    // the write of the old view, due in between
    a.write('#/imaging?t=vim');
    expect(w.location.hash).toBe('#/coords');
    expect(w.written).toEqual([]);
    // the handler runs: the page reads the address, shows that view, and writes it in full
    a.read();
    a.write('#/coords?x=1');
    expect(w.location.hash).toBe('#/coords?x=1');
  });
  it('keeps writing where the browser gives a hash back in other letters than it was given', () => {
    const w = fakeWindow('#/a');
    w.history.replaceState = (_d, _u, url) => { w.location.hash = url.replace('~', '%7E'); w.written.push(url); };
    const a = addressSync(w);
    a.write('#/a?s=x~1');
    a.write('#/a?s=x~2');
    expect(w.written).toEqual(['#/a?s=x~1', '#/a?s=x~2']);
  });
});
