import type { BsReference } from '../brainstem/schema';

/** Sources of the ventricles section, each checked against its open-access full text (Europe PMC); Jean 2019, which has
 * none, against its abstract (PubMed). */
const doi = (d: string) => `https://doi.org/${d}`;
export const VE_REFERENCES: BsReference[] = [
  { id: 'chen2025', pmid: '39627172', pmcid: 'PMC12333769', shortLabel: 'Chen 2025', url: doi('10.1227/ons.0000000000001467'),
    citation: 'Chen X, Chen T, Xie Z, Xu L, Qi Z, Guo X. Evaluation of the accuracy of 4 conventional freehand frontal ventriculostomy methods in the Chinese population. Oper Neurosurg. 2025;29(3):351. doi:10.1227/ons.0000000000001467.' },
  { id: 'park2020', pmid: '32295983', pmcid: 'PMC7246224', shortLabel: 'Park 2020', url: doi('10.2176/nmc.oa.2019-0304'),
    citation: 'Park B, Han S, Byoun HS, Han S, Choi SW, Lim J. The assessment of geometric reliability of conventional trajectory of ventriculostomy in a three dimensional virtual model and proposal of a new trajectory. Neurol Med Chir (Tokyo). 2020;60(5):264–270. doi:10.2176/nmc.oa.2019-0304.' },
  { id: 'charcos2025', pmid: '41163747', pmcid: 'PMC12560684', shortLabel: 'Charcos 2025', url: doi('10.1227/neuprac.0000000000000173'),
    citation: 'Charcos I, Koneru M, Ifrach J, Wojcik K, Tonetti DA, Thomas AJ, et al. Comparison of accuracy between image-guided and freehand external ventricular drain bedside placement in association with time efficacy. Neurosurg Pract. 2025;6(4):e000173. doi:10.1227/neuprac.0000000000000173.' },
  { id: 'gangal2026', pmid: '42866759', pmcid: 'PMC13657594', shortLabel: 'Gangal 2026', url: doi('10.1097/MS9.0000000000005528'),
    citation: 'Gangal YA, Muzumdar DP. Anatomy of corpus callosum and lateral ventricle: a fiber dissection study. Ann Med Surg (Lond). 2026;88(10):6272. doi:10.1097/MS9.0000000000005528.' },
  { id: 'abdalavargas2022', pmid: '35673649', pmcid: 'PMC9168335', shortLabel: 'Abdala-Vargas 2022', url: doi('10.25259/SNI_404_2022'),
    citation: 'Abdala-Vargas NJ, Cifuentes-Lobelo HA, Ordoñez-Rubiano E, Patiño-Gomez JG, Villalonga JF, Lucifero AG, et al. Anatomic variations of the floor of the third ventricle: surgical implications for endoscopic third ventriculostomy. Surg Neurol Int. 2022;13:218. doi:10.25259/SNI_404_2022.' },
  { id: 'azab2014', pmid: '25140283', pmcid: 'PMC4135544', shortLabel: 'Azab 2014', url: doi('10.4103/2152-7806.138364'),
    citation: 'Azab WA, Salaheddin W, Alsheikh TM, Nasim K, Nasr MM. Colloid cysts posterior and anterior to the foramen of Monro: anatomical features and implications for endoscopic excision. Surg Neurol Int. 2014;5:124. doi:10.4103/2152-7806.138364.' },
  { id: 'jean2019', pmid: '30953154', shortLabel: 'Jean 2019', url: doi('10.1007/s00701-019-03887-4'),
    citation: 'Jean WC, Tai AX, Hogan E, Herur-Raman A, Felbaum DR, Leonardo J, et al. An anatomical study of the foramen of Monro: implications in management of pineal tumors presenting with hydrocephalus. Acta Neurochir (Wien). 2019;161(5):975–983. doi:10.1007/s00701-019-03887-4.' },
  { id: 'xiao2025', pmid: '39748024', pmcid: 'PMC11695585', shortLabel: 'Xiao 2025', url: doi('10.1038/s41598-024-83874-7'),
    citation: 'Xiao K, Zhou L, Tang X, Liu S, Deng Z, Yang F. MRI imaging characteristics of brainstem and midbrain aqueduct in patients with iNPH. Sci Rep. 2025;15(1):94. doi:10.1038/s41598-024-83874-7.' },
  { id: 'erginoglu2026', pmid: '41283941', pmcid: 'PMC12967451', shortLabel: 'Erginoglu 2026', url: doi('10.1007/s11845-025-04170-5'),
    citation: 'Erginoglu U, Sulaimanov U, Uslu I, Ataoglu C, Keles A, Aycan A, et al. Quantitative anatomy of the fourth ventricle floor: a cadaveric morphometric study. Ir J Med Sci. 2026;195(1):373–381. doi:10.1007/s11845-025-04170-5.' },
  { id: 'sousa2025', pmid: '39911564', pmcid: 'PMC11794814', shortLabel: 'Sousa 2025', url: doi('10.3389/fnana.2025.1431128'),
    citation: 'Sousa J, Silva SM, Alves H, Carvalho B, Sousa JM, Ferreira-Pinto MJ, et al. Optimal trajectory of the neuroendoscope for third ventricle pavement access. Front Neuroanat. 2025;19:1431128. doi:10.3389/fnana.2025.1431128.' },
  { id: 'vann2022', pmid: '36507070', pmcid: 'PMC9726681', shortLabel: 'Vann 2022', url: doi('10.1016/j.ynirp.2022.100122'),
    citation: 'Vann SD, Zachiu C, Meys KME, Ambrosino S, Durston S, de Vries LS, Groenendaal F, Lequin MH. Normative mammillary body volumes: from the neonatal period to young adult. Neuroimage Rep. 2022;2(4):100122. doi:10.1016/j.ynirp.2022.100122.' },
  { id: 'dasilva2024', pmid: '38374441', pmcid: 'PMC10960742', shortLabel: 'da Silva 2024', url: doi('10.1007/s00276-024-03312-1'),
    citation: 'da Silva AC, Silva SM, Alves H, Cunha-Cabral D, Pinto FF, Fernandes-Silva J, et al. Stereotactic anatomy of the third ventricle. Surg Radiol Anat. 2024;46(3):271–283. doi:10.1007/s00276-024-03312-1.' },
  { id: 'rosu2026', pmid: '41681810', pmcid: 'PMC12897366', shortLabel: 'Roşu 2026', url: doi('10.3390/diagnostics16030491'),
    citation: 'Roşu AI, Ghenciu LA, Roşu DC, Iacob ER, Stoicescu ER, Stoicescu R, et al. Ventricular anatomy across CT and MRI in hydrocephalus: a retrospective study. Diagnostics (Basel). 2026;16(3):491. doi:10.3390/diagnostics16030491.' },
  { id: 'longatti2026', pmid: '41784833', pmcid: 'PMC12963120', shortLabel: 'Longatti 2026', url: doi('10.1007/s00381-026-07188-x'),
    citation: 'Longatti P, Fiorindi A, Siddi F, Boaro A, Canova G, Feletti A. The telovelar approach reshaped: a new perspective from inside the fourth ventricle. Childs Nerv Syst. 2026;42(1):96. doi:10.1007/s00381-026-07188-x.' },
];
