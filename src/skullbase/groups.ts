import type { CameraPreset } from '../data/schema';
import type { V3 } from '../state';
import { kindOf, LANDMARKS, REGIONS, SB_MANIFEST } from './index';

/**
 * Groups of the skull-base page, all derived from the model itself: measured neighbourhoods of key
 * landmarks, the vessel / nerve systems, and each bone with its labelled landmarks. Their descriptions
 * state how they were made; they carry no anatomical claims of their own.
 */
export interface SbGroup {
  id: string;
  kind: 'overview' | 'region' | 'system' | 'bone';
  name: string;
  description: string;
  /** structures drawn highlighted (bones solid, vessels and nerves as lines) */
  structures: string[];
  /** landmark ids drawn as points */
  landmarks: string[];
  camera: CameraPreset;
  hemi: 'L' | 'R' | 'both';
  /** default height (mm from the hypophysial fossa) above which everything is cut away; null = nothing */
  cutAbove: number | null;
  focus: V3 | null;
  radius: number;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const bones = SB_MANIFEST.structures.filter((s) => s.type === 'bone');
const ofKind = (k: string) => SB_MANIFEST.structures.filter((s) => kindOf(s) === k).map((s) => s.id);
/** default lid: removes the calvaria so the cranial floor is seen from above */
export const FLOOR_CUT_MM = 22;

const BONE_GROUPS: [string, string[]][] = [
  ['All bones', [...new Set(bones.map((b) => b.name))]],
  ['Sphenoid bone', ['Sphenoid bone']], ['Temporal bone', ['Temporal bone']], ['Occipital bone', ['Occipital bone']],
  ['Frontal and ethmoid bones', ['Frontal bone', 'Ethmoid bone']], ['Parietal bone', ['Parietal bone']],
];

export const SB_GROUPS: SbGroup[] = [
  {
    id: 'floor', kind: 'overview', name: 'Cranial floor', camera: 'axial', hemi: 'both', cutAbove: FLOOR_CUT_MM, focus: null, radius: 75,
    description: `The cranial bones of the model with everything above ${FLOOR_CUT_MM} mm (over the hypophysial fossa) cut away, seen from above. Use the regions to see what passes each opening, and the bones for their labelled landmarks.`,
    structures: bones.map((b) => b.id), landmarks: [],
  },
  ...REGIONS.map((r): SbGroup => ({
    id: `near_${slug(r.landmark)}`, kind: 'region', name: `Around the ${r.landmark.toLowerCase()}`, camera: 'axial', hemi: 'both',
    cutAbove: Math.round(r.ras[2] + 12), focus: r.ras as V3, radius: Math.max(45, r.radiusMm + 25),
    description: `Every structure of the model that comes within ${r.radiusMm} mm of the ${r.landmark.toLowerCase()} landmark, measured from the model (nearest point of each bone, vessel or nerve). Distances are listed on each card.`,
    structures: r.structures.map((s) => s.id),
    landmarks: LANDMARKS.filter((l) => r.landmarks.includes(l.name)).map((l) => l.id),
  })),
  {
    id: 'nerves', kind: 'system', name: 'Cranial nerves', camera: 'axial', hemi: 'both', cutAbove: FLOOR_CUT_MM, focus: null, radius: 75,
    description: 'All cranial nerves of the model (I–XII) and their branches, cropped to the head. Show or hide each one in the list.',
    structures: ofKind('nerve'), landmarks: [],
  },
  {
    id: 'arteries', kind: 'system', name: 'Arteries', camera: 'axial', hemi: 'both', cutAbove: null, focus: null, radius: 85,
    description: `The arteries kept for skull-base teaching, by system: ${SB_MANIFEST.arterySystems.join(', ').toLowerCase()}. Other external carotid branches (to the face, scalp, jaw and nose), distal cortical branches and small orbital branches of the model are left out. Show or hide each one in the list.`,
    structures: ofKind('artery'), landmarks: [],
  },
  {
    id: 'veins', kind: 'system', name: 'Veins and dural sinuses', camera: 'posteriorOblique', hemi: 'both', cutAbove: null, focus: null, radius: 85,
    description: 'Veins and dural venous sinuses of the model inside the head, with the cavernous sinus as a surface.',
    structures: [...ofKind('vein'), ...SB_MANIFEST.structures.filter((s) => s.name === 'Cavernous sinus').map((s) => s.id)], landmarks: [],
  },
  ...BONE_GROUPS.map(([name, members]): SbGroup => ({
    id: `bone_${slug(name)}`, kind: 'bone', name, camera: 'axial', hemi: 'both', cutAbove: FLOOR_CUT_MM, focus: null, radius: 75,
    description: name === 'All bones'
      ? 'Every bone of the model with all its landmarks at once. Choose a single bone for fewer labels, or set Labels to Hover.'
      : `${members.join(' and ')} with the landmarks Z-Anatomy labels on ${members.length > 1 ? 'them' : 'it'}. The landmark list follows Z-Anatomy’s anatomical hierarchy (Terminologia Anatomica names).`,
    structures: bones.filter((b) => members.includes(b.name)).map((b) => b.id),
    landmarks: (name === 'All bones' ? LANDMARKS : LANDMARKS.filter((l) => members.includes(l.bone))).map((l) => l.id),
  })),
];
export const SB_GROUP = new Map(SB_GROUPS.map((g) => [g.id, g]));
