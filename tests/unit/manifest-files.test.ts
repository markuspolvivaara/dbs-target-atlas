import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Every section's manifest against the files (the site audit's P1-11): the ventricles' entry for a file it borrows
 * from the skull base had an old byte count and an old derivation, and a test covered the DBS manifest only. The
 * copies under public/assets/ must be the generated files as they are (`spine_build.py refs` once refreshed only the
 * generated one).
 */
const GEN = new URL('../../src/data/generated/', import.meta.url);
const PUBLIC = new URL('../../public/', import.meta.url);
interface Entry { id: string; file: string; bytes?: number; derivation?: string; source?: string; licence?: string }
const manifests = readdirSync(GEN).filter((f) => f.endsWith('manifest.json')).sort();
const read = (f: string) => JSON.parse(readFileSync(new URL(f, GEN), 'utf8')) as { structures: Entry[] };

describe('manifests and the files they describe', () => {
  it('there are manifests for all ten section models', () => {
    expect(manifests.length).toBeGreaterThanOrEqual(10);
  });

  it.each(manifests)('%s: the copy the site serves (if any) is the generated file as it is', (f) => {
    const served = new URL(`assets/${f}`, PUBLIC);
    if (!existsSync(served)) return;
    expect(readFileSync(served, 'utf8') === readFileSync(new URL(f, GEN), 'utf8'), `public/assets/${f}`).toBe(true);
  });

  it.each(manifests)('%s: every file named exists and has the byte count given', (f) => {
    const bad: string[] = [];
    for (const s of read(f).structures) {
      const p = new URL(s.file, PUBLIC);
      if (!existsSync(p)) bad.push(`${s.id}: ${s.file} missing`);
      else if (s.bytes !== undefined && statSync(p).size !== s.bytes) bad.push(`${s.id}: ${s.file} is ${statSync(p).size} bytes, the manifest says ${s.bytes}`);
    }
    expect(bad).toEqual([]);
  });

  it('a file drawn by two sections is described the same way in both', () => {
    const by = new Map<string, { m: string; s: Entry }[]>();
    for (const f of manifests) for (const s of read(f).structures) by.set(s.file, [...(by.get(s.file) ?? []), { m: f, s }]);
    const shared = [...by.values()].filter((v) => new Set(v.map((x) => x.m)).size > 1);
    expect(shared.length).toBeGreaterThan(20);
    const bad: string[] = [];
    for (const v of shared) {
      for (const key of ['derivation', 'source', 'licence'] as const) {
        const seen = new Set(v.map((x) => x.s[key]));
        if (seen.size > 1) bad.push(`${v[0].s.file}: ${key} differs between ${v.map((x) => x.m).join(', ')}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
