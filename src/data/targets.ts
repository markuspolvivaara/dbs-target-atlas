import coords from './generated/coordinates.json';
import { acpcToMni, TEMPLATE_ACPC_LENGTH } from './acpc';
import { CoordinateSchema, type Target } from './schema';

/**
 * Target markers.
 *   sweetSpot        = a published probabilistic stimulation map distributed as a file: the pipeline's point
 *                      (pipeline/build.py, generated/coordinates.json), or the peak the paper prints
 *   publishedTarget  = a surgical target a cited paper prints in AC-PC millimetres, placed in the template with the
 *                      viewer's AC-PC frame (acpc.ts)
 *   atlasCoordinate  = the centroid of an atlas label: for orientation, not a surgical target
 * Computed coordinates are never typed here; printed ones are, each with its paper. (The site audit's finding A-003:
 * centroids had been headed as targets, some 4 to 9 mm from where the cited surgeons aim.)
 * No typical trajectory is attached: none of the sources provides one (TODO).
 */
type V = [number, number, number];
type Def = Omit<Target, 'mni' | 'method' | 'moreRefIds'> & {
  moreRefIds?: string[];
  /** A printed AC-PC target: lateral, anterior of the mid-commissural point, above the AC-PC plane (right side). */
  acpc?: V;
  /** A printed MNI point, right side (the left mirrored). */
  mniRight?: V;
  /** The method for a printed point (computed points take the pipeline's). */
  method?: string;
};

const fmt = (v: number) => v.toFixed(1);
const L = TEMPLATE_ACPC_LENGTH;
const PLACED = `Placed in the template with the viewer’s AC–PC frame (the Lead-DBS method, see Coordinates; template AC–PC length ${fmt(L)} mm).`;

const DEFS: Def[] = [
  { id: 't-ss-pd', label: 'PD sweet spot', structureId: 'ss_pd', coordKey: 'ss_pd', kind: 'sweetSpot', refId: 'hollunder2024' },
  // (the peaks Horn 2022 prints, full text; the largest region's centroid had been 4 to 5 mm off for generalized dystonia)
  { id: 't-ss-gen', label: 'Generalized dystonia sweet spot', structureId: 'ss_gen', kind: 'sweetSpot', refId: 'horn2022', mniRight: [21.1, -9.1, -0.14],
    method: 'The peak Horn 2022 prints (full text): ±21.1, −9.1, −0.14 mm in MNI space (R = 0.67). The distributed map’s own maximum lies within 1 mm of it. The 3D volume shows the map at 50 % of its maximum; its largest region holds only about a third of the map.' },
  { id: 't-ss-cerv', label: 'Cervical dystonia sweet spot', structureId: 'ss_cerv', kind: 'sweetSpot', refId: 'horn2022', mniRight: [20.4, -12.4, -5.2],
    method: 'The peak Horn 2022 prints (full text): ±20.4, −12.4, −5.2 mm in MNI space (R = 0.58), at the medial pallidal border. The distributed map’s own maximum lies within 2.5 mm of it. The 3D volume shows the map at 50 % of its maximum.' },
  { id: 't-ss-tremor', label: 'Thalamic tremor hotspot', structureId: 'ss_tremor', coordKey: 'ss_tremor', kind: 'sweetSpot', refId: 'elias2021',
    note: 'Near where the distributed map peaks: on the surface of the Vim drawn here (DISTAL) on the left and 1.5 mm outside it on the right, inside the drawn VLa (Morel), and 8 to 9 mm from the indirect Vim target (Guiot). Elias 2021’s full text is not open, so its own coordinates could not be compared.' },
  { id: 't-atlas-gpi-sm', label: 'Sensorimotor GPi (centroid)', structureId: 'gpi_sm', coordKey: 'atlas:gpi_sm', kind: 'atlasCoordinate', refId: 'ewert2018' },
  { id: 't-atlas-gpi', label: 'GPi (centroid)', structureId: 'gpi', coordKey: 'atlas:gpi', kind: 'atlasCoordinate', refId: 'ewert2018' },
  { id: 't-atlas-stn', label: 'STN (centroid)', structureId: 'stn', coordKey: 'atlas:stn', kind: 'atlasCoordinate', refId: 'ewert2018' },
  { id: 't-pub-vim', label: 'Vim, indirect target (Guiot)', structureId: 'vim', kind: 'publishedTarget', refId: 'sammartino2016', acpc: [15, -0.25 * L, 0],
    method: `Guiot’s indirect Vim target as Sammartino 2016 gives it: between the second and third twelfths of the AC–PC length in front of the posterior commissure (here three twelfths, as the site’s calculator uses), 15 mm from the midline (or 11.5 mm from the third ventricle’s wall), in the AC–PC plane. ${PLACED}`,
    note: 'Here it lies about 1 mm outside the Vim drawn (DISTAL), at its lower back edge. The centroid of the drawn Vim, 6 mm away and higher, is on its card.' },
  { id: 't-atlas-psa', label: 'Caudal ZI / PSA (centroid)', structureId: 'psa', coordKey: 'atlas:psa', kind: 'atlasCoordinate', refId: 'lau2020' },
  { id: 't-atlas-vo', label: 'VLa (Morel) centroid', structureId: 'vo', coordKey: 'atlas:vo', kind: 'atlasCoordinate', refId: 'krauth2010' },
  { id: 't-pub-vo', label: 'Voa–Vop junction', structureId: 'vo', kind: 'publishedTarget', refId: 'shimizu2018', moreRefIds: ['horisawa2019'], acpc: [13.5, -2, 1],
    method: `The Voa–Vop junction as Shimizu 2018 and Horisawa 2019 target it for Vo thalamotomy in focal hand dystonia (from the Schaltenbrand–Wahren atlas; both full text): 13.5 mm lateral (Horisawa: 13.5 to 15), 2 mm behind the mid-commissural point, 1 mm above the AC–PC line. ${PLACED}`,
    note: 'Here it lies about 1.4 mm outside the VLa drawn (Morel’s, approximately Voa), inside the thalamus: the atlases draw the Vo region differently. The centroid of the drawn VLa, 8 mm higher, is on its card.' },
  { id: 't-pub-ant-mtt', label: 'ANT–MTT junction (Schaper 2020)', structureId: 'ant', kind: 'publishedTarget', refId: 'schaper2020', acpc: [6.2, 3.8, 8.7],
    method: `The ANT–MTT junction as Schaper 2020 measured it in 20 patients’ own scans (full text): 6.2 mm lateral, 3.8 mm anterior and 8.7 mm above the mid-commissural point (means), which the paper gives as the coordinates for indirect targeting of the junction. ${PLACED}`,
    note: 'Here it lies on the mammillothalamic tract drawn, about 3 mm below the ANT drawn (Morel atlas): in this template the drawn tract meets the drawn ANT 4.4 mm away, higher and further forward. The paper’s figure is a mean of real brains, the drawing one atlas.' },
  { id: 't-atlas-hip', label: 'Hippocampus (centroid)', structureId: 'hippocampus', coordKey: 'atlas:hippocampus', kind: 'atlasCoordinate', refId: 'xiao2017' },
  { id: 't-atlas-cm', label: 'CM (centroid)', structureId: 'cm', coordKey: 'atlas:cm', kind: 'atlasCoordinate', refId: 'krauth2010' },
];

const C = coords as Record<string, unknown>;
const mirror = (v: V): V => [-v[0], v[1], v[2]];

export const TARGETS: Target[] = DEFS.map(({ acpc, mniRight, method, ...d }) => {
  const base = { ...d, moreRefIds: d.moreRefIds ?? [] };
  if (acpc) return { ...base, mni: { left: acpcToMni(mirror(acpc)), right: acpcToMni(acpc) }, method: method! };
  if (mniRight) return { ...base, mni: { left: mirror(mniRight), right: mniRight }, method: method! };
  const c = CoordinateSchema.parse(C[d.coordKey!]);
  return { ...base, mni: { left: c.L, right: c.R }, method: method ?? c.method };
});
