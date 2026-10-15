import manifestJson from './generated/manifest.json';
import { ADDITION_DESCRIPTIONS } from './additions';
import { EPILEPSY_DESCRIPTIONS } from './epilepsy';
import { ManifestSchema, type Structure } from './schema';

export const MANIFEST = ManifestSchema.parse(manifestJson);

/**
 * Info-card text per structure. Only sentences from the attached content are
 * used (IND why / target text, IMG notes, evidence claims). A structure the
 * content does not discuss has no entry and its card says so.
 */
const DESCRIPTIONS: Record<string, { text: string; refIds: string[] }> = {
  stn: { text: 'Benefit follows the hyperdirect pathway from SMA and M1 into the supero-lateral STN. Atrophy, ventricle size and AC–PC length shift where the STN lies, so check indirect coordinates against the images.', refIds: ['akram2017', 'stnanat2025'] },
  stn_motor: { text: 'Dorsolateral (motor) STN. The hyperdirect pathway to M1 and SMA defines the motor STN. Patient-specific 7T tractography of it improved outcomes prospectively.', refIds: ['akram2017', 'npj2026'] },
  gpi: { text: 'Face and neck lie in the ventral, lateral and posterior GPi.', refIds: ['thieme2021'] },
  gpi_sm: { text: 'The best stimulation volume sits in posteroventral GPi and extends into subpallidal white matter, implicating the ansa lenticularis.', refIds: ['reich2019'] },
  vim: { text: 'The Vim relays the DRTT from the contralateral dentate nucleus to M1.', refIds: [] },
  psa: { text: 'Often reached by extending a Vim trajectory, so one lead can cover both.', refIds: ['nma2025'] },
  vo: { text: 'Vo is the main pallidal-receiving thalamus. Receives pallidal output through the pallidothalamic bundles.', refIds: ['vocoords'] },
  cm: { text: 'CM connectivity to sensorimotor cortex, putamen and cerebellum predicted tic improvement.', refIds: ['johnson2020'] },
  pf: { text: 'Centromedian–parafascicular (CM-Pf) thalamus.', refIds: [] },
  snr: { text: 'For freezing of gait, deep contacts at the STN/SNr border.', refIds: ['weiss2013', 'artusi2025', 'mds2024'] },
  dentate: { text: 'The Vim relays the DRTT from the contralateral dentate nucleus to M1.', refIds: [] },
  putamen: { text: 'CM connectivity to sensorimotor cortex, putamen and cerebellum predicted tic improvement.', refIds: ['johnson2020'] },
  m1: { text: 'Each cardinal sign maps to its own tracts: tremor to M1 and cerebellum, bradykinesia to SMA, rigidity to premotor cortex, axial signs to SMA and brainstem.', refIds: ['rajamani2024'] },
  sma: { text: 'Each cardinal sign maps to its own tracts: tremor to M1 and cerebellum, bradykinesia to SMA, rigidity to premotor cortex, axial signs to SMA and brainstem.', refIds: ['rajamani2024'] },
  pmd: { text: 'Each cardinal sign maps to its own tracts: tremor to M1 and cerebellum, bradykinesia to SMA, rigidity to premotor cortex, axial signs to SMA and brainstem.', refIds: ['rajamani2024'] },
  pmv: { text: 'Each cardinal sign maps to its own tracts: tremor to M1 and cerebellum, bradykinesia to SMA, rigidity to premotor cortex, axial signs to SMA and brainstem.', refIds: ['rajamani2024'] },
  s1: { text: 'Dystonia response maps to sensorimotor-connected circuits.', refIds: ['hollunder2024'] },
  hdp: { text: 'Benefit follows the hyperdirect pathway from SMA and M1 into the supero-lateral STN.', refIds: ['akram2017', 'peeters2024'] },
  al: { text: 'The best stimulation volume sits in posteroventral GPi and extends into subpallidal white matter, implicating the ansa lenticularis.', refIds: ['reich2019'] },
  lf: { text: 'Stimulation-induced dyskinesia from GPi linked to lenticular-fasciculus connectivity.', refIds: ['sid'] },
  drtt: { text: 'Efficacy at both Vim and PSA tracks how close the active contact is to the DRTT.', refIds: ['poster'] },
  ndrtt: { text: 'Efficacy at both Vim and PSA tracks how close the active contact is to the DRTT.', refIds: ['poster'] },
  cst: { text: 'DRTT, with the pyramidal tract and medial lemniscus as borders in dual-tract models.', refIds: ['jns2021'] },
  ml: { text: 'DRTT, with the pyramidal tract and medial lemniscus as borders in dual-tract models.', refIds: ['jns2021'] },
  rt_gen: { text: 'In generalized dystonia, benefit followed the pallidothalamic bundles.', refIds: ['horn2022'] },
  rt_cerv: { text: 'Cervical dystonia responded best to modulation of the striatopallidofugal axis.', refIds: ['horn2022'] },
  sw_pd: { text: "Symptom-specific tracts mapped in 237 patients from five centres. (Streamlines shown: PD sweet streamlines of the Human Dysfunctome Atlas.)", refIds: ['hollunder2024', 'rajamani2024'] },
  sw_dyt: { text: 'Dystonia response maps to sensorimotor-connected circuits.', refIds: ['hollunder2024'] },
  sw_ts: { text: 'Tourette response maps to M1-connected circuits.', refIds: ['hollunder2024'] },
  sw_pd_m1: { text: 'Tremor maps to tracts to M1 and cerebellum.', refIds: ['rajamani2024'] },
  sw_pd_sma: { text: 'Bradykinesia maps to SMA; axial signs to SMA and brainstem.', refIds: ['rajamani2024'] },
  sw_pd_pm: { text: 'Rigidity maps to premotor cortex.', refIds: ['rajamani2024'] },
  ss_pd: { text: 'Supero-lateral STN was the most effective site; hyperdirect connectivity predicted improvement.', refIds: ['akram2017', 'hollunder2024'] },
  ss_gen: { text: 'Generalized dystonia responded to the pallidothalamic bundles.', refIds: ['horn2022'] },
  ss_cerv: { text: 'Striatopallidofugal axis linked to optimal cervical outcomes in 80 patients.', refIds: ['horn2022'] },
  ss_dyt: { text: 'Dystonia response maps to sensorimotor-connected circuits.', refIds: ['hollunder2024'] },
  ss_ts: { text: 'Tourette response maps to M1-connected circuits.', refIds: ['hollunder2024'] },
};

Object.assign(DESCRIPTIONS, EPILEPSY_DESCRIPTIONS, ADDITION_DESCRIPTIONS);

export const STRUCTURES: Structure[] = MANIFEST.structures.map((m) => ({
  id: m.id,
  name: m.name,
  aliases: m.aliases,
  type: m.type,
  colour: m.colour.token,
  meshFile: m.file,
  description: DESCRIPTIONS[m.id]?.text ?? null,
  refIds: [...(DESCRIPTIONS[m.id]?.refIds ?? []), ...m.refIds].filter((v, i, a) => a.indexOf(v) === i),
}));

export const DESCRIPTION_IDS = Object.keys(DESCRIPTIONS);
