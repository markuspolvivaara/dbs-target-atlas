import type { Reference } from './schema';

/**
 * Researched additions to the original movement-disorder content (October 2026).
 * Like epilepsy.ts, every sentence is checked against the cited abstract on PubMed.
 *
 * Optic tract as a GPi landmark. (The optic *radiation* runs from the lateral
 * geniculate to occipital cortex and is not near the pallidum.)
 * Red nucleus as an STN landmark (with a dissenting study for balance).
 */
export const ADDITION_REFERENCES: Reference[] = [
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
];

export const ADDITION_DESCRIPTIONS: Record<string, { text: string; refIds: string[] }> = {
  optic_tract: {
    text: 'The optic tract runs beneath the posteroventral GPi and is a landmark for pallidal targeting. During surgery it is identified by stimulation-evoked flashes of light, so the lesion or lead can spare it; hyperactive GPi cells lay medial to its lateral border and at least 5.1 mm above its dorsal surface. Visual field defects after posterior pallidotomy were linked to lesions adjacent to the tract. An inversion-recovery MRI sequence can show the GPi and the optic tract directly.',
    refIds: ['vitek1998', 'yokoyama2002', 'biousse1998', 'reich2000'],
  },
  rn: {
    text: 'The red nucleus is a landmark for STN targeting: its anterior border on T2-weighted MRI was introduced as a reference for locating the STN centre relative to the AC–PC line. A red-nucleus-based target came closest to the clinically optimal contact and was the most precise of three targeting methods compared. On conventional MRI, however, the RN–STN relationship was inconsistent, and the authors recommend combining several anatomical measurements.',
    refIds: ['bejjani2000', 'andradesouza2005', 'danish2006'],
  },
};
