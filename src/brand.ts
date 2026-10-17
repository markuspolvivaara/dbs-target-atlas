/**
 * Project name and sections, in one place so the project can be renamed later
 * by editing this file (plus the static <title> tags in index.html and dbs/index.html).
 */
export const BRAND = {
  name: 'Open Neuroanatomy Atlas',
  tagline: 'Interactive 3D neuroanatomy for teaching, built from published atlases in MNI space.',
  repo: 'https://github.com/markuspolvivaara/dbs-target-atlas',
} as const;

export interface Section {
  id: 'dbs' | 'tracts';
  name: string;
  /** path from the site root */
  path: string;
  status: 'live' | 'soon';
  summary: string;
}

export const SECTIONS: Section[] = [
  {
    id: 'dbs', name: 'DBS targets', path: 'dbs/', status: 'live',
    summary: 'Deep brain stimulation targets for movement disorders and epilepsy: nuclei, the tracts thought to carry the effect, published sweet spots, imaging and a lead model.',
  },
  {
    id: 'tracts', name: 'White-matter tracts', path: 'tracts/', status: 'soon',
    summary: 'Association, commissural and projection tracts in 3D with their course, terminations and surgical relevance, for tumour and epilepsy surgery teaching.',
  },
];

/**
 * Relative path from the current page to the site root, set per page with
 * <meta name="site-root" content="../">. Assets and section links resolve against it,
 * so the site works from any sub-path (GitHub Pages project URL, later a custom domain).
 */
export const SITE_ROOT: string =
  (typeof document !== 'undefined' && document.querySelector<HTMLMetaElement>('meta[name="site-root"]')?.content) || './';
