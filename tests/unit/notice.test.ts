import { readdirSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = new URL('../../', import.meta.url);
const read = (p: string) => readFileSync(new URL(p, root), 'utf8');

describe('licence records', () => {
  it('NOTICE has an entry for every folder of shipped assets', () => {
    const notice = read('NOTICE');
    // (home/ holds the home page's pictures of the sections: the project's own renders of the models listed here)
    const folders = readdirSync(new URL('public/assets/', root)).filter((d) => d !== 'home' && statSync(new URL(`public/assets/${d}`, root)).isDirectory());
    expect(folders.length).toBeGreaterThan(10);
    // (the vascular section's 138 files had none)
    for (const d of folders) expect(notice, d).toContain(`public/assets/${d}/`);
  });
  it('the README gives the site’s own address', () => {
    const readme = read('README.md');
    expect(readme).toContain('https://openneuroatlas.net/');
    expect(readme).not.toContain('markuspolvivaara.github.io');
  });
});
