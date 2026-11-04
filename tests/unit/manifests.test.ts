import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// every section's generated manifest, as the pipeline wrote it (the app parses each with its own schema)
const GEN = new URL('../../src/data/generated/', import.meta.url);
const manifests = readdirSync(GEN).filter((f) => f.endsWith('manifest.json'))
  .map((f) => [f, JSON.parse(readFileSync(new URL(f, GEN), 'utf8'))] as const)
  .filter(([, m]) => Array.isArray(m.structures));
const shipped = (p: string) => existsSync(new URL(`../../public/${p}`, import.meta.url));

describe('provenance fields in the manifests', () => {
  it('every structure file and every copy’s source is shipped', () => {
    expect(manifests.length).toBeGreaterThan(5);
    for (const [f, m] of manifests) {
      for (const s of m.structures) {
        expect(shipped(s.file), `${f}: ${s.id} file ${s.file}`).toBe(true);
        if (s.pushedFrom) expect(shipped(s.pushedFrom), `${f}: ${s.id} pushedFrom ${s.pushedFrom}`).toBe(true);
      }
    }
  });
  it('a build-only source (joinedFrom, clearedFrom) is the pipeline’s own input: never the structure’s own file or another’s', () => {
    for (const [f, m] of manifests) {
      const files = new Set(m.structures.map((s: { file: string }) => s.file));
      for (const s of m.structures) {
        for (const k of ['joinedFrom', 'clearedFrom'] as const) {
          const p: string | undefined = s[k];
          if (!p) continue;
          expect(p, `${f}: ${s.id} ${k}`).not.toBe(s.file);
          expect(files.has(p), `${f}: ${s.id} ${k} names another structure's file`).toBe(false);
        }
      }
    }
  });
});

describe('the pages', () => {
  it('each section page describes itself (no two share a description)', () => {
    const pages = ['index.html', ...readdirSync(new URL('../../', import.meta.url), { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(new URL(`../../${d.name}/index.html`, import.meta.url)) && !['dist', 'playwright-report', 'node_modules'].includes(d.name))
      .map((d) => `${d.name}/index.html`)];
    const desc = new Map<string, string>();
    for (const p of pages) {
      const html = readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
      const d = html.match(/<meta name="description" content="([^"]+)"/)?.[1];
      expect(d, p).toBeTruthy();
      expect(desc.get(d!), `${p} has the description of ${desc.get(d!)}`).toBeUndefined();
      desc.set(d!, p);
    }
    expect(pages.length).toBeGreaterThan(8);
  });
});

describe('corrected wordings stay corrected (review of 3–4 Nov 2026)', () => {
  const src = (p: string) => readFileSync(new URL(`../../src/${p}`, import.meta.url), 'utf8');
  it('projection fibres cross with the callosal fibres, they do not cross the corpus callosum (Yeh 2018)', () => {
    expect(src('tracts/content.ts')).not.toMatch(/cross the corpus callosum/);
    expect(src('tracts/content.ts')).toMatch(/cross with the horizontally passing fibres of the corpus callosum/);
  });
  it('clipping states its aim and its outcomes, not a guarantee (Lee 2022)', () => {
    const v = src('vascular/content.ts');
    expect(v).not.toMatch(/closes the neck for good/);
    expect(v).toMatch(/its aim is to close the neck/);
    expect(v).toMatch(/residual neck/);
  });
  it('the AVM nidus definition allows for a diffuse nidus (Naranbhai 2023; Wu 2024)', () => {
    const v = src('vascular/content.ts');
    expect(v).not.toMatch(/with no brain tissue between them/);
    expect(v).toMatch(/in its usual definition/);
  });
});
