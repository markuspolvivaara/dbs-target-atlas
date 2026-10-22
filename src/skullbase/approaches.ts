import type { CameraPreset } from '../data/schema';

/**
 * Skull base v3's surgical views: the right pterional, lateral supraorbital (LSO) and parasagittal (interhemispheric)
 * craniotomies and the midline suboccipital one (telovelar), cut out of the CT's bone by pipeline/skullbase_v3_approach.py,
 * with the brain fitted into this CT (pipeline/skullbase_brain.py: the fissure opening, frontal lift and interhemispheric
 * retraction; pipeline/skullbase_pfossa.py: the cerebellum, brainstem and fourth ventricle, the tonsils drawn apart). What each approach
 * is and what it exposes comes from open-access sources, checked against their full texts: Yilmaz 2025 (PMC12733489),
 * Sevgi 2026 (PMC13096834), Muhammad 2019 (PMC6704088), Ngando 2013 (PMC3814910), Wang 2011 (PMC3171658),
 * Srinivasa 2021 (PMC8751500), Oo 2021 (PMC7969099), Imada 2021 (PMC8666298), Choque-Velasquez 2018 (PMC6094498),
 * Cha 2012 (PMC3424172), Mosteiro 2026 (PMC13183721), Amini 2024 (PMC11271347), Symss 2014 (PMC4129577), Nair 2016
 * (PMC4849301), Chrissicopoulos 2024 (PMC10961669), Triantafyllou 2025 (PMC12346034), Cho 2024 (PMC11322403), Pettersson
 * 2023 (PMC10159312), Wang 2023 (PMC9944752), Longatti 2026 (PMC12963120), Pantu 2026 (PMC12785894), Cavalheiro 2015
 * (PMC4564452). How the openings and the brain were drawn on this CT is generated with the geometry (sbv3-approaches.json,
 * sbv3-fit.json).
 */
export interface ApproachRef { id: string; shortLabel: string; citation: string; url: string; pmid: string; pmcid: string }
export interface ApproachClaim { text: string; refIds: string[] }
export interface ApproachSection {
  title: string;
  claims: ApproachClaim[];
  /** a measurement on this CT shown under the claims (from sbv3-fit.json): M1's length, or the anterior cerebral
   * arteries TopBrain labels */
  measured?: 'm1' | 'aca' | 'tonsils';
}
export interface ApproachContent {
  /** the geometry's id (sbv3-approaches.json) */
  id: string;
  /** the view's group id */
  view: string;
  name: string;
  camera: CameraPreset;
  /** the hemispheres drawn (default: the craniotomy's side) */
  hemi?: 'L' | 'R' | 'both';
  /** the brain drawn: the fitted cerebrum (default) or the posterior fossa's contents */
  brain?: 'cerebrum' | 'hindbrain';
  summary: string;
  /** what the sources say, by topic: the craniotomy first, care points last */
  sections: ApproachSection[];
  /** structures of the model drawn with it (names) */
  context: string[];
  /** what this model cannot show */
  notShown: string;
  /** structures (names) the view frames, with the bone removed */
  focus: string[];
  /** the shapes of the brain the view offers (named morph targets: open, lift, interhemispheric, telovelar), a slider each */
  morphs: string[];
}
const sec = (title: string, claims: ApproachClaim[], measured?: ApproachSection['measured']): ApproachSection => ({ title, claims, ...(measured ? { measured } : {}) });

const doi = (d: string) => `https://doi.org/${d}`;
export const APPROACH_REFS: ApproachRef[] = [
  { id: 'yilmaz2025', pmid: '41465743', pmcid: 'PMC12733489', shortLabel: 'Yilmaz 2025', url: doi('10.3390/life15121804'),
    citation: 'Yilmaz MC, Durmus YE. Exploring the lamina terminalis: a stepwise anatomical comparison of pterional and orbitozygomatic craniotomy approaches. Life (Basel). 2025;15(12):1804. doi:10.3390/life15121804.' },
  { id: 'sevgi2026', pmid: '42021776', pmcid: 'PMC13096834', shortLabel: 'Sevgi 2026', url: doi('10.3389/fneur.2026.1736101'),
    citation: 'Sevgi UT, Sulaimanov U, Korkmaz TŞ, Şahin MH, Yekeler B, Keleş A, et al. Anterolateral, lateral, and posterior corridors to complex skull base lesions in sphenocavernous and petroclival regions: microsurgical anatomy with three-dimensional reconstructions and illustrative cases. Front Neurol. 2026;17:1736101. doi:10.3389/fneur.2026.1736101.' },
  { id: 'muhammad2019', pmid: '31281944', pmcid: 'PMC6704088', shortLabel: 'Muhammad 2019', url: doi('10.1007/s00701-019-03999-x'),
    citation: 'Muhammad S, Tanikawa R, Lawton M, Regli L, Niemelä M, Korja M. Microsurgical dissection of Sylvian fissure—short technical videos of third generation cerebrovascular neurosurgeons. Acta Neurochir (Wien). 2019;161(9):1743–1746. doi:10.1007/s00701-019-03999-x.' },
  { id: 'ngando2013', pmid: '24231790', pmcid: 'PMC3814910', shortLabel: 'Ngando 2013', url: doi('10.4103/2152-7806.119073'),
    citation: 'Ngando HM, Maslehaty H, Schreiber L, Blaeser K, Scholz M, Petridis AK. Anatomical configuration of the Sylvian fissure and its influence on outcome after pterional approach for microsurgical aneurysm clipping. Surg Neurol Int. 2013;4:129. doi:10.4103/2152-7806.119073.' },
  { id: 'wang2011', pmid: '21863272', pmcid: 'PMC3171658', shortLabel: 'Wang 2011', url: doi('10.1007/s10072-011-0721-2'),
    citation: 'Wang F, Sun T, Li X, Xia H, Li Z. Microsurgical and tractographic anatomical study of insular and transsylvian transinsular approach. Neurol Sci. 2011;32(5):865–874. doi:10.1007/s10072-011-0721-2.' },
  { id: 'srinivasa2021', pmid: '35071078', pmcid: 'PMC8751500', shortLabel: 'Srinivasa 2021', url: doi('10.4103/ajns.ajns_189_21'),
    citation: 'Srinivasa R, Shwetha K, Pravin S, Daisy S, Eilene B, Mathuriya SN, et al. Microsurgical anatomy of middle cerebral artery in Northwest Indian population: a cadaveric brain dissection study. Asian J Neurosurg. 2021;16(4):785–791. doi:10.4103/ajns.ajns_189_21.' },
  { id: 'oo2021', pmid: '33776597', pmcid: 'PMC7969099', shortLabel: 'Oo 2021', url: doi('10.1155/2021/6652676'),
    citation: 'Oo EM, Saw KEE, Oo HN, Than T, Thida K. Variable anatomy of the middle cerebral artery from its origin to the edge of the Sylvian fissure: a direct fresh brain study. ScientificWorldJournal. 2021;2021:6652676. doi:10.1155/2021/6652676.' },
  { id: 'choquevelasquez2018', pmid: '30159200', pmcid: 'PMC6094498', shortLabel: 'Choque-Velasquez 2018', url: doi('10.4103/sni.sni_185_18'),
    citation: 'Choque-Velasquez J, Hernesniemi J. One burr-hole craniotomy: lateral supraorbital approach in Helsinki Neurosurgery. Surg Neurol Int. 2018;9:156. doi:10.4103/sni.sni_185_18.' },
  { id: 'cha2012', pmid: '22949961', pmcid: 'PMC3424172', shortLabel: 'Cha 2012', url: doi('10.3340/jkns.2012.51.6.334'),
    citation: 'Cha KC, Hong SC, Kim JS. Comparison between lateral supraorbital approach and pterional approach in the surgical treatment of unruptured intracranial aneurysms. J Korean Neurosurg Soc. 2012;51(6):334–337. doi:10.3340/jkns.2012.51.6.334.' },
  { id: 'mosteiro2026', pmid: '41975109', pmcid: 'PMC13183721', shortLabel: 'Mosteiro 2026', url: doi('10.1007/s00701-026-06871-x'),
    citation: 'Mosteiro A, Codes M, Cabrera G, Mena XM, Topczewski T, Andrade-Barazarte H, et al. Selecting the optimal keyhole approach for internal carotid and middle cerebral artery aneurysms. Anatomical comparison of transorbital, lateral supraorbital and minipterional routes with clinical implications. Acta Neurochir (Wien). 2026;168(1):107. doi:10.1007/s00701-026-06871-x.' },
  { id: 'amini2024', pmid: '39034333', pmcid: 'PMC11271347', shortLabel: 'Amini 2024', url: doi('10.1007/s10143-024-02518-6'),
    citation: 'Amini A, Swiatek VM, Stein KP, Rashidi A, Sandalcioglu IE, Neyazi B. Pterional vs. lateral supraorbital approach in the management of middle cerebral artery aneurysms: insights from a phantom model study. Neurosurg Rev. 2024;47(1):344. doi:10.1007/s10143-024-02518-6.' },
  { id: 'imada2021', pmid: '34645716', pmcid: 'PMC8666298', shortLabel: 'Imada 2021', url: doi('10.2176/nmc.oa.2021-0080'),
    citation: 'Imada Y, Mihara C, Kawamoto H, Kurisu K. Dissection of the Sylvian fissure in the trans-sylvian approach based on the morphological classification of the superficial middle cerebral vein. Neurol Med Chir (Tokyo). 2021;61(12):731–740. doi:10.2176/nmc.oa.2021-0080.' },
  { id: 'symss2014', pmid: '25126118', pmcid: 'PMC4129577', shortLabel: 'Symss 2014', url: doi('10.4103/1793-5482.136708'),
    citation: 'Symss NP, Ramamurthi R, Kapu R, Rao SM, Vasudevan MC, Pande A, et al. Complication avoidance in transcallosal transforaminal approach to colloid cysts of the anterior third ventricle: an analysis of 80 cases. Asian J Neurosurg. 2014;9(2):51–57. doi:10.4103/1793-5482.136708.' },
  { id: 'nair2016', pmid: '27366259', pmcid: 'PMC4849301', shortLabel: 'Nair 2016', url: doi('10.4103/1793-5482.144185'),
    citation: 'Nair S, Gopalakrishnan CV, Menon G, Easwer HV, Abraham M. Interhemispheric transcallosal transforaminal approach and its variants to colloid cyst of third ventricle: technical issues based on a single institutional experience of 297 cases. Asian J Neurosurg. 2016;11(3):292–297. doi:10.4103/1793-5482.144185.' },
  { id: 'chrissicopoulos2024', pmid: '38529447', pmcid: 'PMC10961669', shortLabel: 'Chrissicopoulos 2024', url: doi('10.7759/cureus.54800'),
    citation: 'Chrissicopoulos C, Mavrovounis G, Piagkou M, Triantafyllou G, Nasis N, Stranjalis G, et al. The anatomical variation of the distal anterior cerebral artery: an angiographic study in a Greek population sample. Cureus. 2024;16(2):e54800. doi:10.7759/cureus.54800.' },
  { id: 'triantafyllou2025', pmid: '40804858', pmcid: 'PMC12346034', shortLabel: 'Triantafyllou 2025', url: doi('10.3390/diagnostics15151893'),
    citation: 'Triantafyllou G, Paschopoulos I, Kamoutsis K, Papadopoulos-Manolarakis P, Valenzuela-Fuenzalida JJ, Sanchis-Gimeno J, et al. Morphological variations of the anterior cerebral artery: a systematic review with meta-analysis of 85,316 patients. Diagnostics (Basel). 2025;15(15):1893. doi:10.3390/diagnostics15151893.' },
  { id: 'cho2024', pmid: '38703239', pmcid: 'PMC11322403', shortLabel: 'Cho 2024', url: doi('10.1007/s00381-024-06443-3'),
    citation: 'Cho A, Lippolis MA, Herta J, Dogan M, Hedrich C, Azizi AA, et al. The telovelar approach for fourth ventricular tumors in children: is removal of the posterior arch of C1 necessary? Childs Nerv Syst. 2024;40(9):2707. doi:10.1007/s00381-024-06443-3.' },
  { id: 'pettersson2023', pmid: '37151430', pmcid: 'PMC10159312', shortLabel: 'Pettersson 2023', url: doi('10.25259/SNI_167_2023'),
    citation: 'Pettersson SD, Jabbar R, Popławska M, Och A, Orrego-Gonzalez E, Klepinowski T, et al. Telovelar versus transvermian approach to tumors of the fourth ventricle and their impact on postoperative neurological complications: a multicenter study. Surg Neurol Int. 2023;14:124. doi:10.25259/SNI_167_2023.' },
  { id: 'wang2023', pmid: '35968951', pmcid: 'PMC9944752', shortLabel: 'Wang 2023', url: doi('10.1097/SCS.0000000000008883'),
    citation: 'Wang J, Wang X, Xu J, Wu Z, Dou Y. Microsurgical management of fourth ventricle lesions via the median suboccipital keyhole telovelar approach. J Craniofac Surg. 2023;34(2):607. doi:10.1097/SCS.0000000000008883.' },
  { id: 'longatti2026', pmid: '41784833', pmcid: 'PMC12963120', shortLabel: 'Longatti 2026', url: doi('10.1007/s00381-026-07188-x'),
    citation: 'Longatti P, Fiorindi A, Siddi F, Boaro A, Canova G, Feletti A. The telovelar approach reshaped: a new perspective from inside the fourth ventricle. Childs Nerv Syst. 2026;42(1):96. doi:10.1007/s00381-026-07188-x.' },
  { id: 'pantu2026', pmid: '41515624', pmcid: 'PMC12785894', shortLabel: 'Pantu 2026', url: doi('10.3390/diagnostics16010129'),
    citation: 'Pantu C, Breazu A, Oprea S, Rădoi MP, Munteanu O, Dobrin N, et al. Telovelar approach for fourth-ventricular epidermoid cyst: anatomical respect, functional recovery, and long-term stability. Diagnostics (Basel). 2026;16(1):129. doi:10.3390/diagnostics16010129.' },
  { id: 'cavalheiro2015', pmid: '26351233', pmcid: 'PMC4564452', shortLabel: 'Cavalheiro 2015', url: doi('10.1007/s00381-015-2799-y'),
    citation: 'Cavalheiro S, Yagmurlu K, da Costa MDS, Nicácio JM, Rodrigues TP, Chaddad-Neto F, et al. Surgical approaches for brainstem tumors in pediatric patients. Childs Nerv Syst. 2015;31(10):1815–1840. doi:10.1007/s00381-015-2799-y.' },
];
export const APPROACH_REF = new Map(APPROACH_REFS.map((r) => [r.id, r]));

const c = (text: string, ...refIds: string[]): ApproachClaim => ({ text, refIds });

/** the middle cerebral artery and the insula: the same anatomy behind either opening */
const ARTERY: ApproachClaim[] = [
  c('M1 leaves the internal carotid bifurcation lateral to the optic chiasm and runs laterally and slightly forward under the anterior perforated substance to the medial end of the Sylvian fissure. There it turns (the genu), crosses the limen insulae and enters the insular area.', 'srinivasa2021'),
  c('M2, the insular segment, runs from the genu at the limen insulae to the circular sulcus of the insula; M3 is the opercular segment and M4–M5 the cortical segments.', 'srinivasa2021'),
  c('In 30 cadaveric arteries, M1 (origin to genu) measured 16 ± 3 mm and 3 ± 0.5 mm across. The main trunk ended in a bifurcation in 73 %, as a single trunk in 10 % and in a trifurcation in 10 %.', 'srinivasa2021'),
  c('In 100 fresh hemispheres: bifurcation 72 %, trifurcation 16 %, a single trunk 12 %; the main trunk 20.6 ± 6.2 mm long.', 'oo2021'),
];
export const INSULA: ApproachClaim[] = [
  c('Three short and two long insular gyri. The limen insulae is a slightly raised, arched ridge at the junction of the sphenoidal and operculoinsular compartments of the fissure, from the temporal pole to the orbital surface of the frontal lobe.', 'wang2011'),
  c('The anterior, superior and inferior limiting sulci separate the insula from the fronto-orbital, frontoparietal and temporal opercula (23, 52 and 46 mm long in that study’s specimens).', 'wang2011'),
];
const FISSURE = c('The Sylvian fissure (the lateral sulcus) separates the frontal and parietal lobes from the temporal lobe; the insula and the main branches of the middle cerebral artery lie deep in it, covered by the opercula.', 'muhammad2019');
const VEINS = c('The superficial middle cerebral (Sylvian) vein is one of the main obstacles to a wide opening of the fissure. In 116 patients its pattern (five types) showed where to dissect so as to preserve it and its bridging veins; postoperative venous infarction occurred in 2.6 %.', 'imada2021');
const CISTERN = c('Opening the carotid cistern lets cerebrospinal fluid drain, which relaxes the brain, and exposes the internal carotid artery for proximal control; the dissection then goes medially to the chiasmatic and lamina terminalis cisterns.', 'yilmaz2025');
const CONTEXT = ['Internal carotid artery', 'Middle cerebral artery (M1 segment)', 'Middle cerebral artery (M2 segment)', 'Middle cerebral artery (M3 segment)',
  'Anterior cerebral artery (A1–A2)', 'Proximal lateral striate branches', 'Distal lateral striate branches', 'Optic nerve (II)', 'Oculomotor nerve (III)'];
const NOT_SHOWN = 'The scalp, temporalis muscle, dura and arachnoid; the Sylvian veins (this angiogram labels none near the fissure); the cortical (M4) branches of the middle cerebral artery, which the labels stop short of. The brain is a template fitted to this skull and its arteries, not this patient’s own, and its opening and lift are shapes, not a simulation of the tissue.';

export const APPROACHES: ApproachContent[] = [
  {
    id: 'pterional', view: 'transsylvian', name: 'Pterional transsylvian approach', camera: 'anterolateral',
    summary: 'The right pterional craniotomy cut out of this CT’s bone, and a template brain fitted into the skull. One slider opens its Sylvian fissure onto the insula and this patient’s middle cerebral artery; another lifts the frontal lobe off the orbital roof to look under it, at the carotid and the optic nerve.',
    sections: [sec('The craniotomy', [
      c('Four burr holes: the keyhole (McCarty) anterior to the superior temporal line and above the frontozygomatic suture; one in the frontal bone near the superior orbital rim, avoiding the frontal sinus, 3–4 cm from the first; one below the superior temporal line, near or just anterior to the coronal suture; and one in the temporal squama behind the sphenotemporal suture. Osteotomies join them.', 'yilmaz2025'),
      c('Three burr holes in another description: over the keyhole, behind the superior temporal line, and on the temporal squama near the upper zygomatic root.', 'sevgi2026'),
      c('Yaşargil’s 1975 modification limited the craniotomy, removed two-thirds of the sphenoid wing and opened the sylvian fissure and anterior cisterns to minimise frontal lobe retraction.', 'yilmaz2025'),
    ]), sec('The Sylvian fissure', [
      FISSURE,
      c('Its dissection begins at the frontal operculum, typically at the pars triangularis, where the fissure is widest; dissection between the frontal and temporal lobes exposes the middle cerebral artery and its branches.', 'yilmaz2025'),
      c('The pterional approach uses this naturally occurring plane to reach an aneurysm without extensive brain retraction.', 'ngando2013'),
      c('Yaşargil’s “natural spaces”: following the CSF spaces and the arachnoid cisterns, avoiding manipulation of the brain, to reach the lesion.', 'muhammad2019'),
      c('The fissure is split sharply (microscissors) or bluntly (bipolar tips), widely or in a focused opening of about 1 cm at the lesion. Retractors, if used, should hold the brain in place rather than retract it.', 'muhammad2019'),
      c('In the transsylvian transinsular approach the carotid cistern is opened between the optic nerve and the internal carotid artery, then the proximal fissure: this exposes about the anterior third of the insula and 1–2 cm of the M2 segments, and the temporal operculum can be retracted down to the inferior limiting sulcus.', 'wang2011'),
      c('Yaşargil described four types of fissure seen at operation: straight and wide, straight and narrow, with the frontal lobe herniated into it, and with the temporal lobe herniated into it. Among 98 patients with unruptured aneurysms the shares were 39 %, 44 %, 13 % and 5 %.', 'ngando2013'),
    ]), sec('Lifting the frontal lobe', [
      c('In the transsylvian transinsular approach, retraction is applied to the lateral fronto-orbital area to show the carotid cistern, which is opened between the optic nerve and the internal carotid artery.', 'wang2011'),
      CISTERN,
      c('After the fissure is dissected, retracting the frontal and temporal lobes exposes the optic nerve, the vessels and the anterior and middle cranial fossae.', 'yilmaz2025'),
    ]), sec('Middle cerebral artery', ARTERY, 'm1'), sec('Insula', INSULA), sec('Care points', [
      VEINS,
      c('The superficial Sylvian veins are preserved, especially those draining into the temporal lobe; frontal draining veins may be sacrificed if necessary.', 'yilmaz2025'),
      c('The orbital meningeal artery, met at the superolateral edge of the superior orbital fissure during sphenoid wing resection, often bleeds and is coagulated.', 'yilmaz2025'),
    ])],
    context: CONTEXT,
    notShown: NOT_SHOWN,
    focus: ['Middle cerebral artery (M2 segment)'],
    morphs: ['open', 'lift'],
  },
  {
    id: 'lso', view: 'lso', name: 'Lateral supraorbital approach', camera: 'frontolateral',
    summary: 'A right lateral supraorbital (LSO) craniotomy cut out of this CT’s bone, drawn larger than usual to show the anatomy, over the same fitted brain. The fissure lies at the craniotomy’s lower edge; the lift raises the frontal lobe to look along the orbital roof at the carotid, the optic nerve and M1, and the other slider opens the fissure.',
    sections: [sec('The craniotomy', [
      c('A more aesthetic variant of the classic pterional approach, developed in Helsinki and the approach used most there: a curved frontotemporal skin incision behind the hairline, stopping 2–3 cm above the zygoma, and the temporalis muscle opened only a little, near its upper insertion.', 'choquevelasquez2018'),
      c('One burr hole posteriorly, just below the insertion line of the temporalis muscle; the bone flap is cut mainly with the side-cutting craniotome and its basal part drilled off before it is lifted; about 3 × 4 cm.', 'cha2012'),
      c('In 61 patients each, the mean craniotomy area was 1275 mm² with the LSO and 2859 mm² with the pterional approach, and the mean operation time 117 against 164 minutes.', 'cha2012'),
      c('Through it: the anterior skull base, the sellar and suprasellar regions and selected upper basilar lesions. Middle cerebral artery aneurysms and lesions along the fissure or in the middle fossa need the proximal fissure opened further.', 'choquevelasquez2018'),
    ]), sec('The Sylvian fissure', [
      FISSURE,
      c('In the LSO the fissure lies at the lower edge of the craniotomy, under the dural edge below the sphenoid ridge, and is seen by gentle pressure on the exposed frontal lobe.', 'mosteiro2026'),
      c('It is dissected from proximal to distal, starting at the optico-carotid region, or from distal to proximal, starting at the anterior Sylvian point, mainly by gentle distraction of the frontal lobe: the temporal lobe is not accessible.', 'mosteiro2026'),
      c('After the fissure is opened a little, a single spatula on the frontal lobe moves the brain.', 'cha2012'),
    ]), sec('Lifting the frontal lobe', [
      CISTERN,
      c('In eight cadaver sides per approach, the surgical freedom at the internal carotid bifurcation was largest through the LSO (85 cm², against the minipterional and transorbital routes); at the posterior communicating artery it was 71 cm², against 102 cm² through the minipterional; at M1 the approaches did not differ.', 'mosteiro2026'),
    ]), sec('Middle cerebral artery', [
      ...ARTERY,
      c('In a phantom model of middle cerebral artery aneurysm clipping (22 participants), the LSO had success rates comparable with the pterional approach; the authors suggest it may suit patients whose M1 is shorter than average.', 'amini2024'),
    ], 'm1'), sec('Insula', INSULA), sec('Care points', [VEINS])],
    context: [...CONTEXT, 'Olfactory nerve (I)'],
    notShown: `${NOT_SHOWN} The craniotomy is drawn larger than the usual LSO, its outline placed by hand on this skull.`,
    focus: ['Middle cerebral artery (M1 segment)', 'Optic nerve (II)'],
    morphs: ['lift', 'open'],
  },
  {
    id: 'interhemispheric', view: 'interhemispheric', name: 'Interhemispheric transcallosal approach', camera: 'vertex', hemi: 'both',
    summary: 'A right parasagittal craniotomy at the coronal suture cut out of this CT’s bone, over the same fitted brain. The slider holds the right hemisphere off the falx, opening the interhemispheric fissure down to the corpus callosum and this patient’s anterior cerebral arteries on it.',
    sections: [sec('The craniotomy', [
      c('In 80 patients with colloid cysts of the third ventricle, all through a right frontoparietal midline craniotomy and an anterior transcallosal transforaminal approach.', 'symss2014'),
      c('A right-sided precoronal parasagittal craniotomy suffices even when a cyst blocks the left foramen of Monro and the left lateral ventricle is the larger: both foramina are exposed equally well. Of 297 patients, 275 (92.6 %) were operated through the interhemispheric transcallosal approach, 22 transcortically.', 'nair2016'),
    ]), sec('Bridging veins', [
      c('In Apuzzo’s study of 100 angiograms, 70 % of the parasagittal venous tributaries entered the superior sagittal sinus within 2 cm behind the coronal suture, 30 % within 2 cm in front of it. He stressed planning the dural flap, and mobilising the cortical veins rather than sacrificing them.', 'symss2014'),
      c('The bridging parasagittal veins can be in the way, but a gap of 2–3 cm between them is usually found, wide enough to remove the cyst.', 'nair2016'),
      c('Venous cortical infarction (4 of 80 patients) is prevented by not sacrificing bridging veins and by avoiding prolonged excessive retraction of the frontal lobe; if a vein must be sacrificed, the retractor is not applied over the area it drains.', 'symss2014'),
    ]), sec('Holding the hemisphere off the falx', [
      c('Prolonged retraction may cause injury if the retractor is not released periodically. Excessive lateral retraction can make the frontal lobe swell, and medial retraction on the superior sagittal sinus can lead to its thrombosis.', 'symss2014'),
      c('Transient hemiparesis (4 of 80 patients) followed retraction oedema, venous infarction or prolonged retraction of the pericallosal artery.', 'symss2014'),
    ]), sec('The corpus callosum', [
      c('The callosum is incised in the midline between the pericallosal arteries, 1.5–2.5 cm long in the sagittal plane, in its anterior part; an incision of up to 2.5 cm in the anterior body exposes the ventricles without disconnection syndromes.', 'symss2014'),
      c('A small incision (1 cm) in the corpus callosum is usually enough to remove a colloid cyst.', 'nair2016'),
    ]), sec('Anterior cerebral artery', [
      c('The ACA passes anteromedial to the optic nerve, then runs in the great longitudinal fissure and around the genu of the corpus callosum.', 'triantafyllou2025'),
      c('Its segments: precommunicating (A1), infracallosal (A2), pericallosal (A3), supracallosal (A4) and postcallosal (A5); A2–A5 are the distal ACA.', 'chrissicopoulos2024'),
      c('The callosomarginal artery runs in or near the cingulate sulcus and gives two or more major cortical branches; it most often arises from A3. On angiograms it was present in 824 of 912 hemispheres (90.4 %).', 'chrissicopoulos2024'),
      c('Of 456 patients, 81.8 % had the typical distal ACA, 14.5 % a bihemispheric, 2.2 % a median and 1.5 % an azygos pattern. A median ACA arises from the anterior communicating artery beside the A2 segments and supplies the corpus callosum and both hemispheres.', 'chrissicopoulos2024'),
      c('Pooled over 85,316 patients the typical ACA was found in 93.75 %; the commonest variant, an accessory ACA (also called a triplicated ACA, accessory A2 or median artery of the corpus callosum), in 1.99 %. It runs parallel to and behind the pericallosal artery, which makes it vulnerable during surgery.', 'triantafyllou2025'),
    ], 'aca'), sec('Care points', [
      c('Small branches of the pericallosal arteries can be injured during lateral dissection. Adherent cingulate gyri can be mistaken for the corpus callosum and cut, and the callosomarginal artery injured, weakening the opposite leg.', 'symss2014'),
      c('Seizures after the operation: 9 of 275 (3 %) through the transcallosal route, against 14 % transcortically.', 'nair2016'),
    ])],
    context: ['Anterior cerebral artery (A1–A2)', 'Anterior cerebral artery (A3)', 'Third anterior cerebral artery (A2)', 'Third anterior cerebral artery (A3)',
      'Anterior communicating artery', 'Superior sagittal sinus', 'Internal cerebral veins', 'Falx cerebri'],
    notShown: 'The scalp, dura and arachnoid; the bridging veins and the cortical branches of the anterior cerebral artery (this angiogram labels neither: TopBrain’s labels stop at A3); the left A3, which this CT’s labels do not include. The brain is a template fitted to this skull and its arteries, not this patient’s own; its medial wall is the template’s cut through the corpus callosum, and the retraction is a shape, not a simulation of the tissue.',
    focus: ['Anterior cerebral artery (A3)', 'Third anterior cerebral artery (A3)'],
    morphs: ['interhemispheric'],
  },
  {
    id: 'suboccipital', view: 'telovelar', name: 'Telovelar approach', camera: 'suboccipital', hemi: 'both', brain: 'hindbrain',
    summary: 'A midline suboccipital craniotomy cut out of this CT’s bone, with the cerebellum, brainstem and fourth ventricle of an anatomical model fitted into its posterior fossa. The slider draws the cerebellar tonsils apart, opening the cerebellomedullary fissure onto the lower roof of the fourth ventricle and this patient’s posterior inferior cerebellar arteries.',
    sections: [sec('The craniotomy', [
      c('A median suboccipital craniectomy, then the telovelar route along the embryonic cerebellomedullary fissure, which spares the vermis and the brainstem.', 'pantu2026'),
      c('In a keyhole variant (13 patients) the midline skin incision ran from the line between the mastoid tips 3 cm up and 1 cm down; the osteoplastic craniotomy was about 2 cm across, and the dura was opened in a reverse U extended towards the foramen magnum.', 'wang2023'),
      c('Of 67 patients with fourth-ventricle tumours, the posterior fossa was opened by craniotomy in 76.1 % and craniectomy in 23.9 %.', 'pettersson2023'),
      c('In 39 of 40 children operated through a telovelar or telovelar-like approach in a modified prone position, the posterior arch of C1 was left; none needed it removed for exposure. A cadaver study (six heads) had found that removing it steepens the angle to the upper fourth ventricle.', 'cho2024'),
    ]), sec('The cerebellomedullary fissure and the tonsils', [
      c('Matsushima’s transcerebellomedullary fissure approach (1992), now called telovelar, reaches the fourth ventricle from below through the fissure without splitting the vermis; in its unilateral form one cerebellar tonsil is retracted laterally and the tela choroidea opened.', 'pettersson2023'),
      c('With the arachnoid opened, both tonsils, the uvula, the posterior inferior cerebellar artery (which disappears into the cerebellomedullary fissure), the foramen of Magendie and the tela choroidea are seen. The tonsil is retracted after the uvulotonsillar and medullotonsillar spaces are dissected, and the tela choroidea is freed from the taenia on both sides.', 'wang2023'),
      c('The cerebellum has tentorial, petrosal and suboccipital surfaces; the suboccipital surface of the cerebellum and the medulla are supplied by the posterior inferior cerebellar artery.', 'cavalheiro2015'),
    ], 'tonsils'), sec('The roof of the fourth ventricle', [
      c('Its caudal roof: the uvula and nodulus of the vermis; the inferior medullary velum branching off the nodulus on each side to the flocculus just outside the foramina of Luschka; below, the tela choroidea with the choroid plexus, fixed by the taeniae beside the foramen of Magendie.', 'longatti2026'),
      c('The telovelar incision starts low in the tela once the uvulotonsillar fissure is open: safe in its caudal part, cautious from the choroid plexus to the telovelar junction, very cautious in the inferior medullary velum near the fastigium. Seen endoscopically the velum beside the nodulus was barely 6 mm long (5.5–7.2 mm), and cutting it added little access.', 'longatti2026'),
      c('Dividing both taeniae can make the opening four or five times the size of the foramen of Magendie, but the roof can then be lifted only a little: the posterior inferior cerebellar artery crosses the field and can be stretched.', 'longatti2026'),
    ]), sec('Care points', [
      c('Incising the vermis where it is not infiltrated is generally held to raise the risk of a posterior fossa syndrome, including cerebellar mutism.', 'cho2024'),
      c('In 67 patients, and pooled with 304 from three earlier studies, the risk of postoperative neurological complications did not differ significantly between the telovelar and transvermian approaches. Neurophysiological monitoring protected against speech and swallowing deficits (odds ratio 0.076), and an external ventricular drain during surgery against gait and motor deficits (0.075) and hydrocephalus (0.020).', 'pettersson2023'),
      c('After a keyhole telovelar approach the commonest new or worse deficit was of gait or focal motor function (15.4 %); the abducens nerve was the cranial nerve most often affected, then the facial.', 'wang2023'),
    ])],
    context: ['Posterior inferior cerebellar artery', 'Vertebral artery', 'Basilar artery', 'Superior cerebellar artery', 'Transverse sinus', 'Sigmoid sinus',
      'Glossopharyngeal nerve (IX)', 'Vagus nerve (X)', 'Accessory nerve (XI)', 'Hypoglossal nerve (XII)'],
    notShown: 'The skin, muscles, dura and arachnoid; the tela choroidea, inferior medullary velum and choroid plexus (thin sheets the model lacks: the fourth ventricle’s lower roof is open in it); the occipital sinus and the veins of the fissure. The cerebellum, brainstem and fourth ventricle are one adult’s anatomical model (Z-Anatomy) fitted into this skull and around its arteries, not this patient’s own; the tonsils’ retraction is a shape, not a simulation of the tissue.',
    focus: ['Fourth ventricle', 'Tonsil of cerebellum'],
    morphs: ['telovelar'],
  },
];
export const APPROACH = new Map(APPROACHES.map((a) => [a.id, a]));
