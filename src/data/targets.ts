import coords from './generated/coordinates.json';
import { CoordinateSchema, type Target } from './schema';

/**
 * Target markers. Coordinates are never typed here: each marker points to a
 * key in generated/coordinates.json, written by pipeline/build.py from the
 * source volumes (sweet-spot peak regions or atlas label centroids).
 *   sweetSpot        = published probabilistic stimulation map distributed as a file
 *   atlasCoordinate  = centroid of an atlas label (orientation, not an outcome map)
 * No typical trajectory is attached: none of the sources provides one (TODO).
 */
type Def = Omit<Target, 'mni' | 'method'>;

const DEFS: Def[] = [
  { id: 't-ss-pd', label: 'PD sweet spot', structureId: 'ss_pd', coordKey: 'ss_pd', kind: 'sweetSpot', refId: 'hollunder2024' },
  { id: 't-ss-gen', label: 'Generalized dystonia sweet spot', structureId: 'ss_gen', coordKey: 'ss_gen', kind: 'sweetSpot', refId: 'horn2022' },
  { id: 't-ss-cerv', label: 'Cervical dystonia sweet spot', structureId: 'ss_cerv', coordKey: 'ss_cerv', kind: 'sweetSpot', refId: 'horn2022' },
  { id: 't-ss-tremor', label: 'Thalamic tremor hotspot', structureId: 'ss_tremor', coordKey: 'ss_tremor', kind: 'sweetSpot', refId: 'elias2021' },
  { id: 't-atlas-gpi-sm', label: 'Sensorimotor GPi (centroid)', structureId: 'gpi_sm', coordKey: 'atlas:gpi_sm', kind: 'atlasCoordinate', refId: 'ewert2018' },
  { id: 't-atlas-gpi', label: 'GPi (centroid)', structureId: 'gpi', coordKey: 'atlas:gpi', kind: 'atlasCoordinate', refId: 'ewert2018' },
  { id: 't-atlas-stn', label: 'STN (centroid)', structureId: 'stn', coordKey: 'atlas:stn', kind: 'atlasCoordinate', refId: 'ewert2018' },
  { id: 't-atlas-vim', label: 'Vim (centroid)', structureId: 'vim', coordKey: 'atlas:vim', kind: 'atlasCoordinate', refId: 'ewert2018' },
  { id: 't-atlas-psa', label: 'Caudal ZI / PSA (centroid)', structureId: 'psa', coordKey: 'atlas:psa', kind: 'atlasCoordinate', refId: 'lau2020' },
  { id: 't-atlas-vo', label: 'Vo (Morel VLa centroid)', structureId: 'vo', coordKey: 'atlas:vo', kind: 'atlasCoordinate', refId: 'krauth2010' },
  { id: 't-ant-mtt', label: 'ANT–MTT junction', structureId: 'ant', coordKey: 'atlas:ant_mtt', kind: 'atlasCoordinate', refId: 'krauth2010' },
  { id: 't-atlas-hip', label: 'Hippocampus (centroid)', structureId: 'hippocampus', coordKey: 'atlas:hippocampus', kind: 'atlasCoordinate', refId: 'xiao2017' },
  { id: 't-atlas-cm', label: 'CM (centroid)', structureId: 'cm', coordKey: 'atlas:cm', kind: 'atlasCoordinate', refId: 'krauth2010' },
];

const C = coords as Record<string, unknown>;

export const TARGETS: Target[] = DEFS.map((d) => {
  const c = CoordinateSchema.parse(C[d.coordKey]);
  return { ...d, mni: { left: c.L, right: c.R }, method: c.method };
});
