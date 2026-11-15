import type { Reference } from './schema';

/**
 * Researched additions to the original movement-disorder content (October 2026).
 * Like epilepsy.ts, every sentence is checked against the cited abstract on PubMed.
 *
 * Optic tract as a GPi landmark. (The optic *radiation* runs from the lateral
 * geniculate to occipital cortex and is not near the pallidum.)
 * Red nucleus as an STN landmark (with a dissenting study for balance).
 *
 * The site audit's review (November 2026), A-001: the Parkinson's view of stimulation-induced dyskinesia rebuilt from
 * Tsuboi 2021 (checked against its abstract; the full text is not open access), and the lenticular fasciculus's card,
 * which had carried that view's claim, from Horn 2022 (full text). Then, the owner's choice: a view of what DBS does for
 * levodopa-induced dyskinesia, from Fan 2020 (full text), Aquino 2019 (the author manuscript in PMC), and Krack 1998,
 * D'Souza 2026 and Katayama 2006 (their abstracts: the full texts are not open access).
 * A-002: the cards of Hollunder 2024's dystonia and Tourette maps, and of S1, which carried its dystonia claim, say that
 * the maps come from subthalamic DBS (full text, PMC10917675: every cohort STN DBS; dystonia 56 of 70 patients in the
 * maps, of several forms; Tourette 14).
 * A-003: Sammartino 2016 (full text) for Guiot's indirect Vim target, one of the published targets that replace
 * nucleus centroids as markers (targets.ts).
 * B2 (statements their citation did not support): Liu 2014 (abstract) for the GPi-STN comparison in place of a
 * meeting abstract; Horisawa 2021 (full text), the pilot study a cited protocol rested on; Ilinsky 2018 (full text)
 * for which part of Vo is pallidal; Sammartino 2016 again for the pyramidal tract and medial lemniscus as the Vim's
 * borders; the SNr as investigational.
 */
export const ADDITION_REFERENCES: Reference[] = [
  { id: 'tsuboi2021', topic: 'pd', shortLabel: 'Tsuboi 2021', url: 'https://pubmed.ncbi.nlm.nih.gov/33002233/',
    citation: "Tsuboi T, Charbel M, Peterside DT, Rana M, Elkouzi A, Deeb W, et al. Pallidal connectivity profiling of stimulation-induced dyskinesia in Parkinson's disease. Mov Disord. 2021;36(2):380–388. doi:10.1002/mds.28324. Checked against its abstract: the full text is not open access." },
  { id: 'sammartino2016', topic: 'tremor', shortLabel: 'Sammartino 2016', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5089633/',
    citation: 'Sammartino F, Krishna V, King NK, Lozano AM, Schwartz ML, Huang Y, Hodaie M. Tractography-based ventral intermediate nucleus targeting: novel methodology and intraoperative validation. Mov Disord. 2016;31(8):1217–1225. doi:10.1002/mds.26633.' },
  { id: 'liu2014', topic: 'pd', shortLabel: 'Liu 2014', url: 'https://doi.org/10.3171/2014.4.JNS131711',
    citation: 'Liu Y, Li W, Tan C, Liu X, Wang X, Gui Y, et al. Meta-analysis comparing deep brain stimulation of the globus pallidus and subthalamic nucleus to treat advanced Parkinson disease. J Neurosurg. 2014;121(3):709–718. doi:10.3171/2014.4.JNS131711. Checked against its abstract: the full text is not open access.' },
  { id: 'horisawa2021', topic: 'dyst', shortLabel: 'Horisawa 2021', url: 'https://doi.org/10.1002/mds.28613',
    citation: 'Horisawa S, Yamaguchi T, Abe K, Hori H, Fukui A, Iijima M, et al. Magnetic resonance-guided focused ultrasound thalamotomy for focal hand dystonia: a pilot study. Mov Disord. 2021;36(8):1955–1959. doi:10.1002/mds.28613.' },
  { id: 'ilinsky2018', topic: 'dyst', shortLabel: 'Ilinsky 2018', url: 'https://doi.org/10.1523/ENEURO.0060-18.2018',
    citation: 'Ilinsky I, Horn A, Paul-Gilloteaux P, Gressens P, Verney C, Kultas-Ilinsky K. Human motor thalamus reconstructed in 3D from continuous sagittal sections with identified subcortical afferent territories. eNeuro. 2018;5(3):ENEURO.0060-18.2018. doi:10.1523/ENEURO.0060-18.2018.' },
  { id: 'fan2020', topic: 'pd', shortLabel: 'Fan 2020', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC6952311/',
    citation: 'Fan SY, Wang KL, Hu W, Eisinger RS, Han A, Han CL, et al. Pallidal versus subthalamic nucleus deep brain stimulation for levodopa-induced dyskinesia. Ann Clin Transl Neurol. 2020;7(1):59–68. doi:10.1002/acn3.50961.' },
  { id: 'krack1998', topic: 'pd', shortLabel: 'Krack 1998', url: 'https://pubmed.ncbi.nlm.nih.gov/9485059/',
    citation: "Krack P, Pollak P, Limousin P, Hoffmann D, Benazzouz A, Le Bas JF, et al. Opposite motor effects of pallidal stimulation in Parkinson's disease. Ann Neurol. 1998;43(2):180–192. doi:10.1002/ana.410430208. Checked against its abstract: the full text is not open access." },
  { id: 'dsouza2026', topic: 'pd', shortLabel: "D'Souza 2026", url: 'https://pubmed.ncbi.nlm.nih.gov/42474413/',
    citation: "D'Souza S, Shah HP, Seshadri V, Toms J, D'Haese P, Dawant BM, et al. Success and failure with the antidyskinetic effect of globus pallidus internus deep brain stimulation: a sweet spot and connectivity analysis in the CSP-468 cohort. Neuromodulation. 2026 (online 23 June 2026). doi:10.1016/j.neurom.2026.06.462. Checked against its abstract: the full text is not open access." },
  { id: 'aquino2019', topic: 'pd', shortLabel: 'Aquino 2019', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10957149/',
    citation: "Aquino CC, Duffley G, Hedges DM, Vorwerk J, House PA, Ferraz HB, et al. Interleaved deep brain stimulation for dyskinesia management in Parkinson's disease. Mov Disord. 2019;34(11):1722–1727. doi:10.1002/mds.27839. Checked against the author manuscript in PMC." },
  { id: 'katayama2006', topic: 'pd', shortLabel: 'Katayama 2006', url: 'https://pubmed.ncbi.nlm.nih.gov/16905880/',
    citation: "Katayama Y, Oshima H, Kano T, Kobayashi K, Fukaya C, Yamamoto T. Direct effect of subthalamic nucleus stimulation on levodopa-induced peak-dose dyskinesia in patients with Parkinson's disease. Stereotact Funct Neurosurg. 2006;84(4):176–179. doi:10.1159/000094957. Checked against its abstract: the full text is not open access." },
  { id: 'gruber2018', topic: 'dyst', shortLabel: 'Gruber 2018', url: 'https://doi.org/10.1016/j.brs.2018.08.006',
    citation: 'Gruber D, Südmeyer M, Deuschl G, Falk D, Krauss JK, Mueller J, et al. Neurostimulation in tardive dystonia/dyskinesia: a delayed start, sham stimulation-controlled randomized trial. Brain Stimul. 2018;11(6):1368–1377. doi:10.1016/j.brs.2018.08.006. (Abstract only: not open access.)' },
  { id: 'vitek1998', topic: 'img', shortLabel: 'Vitek 1998', url: 'https://doi.org/10.3171/jns.1998.88.6.1027',
    citation: 'Vitek JL, Bakay RA, Hashimoto T, et al. Microelectrode-guided pallidotomy: technical approach and its application in medically intractable Parkinson’s disease. J Neurosurg. 1998;88(6):1027–1043. doi:10.3171/jns.1998.88.6.1027.' },
  { id: 'yokoyama2002', topic: 'img', shortLabel: 'Yokoyama 2002', url: 'https://doi.org/10.1007/s00701-002-0958-x',
    citation: 'Yokoyama T, Sugiyama K, Nishizawa S, Yokota N, Ohta S, Namba H. Neural activity of the globus pallidus interna and its anatomical relations to the optic tract in Parkinson’s disease. Acta Neurochir (Wien). 2002;144(8):769–776. doi:10.1007/s00701-002-0958-x.' },
  { id: 'biousse1998', topic: 'img', shortLabel: 'Biousse 1998', url: 'https://doi.org/10.1212/wnl.50.1.258',
    citation: 'Biousse V, Newman NJ, Carroll C, et al. Visual fields in patients with posterior GPi pallidotomy. Neurology. 1998;50(1):258–265. doi:10.1212/wnl.50.1.258.' },
  { id: 'reich2000', topic: 'img', shortLabel: 'Reich 2000', url: 'https://pubmed.ncbi.nlm.nih.gov/10815670/',
    citation: 'Reich CA, Hudgins PA, Sheppard SK, Starr PA, Bakay RA. A high-resolution fast spin-echo inversion-recovery sequence for preoperative localization of the internal globus pallidus. AJNR Am J Neuroradiol. 2000;21(5):928–931. PMID 10815670.' },
  { id: 'bejjani2000', topic: 'img', shortLabel: 'Bejjani 2000', url: 'https://doi.org/10.3171/jns.2000.92.4.0615',
    citation: 'Bejjani BP, Dormont D, Pidoux B, et al. Bilateral subthalamic stimulation for Parkinson’s disease by using three-dimensional stereotactic magnetic resonance imaging and electrophysiological guidance. J Neurosurg. 2000;92(4):615–625. doi:10.3171/jns.2000.92.4.0615.' },
  { id: 'andradesouza2005', topic: 'img', shortLabel: 'Andrade-Souza 2005', url: 'https://doi.org/10.1227/01.neu.0000156547.24603.ee',
    citation: 'Andrade-Souza YM, Schwalb JM, Hamani C, et al. Comparison of three methods of targeting the subthalamic nucleus for chronic stimulation in Parkinson’s disease. Neurosurgery. 2005;56(2 Suppl):360–368. doi:10.1227/01.neu.0000156547.24603.ee.' },
  { id: 'danish2006', topic: 'img', shortLabel: 'Danish 2006', url: 'https://doi.org/10.1159/000092682',
    citation: 'Danish SF, Jaggi JL, Moyer JT, Finkel L, Baltuch GH. Conventional MRI is inadequate to delineate the relationship between the red nucleus and subthalamic nucleus in Parkinson’s disease. Stereotact Funct Neurosurg. 2006;84(1):12–18. doi:10.1159/000092682.' },
  // (A-013: stimulation-induced side effects per target and landmark, sideeffects.ts)
  { id: 'koeglsperger2019', topic: 'pd', shortLabel: 'Koeglsperger 2019', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC6558426/',
    citation: 'Koeglsperger T, Palleis C, Hell F, Mehrkens JH, Bötzel K. Deep brain stimulation programming for movement disorders: current concepts and evidence-based strategies. Front Neurol. 2019;10:410. doi:10.3389/fneur.2019.00410.' },
  { id: 'kim2021', topic: 'tremor', shortLabel: 'Kim 2021', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8220085/',
    citation: 'Kim MJ, Chang KW, Park SH, Chang WS, Jung HH, Chang JW. Stimulation-induced side effects of deep brain stimulation in the ventralis intermedius and posterior subthalamic area for essential tremor. Front Neurol. 2021;12:678592. doi:10.3389/fneur.2021.678592.' },
];

export const ADDITION_DESCRIPTIONS: Record<string, { text: string; refIds: string[] }> = {
  lf: { text: 'With the ansa lenticularis, one of the pallidothalamic projections that cross the GPi. In generalized dystonia both were associated with optimal outcome; in cervical dystonia the lenticular fasciculus was associated with a worse one. In Parkinson\'s disease, stimulation from STN leads above and lateral to the STN, where the pallidothalamic fibres run, suppressed dyskinesia directly.', refIds: ['horn2022', 'aquino2019'] },
  al: { text: 'In dystonia, the best stimulation volume extends from the posteroventral GPi into the subpallidal white matter; one peak of the generalized-dystonia sweet spot lay ventral to the pallidum, possibly on the ansa lenticularis\'s course. In Parkinson\'s disease, the fibres linked to pallidal stimulation\'s relief of levodopa-induced dyskinesia ran beneath the GPi, like the ansa lenticularis.', refIds: ['reich2019', 'horn2022', 'dsouza2026'] },
  // (B2: Reich 2019's abstract names subpallidal white matter, not the ansa lenticularis)
  gpi_sm: { text: 'The best stimulation volume sits in posteroventral GPi and extends into subpallidal white matter.', refIds: ['reich2019'] },
  // (B2: the pyramidal tract and medial lemniscus as the Vim's lateral and posterior borders, Sammartino 2016; A-013:
  // what current reaching each landmark does, Koeglsperger 2019)
  cst: { text: 'In tractography-based Vim targeting, the pyramidal tract marks the Vim\'s lateral border. Current that spreads into the internal capsule\'s motor fibres, lateral and anterior to the STN, lateral to the Vim or medial and posterior to the GPi, causes muscle contractions and strained or spastic dysarthria.', refIds: ['sammartino2016', 'koeglsperger2019'] },
  ml: { text: 'In tractography-based Vim targeting, the medial lemniscus marks the Vim\'s posterior border; stimulating it gave hemibody paraesthesias. It lies ventroposterior to the STN, and current spreading into it is a likely cause of paraesthesiae on the opposite side during STN stimulation.', refIds: ['sammartino2016', 'koeglsperger2019'] },
  // (B2: Voa pallidal, most of Vop cerebellar, Ilinsky 2018; the mesh is Morel's VLa)
  vo: { text: 'Drawn: Morel\'s VLa, approximately Hassler\'s Voa. Voa, with a narrow anterior strip of Vop, receives pallidal input; the bulk of Vop, like the Vim, belongs to the cerebellar territory (nomenclatures differ between atlases). For hand dystonia, surgeons target the Voa–Vop junction.', refIds: ['ilinsky2018', 'shimizu2018'] },
  // (B2: combined STN and SNr stimulation is investigational; its trials were negative on their primary outcomes)
  snr: { text: 'Investigational: deep contacts at the STN/SNr border, combined with STN stimulation, for freezing of gait. The trials were negative on their primary outcomes.', refIds: ['weiss2013', 'artusi2025', 'mds2024'] },
  gpe: { text: 'After pallidal DBS for Parkinson\'s disease, the contacts that induced dyskinesia lay mainly in the dorsal GPi and GPe.', refIds: ['tsuboi2021'] },
  ss_dyt: { text: 'From subthalamic DBS, not pallidal: the sweet spot of 56 patients with dystonia of several forms. The benefit followed connections with sensorimotor cortex (S1 and M1).', refIds: ['hollunder2024'] },
  sw_dyt: { text: 'From subthalamic DBS, not pallidal: in 56 patients with dystonia of several forms, the streamlines linked to benefit connected the STN\'s sensorimotor territory with sensorimotor cortex (S1 and M1).', refIds: ['hollunder2024'] },
  ss_ts: { text: 'From subthalamic DBS in 14 patients with Tourette syndrome, not from the CM-Pf or GPi, the targets of this atlas\'s Tourette views, so it is not drawn there. The benefit followed connections with M1 and the SMA.', refIds: ['hollunder2024'] },
  sw_ts: { text: 'From subthalamic DBS in 14 patients with Tourette syndrome: the streamlines linked to benefit connected the STN\'s associative territory with M1 and the SMA. Not drawn in the Tourette views, whose targets are the CM-Pf and GPi.', refIds: ['hollunder2024'] },
  s1: { text: 'After subthalamic DBS for dystonia (56 patients), the benefit followed connections with sensorimotor cortex, S1 and M1.', refIds: ['hollunder2024'] },
  optic_tract: {
    text: 'The optic tract runs beneath the posteroventral GPi and is a landmark for pallidal targeting. During surgery it is identified by stimulation-evoked flashes of light, so the lesion or lead can spare it; hyperactive GPi cells lay medial to its lateral border and at least 5.1 mm above its dorsal surface. Visual field defects after posterior pallidotomy were linked to lesions adjacent to the tract. With a lead in place, current spreading into the tract from the GPi causes phosphenes. An inversion-recovery MRI sequence can show the GPi and the optic tract directly.',
    refIds: ['vitek1998', 'yokoyama2002', 'biousse1998', 'koeglsperger2019', 'reich2000'],
  },
  rn: {
    text: 'The red nucleus is a landmark for STN targeting: its anterior border on T2-weighted MRI was introduced as a reference for locating the STN centre relative to the AC–PC line. A red-nucleus-based target came closest to the clinically optimal contact and was the most precise of three targeting methods compared. On conventional MRI, however, the RN–STN relationship was inconsistent, and the authors recommend combining several anatomical measurements. Third-nerve fibres (not drawn) run inferomedial to the STN and through the red nucleus below it: current reaching them can cause deviation of one eye and diplopia. Nausea and sweating are put down to spread medially and anteriorly, presumably to the hypothalamus and the red nucleus.',
    refIds: ['bejjani2000', 'andradesouza2005', 'danish2006', 'koeglsperger2019'],
  },
};
