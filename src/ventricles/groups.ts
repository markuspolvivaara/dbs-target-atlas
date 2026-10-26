import type { CameraPreset } from '../data/schema';
import type { Look } from '../viewer/materials';
import { VE_MANIFEST } from './index';

/**
 * Views of the ventricles page: the ventricles in the skull, and the frontal ventriculostomy from Kocher's point.
 */
export interface VeGroup {
  id: string;
  kind: 'anatomy' | 'access' | 'endoscopic';
  name: string;
  description: string;
  key: string[];
  /** drawn see-through around the key structures (null: none) */
  context?: string[];
  /** how the bone is drawn, and the fitted brain (null: not drawn) */
  bone: Look;
  brain: Look | null;
  camera: CameraPreset;
  radius: number;
  /** a ventriculostomy view: the catheter and the landmarks it is placed by */
  catheter?: boolean;
  /** the endoscopic view: a rigid endoscope through the foramen of Monro to the floor of the third ventricle */
  endoscope?: boolean;
}

const ofCat = (c: string) => VE_MANIFEST.structures.filter((s) => s.category === c).map((s) => s.id);
export const VENTRICLES = ofCat('ventricle');
export const BONES = ofCat('bone');
export const BRAIN = ofCat('brain');
/** the structures around the ventricles (the fitted model), and the vessels, nerves and brainstem the endoscope shows */
export const DEEP = ofCat('deep');
export const AROUND = [...ofCat('artery'), ...ofCat('vein'), ...ofCat('nerve'), ...ofCat('hindbrain')];

export const VE_GROUPS: VeGroup[] = [
  {
    id: 'ventricles', kind: 'anatomy', name: 'The ventricular system', camera: 'anterolateral', radius: 80, bone: 'ghost', brain: null,
    description: 'This CT’s ventricles inside the skull: the lateral ventricles, the foramina of Monro, the third ventricle, the aqueduct and the fourth ventricle. They are narrow in this young adult, and where the CT cannot show them (the temporal horns, the foramina, the third ventricle’s floor, the aqueduct, most of the fourth ventricle) they are a model fitted onto them: see each card.',
    key: VENTRICLES,
  },
  {
    id: 'around', kind: 'anatomy', name: 'Around the third ventricle', camera: 'sagittal', radius: 40, bone: 'ghost', brain: null,
    description: 'What forms the walls and floor of the lateral and third ventricles, and what lies beneath the floor: the fornix, septum, caudate nucleus and thalamus, the hypothalamus and mammillary bodies, the optic chiasm and commissures (a model fitted with the ventricles), this patient’s basilar artery and its branches and the deep veins (the CT angiogram), the oculomotor nerves and the brainstem.',
    key: [...DEEP, ...AROUND], context: VENTRICLES,
  },
  {
    id: 'evd', kind: 'access', name: 'Frontal ventriculostomy', camera: 'frontolateral', radius: 70, bone: 'shell', brain: null, catheter: true,
    description: 'A catheter from Kocher’s point along the four freehand trajectories Chen compared, on this skull: choose the side, how Kocher’s point is found, and where the catheter is aimed. Each trajectory is followed to the first ventricle it meets.',
    key: VENTRICLES,
  },
  {
    id: 'etv', kind: 'endoscopic', name: 'Endoscopic third ventriculostomy', camera: 'sagittal', radius: 45, bone: 'ghost', brain: null, endoscope: true,
    description: 'A rigid endoscope from a frontal burr hole through the foramen of Monro to the floor of the third ventricle, on the line Sousa drew on 187 MRIs. Its view shows the walls from inside, and through them what lies just behind: the fornix at the foramen, the mammillary bodies and, through the thin floor, the basilar artery.',
    key: [...DEEP, ...AROUND], context: VENTRICLES,
  },
];
export const VE_GROUP = new Map(VE_GROUPS.map((g) => [g.id, g]));
