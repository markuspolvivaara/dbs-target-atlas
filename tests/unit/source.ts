import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

/** Extract the data objects (R, IND, IMG) from the original teaching page, without running its DOM code. */
export function loadSource() {
  const html = readFileSync(new URL('../../source/dbs-targets.html', import.meta.url), 'utf8');
  const grab = (name: string, open: string, close: string) => {
    const start = html.indexOf(`var ${name} = ${open}`);
    if (start < 0) throw new Error(`source: ${name} not found`);
    let depth = 0;
    for (let i = start + `var ${name} = `.length; i < html.length; i++) {
      if (html[i] === open) depth++;
      else if (html[i] === close && --depth === 0) return html.slice(start + `var ${name} = `.length, i + 1);
    }
    throw new Error(`source: ${name} unterminated`);
  };
  const ctx = { C: (k: string) => `var(--${k})` };
  const R = runInNewContext(`(${grab('R', '{', '}')})`, ctx) as Record<string, { g: string; s: string; t: string; u: string }>;
  const IND = runInNewContext(`(${grab('IND', '[', ']')})`, ctx) as {
    id: string; label: string; title: string; accent: string; target: string; alt: string; why: string; choose: string;
    imaging: string; ev: string[][]; caveat: string; cref: string[];
    nodes: { primary: string[]; alt: string[]; context: string[] }; tracts: { on: string[]; alt: string[] };
  }[];
  const IMG = runInNewContext(`(${grab('IMG', '[', ']')})`, ctx) as {
    id: string; label: string; title: string; accent: string; seq: string[][]; noseq?: string; tract: string; note: string; refs: string[];
  }[];
  return { html, R, IND, IMG };
}
