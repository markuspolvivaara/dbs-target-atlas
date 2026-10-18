import type { CameraPreset } from '../data/schema';
import { BS_MANIFEST, DBS_NUCLEI, ofKind, TRACTS } from './index';

/**
 * Views of the brainstem page. Each draws some structures highlighted (`key`) and others faintly for orientation
 * (`context`); the brainstem's surface is drawn solid where the view is about its surface (the entry zones) and
 * see-through where it is about what lies inside.
 */
export interface BsGroup {
  id: string;
  kind: 'overview' | 'inside' | 'zones';
  name: string;
  description: string;
  key: string[];
  context: string[];
  /** how the brainstem's own surface is drawn */
  surface: 'solid' | 'shell' | 'ghost';
  camera: CameraPreset;
  radius: number;
  /** safe entry zones: the part of the brainstem they lie on */
  region?: 'midbrain' | 'pons' | 'floor' | 'medulla';
}

const FEATURES = ofKind('feature');
const CSF = ofKind('csf');
const NERVES = ofKind('nerve');
const ARTERIES = ofKind('artery');
const zonesIn = (r: string) => BS_MANIFEST.structures.filter((s) => s.category === 'sez' && s.bsRegion === r).map((s) => s.id);

export const BS_GROUPS: BsGroup[] = [
  {
    id: 'overview', kind: 'overview', name: 'Brainstem and cranial nerves', camera: 'coronal', radius: 48, surface: 'solid',
    description: 'The midbrain, pons and medulla with their surface features and cranial nerves III–XII where they leave the brainstem. Use the views below for what lies inside and for the safe entry zones.',
    key: [...FEATURES, ...NERVES], context: [],
  },
  {
    id: 'cn_nuclei', kind: 'inside', name: 'Cranial nerve nuclei', camera: 'posterior', radius: 45, surface: 'shell',
    description: 'The nuclei of cranial nerves III–XII inside the see-through brainstem, with the nerves. The nuclei are the model’s simple shapes for their position and extent: approximate.',
    key: [...ofKind('cnNucleus'), ...NERVES], context: CSF,
  },
  {
    id: 'arousal', kind: 'inside', name: 'Ascending arousal network', camera: 'sagittal', radius: 42, surface: 'shell',
    description: 'The ten brainstem nuclei of the Harvard Ascending Arousal Network atlas 2.0, annotated on ex vivo MRI with histology, in MNI space.',
    key: ofKind('aan'), context: [...CSF, 'rn', 'snr', 'snc'],
  },
  {
    id: 'tracts', kind: 'inside', name: 'Tracts and deep nuclei', camera: 'sagittal', radius: 55, surface: 'ghost',
    description: 'The long tracts and cerebellar peduncles of the brainstem from the white-matter section (HCP-1065 tractography), with the red nucleus, substantia nigra, subthalamic nucleus and dentate nucleus from the DBS section’s atlases.',
    key: [...TRACTS, ...DBS_NUCLEI.filter((x) => x !== 'thal')], context: ['thal'],
  },
  {
    id: 'arteries', kind: 'overview', name: 'Arteries', camera: 'coronal', radius: 50, surface: 'solid',
    description: 'The vertebral and basilar arteries and their branches next to the brainstem, from the model: approximate, and arteries vary between people.',
    key: ARTERIES, context: NERVES,
  },
  {
    id: 'sez_all', kind: 'zones', name: 'All safe entry zones', camera: 'sagittal', radius: 48, surface: 'solid',
    description: 'Every safe entry zone drawn here, on the brainstem’s surface. Choose a part of the brainstem for its zones, or a zone for what the sources say about it.',
    key: ofKind('sez'), context: [...NERVES, ...FEATURES],
  },
  {
    id: 'sez_midbrain', kind: 'zones', name: 'Midbrain', camera: 'posteriorOblique', radius: 32, surface: 'solid', region: 'midbrain',
    description: 'Entry zones of the midbrain: in front beside the oculomotor nerve, on its side, and above and below the colliculi.',
    key: zonesIn('midbrain'), context: [...NERVES, ...FEATURES, ...ARTERIES],
  },
  {
    id: 'sez_pons', kind: 'zones', name: 'Ventral pons', camera: 'coronal', radius: 34, surface: 'solid', region: 'pons',
    description: 'Entry zones on the front and side of the pons, next to the oculomotor and trigeminal nerves.',
    key: zonesIn('pons'), context: [...NERVES, ...FEATURES, ...ARTERIES],
  },
  {
    id: 'sez_floor', kind: 'zones', name: 'Floor of the fourth ventricle', camera: 'posterior', radius: 30, surface: 'solid', region: 'floor',
    description: 'Entry zones on the floor of the fourth ventricle, around the facial colliculus. The ventricle itself is hidden in this view.',
    key: zonesIn('floor'), context: [...FEATURES, ...ofKind('cnNucleus').filter((id) => /abducens|facial|hypoglossal/.test(id))],
  },
  {
    id: 'sez_medulla', kind: 'zones', name: 'Medulla', camera: 'posteriorOblique', radius: 32, surface: 'solid', region: 'medulla',
    description: 'Entry zones of the medulla: around the olive in front and at the side, and the sulci on its back below the obex.',
    key: zonesIn('medulla'), context: [...NERVES, ...FEATURES, ...ARTERIES],
  },
];
export const BS_GROUP = new Map(BS_GROUPS.map((g) => [g.id, g]));
