import { REF } from '../data';
import { h } from './h';
import { refLinksFrom } from './reflinks';

export { h };

/** "(Akram 2017, Rajamani 2024)" with each label linking to its source. */
export function refLinks(ids: string[], paren = true): DocumentFragment {
  return refLinksFrom(REF, ids, paren);
}

export { chips, clear, fmtMm } from './widgets';
