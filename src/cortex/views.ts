import type { CameraPreset } from '../data/schema';
import type { Hemi } from '../state';
import { LABELS, METHOD } from './index';

/**
 * The four views of the cortex page. Which labels a view lists comes from the "visible on views" column of
 * Destrieux et al. 2010, Table 1; the insular view lists the insula and its circular sulcus.
 */
export interface CtxView {
  id: 'lateral' | 'medial' | 'basal' | 'insular';
  name: string;
  camera: CameraPreset;
  hemi: Hemi;
  /** remove the surface lateral of the insula (pial surface only) */
  cutOpercula: boolean;
  labels: string[];
  description: string;
}

const onView = (v: string) => LABELS.filter((l) => l.views.includes(v as never)).map((l) => l.id);

export const VIEWS: CtxView[] = [
  {
    id: 'lateral', name: 'Lateral', camera: 'lateral', hemi: 'both', cutOpercula: false, labels: onView('L'),
    description: 'The lateral surface, seen from the left (or from the side shown). Highlighted: the labels Destrieux et al. 2010 (Table 1) list as visible on the lateral view.',
  },
  {
    id: 'medial', name: 'Medial', camera: 'medial', hemi: 'L', cutOpercula: false, labels: onView('M'),
    description: 'The medial surface of one hemisphere, seen from the midline. Highlighted: the labels Destrieux et al. 2010 (Table 1) list as visible on the medial view. The grey area in the middle is the medial wall, which the parcellation leaves unlabelled.',
  },
  {
    id: 'basal', name: 'Basal', camera: 'inferior', hemi: 'both', cutOpercula: false, labels: onView('I'),
    description: 'The basal (inferior) surface seen from below, anterior at the top. Highlighted: the labels Destrieux et al. 2010 (Table 1) list as visible on the inferior view.',
  },
  {
    id: 'insular', name: 'Insular', camera: 'lateral', hemi: 'L', cutOpercula: true, labels: LABELS.filter((l) => l.insula).map((l) => l.id),
    description: `The insula and its circular sulcus. On the pial surface everything lying lateral of the insula, over its outline seen from the side (plus ${METHOD.operMarginMm} mm), is cut away so the insula can be seen; this removes the opercula. On the inflated surface the insula is visible without the cut. With colours by lobe all five labels are yellow; choose atlas colours (Display) to tell them apart.`,
  },
];
export const VIEW = new Map(VIEWS.map((v) => [v.id, v]));
export type ViewId = CtxView['id'];
