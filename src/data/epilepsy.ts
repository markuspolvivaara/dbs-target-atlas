import type { Imaging, IndicationInput, Reference, SymptomInput } from './schema';

/**
 * Epilepsy: a researched addition (October 2026), not part of the original
 * teaching page. Every sentence below is taken from, or closely paraphrases,
 * the abstract of the cited paper (checked against PubMed records). Keep it
 * that way: no claim without a reference in EPILEPSY_REFERENCES.
 */
export const EPILEPSY_REFERENCES: Reference[] = [
  { id: 'fisher2010', topic: 'epi', shortLabel: 'Fisher 2010 (SANTE)', url: 'https://doi.org/10.1111/j.1528-1167.2010.02536.x',
    citation: 'Fisher R, Salanova V, Witt T, et al.; SANTE Study Group. Electrical stimulation of the anterior nucleus of thalamus for treatment of refractory epilepsy. Epilepsia. 2010;51(5):899–908. doi:10.1111/j.1528-1167.2010.02536.x.' },
  { id: 'salanova2015', topic: 'epi', shortLabel: 'Salanova 2015', url: 'https://doi.org/10.1212/WNL.0000000000001334',
    citation: 'Salanova V, Witt T, Worth R, et al.; SANTE Study Group. Long-term efficacy and safety of thalamic stimulation for drug-resistant partial epilepsy. Neurology. 2015;84(10):1017–1025. doi:10.1212/WNL.0000000000001334.' },
  { id: 'salanova2021', topic: 'epi', shortLabel: 'Salanova 2021', url: 'https://doi.org/10.1111/epi.16895',
    citation: 'Salanova V, Sperling MR, Gross RE, et al.; SANTÉ Study Group. The SANTÉ study at 10 years of follow-up: effectiveness, safety, and sudden unexpected death in epilepsy. Epilepsia. 2021;62(6):1306–1317. doi:10.1111/epi.16895.' },
  { id: 'troster2017', topic: 'epi', shortLabel: 'Tröster 2017', url: 'https://doi.org/10.1016/j.seizure.2016.12.014',
    citation: 'Tröster AI, Meador KJ, Irwin CP, Fisher RS; SANTE Study Group. Memory and mood outcomes after anterior thalamic stimulation for refractory partial epilepsy. Seizure. 2017;45:133–141. doi:10.1016/j.seizure.2016.12.014.' },
  { id: 'kaufmann2024', topic: 'epi', shortLabel: 'MORE registry 2024', url: 'https://doi.org/10.1111/epi.18003',
    citation: 'Kaufmann E, Peltola J, Colon AJ, et al.; MORE study group. Long-term evaluation of anterior thalamic deep brain stimulation for epilepsy in the European MORE registry. Epilepsia. 2024;65(8):2438–2458. doi:10.1111/epi.18003.' },
  { id: 'lehtimaki2016', topic: 'epi', shortLabel: 'Lehtimäki 2016', url: 'https://doi.org/10.1016/j.brs.2015.09.014',
    citation: 'Lehtimäki K, Möttönen T, Järventausta K, et al. Outcome based definition of the anterior thalamic deep brain stimulation target in refractory epilepsy. Brain Stimul. 2016;9(2):268–275. doi:10.1016/j.brs.2015.09.014.' },
  { id: 'schaper2020', topic: 'epi', shortLabel: 'Schaper 2020', url: 'https://doi.org/10.1093/neuros/nyaa141',
    citation: 'Schaper FLWVJ, Plantinga BR, Colon AJ, et al. Deep brain stimulation in epilepsy: a role for modulation of the mammillothalamic tract in seizure control? Neurosurgery. 2020;87(3):602–610. doi:10.1093/neuros/nyaa141.' },
  { id: 'ilyas2022', topic: 'epi', shortLabel: 'Ilyas 2022', url: 'https://doi.org/10.3171/2022.2.JNS212550',
    citation: 'Ilyas A, Snyder KM, Thomas TM, Tandon N. Optimal targeting of the anterior nucleus of the thalamus for epilepsy: a meta-analysis. J Neurosurg. 2022;137(6):1582–1590. doi:10.3171/2022.2.JNS212550.' },
  { id: 'grewal2018', topic: 'epi', shortLabel: 'Grewal 2018', url: 'https://doi.org/10.3171/2018.4.FOCUS18147',
    citation: 'Grewal SS, Middlebrooks EH, Kaufmann TJ, et al. Fast gray matter acquisition T1 inversion recovery MRI to delineate the mammillothalamic tract for preoperative direct targeting of the anterior nucleus of the thalamus for deep brain stimulation in epilepsy. Neurosurg Focus. 2018;45(2):E6. doi:10.3171/2018.4.FOCUS18147.' },
  { id: 'dalic2022', topic: 'epi', shortLabel: 'Dalic 2022 (ESTEL)', url: 'https://doi.org/10.1002/ana.26280',
    citation: 'Dalic LJ, Warren AEL, Bulluss KJ, et al. DBS of thalamic centromedian nucleus for Lennox–Gastaut syndrome (ESTEL trial). Ann Neurol. 2022;91(2):253–267. doi:10.1002/ana.26280.' },
  { id: 'warren2020', topic: 'epi', shortLabel: 'Warren 2020', url: 'https://doi.org/10.1136/jnnp-2019-322030',
    citation: 'Warren AEL, Dalic LJ, Thevathasan W, et al. Targeting the centromedian thalamic nucleus for deep brain stimulation. J Neurol Neurosurg Psychiatry. 2020;91(4):339–349. doi:10.1136/jnnp-2019-322030.' },
  { id: 'uysal2026', topic: 'epi', shortLabel: 'Uysal 2026 (NAUTILUS)', url: 'https://doi.org/10.1002/epi.70321',
    citation: 'Uysal U, Landazuri P, Burdette DE, et al.; NAUTILUS Study Group. Responsive stimulation of the thalamus for idiopathic generalized epilepsy: results of the randomized controlled NAUTILUS trial through 18 months. Epilepsia. 2026;67(8):4139–4152. doi:10.1002/epi.70321.' },
  { id: 'cukiert2017', topic: 'epi', shortLabel: 'Cukiert 2017', url: 'https://doi.org/10.1111/epi.13860',
    citation: 'Cukiert A, Cukiert CM, Burattini JA, Mariani PP, Bezerra DF. Seizure outcome after hippocampal deep brain stimulation in patients with refractory temporal lobe epilepsy: a prospective, controlled, randomized, double-blind study. Epilepsia. 2017;58(10):1728–1733. doi:10.1111/epi.13860.' },
  { id: 'vetkas2022', topic: 'epi', shortLabel: 'Vetkas 2022', url: 'https://doi.org/10.1111/epi.17157',
    citation: 'Vetkas A, Fomenko A, Germann J, et al. Deep brain stimulation targets in epilepsy: systematic review and meta-analysis of anterior and centromedian thalamic nuclei and hippocampus. Epilepsia. 2022;63(3):513–524. doi:10.1111/epi.17157.' },
];

const EVIDENCE = {
  sante: { claim: 'SANTE: 110 patients randomized; at the end of the 3-month blinded phase the stimulated group had a 29% greater seizure reduction than controls', refIds: ['fisher2010'] },
  sante5: { claim: 'Median seizure reduction 41% at 1 year and 69% at 5 years; 16% seizure-free for at least 6 months', refIds: ['salanova2015'] },
  sante10: { claim: '75% median seizure reduction at 7 years; SUDEP rate 2.0 per 1000 person-years', refIds: ['salanova2021'] },
  more: { claim: 'European MORE registry: 41% responders at a median 3.5 years; unifocal epilepsy and no prior epilepsy surgery predicted larger reductions', refIds: ['kaufmann2024'] },
  ilyas: { claim: 'Responders’ active contacts were 1.6 mm more anterior than non-responders’ and adjacent to the mammillothalamic tract (7 studies, 162 patients)', refIds: ['ilyas2022'] },
  schaper: { claim: 'Distance from the active contact to the ANT–MTT junction correlated with seizure reduction; responders showed a hot spot at the junction', refIds: ['schaper2020'] },
  lehtimaki: { claim: 'Contacts in successful treatments sat more anterior and superior; direct visualization of the target is essential', refIds: ['lehtimaki2016'] },
  estel: { claim: 'ESTEL (Lennox–Gastaut): ≥50% fewer electrographic seizures in 59% of stimulated vs 0% of control patients; the diary-seizure primary outcome was not significant', refIds: ['dalic2022'] },
  nautilus: { claim: 'NAUTILUS (responsive CM stimulation, idiopathic generalized epilepsy): primary endpoint not met; 76.8% median reduction in generalized tonic-clonic seizures at 18 months', refIds: ['uysal2026'] },
  warren: { claim: '3T MP2RAGE visualized the CM; fMRI connectivity of CM-DBS sites included sensorimotor/premotor and limbic cortex, basal ganglia, brainstem and cerebellum', refIds: ['warren2020'] },
  cukiert: { claim: 'Hippocampal DBS in temporal lobe epilepsy: 7 of 8 active-arm patients responded, 4 seizure-free, in a randomized double-blind study of 16 patients', refIds: ['cukiert2017'] },
  vetkas: { claim: 'Meta-analysis of 527 patients: best evidence for ANT; CM and hippocampal stimulation need further randomized trials', refIds: ['vetkas2022'] },
};

export const EPILEPSY_INDICATION: IndicationInput = {
  id: 'epi', label: 'Epilepsy', name: 'Drug-resistant epilepsy', accent: 'ant',
  symptomIds: ['epi-focal', 'epi-generalized', 'epi-temporal'],
  primaryTargets: ['ant'], alternativeTargets: ['cm', 'hippocampus'],
  contextStructures: ['mtt', 'mamm', 'fornix'],
  keyTracts: [], alternativeTracts: [], corticalAreas: [],
  targetMarkers: ['t-ant-mtt'], alternativeMarkers: ['t-atlas-cm', 't-atlas-hip'],
  target: 'Anterior nucleus of the thalamus (ANT), for focal epilepsy that is multifocal or poorly localized.',
  alternatives: 'Centromedian thalamus (CM) for generalized seizures; hippocampus for temporal lobe seizures.',
  why: 'Bilateral ANT stimulation reduced seizures in a double-blind randomized trial, and the reduction grew over years of follow-up. Outcome depends on where the contacts sit: responders’ contacts lie in the anterior ANT, close to where the mammillothalamic tract ends.',
  howToChoose: 'Seizure type points to the target: ANT for focal seizures, CM for generalized seizures, hippocampus for temporal lobe seizures. The best evidence is for ANT; CM and hippocampal stimulation still need further randomized trials.',
  imaging: 'The ANT is hard to see on standard MRI, and indirect targeting suffers from thalamic variability and atrophy. FGATIR shows the mammillothalamic tract ending in the ANT; for CM, 3T MP2RAGE outlines the nucleus.',
  evidence: [EVIDENCE.sante, EVIDENCE.sante5, EVIDENCE.sante10, EVIDENCE.more, EVIDENCE.ilyas, EVIDENCE.schaper, EVIDENCE.lehtimaki,
    EVIDENCE.estel, EVIDENCE.nautilus, EVIDENCE.warren, EVIDENCE.cukiert, EVIDENCE.vetkas],
  caveat: 'In the SANTE blinded phase, stimulated patients more often reported depression or memory problems, without objective long-term decline. Serious device-related adverse events reached 34% at 5 years.',
  caveatRefIds: ['fisher2010', 'troster2017', 'salanova2015'],
  missingTracts: [],
  camera: 'coronal',
};

export const EPILEPSY_SYMPTOMS: SymptomInput[] = [
  {
    id: 'epi-focal', indicationId: 'epi', name: 'Focal seizures',
    summary: 'For focal epilepsy that is multifocal or poorly localized, the ANT is the target with randomized evidence. Stimulation at the junction of the ANT and the mammillothalamic tract correlated with better seizure control.',
    structures: ['ant', 'mtt'], contextStructures: ['mamm', 'fornix'], tracts: [], corticalAreas: [], targetId: 't-ant-mtt',
    evidence: [EVIDENCE.sante, EVIDENCE.sante10, EVIDENCE.schaper, EVIDENCE.ilyas, EVIDENCE.lehtimaki],
    note: 'Marker: atlas-derived ANT–MTT junction (Morel atlas labels), not a published sweet spot. No ANT outcome map is distributed as a file.',
    camera: 'sagittal',
  },
  {
    id: 'epi-generalized', indicationId: 'epi', name: 'Generalized seizures',
    summary: 'CM stimulation is used for generalized epilepsy, including Lennox–Gastaut syndrome. In ESTEL it reduced electrographic seizures; in NAUTILUS, responsive CM stimulation reduced generalized tonic-clonic seizures.',
    structures: ['cm'], contextStructures: ['pf'], tracts: [], corticalAreas: ['m1', 's1', 'pmd', 'pmv'], targetId: 't-atlas-cm',
    evidence: [EVIDENCE.estel, EVIDENCE.nautilus, EVIDENCE.warren, EVIDENCE.vetkas],
    note: 'NAUTILUS used responsive neurostimulation, not continuous DBS, and missed its prespecified primary endpoint. Highlighted cortex follows the fMRI connectivity of CM-DBS sites (sensorimotor/premotor); no CM tract file is distributed. Marker: Morel CM centroid (atlas coordinate).',
    noteRefIds: ['uysal2026', 'warren2020'],
    camera: 'coronal',
  },
  {
    id: 'epi-temporal', indicationId: 'epi', name: 'Temporal lobe seizures',
    summary: 'Hippocampal stimulation reduced seizure frequency compared with no stimulation in refractory temporal lobe epilepsy; the evidence comes from small randomized studies.',
    structures: ['hippocampus'], tracts: [], corticalAreas: [], targetId: 't-atlas-hip',
    evidence: [EVIDENCE.cukiert, EVIDENCE.vetkas],
    note: 'Marker: centroid of the PD25 hippocampus label, for orientation only; it is not an electrode position from the trials.',
    camera: 'sagittal',
  },
];

export const EPILEPSY_IMAGING: Imaging = {
  id: 'ant', structureId: 'ant', label: 'ANT', title: 'Anterior nucleus of the thalamus', accent: 'ant',
  sequences: [{ name: 'FGATIR', note: 'Delineates the mammillothalamic tract and its termination in the ANT' }],
  tract: 'Mammillothalamic tract. Stimulation near the ANT–MTT junction correlated with better seizure control.',
  note: 'Indirect targeting is difficult because of thalamic variability and atrophy in epilepsy. Contacts in successful treatments sat more anterior and superior.',
  refIds: ['grewal2018', 'schaper2020', 'lehtimaki2016', 'ilyas2022'],
};

/** Info-card text for the structures this addition introduces (same rule: sentence + reference). */
export const EPILEPSY_DESCRIPTIONS: Record<string, { text: string; refIds: string[] }> = {
  ant: { text: 'Bilateral ANT stimulation reduced seizures in the double-blind SANTE trial. Responders’ active contacts lay more anterior, adjacent to the mammillothalamic tract.', refIds: ['fisher2010', 'ilyas2022'] },
  mtt: { text: 'Stimulation at the junction of the ANT and the mammillothalamic tract correlated with better seizure control. FGATIR shows the tract and its termination in the ANT.', refIds: ['schaper2020', 'grewal2018'] },
  hippocampus: { text: 'Hippocampal DBS reduced seizure frequency compared with no stimulation in a small randomized double-blind trial in refractory temporal lobe epilepsy.', refIds: ['cukiert2017'] },
};
