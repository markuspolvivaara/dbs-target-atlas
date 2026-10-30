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
  /** the frame's least radius, mm (default 60): smaller comes closer */
  radius?: number;
  /** false: frame on the focus alone, not the bone removed too (a corridor that looks past the opening's middle) */
  frameOpening?: boolean;
  /** the shapes of the brain the view offers (named morph targets: open, lift, lsoLift, interhemispheric, telovelar), a slider each */
  morphs: string[];
  /** landmarks (names) the view labels */
  landmarks?: string[];
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
  { id: 'erginoglu2026', pmid: '41283941', pmcid: 'PMC12967451', shortLabel: 'Erginoglu 2026', url: doi('10.1007/s11845-025-04170-5'),
    citation: 'Erginoglu U, Sulaimanov U, Uslu I, Ataoglu C, Keles A, Aycan A, et al. Quantitative anatomy of the fourth ventricle floor: a cadaveric morphometric study. Ir J Med Sci. 2026;195(1):373–381. doi:10.1007/s11845-025-04170-5.' },
  { id: 'zhuang2021', pmid: '34930175', pmcid: 'PMC8686214', shortLabel: 'Zhuang 2021', url: doi('10.1186/s12883-021-02524-x'),
    citation: 'Zhuang S, Xie W, Mao C. Bilateral facial colliculus syndrome caused by pontine tegmentum infarction: a case report. BMC Neurol. 2021;21(1):492. doi:10.1186/s12883-021-02524-x.' },
  { id: 'ota2024', pmid: '41583581', pmcid: 'PMC12778471', shortLabel: 'Ota 2024', url: doi('10.1161/SVIN.123.001050'),
    citation: 'Ota T. Functional cerebral venous anatomy from the viewpoint of venous collaterals part I, supratentorial superficial and deep venous system. Stroke Vasc Interv Neurol. 2024;4(2):e001050. doi:10.1161/SVIN.123.001050.' },
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
  { id: 'liu2014', pmid: '24678432', pmcid: 'PMC3942613', shortLabel: 'Liu 2014', url: doi('10.4103/2152-7806.126081'),
    citation: 'Liu R, Kasper EM. Bilateral telovelar approach: a safe route revisited for resections of various large fourth ventricle tumors. Surg Neurol Int. 2014;5:16. doi:10.4103/2152-7806.126081.' },
  { id: 'wang2023', pmid: '35968951', pmcid: 'PMC9944752', shortLabel: 'Wang 2023', url: doi('10.1097/SCS.0000000000008883'),
    citation: 'Wang J, Wang X, Xu J, Wu Z, Dou Y. Microsurgical management of fourth ventricle lesions via the median suboccipital keyhole telovelar approach. J Craniofac Surg. 2023;34(2):607. doi:10.1097/SCS.0000000000008883.' },
  { id: 'longatti2026', pmid: '41784833', pmcid: 'PMC12963120', shortLabel: 'Longatti 2026', url: doi('10.1007/s00381-026-07188-x'),
    citation: 'Longatti P, Fiorindi A, Siddi F, Boaro A, Canova G, Feletti A. The telovelar approach reshaped: a new perspective from inside the fourth ventricle. Childs Nerv Syst. 2026;42(1):96. doi:10.1007/s00381-026-07188-x.' },
  { id: 'pantu2026', pmid: '41515624', pmcid: 'PMC12785894', shortLabel: 'Pantu 2026', url: doi('10.3390/diagnostics16010129'),
    citation: 'Pantu C, Breazu A, Oprea S, Rădoi MP, Munteanu O, Dobrin N, et al. Telovelar approach for fourth-ventricular epidermoid cyst: anatomical respect, functional recovery, and long-term stability. Diagnostics (Basel). 2026;16(1):129. doi:10.3390/diagnostics16010129.' },
  { id: 'cavalheiro2015', pmid: '26351233', pmcid: 'PMC4564452', shortLabel: 'Cavalheiro 2015', url: doi('10.1007/s00381-015-2799-y'),
    citation: 'Cavalheiro S, Yagmurlu K, da Costa MDS, Nicácio JM, Rodrigues TP, Chaddad-Neto F, et al. Surgical approaches for brainstem tumors in pediatric patients. Childs Nerv Syst. 2015;31(10):1815–1840. doi:10.1007/s00381-015-2799-y.' },
  { id: 'jian2021', pmid: '34692760', pmcid: 'PMC8531805', shortLabel: 'Jian 2021', url: doi('10.3389/fsurg.2021.700777'),
    citation: 'Jian ZH, Sheng MF, Li JY, An DZ, Weng ZJ, Chen G. Developing a method to precisely locate the keypoint during craniotomy using the retrosigmoid keyhole approach: surgical anatomy and technical nuances. Front Surg. 2021;8:700777. doi:10.3389/fsurg.2021.700777.' },
  { id: 'jian2022', pmid: '35495767', pmcid: 'PMC9046933', shortLabel: 'Jian 2022', url: doi('10.3389/fsurg.2022.809098'),
    citation: 'Jian ZH, Sheng MF, Li JY, Li Y, Weng ZJ, Chen G. Precise localization in craniotomy with a retrosigmoid keyhole approach: microsurgical anatomy and clinical study. Front Surg. 2022;9:809098. doi:10.3389/fsurg.2022.809098.' },
  { id: 'jian2024', pmid: '39008189', pmcid: 'PMC11249418', shortLabel: 'Jian 2024', url: doi('10.1007/s10143-024-02583-x'),
    citation: 'Jian ZH, Sheng MF, Liao CC, Weng ZJ, Li JY, Yi XF, et al. A novel theory for rapid localization of the transverse-sigmoid sinus junction and “keyhole” in the retrosigmoid keyhole approach: micro-anatomical study and clinical application. Neurosurg Rev. 2024;47(1):331. doi:10.1007/s10143-024-02583-x.' },
  { id: 'hu2023', pmid: '36908299', pmcid: 'PMC9995208', shortLabel: 'Hu 2023', url: doi('10.1155/2023/5407912'),
    citation: 'Hu W, Zhou J, Liu ZM, Li Y, Cai QF, Hu XM, et al. Computed tomography study of the retrosigmoid craniotomy keyhole approach using surface landmarks. Int J Clin Pract. 2023;2023:5407912. doi:10.1155/2023/5407912.' },
  { id: 'choquevelasquez2018rs', pmid: '30186664', pmcid: 'PMC6108164', shortLabel: 'Choque-Velasquez 2018b', url: doi('10.4103/sni.sni_186_18'),
    citation: 'Choque-Velasquez J, Hernesniemi J. One burr-hole craniotomy: upper retrosigmoid approach in Helsinki Neurosurgery. Surg Neurol Int. 2018;9:163. doi:10.4103/sni.sni_186_18.' },
  { id: 'hamelinck2024', pmid: '39193063', pmcid: 'PMC11349056', shortLabel: 'Hamelinck 2024', url: doi('10.7759/cureus.67841'),
    citation: 'Hamelinck Z, Thijs D, Feyen B, Vanloon M, Van Rompaey V, Menovsky T. A novel way for efficient and safe posterior fossa relaxation: the extradural opening of the cisterna magna in retrosigmoid craniotomy. Cureus. 2024;16(8):e67841. doi:10.7759/cureus.67841.' },
  { id: 'meybodi2023', pmid: '36895247', pmcid: 'PMC9990784', shortLabel: 'Meybodi 2023', url: doi('10.25259/SNI_1097_2022'),
    citation: 'Meybodi AT, Liang AS, Mokhtari P, Moreira LB, Zhao X, Lawton MT, et al. Nervus intermedius: microsurgical and anatomic relationships to the cerebellopontine angle neurovascular complex. Surg Neurol Int. 2023;14:37. doi:10.25259/SNI_1097_2022.' },
  { id: 'jeican2026', pmid: '42356086', pmcid: 'PMC13302864', shortLabel: 'Jeican 2026', url: doi('10.3390/medicina62061073'),
    citation: 'Jeican II, Siserman CV, Toader C, Trombitaș VE. Microsurgical anatomy of the labyrinthine artery: a cadaveric microdissection study of number, origin and course at the cerebellopontine angle. Medicina (Kaunas). 2026;62(6):1073. doi:10.3390/medicina62061073.' },
  { id: 'basamh2020', pmid: '31768757', pmcid: 'PMC6942005', shortLabel: 'Basamh 2020', url: doi('10.1007/s00701-019-04109-7'),
    citation: 'Basamh M, Sinning N, Kehler U. Individual variations of the superior petrosal vein complex and their microsurgical relevance in 50 cases of trigeminal microvascular decompression. Acta Neurochir (Wien). 2020;162(1):197–209. doi:10.1007/s00701-019-04109-7.' },
  { id: 'watanabe2013', pmid: '23990034', pmcid: 'PMC3779012', shortLabel: 'Watanabe 2013', url: doi('10.1007/s00701-013-1840-8'),
    citation: 'Watanabe T, Igarashi T, Fukushima T, Yoshino A, Katayama Y. Anatomical variation of superior petrosal vein and its management during surgery for cerebellopontine angle meningiomas. Acta Neurochir (Wien). 2013;155(10):1871–1878. doi:10.1007/s00701-013-1840-8.' },
  { id: 'przepiorka2023', pmid: '37508971', pmcid: 'PMC10377583', shortLabel: 'Przepiorka 2023', url: doi('10.3390/brainsci13071039'),
    citation: 'Przepiorka L, Wójtowicz K, Camlet K, Jankowski J, Kujawski S, Grabowska-Derlatka L, et al. Postoperative cerebral venous sinus thrombosis following a retrosigmoid craniotomy—a clinical and radiological analysis. Brain Sci. 2023;13(7):1039. doi:10.3390/brainsci13071039.' },
  { id: 'tang2025', pmid: '40527834', pmcid: 'PMC12173248', shortLabel: 'Tang 2025', url: doi('10.1097/MD.0000000000042838'),
    citation: 'Tang M, Richard SA, Lan Z. Cerebrospinal fluid leakage after retrosigmoid craniotomy and craniectomy for cerebellopontine angle tumors: a comparative retrospective study. Medicine (Baltimore). 2025;104(24):e42838. doi:10.1097/MD.0000000000042838.' },
  { id: 'aftahy2024', pmid: '39229481', pmcid: 'PMC11369374', shortLabel: 'Aftahy 2024', url: doi('10.1016/j.bas.2024.102909'),
    citation: 'Aftahy AK, Goldberg M, Butenschoen VM, Wagner A, Meyer B, Negwer C. Functional outcomes after retrosigmoid approach to the cerebellopontine angle: observations from a single-center experience of over 13 years. Brain Spine. 2024;4:102909. doi:10.1016/j.bas.2024.102909.' },
  { id: 'zanin2023', pmid: '37959312', pmcid: 'PMC10648058', shortLabel: 'Zanin 2023', url: doi('10.3390/jcm12216847'),
    citation: 'Zanin L, Agosti E, Ebner F, de Maria L, Belotti F, Buffoli B, et al. Quantitative anatomical comparison of surgical approaches to Meckel’s cave. J Clin Med. 2023;12(21):6847. doi:10.3390/jcm12216847.' },
  { id: 'solari2012', pmid: '23905043', pmcid: 'PMC3728777', shortLabel: 'Solari 2012', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC3728777/',
    citation: 'Solari D, Villa A, De Angelis M, Esposito F, Cavallo LM, Cappabianca P. Anatomy and surgery of the endoscopic endonasal approach to the skull base. Transl Med UniSa. 2012;2:36–46.' },
  { id: 'vanlindert2010', pmid: '20306338', pmcid: 'PMC2872017', shortLabel: 'van Lindert 2010', url: doi('10.1007/s00701-010-0629-2'),
    citation: 'van Lindert EJ, Ingels K, Mylanus E, Grotenhuis JA. Variations of endonasal anatomy: relevance for the endoscopic endonasal transsphenoidal approach. Acta Neurochir (Wien). 2010;152(6):1015–1020. doi:10.1007/s00701-010-0629-2.' },
  { id: 'famurewa2018', pmid: '31198272', pmcid: 'PMC6561078', shortLabel: 'Famurewa 2018', url: doi('10.4103/nmj.nmj_138_18'),
    citation: 'Famurewa OC, Ibitoye BO, Ameye SA, Asaleye CM, Ayoola OO, Onigbinde OS. Sphenoid sinus pneumatization, septation, and the internal carotid artery: a computed tomography study. Niger Med J. 2018;59(1):7–13. doi:10.4103/nmj.nmj_138_18.' },
  { id: 'paudel2025', pmid: '41768804', pmcid: 'PMC12750977', shortLabel: 'Paudel 2025', url: doi('10.31729/jnma.9088'),
    citation: 'Paudel S, Rokaha PS, Bista A, Subedi N, Thapa NB. Normative data for the dimensions and volume of pituitary gland in the general population undergoing magnetic resonance imaging under a tertiary care center: an observational study. JNMA J Nepal Med Assoc. 2025;63(286):423–427. doi:10.31729/jnma.9088.' },
  { id: 'singh2018', pmid: '30294567', pmcid: 'PMC6166545', shortLabel: 'Singh 2018', url: doi('10.4103/ijem.IJEM_199_18'),
    citation: 'Singh AKC, Kandasamy D, Garg A, Jyotsna VP, Khadgawat R. Study of pituitary morphometry using MRI in Indian subjects. Indian J Endocrinol Metab. 2018;22(5):605–609. doi:10.4103/ijem.IJEM_199_18.' },
  { id: 'yohannan2015', pmid: '26473083', pmcid: 'PMC4584028', shortLabel: 'Yohannan 2015', url: doi('10.1155/2015/618042'),
    citation: 'Yohannan DG, Krishnapillai R, Suresh R, Ramnarayan S. A morphometric study of the foramen of diaphragma sellae and delineation of its relation to optic neural pathways through computer aided superimposition. Anat Res Int. 2015;2015:618042. doi:10.1155/2015/618042.' },
  { id: 'chung2016cs', pmid: '27510391', pmcid: 'PMC4974189', shortLabel: 'Chung 2016', url: doi('10.3346/jkms.2016.31.9.1455'),
    citation: 'Chung BS, Ahn YH, Park JS. Ten triangles around cavernous sinus for surgical approach, described by schematic diagram and three dimensional models with the sectioned images. J Korean Med Sci. 2016;31(9):1455–1463. doi:10.3346/jkms.2016.31.9.1455.' },
  { id: 'corvino2023', pmid: '37626571', pmcid: 'PMC10452901', shortLabel: 'Corvino 2023', url: doi('10.3390/brainsci13081215'),
    citation: 'Corvino S, Villanueva-Solórzano PL, Offi M, Armocida D, Nonaka M, Iaconetta G, et al. A new perspective on the cavernous sinus as seen through multiple surgical corridors: anatomical study comparing the transorbital, endonasal, and transcranial routes and the relative coterminous spatial regions. Brain Sci. 2023;13(8):1215. doi:10.3390/brainsci13081215.' },
  { id: 'chotai2018', pmid: '29492113', pmcid: 'PMC5820859', shortLabel: 'Chotai 2018', url: doi('10.4103/ajns.AJNS_26_16'),
    citation: 'Chotai S, Liu Y, Qi S. Review of surgical anatomy of the tumors involving cavernous sinus. Asian J Neurosurg. 2018;13(1):1–8. doi:10.4103/ajns.AJNS_26_16.' },
  { id: 'wysiadecki2021', pmid: '34065668', pmcid: 'PMC8156379', shortLabel: 'Wysiadecki 2021', url: doi('10.3390/brainsci11050649'),
    citation: 'Wysiadecki G, Radek M, Tubbs RS, Iwanaga J, Walocha J, Brzeziński P, et al. Gross and micro-anatomical study of the cavernous segment of the abducens nerve and its relationships to internal carotid plexus: application to skull base surgery. Brain Sci. 2021;11(5):649. doi:10.3390/brainsci11050649.' },
  { id: 'tanoue2020', pmid: '37502139', pmcid: 'PMC10370663', shortLabel: 'Tanoue 2020', url: doi('10.5797/jnet.ra.2020-0086'),
    citation: 'Tanoue S, Hirohata M, Takeuchi Y, Orito K, Kajiwara S, Abe T. Venous anatomy of the cavernous sinus and relevant veins. J Neuroendovasc Ther. 2020;14(12):547–557. doi:10.5797/jnet.ra.2020-0086.' },
  { id: 'nguyen2026', pmid: '42332465', pmcid: 'PMC13286435', shortLabel: 'Nguyen 2026', url: doi('10.1097/MD.0000000000049344'),
    citation: 'Nguyen MQ, Tang MP, Nguyen HT, Tran HT, Tran TT, Tran NBMH. Association of sphenoid sinus pneumatization patterns, Onodi cells, and rostrum pneumatization with natural ostium location: a cross-sectional CT study. Medicine (Baltimore). 2026;105(25):e49344. doi:10.1097/MD.0000000000049344.' },
  { id: 'araujocastro2021', pmid: '35127519', pmcid: 'PMC8810816', shortLabel: 'Araujo-Castro 2021', url: doi('10.3389/fonc.2021.807040'),
    citation: 'Araujo-Castro M, Acitores Cancela A, Vior C, Pascual-Corrales E, Rodríguez Berrocal V. Radiological Knosp, revised-Knosp, and Hardy-Wilson classifications for the prediction of surgical outcomes in the endoscopic endonasal surgery of pituitary adenomas: study of 228 cases. Front Oncol. 2021;11:807040. doi:10.3389/fonc.2021.807040.' },
  { id: 'gupta2020', pmid: '32232723', pmcid: 'PMC7669921', shortLabel: 'Gupta 2020', url: doi('10.1007/s12105-020-01155-x'),
    citation: 'Gupta VK, Thakker A, Gupta KK. Vestibular schwannoma: what we know and where we are heading. Head Neck Pathol. 2020;14(4):1058–1066. doi:10.1007/s12105-020-01155-x.' },
  { id: 'starnoni2020', pmid: '32728903', pmcid: 'PMC7550309', shortLabel: 'Starnoni 2020', url: doi('10.1007/s00701-020-04491-7'),
    citation: 'Starnoni D, Giammattei L, Cossu G, Link MJ, Roche PH, Chacko AG, et al. Surgical management for large vestibular schwannomas: a systematic review, meta-analysis, and consensus statement on behalf of the EANS skull base section. Acta Neurochir (Wien). 2020;162(11):2595–2617. doi:10.1007/s00701-020-04491-7.' },
  { id: 'choi2014', pmid: '25289119', pmcid: 'PMC4185313', shortLabel: 'Choi 2014', url: doi('10.3340/jkns.2014.56.1.11'),
    citation: 'Choi KS, Kim MS, Kwon HG, Jang SH, Kim OL. Preoperative identification of facial nerve in vestibular schwannomas surgery using diffusion tensor tractography. J Korean Neurosurg Soc. 2014;56(1):11–15. doi:10.3340/jkns.2014.56.1.11.' },
  { id: 'ius2021', pmid: '34071391', pmcid: 'PMC8198762', shortLabel: 'Ius 2021', url: doi('10.3390/cancers13112664'),
    citation: 'Ius T, Tel A, Minniti G, Somma T, Solari D, Longhi M, et al. Advances in multidisciplinary management of skull base meningiomas. Cancers (Basel). 2021;13(11):2664. doi:10.3390/cancers13112664.' },
  { id: 'muskens2018', pmid: '29127655', pmcid: 'PMC5735207', shortLabel: 'Muskens 2018', url: doi('10.1007/s00701-017-3390-y'),
    citation: 'Muskens IS, Briceno V, Ouwehand TL, Castlen JP, Gormley WB, Aglio LS, et al. The endoscopic endonasal approach is not superior to the microscopic transcranial approach for anterior skull base meningiomas—a meta-analysis. Acta Neurochir (Wien). 2018;160(1):59–75. doi:10.1007/s00701-017-3390-y.' },
  { id: 'bruneau2008', pmid: '17882459', pmcid: 'PMC2077911', shortLabel: 'Bruneau 2008', url: doi('10.1007/s10143-007-0097-1'),
    citation: 'Bruneau M, George B. Foramen magnum meningiomas: detailed surgical approaches and technical aspects at Lariboisière Hospital and review of the literature. Neurosurg Rev. 2008;31(1):19–32. doi:10.1007/s10143-007-0097-1.' },
  { id: 'rodriguezrubio2019', pmid: '31929953', pmcid: 'PMC6945284', shortLabel: 'Rodriguez Rubio 2019', url: doi('10.7759/cureus.6053'),
    citation: 'Rodriguez Rubio R, Chae R, Kournoutas I, Abla A, McDermott M. Immersive surgical anatomy of the frontotemporal-orbitozygomatic approach. Cureus. 2019;11(11):e6053. doi:10.7759/cureus.6053.' },
  { id: 'pai2018', pmid: '30283520', pmcid: 'PMC6159062', shortLabel: 'Pai 2018', url: doi('10.4103/ajns.ajns_273_16'),
    citation: 'Pai SB, Raghuram G, Keshav GC, Rodrigues E. Far-lateral transcondylar approach to anterior foramen magnum lesions—our experience. Asian J Neurosurg. 2018;13(3):651–655. doi:10.4103/ajns.ajns_273_16.' },
  { id: 'singh2019', pmid: '30937033', pmcid: 'PMC6417359', shortLabel: 'Singh 2019', url: doi('10.4103/ajns.ajns_192_18'),
    citation: 'Singh N, Singh DK, Ahmad F, Kumar R. The retrosigmoid approach: workhorse for petroclival meningioma surgery. Asian J Neurosurg. 2019;14(1):188–192. doi:10.4103/ajns.ajns_192_18.' },
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
/** the Sylvian veins (drawn by rule: this angiogram labels none near the fissure) */
const SYLVIAN_VEINS: ApproachClaim[] = [
  c('The superficial middle cerebral vein receives frontosylvian, parietosylvian and temporosylvian veins; it usually begins at the back end of the fissure and runs forwards and down along its edges.', 'imada2021'),
  c('Its main stems usually run on the temporal lobe: their adhesion, and where the vein drains into a skull-base sinus, limit how far the temporal lobe can be moved.', 'imada2021'),
  c('In 116 patients: a common trunk with anastomoses to a frontosylvian trunk on the fissure in 60 %, a common trunk without them in 8 %, frontosylvian and temporosylvian trunks running side by side in 17 %, the veins of Trolard and Labbé meeting at the back of the fissure and dividing again in 13 %, an underdeveloped vein in 2 %. In the commonest type the fissure was opened at least on the temporal side of the common trunk; without anastomoses, on its frontal side.', 'imada2021'),
  c('It generally runs along the lesser sphenoid wing into the front of the cavernous sinus, directly or through the sphenoparietal sinus. It may instead drain into the laterocavernous sinus, into the pterygoid plexus across the middle fossa floor, or back to the superior petrosal or a tentorial sinus.', 'tanoue2020'),
  c('The precentral, central and posterior insular veins, in the insula’s precentral, central and posterior limiting sulci, run down and forward to its pole, where they join as the deep middle cerebral vein; it flows into the first segment of the basal vein of Rosenthal.', 'ota2024'),
];
const CISTERN = c('Opening the carotid cistern lets cerebrospinal fluid drain, which relaxes the brain, and exposes the internal carotid artery for proximal control; the dissection then goes medially to the chiasmatic and lamina terminalis cisterns.', 'yilmaz2025');
const CONTEXT = ['Internal carotid artery', 'Middle cerebral artery (M1 segment)', 'Middle cerebral artery (M2 segment)', 'Middle cerebral artery (M3 segment)',
  'Anterior cerebral artery (A1–A2)', 'Proximal lateral striate branches', 'Distal lateral striate branches', 'Optic nerve (II)', 'Oculomotor nerve (III)',
  'Superficial middle cerebral vein', 'Sphenoparietal sinus', 'Insular veins', 'Deep middle cerebral vein', 'Basal vein (of Rosenthal)'];
const NOT_SHOWN = 'The scalp, temporalis muscle, dura and arachnoid; the Sylvian veins’ tributaries and bridging veins (the veins themselves are drawn by rule, one superficial trunk of the many patterns, since this angiogram labels none near the fissure); the cortical (M4) branches of the middle cerebral artery, which the labels stop short of. The brain is a template fitted to this skull and its arteries, not this patient’s own, and its opening and lift are shapes, not a simulation of the tissue.';

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
    ]), sec('Middle cerebral artery', ARTERY, 'm1'), sec('Sylvian veins', SYLVIAN_VEINS), sec('Insula', INSULA), sec('Care points', [
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
    id: 'lso', view: 'lso', name: 'Lateral supraorbital approach', camera: 'supraorbital',
    summary: 'A right lateral supraorbital (LSO) craniotomy cut out of this CT’s bone, drawn larger than usual to show the anatomy, over the same fitted brain. The fissure lies at the craniotomy’s lower edge; the lift raises the frontal lobe off the lateral orbital roof, opening a corridor under it to the carotid, the optic nerve and M1, and the other slider opens the fissure.',
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
    // framed on the corridor's far end (the carotid, optic nerve and M1) and its opening, closer than the other views
    focus: ['Middle cerebral artery (M1 segment)', 'Optic nerve (II)', 'Internal carotid artery'],
    radius: 48,
    morphs: ['lsoLift', 'open'],
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
    summary: 'A midline suboccipital craniotomy cut out of this CT’s bone, with the cerebellum, brainstem and fourth ventricle of an anatomical model fitted into its posterior fossa. The slider draws the cerebellar tonsils apart and lifts the inferior vermis, opening the cerebellomedullary fissure onto the lower roof of the fourth ventricle and this patient’s posterior inferior cerebellar arteries.',
    sections: [sec('The craniotomy', [
      c('A median suboccipital craniectomy, then the telovelar route along the embryonic cerebellomedullary fissure, which spares the vermis and the brainstem.', 'pantu2026'),
      c('In a keyhole variant (13 patients) the midline skin incision ran from the line between the mastoid tips 3 cm up and 1 cm down; the osteoplastic craniotomy was about 2 cm across, and the dura was opened in a reverse U extended towards the foramen magnum.', 'wang2023'),
      c('Of 67 patients with fourth-ventricle tumours, the posterior fossa was opened by craniotomy in 76.1 % and craniectomy in 23.9 %.', 'pettersson2023'),
      c('In 39 of 40 children operated through a telovelar or telovelar-like approach in a modified prone position, the posterior arch of C1 was left; none needed it removed for exposure. A cadaver study (six heads) had found that removing it steepens the angle to the upper fourth ventricle.', 'cho2024'),
    ]), sec('The cerebellomedullary fissure and the tonsils', [
      c('Matsushima’s transcerebellomedullary fissure approach (1992), now called telovelar, reaches the fourth ventricle from below through the fissure without splitting the vermis; in its unilateral form one cerebellar tonsil is retracted laterally and the tela choroidea opened.', 'pettersson2023'),
      c('With the arachnoid opened, both tonsils, the uvula, the posterior inferior cerebellar artery (which disappears into the cerebellomedullary fissure), the foramen of Magendie and the tela choroidea are seen. The tonsil is retracted after the uvulotonsillar and medullotonsillar spaces are dissected, and the tela choroidea is freed from the taenia on both sides.', 'wang2023'),
      c('In a bilateral telovelar approach both cerebellomedullary fissures were opened and the tonsils gently retracted upwards and outwards; with the tela choroidea opened, the inferior vermis was not split and its caudal part could be lifted easily.', 'liu2014'),
      c('The cerebellum has tentorial, petrosal and suboccipital surfaces; the suboccipital surface of the cerebellum and the medulla are supplied by the posterior inferior cerebellar artery.', 'cavalheiro2015'),
    ], 'tonsils'), sec('The roof of the fourth ventricle', [
      c('Its caudal roof: the uvula and nodulus of the vermis; the inferior medullary velum branching off the nodulus on each side to the flocculus just outside the foramina of Luschka; below, the tela choroidea with the choroid plexus, fixed by the taeniae beside the foramen of Magendie.', 'longatti2026'),
      c('The telovelar incision starts low in the tela once the uvulotonsillar fissure is open: safe in its caudal part, cautious from the choroid plexus to the telovelar junction, very cautious in the inferior medullary velum near the fastigium. Seen endoscopically the velum beside the nodulus was barely 6 mm long (5.5–7.2 mm), and cutting it added little access.', 'longatti2026'),
      c('With the tela choroidea freed from the taeniae on both sides, the inferior medullary velum and the vermis were gently retracted upwards for a broad view of the fourth ventricle; for larger or more lateral lesions the velum was opened further and the vermis lifted to expose the ventricle’s upper part, and its floor was identified and protected.', 'wang2023'),
      c('Dividing both taeniae can make the opening four or five times the size of the foramen of Magendie, but the roof can then be lifted only a little: the posterior inferior cerebellar artery crosses the field and can be stretched.', 'longatti2026'),
    ]), sec('The floor of the fourth ventricle', [
      c('The floor (the rhomboid fossa) carries surface landmarks over the brainstem’s nuclei: the facial colliculus, the sulcus limitans, the medial eminence, the striae medullares and the hypoglossal and vagal trigones.', 'erginoglu2026'),
      c('In 40 cadaveric brainstems it measured 33.6 mm from the aqueduct’s opening to the obex and 20.0 mm across between the foramina of Luschka. The facial colliculus divided it into nearly equal pontine and medullary parts (14.6 and 14.5 mm), a landmark for suprafacial, infrafacial and pericollicular entry.', 'erginoglu2026'),
      c('The facial colliculus lies over the abducens nucleus and the genu of the facial nerve.', 'zhuang2021'),
      c('The sulcus limitans lay about 3.1 mm from the median sulcus on each side: the midline corridor between them was about 31 % of the floor’s width.', 'erginoglu2026'),
    ]), sec('Care points', [
      c('Incising the vermis where it is not infiltrated is generally held to raise the risk of a posterior fossa syndrome, including cerebellar mutism.', 'cho2024'),
      c('In 67 patients, and pooled with 304 from three earlier studies, the risk of postoperative neurological complications did not differ significantly between the telovelar and transvermian approaches. Neurophysiological monitoring protected against speech and swallowing deficits (odds ratio 0.076), and an external ventricular drain during surgery against gait and motor deficits (0.075) and hydrocephalus (0.020).', 'pettersson2023'),
      c('After a keyhole telovelar approach the commonest new or worse deficit was of gait or focal motor function (15.4 %); the abducens nerve was the cranial nerve most often affected, then the facial.', 'wang2023'),
    ])],
    context: ['Posterior inferior cerebellar artery', 'Posterior inferior cerebellar artery (fitted course)', 'Vertebral artery', 'Basilar artery', 'Superior cerebellar artery', 'Transverse sinus', 'Sigmoid sinus',
      'Glossopharyngeal nerve (IX)', 'Vagus nerve (X)', 'Accessory nerve (XI)', 'Hypoglossal nerve (XII)'],
    notShown: 'The skin, muscles, dura and arachnoid; the tela choroidea, inferior medullary velum and choroid plexus (thin sheets the model lacks: the fourth ventricle’s lower roof is open in it); the occipital sinus and the veins of the fissure. The cerebellum, brainstem and fourth ventricle are one adult’s anatomical model (Z-Anatomy) fitted into this skull and around its arteries, not this patient’s own, and so are the floor’s landmarks (placed over the model’s nuclei); the tonsils’ retraction and the vermis’s lift are a shape, not a simulation of the tissue.',
    focus: ['Fourth ventricle', 'Tonsil of cerebellum'],
    landmarks: ['Facial colliculus', 'Median sulcus of fourth ventricle', 'Vestibular area', 'Hypoglossal trigone', 'Vagal trigone', 'Obex'],
    morphs: ['telovelar'],
  },
  {
    id: 'retrosigmoid', view: 'retrosigmoid', name: 'Retrosigmoid approach', camera: 'retrosigmoid', hemi: 'R', brain: 'hindbrain',
    summary: 'A right retrosigmoid craniotomy cut out of this CT’s bone against this patient’s own transverse and sigmoid sinuses, drawn larger than a keyhole to show the anatomy, with the cerebellum, brainstem and fourth ventricle of an anatomical model fitted into the posterior fossa. The slider draws the right cerebellar hemisphere back from the petrous bone, opening the cerebellopontine angle onto the trigeminal nerve, the facial and vestibulocochlear nerves at the internal acoustic meatus, the lower cranial nerves and the arteries among them.',
    sections: [sec('The craniotomy', [
      c('The keypoint is the point on the outer surface over the junction of the transverse sinus’ lower margin with the sigmoid sinus’ posterior margin. A straight vertical incision about 4 cm long runs 1.5 cm behind the posterior margin of the mastoid process; the burr hole (about 6 mm) is centred 12 mm above the top of the digastric groove, on a line perpendicular to the baseline, and the keypoint lies 3–4 mm anterosuperior to it. The oval bone flap measured 18–20 × 20–25 mm.', 'jian2021'),
      c('In a refinement applied in 53 patients, the burr hole was centred 14.0 mm above and 6.5 mm behind the top of the digastric groove, in a coordinate system on the line from the infraorbital margin to the upper margin of the external acoustic meatus.', 'jian2024'),
      c('In 26 patients whose transverse and sigmoid sinuses were well exposed, the burr hole’s centre lay 3 mm from their junction; on dry skulls the keypoint lay 19.0 ± 2.6 mm (left) and 22.6 ± 4.2 mm (right) from the asterion.', 'jian2022'),
      c('On 3D CT of 149 hemiskulls the asterion lay a mean 6.74 mm (0.5–15.3 mm) from the extended posterior margin of the mastoid process, on its ventral side in 66 % and its dorsal side in 34 %; 93 % of the keypoints fell within a 7 mm circle of a coordinate system built from surface landmarks.', 'hu2023'),
      c('In Helsinki’s one burr-hole upper retrosigmoid craniotomy (park-bench position), the burr hole is made at the flap’s posterior border and two curved cuts run towards the mastoid process, partly exposing the sigmoid sinus; the dura is opened based on the sinus. (Checked against the abstract: a video article.)', 'choquevelasquez2018rs'),
    ]), sec('Relaxing the cerebellum', [
      c('In the Helsinki technique a spinal drain releases 50–100 ml of cerebrospinal fluid, and the head is raised about 20 cm above the heart. (Abstract.)', 'choquevelasquez2018rs'),
      c('Alternatively, the cisterna magna is opened from outside the dura through a small horizontal slit at its level, letting cerebrospinal fluid out before the dura over the hemisphere is opened; the slit is sealed with a fibrinogen–thrombin sponge at the end. Rapid decompression should be avoided.', 'hamelinck2024'),
    ]), sec('The cerebellopontine angle', [
      c('In 17 cadaveric heads the anterior inferior cerebellar artery approached the facial–vestibulocochlear bundle from below in 29 of 34 angles (85 %), its meatal loop passing through the bundle in 22 (65 %); the loop lay medial to the internal acoustic meatus in 53 % and lateral to it in 47 %. The nervus intermedius rootlets arose most often from the proximal premeatal segment of VIII (57 %) and joined VII near the fundus of the meatus (63 %).', 'meybodi2023'),
      c('In 12 cadaveric sides, of fifteen approaches to Meckel’s cave the retrosigmoid with a suprameatal extension exposed the most of the trigeminal stem: 78 % of it with 15 mm of retraction, 75 % with 10 mm; the plain retrosigmoid approach exposed 69 %.', 'zanin2023'),
      c('The labyrinthine artery was found in all 90 angles examined, single in 57.8 %; it arose from the anterior inferior cerebellar artery in 65.6 %, directly from the basilar artery in 13.3 % and from a trunk shared with the anterior inferior cerebellar artery in 21.1 %.', 'jeican2026'),
    ]), sec('The superior petrosal vein', [
      c('In 50 trigeminal microvascular decompressions there was one superior petrosal vein in 64 %, two in 32 % and three in 4 %, with 29 different configurations of the complex; the vein of the cerebellopontine fissure was present in 86 %.', 'basamh2020'),
      c('In 37 cerebellopontine angle meningiomas with an identified petrosal vein, one vein was found in 84 %. It entered the superior petrosal sinus lateral to the facial nerve’s entry into the internal acoustic meatus (type I) in 8 %, between the trigeminal and facial nerves (type II) in 41 %, and medial to the trigeminal nerve’s entry into Meckel’s cave (type III) in 51 %.', 'watanabe2013'),
    ]), sec('Care points', [
      c('Of 345 patients, cerebrospinal fluid leaked in 3 of 83 (3.6 %) after a craniotomy and in 38 of 262 (14.5 %) after a craniectomy (mean openings 3.8 and 4.2 cm).', 'tang2025'),
      c('After 130 retrosigmoid craniotomies, imaging showed venous sinus thrombosis on the operated side in 46.9 %, mostly in the transverse sinus, and more often when that side’s sinus was the dominant one; it was diagnosed clinically in 3.1 %.', 'przepiorka2023'),
      c('In 540 retrosigmoid procedures (517 patients, 2007–2020) the overall complication rate was 21.1 %: cerebrospinal fluid leaks or fistulas in 7.5 %, meningitis in 5.0 % and wound infections in 4.6 %.', 'aftahy2024'),
    ])],
    context: ['Trigeminal nerve (V)', 'Trigeminal ganglion', 'Abducens nerve (VI)', 'Facial nerve (VII)', 'Vestibulocochlear nerve (VIII)', 'Nerves in the internal acoustic meatus (VII, VIII)',
      'Glossopharyngeal nerve (IX)', 'Vagus nerve (X)', 'Accessory nerve (XI)', 'Anterior inferior cerebellar artery', 'Superior cerebellar artery',
      'Superior cerebellar artery (fitted course)',
      'Posterior inferior cerebellar artery', 'Posterior inferior cerebellar artery (fitted course)', 'Basilar artery', 'Vertebral artery', 'Sigmoid sinus', 'Transverse sinus'],
    notShown: 'The craniotomy is drawn larger than a keyhole, its outline placed by hand. The skin, muscles, dura and arachnoid; the superior petrosal vein and its tributaries and the labyrinthine artery (this angiogram labels neither); the nervus intermedius. The anterior inferior cerebellar artery is the fitted model’s (this angiogram does not label it), its origin moved onto this patient’s basilar artery; this angiogram labels only the first part of the superior cerebellar artery, and its course beyond is the fitted model’s, carried on from there: both approximate. The trigeminal nerve’s course from the pons to the ganglion, and the ganglion, are drawn by rule from published measurements, not traced. The cerebellum, brainstem and fourth ventricle are one adult’s anatomical model (Z-Anatomy) fitted into this skull, not this patient’s own, and drawing the hemisphere back is a shape, not a simulation of the tissue.',
    // framed on the cerebellopontine angle (between the trigeminal and the vestibulocochlear nerve), seen along the
    // corridor (the camera preset): the opening around the line of sight
    focus: ['Trigeminal nerve (V)', 'Vestibulocochlear nerve (VIII)'],
    frameOpening: false,
    radius: 45,
    morphs: ['retrosigmoid'],
  },
  {
    id: 'orbitozygomatic', view: 'orbitozygomatic', name: 'Orbitozygomatic approach', camera: 'orbitozygomatic',
    summary: 'This model’s pterional craniotomy extended by an orbitozygomatic piece: the superolateral orbital rim with the orbital roof behind it, and the zygomatic arch, cut out of this CT’s bone, over the same fitted brain. The view looks up from lower down, under the frontal lobe; the sliders open the Sylvian fissure and lift the frontal lobe.',
    sections: [sec('The craniotomy', [
      c('An extension of the pterional craniotomy for anterior skull base and orbital lesions, reaching vascular and oncological lesions without adding morbidity; Hakuba described the orbitozygomatic infratemporal approach in 1986, Al-Mefty the cranio-orbitozygomatic approach after him.', 'yilmaz2025'),
      c('One piece: three burr holes (the McCarty keyhole, one in the temporal squama above the zygomatic root, one in the frontal bone lateral to the supraorbital notch or behind the superior temporal line), then six osteotomies through the orbit’s walls and roof, the zygoma’s body and the zygomatic root in front of the articular tubercle, the flap coming away whole.', 'yilmaz2025'),
      c('Two pieces (drawn here): a standard pterional craniotomy, then the orbital piece: a cut medial on the orbital rim, lateral to the supraorbital ridge, one back from it to the superior orbital fissure and one across the rim just lateral to the frontozygomatic suture towards the fissure; anterior and posterior cuts free the zygomatic arch.', 'yilmaz2025'),
      c('The McCarty keyhole and the inferior orbital fissure are the landmarks for the six bone cuts; the craniotomy can be made in two, one or three pieces.', 'rodriguezrubio2019'),
    ]), sec('What it opens', [
      c('An extension of the pterional approach with wide exposure of the orbit and the anterior, middle and posterior cranial fossae: the basilar apex, the orbital and petrous apices, the upper clivus, the infratemporal, interpeduncular and pterygopalatine fossae and the sellar and parasellar regions, with more manoeuvrability than the pterional approach.', 'rodriguezrubio2019'),
      c('For the anterior and middle skull base with the least retraction, the sphenoid ridge, the orbital roof and the temporal squama are resected: the orbital roof without breaching the periorbita, the sphenoid ridge only as far as the meningo-orbital artery to spare the anterior clinoid.', 'yilmaz2025'),
      FISSURE,
    ]), sec('Care points', [
      c('The facial nerve is preserved by interfascial or subfascial dissection, as in the pterional approach; the temporalis muscle is lifted leaving a cuff at the superior temporal line for reattaching it, and the subperiosteal dissection continues down along the zygomatic arch.', 'yilmaz2025'),
    ])],
    context: CONTEXT,
    notShown: 'The orbital piece’s and the arch’s extents are drawn by rule on this skull (illustrative). The temporalis and masseter muscles, the periorbita and the orbit’s contents, and the facial nerve’s frontal branch are not modelled. ' + NOT_SHOWN,
    focus: ['Middle cerebral artery (M2 segment)'],
    morphs: ['open', 'lift'],
  },
  {
    id: 'far_lateral', view: 'far_lateral', name: 'Far lateral approach', camera: 'farLateral', hemi: 'R', brain: 'hindbrain',
    summary: 'A right far lateral (lateral suboccipital) craniectomy cut out of this CT’s bone down through the foramen magnum’s rim, the posterior third of the occipital condyle drilled, with the cerebellum, brainstem and fourth ventricle of the fitted model: the view along the side of the medulla to the front of the foramen magnum, past the vertebral artery and the lower cranial nerves.',
    sections: [sec('The craniectomy', [
      c('A lateral suboccipital craniectomy and a hemilaminectomy of C1 (of C2 and C3 too when the lesion reaches lower); the transverse–sigmoid junction may be exposed. The posterior 30–40 % of the occipital condyle is drilled extradurally, widening the angle onto the ventral and ventrolateral craniovertebral junction.', 'pai2018'),
      c('The craniectomy should take in the whole lesion, reach the sigmoid sinus laterally and take the rim of the foramen magnum below. Heros’s basic far lateral approach is a low suboccipital approach up to the condyle, not into it.', 'pai2018'),
      c('In a modified park-bench position the two outer muscle layers are reflected together onto the suboccipital triangle; the vertebral artery is exposed and controlled from C2 to where it enters the dura over the groove of C1.', 'pai2018'),
      c('Rhoton’s far lateral approach is a lateral suboccipital approach behind the sternocleidomastoid and the vertebral artery, just medial to the occipital and atlantal condyles; the extreme lateral approach goes deep to the front of the sternocleidomastoid.', 'bruneau2008'),
    ]), sec('What it reaches', [
      c('Lesions ventrolateral and even ventral to the brainstem and upper cervical cord, with little or no retraction: the tumour–brain interface is met early, and the vertebral artery is controlled early.', 'pai2018'),
      c('In 8 patients with lesions in front of the brainstem and upper cord (2 meningiomas, 3 epidermoids, a chordoma, 2 vascular lesions): total excision of 5 of the 6 tumours; one patient died suddenly 18 hours after surgery, one had a cerebrospinal fluid leak.', 'pai2018'),
    ]), sec('Care points', [
      c('For intradural foramen magnum meningiomas, drilling of the condyle and the atlas’s lateral mass is almost never needed; the lateral wall is drilled as far as the tumour reaches across the midline.', 'bruneau2008'),
      c('Permanent morbidity in published series: 0–17 % through a far lateral approach, 21–56 % through an extreme lateral transcondylar one.', 'bruneau2008'),
    ])],
    context: ['Vertebral artery', 'Posterior inferior cerebellar artery', 'Posterior inferior cerebellar artery (fitted course)', 'Basilar artery',
      'Glossopharyngeal nerve (IX)', 'Vagus nerve (X)', 'Accessory nerve (XI)', 'Hypoglossal nerve (XII)', 'Sigmoid sinus', 'Transverse sinus'],
    notShown: 'The atlas and axis are not part of this model, so the hemilaminectomy of C1 is not shown, nor the vertebral artery outside the skull. The craniectomy’s outline is placed by rule (illustrative). The muscles, the dura and the arachnoid. The cerebellum, brainstem and fourth ventricle are one adult’s anatomical model (Z-Anatomy) fitted into this skull, not this patient’s own.',
    focus: ['Medulla oblongata', 'Hypoglossal nerve (XII)'],
    radius: 50,
    morphs: [],
  },
];
export const APPROACH = new Map(APPROACHES.map((a) => [a.id, a]));

/**
 * The endoscopic endonasal (transsphenoidal) view (Skull base v3, src/ui/skullbase-endonasal.ts): what the sources say,
 * checked against their open-access full texts: Solari 2012 (PMC3728777), van Lindert 2010 (PMC2872017), Famurewa 2018
 * (PMC6561078), Nguyen 2026 (PMC13286435), Paudel 2025 (PMC12750977), Singh 2018 (PMC6166545), Yohannan 2015
 * (PMC4584028).
 */
export const ENDONASAL_INFO: { sections: ApproachSection[]; notShown: string } = {
  sections: [
    sec('The scope and the way in', [
      c('The approach is done with a rigid 0° endoscope, 4 mm across, as the only view of the field; angled scopes are kept for particular situations, such as looking round into the suprasellar space once the lesion is out.', 'solari2012', 'vanlindert2010'),
      c('In 185 patients, 48 % had a variation of the nasal anatomy, most often a deviated septum (30 %) or a septal spur (20 %); in fewer than one in five of them did reaching the sphenoid ostium take special measures. Working through one nostril more often needs the middle turbinate removed to make room.', 'vanlindert2010'),
      c('Extended approaches make more room: one middle turbinate removed, the other pushed aside, the back of the nasal septum taken out, and a wider sphenoidotomy.', 'solari2012'),
    ]),
    sec('The sphenoid ostium', [
      c('In 181 adults on CT, each sphenoid sinus had a single natural ostium, on average 1.25 mm wide and 1.8 mm high, most often in the medial third of the sinus’s front wall (58 %) and in its middle third in height (73 %): its lower edge about 10–12 mm above the upper border of the choana, its medial edge 3–5 mm from the septum.', 'nguyen2026'),
      c('Where the ostium is in plain view, orientation and the way into the sinus are straightforward. An Onodi (sphenoethmoidal) cell, a posterior ethmoid cell above and lateral to the sinus, can be taken for the sphenoid sinus once entered: it is reported in 8.4–9 % of people (and was found beside 39 % of the sinuses on Nguyen’s CTs).', 'vanlindert2010', 'nguyen2026'),
      c('Bleeding after the anterior sphenoidotomy usually comes from a branch of the sphenopalatine artery at the inferolateral border of the middle turbinate.', 'vanlindert2010'),
    ]),
    sec('Inside the sphenoid sinus', [
      c('The sellar floor lies in the middle, the planum above it and the clival indentation below; to either side are the bony prominences of the carotid (its cavernous part) and of the optic nerve, with the lateral opticocarotid recess between them, moulded by the pneumatised optic strut.', 'solari2012'),
      c('By how far it is pneumatised, the sinus is conchal (solid bone under the sella), presellar (air no further back than the plane of the sella’s front wall), sellar (air under the sella, beyond the tuberculum) or postsellar (on past the dorsum sellae into the clivus). In 320 adults on CT: sellar 56.6 %, postsellar 40.3 %, conchal 1.9 %, presellar 1.2 %.', 'famurewa2018'),
      c('In the same CTs a septum of the sinus was inserted on the carotid’s bony covering in 31.6 %, and the carotid bulged into the sinus (sinus air round it) in 34.4 %; in 65.6 % it lay wholly in bone.', 'famurewa2018'),
    ]),
    sec('The hypophysis', [
      c('In 870 people with a presumed normal pituitary on MRI, the gland was on average 4.9 mm high and 282 mm³; at 21–30 years 9.4 mm front to back, 12.3 mm across and 5.4 mm high, lower again from 50 on.', 'paudel2025'),
      c('Its upper surface, in 482 people, was most often concave (43.4 %); convex in 17.6 %, much more often in women (29 %, most of them 10–29 years old) than in men (8.6 %).', 'singh2018'),
      c('The diaphragma sellae, the fold of dura roofing the gland, measured on average 11.7 mm front to back and 15.8 mm across in 100 autopsies; its opening, through which the stalk passes, 6.6 by 8.2 mm, and the optic chiasm covered that opening entirely in 45 %.', 'yohannan2015'),
    ]),
    sec('Opening the sella', [
      c('High-speed, low-profile drills open the bone to the dura; a micro-Doppler probe finds the major arteries before the dura is opened, and navigation helps where the usual landmarks cannot be made out (a tumour that has destroyed the sellar floor, an Onodi cell).', 'solari2012', 'vanlindert2010'),
    ]),
  ],
  notShown: 'The front of the nose (the scan does not reach it) and the nasal cavity’s own shape there: the scope starts at the back of the nasal cavity. The turbinates and the septum are not drawn as parts of their own (only the lining of this CT’s air), and pushing them aside is drawn as a corridor opened through them. The mucosal flaps, the dura and its opening, bleeding and the tissue’s give are not simulated: what the burr reaches is taken away. The hypophysis is modelled in this CT’s fossa (its outline from the bone, its lobes and stalk drawn by rule), not seen on it: a CT does not show the gland, the dura or the cavernous sinuses’ walls; the cavernous sinuses are fitted from another model (approximate).',
};

/**
 * The cavernous sinus view (Skull base v3, pipeline/skullbase_v3_cavernous.py): what the sources say, checked against
 * their open-access full texts: Chotai 2018 (PMC5820859), Corvino 2023 (PMC10452901), Wysiadecki 2021 (PMC8156379),
 * Chung 2016 (PMC4974189), Tanoue 2020 (PMC10370663).
 */
export const CAVERNOUS_INFO: { sections: ApproachSection[]; notShown: string } = {
  sections: [
    sec('Its borders and walls', [
      c('In front the anterior clinoid and the superior orbital fissure, behind the petrous tip and the posterior clinoid, medially the sella and the sphenoid body, laterally as far as the junction with the greater wing of the sphenoid.', 'chotai2018'),
      c('The medial wall has been described as a single thin membrane or a distinct dural layer (a mean 0.195 mm thick in one study); the lateral wall has an outer and an inner layer, the cranial nerves running between them.', 'chotai2018'),
    ]),
    sec('The nerves', [
      c('In the lateral wall, from above: the oculomotor nerve, then the trochlear nerve, then the ophthalmic nerve, then the maxillary nerve, each pair bounding a triangle (the supratrochlear between III and IV, Parkinson’s between IV and V1, the anteromedial between V1 and V2).', 'corvino2023'),
      c('The abducens nerve leaves Dorello’s canal under Gruber’s ligament and runs forward medial to the ophthalmic nerve.', 'corvino2023'),
      c('In 60 sides its cavernous segment was on average 26.9 mm long; it crossed the cavernous carotid’s proximal part about 4 mm (1.3–6.5) above the petrolingual ligament, always adhering to the artery where it crossed its posterior vertical segment.', 'wysiadecki2021'),
    ]),
    sec('The triangles', [
      c('Ten triangles round the sinus in three groups. Medial: the superoposterior (oculomotor) triangle between the anterior and posterior clinoids and the petrous apex; the superior (clinoidal, Dolenc’s) between the optic and oculomotor nerves; the middle (supratrochlear) between the oculomotor and trochlear nerves; the inferior (Parkinson’s) between the trochlear and ophthalmic nerves.', 'chung2016cs'),
      c('Lateral: the anteromedial (Mullan’s) between the ophthalmic and maxillary nerves; the anterolateral between the maxillary and mandibular nerves; the posterolateral (Glasscock’s) between the mandibular and greater petrosal nerves; the posteromedial (Kawase’s) between the trigeminal ganglion, the greater petrosal nerve and the petrous apex.', 'chung2016cs'),
      c('Posterior: the lateral (inferolateral) triangle between the dural entries of the trochlear and abducens nerves and the petrous apex; the medial (inferomedial) between those entries and the posterior clinoid.', 'chung2016cs'),
    ]),
    sec('The veins', [
      c('It receives the facial and orbital veins in front through the ophthalmic veins, the meningeal and osseous drainage laterally through the sphenoparietal sinus, the brain’s through the superficial middle cerebral and uncal veins, and connects with the other side through the intercavernous sinus; it drains to the jugular vein through the inferior petrosal sinus and to the pterygoid plexus through emissary veins.', 'tanoue2020'),
      c('The superior petrosal sinus joins it to the transverse–sigmoid junction; the basilar plexus on the clivus joins both inferior petrosal sinuses, the cavernous sinuses and the marginal sinus.', 'tanoue2020'),
    ]),
  ],
  notShown: 'A CT shows neither the sinus’s walls nor its venous spaces and trabeculae: the sinus is modelled round what this CT does show (its bone, its carotid, the hypophysis modelled in the fossa), its lateral wall a plane by rule. The carotid’s branches in it (the meningohypophyseal and inferolateral trunks) and the sympathetic plexus round it are not drawn; the nerves’ course through it is re-routed by rule in the published order, not traced. The superior and inferior petrosal sinuses and the ophthalmic veins are fitted from another model (approximate); the sphenoparietal sinus and the basilar plexus are drawn by rule, the laterocavernous sinus not at all; the superficial middle cerebral vein is drawn (by rule) only in the surgical views, ending in the sphenoparietal sinus, one of its several endings.',
};
