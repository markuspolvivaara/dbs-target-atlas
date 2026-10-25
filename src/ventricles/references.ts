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
];
