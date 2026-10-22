import type { CameraPreset } from '../data/schema';
import type { V3 } from '../state';
import type { Look } from '../viewer/materials';
import { APPROACHES } from './approaches';
import { APPROACH_GEOM, isApproachPart, kindOf, LANDMARKS, REGIONS, SB, SB_MANIFEST, SB_MODEL } from './index';

/**
 * Groups of the skull-base page, all derived from the model itself: measured neighbourhoods of key
 * landmarks, the vessel / nerve systems, and each bone with its labelled landmarks. Their descriptions
 * state how they were made; they carry no anatomical claims of their own.
 */
export interface SbGroup {
  id: string;
  kind: 'overview' | 'region' | 'system' | 'bone' | 'approach';
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
  /** how the bones not in the group are drawn (default: context); the temporal-bone views see through them */
  boneLook?: Look;
  /** a surgical view: the approach drawn (its cut bones stand in for the whole ones) */
  approach?: string;
  /** structures whose centroids the camera frames (default: the group's bones, unless it has a focus point) */
  focusIds?: string[];
  /** a surgical view's shapes of the brain (named morph targets), each with its slider */
  morphs?: string[];
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

/** The foramina Skull base v3 locates on its CT. */
const FORAMINA = ['Optic canal', 'Superior orbital fissure', 'Foramen rotundum', 'Foramen ovale', 'Foramen spinosum', 'Foramen lacerum',
  'External opening of carotid canal', 'Internal acoustic meatus', 'Jugular foramen', 'Hypoglossal canal', 'Foramen magnum'];

/** Skull base v3's views: this CT's skull base with its anatomy made to fit it, the ears' contents seen through the bone. */
function temporalGroups(): SbGroup[] {
  const byName = (...names: string[]) => SB_MANIFEST.structures.filter((s) => names.includes(s.name)).map((s) => s.id);
  // the ear's contents (OpenEar) and the greater petrosal nerve; a view never shows a branch without its parent vessel,
  // so the arteries (TopBrain's trunks, the traced carotid, the anchored small branches) are drawn together in their view
  const ear = SB_MANIFEST.structures.filter((s) => s.dataset === 'openear' || s.name === 'Greater petrosal nerve').map((s) => s.id);
  const earWithCarotid = [...ear, ...byName('Internal carotid artery (petrous and lacerum parts)')];
  const earLms = LANDMARKS.filter((l) => !FORAMINA.includes(l.name) || l.name === 'Internal acoustic meatus');
  const lm = (...names: string[]) => LANDMARKS.filter((l) => names.includes(l.name)).map((l) => l.id);
  const gen = (side: 'L' | 'R') => LANDMARKS.find((l) => l.name === 'Geniculate ganglion' && l.side === side)?.ras as V3 | undefined;
  const FACIAL = ['Facial nerve (VII)', 'Chorda tympani', 'Greater petrosal nerve', 'Nerves in the internal acoustic meatus (VII, VIII)'];
  const arteries = SB_MANIFEST.structures.filter((s) => kindOf(s) === 'artery').map((s) => s.id);
  const veins = SB_MANIFEST.structures.filter((s) => kindOf(s) === 'vein').map((s) => s.id);
  const base = { boneLook: 'shell' as Look, cutAbove: null, hemi: 'both' as const };
  const nerves = SB_MANIFEST.structures.filter((s) => kindOf(s) === 'nerve').map((s) => s.id);
  const bonesV3 = SB_MANIFEST.structures.filter((s) => s.type === 'bone' && !isApproachPart(s)).map((s) => s.id);
  // the surgical view: the craniotomy's cut bones (the other bones whole), the bone removed, the right hemisphere of the
  // fitted brain and the arteries and nerves the approach exposes
  // the brain a view draws: the fitted template's cerebrum, or the posterior fossa's contents (the telovelar view)
  const brainOf = (b: 'cerebrum' | 'hindbrain') => SB_MANIFEST.structures
    .filter((s) => (b === 'cerebrum' ? kindOf(s) === 'brain' : ['hindbrain', 'ventricle'].includes(kindOf(s)))).map((s) => s.id);
  const surgical = APPROACHES.filter((a) => APPROACH_GEOM[a.id]).map((a): SbGroup => {
    const geom = APPROACH_GEOM[a.id];
    const replaced = new Set(geom.bones.map((id) => SB.get(id)?.replaces));
    return {
      id: a.view, kind: 'approach', name: a.name, camera: a.camera, hemi: a.hemi ?? (geom.side === 'M' ? 'both' : geom.side), cutAbove: null, boneLook: undefined,
      // framed on the craniotomy and what it is for: the view looks in through the one onto the other
      focus: null, focusIds: [geom.removed, ...byName(...a.focus)], radius: 60, approach: a.id, morphs: a.morphs,
      description: a.summary,
      structures: [...bonesV3.filter((id) => !replaced.has(id)), ...geom.bones, geom.removed, ...brainOf(a.brain ?? 'cerebrum'), ...byName(...a.context)],
      landmarks: [],
    };
  });
  return [
    {
      ...base, id: 'floor', kind: 'overview', name: 'Cranial floor', camera: 'axial', cutAbove: FLOOR_CUT_MM, focus: null, radius: 75, boneLook: undefined,
      description: `This CT’s skull base seen from above, everything over ${FLOOR_CUT_MM} mm cut away: the cranial nerves routed through its own foramina, the foramina located on it, and the temporal bones’ contents from a real ear. The arteries and veins have their own views.`,
      structures: [...bonesV3, ...nerves, ...ear], landmarks: lm(...FORAMINA),
    },
    {
      ...base, id: 'nerves', kind: 'system', name: 'Cranial nerves', camera: 'axial', cutAbove: FLOOR_CUT_MM, focus: null, radius: 75,
      description: 'The cranial nerves I–XII, each routed through this CT from the fitted model’s course so that it leaves the skull through the CT’s own foramen; the bone see-through.',
      structures: nerves, landmarks: lm(...FORAMINA),
    },
    {
      ...base, id: 'temporal', kind: 'overview', name: 'Temporal bones', camera: 'axial', cutAbove: 4, focus: null, radius: 70,
      description: 'Both temporal bones of one CT, seen from above with the vault cut away and the bone see-through: inside each, the facial nerve, the nerves of the internal acoustic meatus, the inner ear, the ossicles and the petrous carotid of a real ear (OpenEar specimen ALPHA) registered onto it.',
      structures: earWithCarotid, landmarks: earLms.map((l) => l.id),
    },
    ...(['R', 'L'] as const).map((side): SbGroup => ({
      ...base, id: `ear_${side.toLowerCase()}`, kind: 'region', name: side === 'R' ? 'Right temporal bone' : 'Left temporal bone',
      camera: 'lateral', hemi: side, focus: gen(side) ?? null, radius: 32,
      description: `The ${side === 'R' ? 'right' : 'left'} temporal bone from the side, the bone see-through.${side === 'L' ? ' The specimen is a right ear, mirrored here.' : ''}`,
      structures: earWithCarotid, landmarks: earLms.filter((l) => l.side === side).map((l) => l.id),
    })),
    {
      ...base, id: 'facial', kind: 'system', name: 'Facial nerve', camera: 'lateral', hemi: 'R', focus: gen('R') ?? null, radius: 30,
      description: 'The facial nerve through the temporal bone: from the internal acoustic meatus, its labyrinthine, tympanic and mastoid segments with the geniculate ganglion and the second genu, the chorda tympani and the greater petrosal nerve.',
      structures: byName(...FACIAL), landmarks: lm('Fundus of internal acoustic meatus', 'Geniculate ganglion', 'Second genu of facial nerve', "Distal end of the specimen's facial nerve"),
    },
    {
      ...base, id: 'inner_ear', kind: 'system', name: 'Inner ear', camera: 'lateral', hemi: 'R', focus: gen('R') ?? null, radius: 26,
      description: 'The perilymphatic spaces of the cochlea, vestibule and semicircular canals, with the nerves of the internal acoustic meatus and the oval and round windows.',
      structures: byName('Scala tympani', 'Scala vestibuli, vestibule and semicircular canals', 'Nerves in the internal acoustic meatus (VII, VIII)', 'Stapes'),
      landmarks: lm('Oval window', 'Round window', 'Bone over the superior semicircular canal', 'Fundus of internal acoustic meatus'),
    },
    {
      ...base, id: 'middle_ear', kind: 'system', name: 'Middle ear', camera: 'lateral', hemi: 'R', focus: gen('R') ?? null, radius: 26,
      description: 'The tympanic membrane and the ossicles, with the facial nerve’s tympanic segment above the oval window and the chorda tympani crossing the middle ear.',
      structures: byName('Malleus', 'Incus', 'Stapes', 'Tympanic membrane', 'Chorda tympani', 'Facial nerve (VII)'), landmarks: lm('Oval window', 'Round window', 'Second genu of facial nerve'),
    },
    {
      ...base, id: 'arteries', kind: 'system', name: 'Arteries', camera: 'axial', focus: null, radius: 85,
      description: 'This CT’s own arteries: the circle of Willis and its branches from TopBrain’s expert labels of the angiogram, the carotid traced through the carotid canal and foramen lacerum, the cervical carotids from TotalSegmentator; the small branches this CT cannot show anchored to them (approximate). Show or hide each in the list.',
      structures: arteries, landmarks: [],
    },
    {
      ...base, id: 'veins', kind: 'system', name: 'Veins and dural sinuses', camera: 'posteriorOblique', focus: null, radius: 85,
      description: 'This CT’s own veins: the sigmoid and transverse sinuses traced through their enhanced lumen, the deep veins and the straight and superior sagittal sinuses from TopBrain’s labels, and the internal jugular veins from TotalSegmentator.',
      structures: veins, landmarks: [],
    },
    ...surgical,
  ];
}

export const SB_GROUPS: SbGroup[] = SB_MODEL === 'v3' ? temporalGroups() : [
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
/** the group a page opens on */
export const DEFAULT_GROUP = SB_GROUPS[0].id;

/** Systems shown together: the first one's camera, side and focus; the others' structures and landmarks added to it. */
export function viewGroup(grp: string, also: readonly string[] = []): SbGroup {
  const g = SB_GROUP.get(grp) ?? SB_GROUP.get(DEFAULT_GROUP)!;
  const more = also.map((id) => SB_GROUP.get(id)).filter((x): x is SbGroup => !!x && x.kind === 'system' && g.kind === 'system' && x.id !== g.id);
  if (!more.length) return g;
  const all = [g, ...more];
  return {
    ...g,
    name: all.map((x) => x.name).join(' + '),
    description: all.map((x) => x.description).join(' '),
    structures: [...new Set(all.flatMap((x) => x.structures))],
    landmarks: [...new Set(all.flatMap((x) => x.landmarks))],
    focus: null,
    radius: Math.max(...all.map((x) => x.radius)),
  };
}

/** The cut-away height for systems shown together: the least restrictive of theirs (none if any has none). */
export function combinedCut(ids: readonly string[]): number | null {
  const cuts = ids.map((id) => SB_GROUP.get(id)?.cutAbove ?? null);
  return cuts.some((c) => c === null) ? null : Math.max(...(cuts as number[]));
}
