import type { BsReference } from './schema';

/**
 * References for the brainstem section (October 2026). Each record was retrieved from Europe PMC / PubMed (title,
 * authors, journal, volume, pages, DOI). Claims citing a reference with a PMC id were checked against its open-access
 * full text; the others against their abstracts.
 */
const doi = (d: string) => `https://doi.org/${d}`;

export const BS_REFERENCES: BsReference[] = [
  { id: 'cavalheiro2015', pmid: '26351233', pmcid: 'PMC4564452', shortLabel: 'Cavalheiro 2015', url: doi('10.1007/s00381-015-2799-y'),
    citation: 'Cavalheiro S, Yagmurlu K, da Costa MD, Nicácio JM, Rodrigues TP, Chaddad-Neto F, et al. Surgical approaches for brainstem tumors in pediatric patients. Childs Nerv Syst. 2015;31(10):1815–1840. doi:10.1007/s00381-015-2799-y.' },
  { id: 'rajagopal2019', pmid: '30937003', pmcid: 'PMC6417313', shortLabel: 'Rajagopal 2019', url: doi('10.4103/ajns.ajns_158_18'),
    citation: 'Rajagopal N, Kawase T, Mohammad AA, Seng LB, Yamada Y, Kato Y. Timing of surgery and surgical strategies in symptomatic brainstem cavernomas: review of the literature. Asian J Neurosurg. 2019;14(1):15–27. doi:10.4103/ajns.ajns_158_18.' },
  { id: 'cavalcanti2026', pmid: '41772321', pmcid: 'PMC12953320', shortLabel: 'Cavalcanti 2026', url: doi('10.1007/s10143-026-04171-7'),
    citation: 'Cavalcanti DD, Figueiredo EG, de Oliveira Manduca Palmiero H, Preul MC, Spetzler RF. Anatomical and quantitative analysis of safe entry zones to the lower brainstem through the far-lateral approach. Neurosurg Rev. 2026;49(1):257. doi:10.1007/s10143-026-04171-7.' },
  { id: 'erginoglu2026', pmid: '41283941', pmcid: 'PMC12967451', shortLabel: 'Erginoglu 2026', url: doi('10.1007/s11845-025-04170-5'),
    citation: 'Erginoglu U, Sulaimanov U, Uslu I, Ataoglu C, Keles A, Aycan A, et al. Quantitative anatomy of the fourth ventricle floor: a cadaveric morphometric study. Ir J Med Sci. 2026;195(1):373–381. doi:10.1007/s11845-025-04170-5.' },
  { id: 'yang2019', pmid: '30726522', shortLabel: 'Yang 2019', url: doi('10.1007/s10143-019-01081-9'),
    citation: 'Yang Y, van Niftrik B, Ma X, Velz J, Wang S, Regli L, et al. Analysis of safe entry zones into the brainstem. Neurosurg Rev. 2019;42(3):721–729. doi:10.1007/s10143-019-01081-9.' },
  { id: 'yagmurlu2014', pmid: '24983443', shortLabel: 'Yagmurlu 2014', url: doi('10.1227/NEU.0000000000000466'),
    citation: 'Yagmurlu K, Rhoton AL, Tanriover N, Bennett JA. Three-dimensional microsurgical anatomy and the safe entry zones of the brainstem. Neurosurgery. 2014;10 Suppl 4:602–619. doi:10.1227/NEU.0000000000000466.' },
  { id: 'cavalcanti2016', pmid: '26452114', shortLabel: 'Cavalcanti 2016', url: doi('10.3171/2015.4.JNS141945'),
    citation: 'Cavalcanti DD, Preul MC, Kalani MY, Spetzler RF. Microsurgical anatomy of safe entry zones to the brainstem. J Neurosurg. 2016;124(5):1359–1376. doi:10.3171/2015.4.JNS141945.' },
  { id: 'guberinic2022', pmid: '35395628', shortLabel: 'Guberinic 2022', url: doi('10.3171/2022.2.JNS211997'),
    citation: 'Guberinic A, van den Elshout R, Kozicz T, Laan MT, Henssen D. Overview of the microanatomy of the human brainstem in relation to the safe entry zones. J Neurosurg. 2022;137(5):1524–1534. doi:10.3171/2022.2.JNS211997.' },
  { id: 'olchanyi2025', pmid: '41074651', pmcid: 'PMC12514455', shortLabel: 'Olchanyi 2025', url: doi('10.1002/hbm.70357'),
    citation: 'Olchanyi MD, Augustinack J, Haynes RL, Lewis LD, Cicero N, Li J, et al. Automated MRI segmentation of brainstem nuclei critical to consciousness. Hum Brain Mapp. 2025;46(14):e70357. doi:10.1002/hbm.70357.' },
  { id: 'edlow2024', pmid: '38691619', pmcid: 'PMC11870092', shortLabel: 'Edlow 2024', url: doi('10.1126/scitranslmed.adj4303'),
    citation: 'Edlow BL, Olchanyi M, Freeman HJ, Li J, Maffei C, Snider SB, et al. Multimodal MRI reveals brainstem connections that sustain wakefulness in human consciousness. Sci Transl Med. 2024;16(745):eadj4303. doi:10.1126/scitranslmed.adj4303.' },
  { id: 'kim2020', pmid: '36238638', pmcid: 'PMC9431917', shortLabel: 'Kim 2020', url: doi('10.3348/jksr.2020.81.3.501'),
    citation: 'Kim HJ, Seong M, Kim Y. Normal anatomy of cranial nerves III–XII on magnetic resonance imaging. Taehan Yongsang Uihakhoe Chi (J Korean Soc Radiol). 2020;81(3):501–529. doi:10.3348/jksr.2020.81.3.501.' },
  { id: 'alafif2026', pmid: '42776330', pmcid: 'PMC13601307', shortLabel: 'Al-Afif 2026', url: doi('10.1007/s00701-026-07043-7'),
    citation: "Al-Afif S, Hermann EJ, Früh A, Oltmanns J, Woitzik J, Vajkoczy P, et al. The retrosigmoid trans-middle cerebellar peduncle approach for pontine cavernous malformations: multicenter experience. Acta Neurochir (Wien). 2026;168(1):219. doi:10.1007/s00701-026-07043-7." },
  // November 2026 (the audit's D-008): the trigeminal nuclei, the nuclei shared between nerves, the HCP-YA tracts
  { id: 'turnbull2025', pmid: '41594782', pmcid: 'PMC12838919', shortLabel: 'Turnbull 2025', url: doi('10.3390/brainsci16010061'),
    citation: 'Turnbull OH. Feeding, emotion, and the brain stem: the interesting case of the mesencephalic trigeminal nucleus. Brain Sci. 2025;16(1):61. doi:10.3390/brainsci16010061.' },
  { id: 'kaya2023', pmid: '36217737', pmcid: 'PMC9921240', shortLabel: 'Kaya 2023', url: doi('10.1002/hbm.26104'),
    citation: 'Kaya B, Geha P, de Araujo I, Cioffi I, Moayedi M. Identification of central amygdala and trigeminal motor nucleus connectivity in humans: an ultra-high field diffusion MRI study. Hum Brain Mapp. 2023;44(4):1309–1319. doi:10.1002/hbm.26104.' },
  { id: 'henssen2019', pmid: '30293214', pmcid: 'PMC6373363', shortLabel: 'Henssen 2019a', url: doi('10.1007/s00429-018-1767-1'),
    citation: 'Henssen DJHA, Mollink J, Kurt E, van Dongen R, Bartels RHMA, Gräβel D, et al. Ex vivo visualization of the trigeminal pathways in the human brainstem using 11.7T diffusion MRI combined with microscopy polarized light imaging. Brain Struct Funct. 2019;224(1):159–170. doi:10.1007/s00429-018-1767-1.' },
  { id: 'henssen2019vagus', pmid: '30786731', pmcid: 'PMC6643160', shortLabel: 'Henssen 2019b', url: doi('10.1177/0333102419833076'),
    citation: 'Henssen DJHA, Derks B, van Doorn M, Verhoogt N, Van Cappellen van Walsum AM, Staats P, et al. Vagus nerve stimulation for primary headache disorders: an anatomical review to explain a clinical phenomenon. Cephalalgia. 2019;39(9):1180–1194. doi:10.1177/0333102419833076.' },
  { id: 'garciasantos2018', pmid: '29949035', pmcid: 'PMC6108977', shortLabel: 'García Santos 2018', url: doi('10.1007/s13244-018-0630-5'),
    citation: 'García Santos JM, Sánchez Jiménez S, Tovar Pérez M, Moreno Cascales M, Lailhacar Marty J, Fernández-Villacañas Marín MA. Tracking the glossopharyngeal nerve pathway through anatomical references in cross-sectional imaging techniques: a pictorial review. Insights Imaging. 2018;9(4):559–569. doi:10.1007/s13244-018-0630-5.' },
  { id: 'stephani2011', pmid: '21153903', pmcid: 'PMC3097350', shortLabel: 'Stephani 2011', url: doi('10.1007/s00429-010-0296-3'),
    citation: 'Stephani C, Fernandez-Baca Vaca G, Maciunas R, Koubeissi M, Lüders HO. Functional neuroanatomy of the insular lobe. Brain Struct Funct. 2011;216(2):137–149. doi:10.1007/s00429-010-0296-3.' },
  // (the full text in PMC is the author manuscript)
  { id: 'yeh2018', pmid: '29758339', pmcid: 'PMC6921501', shortLabel: 'Yeh 2018', url: doi('10.1016/j.neuroimage.2018.05.027'),
    citation: 'Yeh FC, Panesar S, Fernandes D, Meola A, Yoshino M, Fernandez-Miranda JC, et al. Population-averaged atlas of the macroscale human structural connectome and its network topology. Neuroimage. 2018;178:57–68. doi:10.1016/j.neuroimage.2018.05.027.' },
  { id: 'li2021', pmid: '34597450', pmcid: 'PMC8596984', shortLabel: 'Li 2021', url: doi('10.1002/hbm.25670'),
    citation: 'Li M, Yeh FC, Zeng Q, Wu X, Wang X, Zhu Z, et al. The trajectory of the medial longitudinal fasciculus in the human brain: a diffusion imaging-based tractography study. Hum Brain Mapp. 2021;42(18):6070–6086. doi:10.1002/hbm.25670.' },
  { id: 'donatelli2023', pmid: '37968363', pmcid: 'PMC10651583', shortLabel: 'Donatelli 2023', url: doi('10.1186/s41747-023-00389-y'),
    citation: 'Donatelli G, Emmi A, Costagli M, Cecchi P, Macchi V, Biagi L, et al. Brainstem anatomy with 7-T MRI: in vivo assessment and ex vivo comparison. Eur Radiol Exp. 2023;7(1):71. doi:10.1186/s41747-023-00389-y.' },
  { id: 'sitek2019', pmid: '31368891', pmcid: 'PMC6707786', shortLabel: 'Sitek 2019', url: doi('10.7554/elife.48932'),
    citation: 'Sitek KR, Gulban OF, Calabrese E, Johnson GA, Lage-Castellanos A, Moerel M, et al. Mapping the human subcortical auditory system using histology, postmortem MRI and in vivo MRI at 7T. Elife. 2019;8:e48932. doi:10.7554/elife.48932.' },
];
