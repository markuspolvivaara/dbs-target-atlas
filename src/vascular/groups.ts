import type { CameraPreset } from '../data/schema';
import { LESIONS, VA_MANIFEST } from './index';

/**
 * Views of the vascular page: this CT angiogram's vessels, and each lesion drawn on them.
 */
export interface VaGroup {
  id: string;
  kind: 'normal' | 'aneurysm' | 'avm' | 'fistula';
  name: string;
  description: string;
  /** the lesions drawn (their parts, and the vessels they stand in for) */
  lesions: string[];
  /** veins drawn (false: the arteries alone) */
  veins: boolean;
  /** the fitted brain drawn faintly (an AVM's place in it) */
  brain: boolean;
  camera: CameraPreset;
  radius: number;
}

const ofCat = (c: string) => VA_MANIFEST.structures.filter((s) => s.category === c && !s.lesion).map((s) => s.id);
export const ARTERIES = ofCat('artery');
export const VEINS = ofCat('vein');
export const BONES = VA_MANIFEST.structures.filter((s) => s.type === 'bone').map((s) => s.id);
export const BRAIN = ofCat('brain');
const lesionIds = (kind: string) => LESIONS.filter((l) => l.kind === kind).map((l) => l.id);

export const VA_GROUPS: VaGroup[] = [
  {
    id: 'normal', kind: 'normal', name: 'Arteries and veins', camera: 'anterolateral', radius: 85, lesions: [], veins: true, brain: false,
    description: 'This CT angiogram’s vessels: the carotid and vertebral arteries, the circle of Willis and the cerebral arteries as far as its labels go, the veins and dural sinuses. Turn on the angiogram to watch contrast reach them: the arteries first, then, after the capillary phase, the veins.',
  },
  {
    id: 'aneurysms', kind: 'aneurysm', name: 'Aneurysms', camera: 'axial', radius: 45, lesions: lesionIds('aneurysm'), veins: false, brain: false,
    description: 'Saccular aneurysms drawn where this CT’s arteries branch, at the commonest sites (the communicating arteries, the middle cerebral bifurcation, the basilar tip, the ophthalmic segment, the PICA origin); a fusiform aneurysm of the basilar trunk; and a blister on the internal carotid’s dorsal wall. All are drawings on this patient’s arteries, with illustrative sizes.',
  },
  {
    id: 'avm1', kind: 'avm', name: 'AVM: Spetzler–Martin grade I', camera: 'anterolateral', radius: 70, lesions: ['avm1'], veins: true, brain: true,
    description: 'A small arteriovenous malformation (under 3 cm) in the right frontal pole, a non-eloquent area, fed by the anterior cerebral artery and draining superficially into the superior sagittal sinus.',
  },
  {
    id: 'avm3', kind: 'avm', name: 'AVM: Spetzler–Martin grade III', camera: 'axial', radius: 80, lesions: ['avm3'], veins: true, brain: true,
    description: 'A medium arteriovenous malformation (3–6 cm) in the left sensorimotor cortex at the central sulcus (eloquent), fed by middle cerebral artery branches and draining superficially into the superior sagittal sinus.',
  },
  {
    id: 'avm5', kind: 'avm', name: 'AVM: Spetzler–Martin grade V', camera: 'sagittal', radius: 90, lesions: ['avm5'], veins: true, brain: true,
    description: 'A large arteriovenous malformation (over 6 cm) in the right occipital lobe, the visual cortex (eloquent), reaching deep, fed by posterior and middle cerebral artery branches and draining both deep (the vein of Galen, the straight sinus) and superficially.',
  },
  {
    id: 'davf', kind: 'fistula', name: 'Dural AV fistula', camera: 'sagittal', radius: 75, lesions: ['davf'], veins: true, brain: true,
    description: 'A dural arteriovenous fistula on the wall of the right transverse–sigmoid junction, fed by meningeal branches, draining into the sinus (on to the jugular vein and back along the transverse sinus) and back into a cortical vein: Borden type II.',
  },
  {
    id: 'ccfa', kind: 'fistula', name: 'Direct carotid-cavernous fistula', camera: 'anterolateral', radius: 55, lesions: ['ccfa'], veins: true, brain: false,
    description: 'Barrow type A: the right cavernous carotid opening straight into the cavernous sinus. The sinus fills with the arteries, and from it the ophthalmic veins (dilated), the petrosal sinuses, the opposite sinus and cortical veins.',
  },
  {
    id: 'ccfd', kind: 'fistula', name: 'Indirect carotid-cavernous fistula', camera: 'anterolateral', radius: 55, lesions: ['ccfd'], veins: true, brain: false,
    description: 'Barrow type D: small dural branches of the internal and external carotid arteries feeding the right cavernous sinus’s wall. A low-flow shunt: the sinus fills later than with a direct fistula, and drains through the petrosal sinuses and the ophthalmic veins.',
  },
];
export const VA_GROUP = new Map(VA_GROUPS.map((g) => [g.id, g]));
