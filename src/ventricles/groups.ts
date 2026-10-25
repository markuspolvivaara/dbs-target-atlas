import type { CameraPreset } from '../data/schema';
import type { Look } from '../viewer/materials';
import { VE_MANIFEST } from './index';

/**
 * Views of the ventricles page: the ventricles in the skull, and the frontal ventriculostomy from Kocher's point.
 */
export interface VeGroup {
  id: string;
  kind: 'anatomy' | 'access';
  name: string;
  description: string;
  key: string[];
  /** how the bone is drawn, and the fitted brain (null: not drawn) */
  bone: Look;
  brain: Look | null;
  camera: CameraPreset;
  radius: number;
  /** a ventriculostomy view: the catheter and the landmarks it is placed by */
  catheter?: boolean;
}

const ofCat = (c: string) => VE_MANIFEST.structures.filter((s) => s.category === c).map((s) => s.id);
export const VENTRICLES = ofCat('ventricle');
export const BONES = ofCat('bone');
export const BRAIN = ofCat('brain');

export const VE_GROUPS: VeGroup[] = [
  {
    id: 'ventricles', kind: 'anatomy', name: 'The ventricular system', camera: 'anterolateral', radius: 80, bone: 'ghost', brain: null,
    description: 'This CT’s ventricles inside the skull: the lateral ventricles, the foramina of Monro, the third ventricle, the aqueduct and the fourth ventricle. They are narrow in this young adult, and where the CT cannot show them (the temporal horns, the foramina, the third ventricle’s floor, the aqueduct, most of the fourth ventricle) they are a model fitted onto them: see each card.',
    key: VENTRICLES,
  },
  {
    id: 'evd', kind: 'access', name: 'Frontal ventriculostomy', camera: 'frontolateral', radius: 70, bone: 'shell', brain: null, catheter: true,
    description: 'A catheter from Kocher’s point along the four freehand trajectories Chen compared, on this skull: choose the side, how Kocher’s point is found, and where the catheter is aimed. Each trajectory is followed to the first ventricle it meets.',
    key: VENTRICLES,
  },
];
export const VE_GROUP = new Map(VE_GROUPS.map((g) => [g.id, g]));
