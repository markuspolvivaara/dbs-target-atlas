/**
 * Project name and sections, in one place so the project can be renamed later
 * by editing this file (plus the static <title> tags in index.html and each section's index.html).
 */
export const BRAND = {
  name: 'Open Neuroanatomy Atlas',
  tagline: 'Interactive 3D neuroanatomy for teaching, built from published atlases and open imaging data.',
  repo: 'https://github.com/markuspolvivaara/dbs-target-atlas',
} as const;

export interface Section {
  id: 'dbs' | 'tracts' | 'skullbase' | 'cortex' | 'spine' | 'skullbase-ct' | 'brainstem';
  name: string;
  /** path from the site root */
  path: string;
  status: 'live' | 'soon';
  summary: string;
}

export const SECTIONS: Section[] = [
  // from the more basic to the more specialised; the spine, anatomically apart, last
  {
    id: 'cortex', name: 'Cortical anatomy', path: 'cortex/', status: 'live',
    summary: 'The gyri and sulci of the cerebral cortex (Destrieux parcellation) on a template brain: lateral, medial, basal and insular views, the pial surface and an inflated one that opens the sulci, with the lobes, borders and names of every label.',
  },
  {
    id: 'tracts', name: 'White-matter tracts', path: 'tracts/', status: 'live',
    summary: 'Core, extended and posterior fossa white-matter tracts in 3D (language, visual, motor, limbic, cerebellar and brainstem) with their course, connections, function and surgical relevance, for tumour and epilepsy surgery teaching.',
  },
  {
    id: 'skullbase', name: 'Skull base', path: 'skullbase/', status: 'live',
    summary: 'Cranial bones with their labelled foramina and landmarks, the cranial nerves, arteries and dural sinuses, in a cut-away 3D model: what passes where around the sella, orbit apex, petrous apex and foramen magnum.',
  },
  {
    id: 'brainstem', name: 'Brainstem', path: 'brainstem/', status: 'live',
    summary: 'The midbrain, pons and medulla in MNI space with cranial nerves III–XII, the cranial nerve and arousal network nuclei, the long tracts, and the published safe entry zones for brainstem surgery, each with its borders, approaches and sources.',
  },
  {
    id: 'dbs', name: 'DBS targets', path: 'dbs/', status: 'live',
    summary: 'Deep brain stimulation targets for movement disorders and epilepsy: nuclei, the tracts thought to carry the effect, published sweet spots, imaging and a lead model.',
  },
  {
    id: 'spine', name: 'Spine', path: 'spine/', status: 'live',
    summary: 'Surgical anatomy of the spine from one adult CT, by region and level: vertebrae, discs, the spinal canal and the nerve roots, the vertebral artery and the neck, a virtual screw, and the craniocervical junction with its measurements.',
  },
  {
    // the skull base's second model, to compare with the first (each page switches to the other)
    id: 'skullbase-ct', name: 'Skull base v2', path: 'skullbase-ct/', status: 'live',
    summary: 'The skull base from a real head CT angiogram: the CT’s own bone with its foramina, the patient’s own arteries and veins (circle of Willis with both communicating arteries) from expert labels, and the cranial nerves and landmark names fitted onto it from the first model. To compare with Skull base.',
  },
];

/**
 * Relative path from the current page to the site root, set per page with
 * <meta name="site-root" content="../">. Assets and section links resolve against it,
 * so the site works from any sub-path (GitHub Pages project URL, later a custom domain).
 */
export const SITE_ROOT: string =
  (typeof document !== 'undefined' && document.querySelector<HTMLMetaElement>('meta[name="site-root"]')?.content) || './';
