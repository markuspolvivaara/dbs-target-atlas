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
];
