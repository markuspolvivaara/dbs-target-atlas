import type { CameraPreset } from '../data/schema';
import { SP_MANIFEST, type RegionId } from './index';

/** The regions of the spine page. Only the lumbar region is built so far (phase 1). */
export interface SpineRegion {
  id: RegionId;
  name: string;
  ready: boolean;
  /** levels offered in the level selector, cranial to caudal */
  levels: string[];
  /** structures drawn as the region's context (bone, discs, soft tissue) */
  structures: string[];
  camera: CameraPreset;
  description: string;
}

const inRegion = (r: RegionId, extra: string[] = []) => SP_MANIFEST.structures
  .filter((s) => s.region === r || extra.includes(s.id) || (s.category === 'disc' && (s.level ?? '').split('-').some((l) => l.startsWith(r[0].toUpperCase())))).map((s) => s.id);

export const REGIONS: SpineRegion[] = [
  {
    id: 'lumbar', name: 'Lumbar', ready: true, levels: ['L1', 'L2', 'L3', 'L4', 'L5', 'S1'], camera: 'lateral',
    structures: inRegion('lumbar', ['sp_t12', 'sp_sacrum', 'sp_hip_left', 'sp_hip_right', 'sp_dural_sac',
      ...SP_MANIFEST.structures.filter((x) => ['root', 'ganglion'].includes(x.category ?? '')).map((x) => x.id)]),
    description: 'L1 to the sacrum and pelvis of one adult CT, with the discs, the spinal canal contents and the lumbar roots (schematic), for the dorsal approaches.',
  },
  {
    id: 'thoracic', name: 'Thoracic', ready: false, levels: [], camera: 'lateral', structures: [],
    description: 'Phase 3: pedicle morphometry, rib heads, the aorta and azygos by level, the artery of Adamkiewicz and the thoracic approaches.',
  },
  {
    id: 'cervical', name: 'Cervical', ready: false, levels: [], camera: 'lateral', structures: [],
    description: 'Phase 2: the craniocervical junction, the vertebral artery, C1–C2 fixation, lateral mass screws and the anterior approach.',
  },
];
export const REGION = new Map(REGIONS.map((r) => [r.id, r]));
