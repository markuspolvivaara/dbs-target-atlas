import { h } from './h';

/**
 * The licences the sources' terms name, each with the address of its text. A Credits page that names a licence links to
 * it (Creative Commons licences ask for the licence's address, or a link to it, with the attribution), and a web
 * address printed in an attribution line is a link too.
 */
const LICENCES: [RegExp, string][] = [
  [/CC[ -]BY-SA[ -]4\.0/, 'https://creativecommons.org/licenses/by-sa/4.0/'],
  [/CC[ -]BY-SA[ -]3\.0/, 'https://creativecommons.org/licenses/by-sa/3.0/'],
  [/CC[ -]BY-SA[ -]2\.1 Japan/, 'https://creativecommons.org/licenses/by-sa/2.1/jp/'],
  [/CC[ -]BY[ -]4\.0/, 'https://creativecommons.org/licenses/by/4.0/'],
  [/CC[ -]BY[ -]3\.0/, 'https://creativecommons.org/licenses/by/3.0/'],
  [/CC0 1\.0/, 'https://creativecommons.org/publicdomain/zero/1.0/'],
  [/GPL-3\.0(?:-only)?|GPL-3\b|GPL v3/, 'https://www.gnu.org/licenses/gpl-3.0.html'],
  [/Apache-2\.0/, 'https://www.apache.org/licenses/LICENSE-2.0'],
  [/WU-Minn HCP Open Access Data Use Terms/, 'https://www.humanconnectome.org/study/hcp-young-adult/document/wu-minn-hcp-consortium-open-access-data-use-terms'],
];
const URL = /https?:\/\/[^\s,;)]+[^\s,;).]/;

/** `text` as it is, with every licence name linked to the licence's text and every web address made a link. */
export function withLicenceLinks(text: string): (string | HTMLElement)[] {
  const out: (string | HTMLElement)[] = [];
  let rest = text;
  for (;;) {
    let first: { at: number; len: number; href: string } | null = null;
    for (const [re, href] of [...LICENCES, [URL, ''] as [RegExp, string]]) {
      const m = re.exec(rest);
      if (m && (!first || m.index < first.at)) first = { at: m.index, len: m[0].length, href: href || m[0] };
    }
    if (!first) break;
    if (first.at) out.push(rest.slice(0, first.at));
    out.push(h('a', { href: first.href, target: '_blank', rel: 'noopener' }, rest.slice(first.at, first.at + first.len)));
    rest = rest.slice(first.at + first.len);
  }
  if (rest) out.push(rest);
  return out;
}

/** Do the same for a whole page already built: every text on it outside a link (the licence lines, the attribution
 * lists, the sentences about the other sections' files). */
export function linkLicences(root: HTMLElement): void {
  const texts: Text[] = [];
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) if (!(n.parentElement?.closest('a, code, h1, h2, h3'))) texts.push(n as Text);
  for (const t of texts) {
    const parts = withLicenceLinks(t.data);
    if (parts.length === 1 && typeof parts[0] === 'string') continue;
    t.replaceWith(...parts);
  }
}
