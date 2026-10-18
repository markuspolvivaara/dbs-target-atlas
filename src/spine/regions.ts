import type { CameraPreset } from '../data/schema';
import { SP_MANIFEST, type RegionId } from './index';

/** The regions of the spine page: lumbar, thoracic, cervical, and the craniocervical junction (from its own CT). */
export interface SpineRegion {
  id: RegionId;
  name: string;
  /** the overview card's heading */
  title: string;
  ready: boolean;
  /** levels offered in the level selector, cranial to caudal */
  levels: string[];
  /** structures drawn as the region's context (bone, discs, soft tissue) */
  structures: string[];
  camera: CameraPreset;
  description: string;
}

const inRegion = (r: RegionId, extra: string[] = []) => SP_MANIFEST.structures
  .filter((s) => s.region === r || extra.includes(s.id)
    || (r !== 'ccj' && s.category === 'disc' && (s.level ?? '').split('-').some((l) => l.startsWith(r[0].toUpperCase())))).map((s) => s.id);

// cranial to caudal
export const REGIONS: SpineRegion[] = [
  {
    // its own CT; its measurements are drawn on its midsagittal CT in the card, and over the bone here
    id: 'ccj', name: 'Craniocervical', title: 'Craniocervical junction', ready: true, levels: [], camera: 'lateral',
    structures: inRegion('ccj'),
    description: 'The occipital bone around the foramen magnum, C1 to C3 and the spinal canal contents of a second adult CT (a cervical scan; the whole-spine CT ends just above C1), with the junction’s standard measurements taken in its midsagittal plane and compared with published normal values.',
  },
  {
    id: 'cervical', name: 'Cervical', title: 'Cervical spine', ready: true, levels: Array.from({ length: 7 }, (_, i) => `C${i + 1}`), camera: 'lateral',
    structures: inRegion('cervical', ['sp_t1', 'sp_dural_sac']),
    description: 'C1 to C7 of one adult CT, with the discs, the spinal canal contents, the cervical roots and the vertebral artery (schematic), and the neck’s vessels, viscera and muscles that the anterior approach meets.',
  },
  {
    id: 'thoracic', name: 'Thoracic', title: 'Thoracic spine', ready: true, levels: Array.from({ length: 12 }, (_, i) => `T${i + 1}`), camera: 'lateral',
    structures: inRegion('thoracic', ['sp_c7', 'sp_l1', 'sp_dural_sac']),
    description: 'T1 to T12 of one adult CT, with the discs, the spinal canal contents and the thoracic roots (schematic), for the dorsal approaches.',
  },
  {
    id: 'lumbar', name: 'Lumbar', title: 'Lumbar spine', ready: true, levels: ['L1', 'L2', 'L3', 'L4', 'L5', 'S1'], camera: 'lateral',
    structures: inRegion('lumbar', ['sp_t12', 'sp_sacrum', 'sp_hip_left', 'sp_hip_right', 'sp_dural_sac']),
    description: 'L1 to the sacrum and pelvis of one adult CT, with the discs, the spinal canal contents and the lumbar roots (schematic), for the dorsal approaches.',
  },
];
export const REGION = new Map(REGIONS.map((r) => [r.id, r]));
