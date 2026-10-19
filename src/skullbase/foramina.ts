/**
 * Foramina the Z-Anatomy model does not label: located by the pipeline (pipeline/skullbase_foramina.py) from where the
 * structures that pass through them cross the bone. What passes through each, from open-access sources: Romano 2019
 * (PMC6420596) for the nerves, Muslu 2025 (PMC12113558) for the carotid canal and foramen lacerum.
 */
export interface ForamenRef { id: string; shortLabel: string; citation: string; url: string; pmid: string }
export interface ForamenClaim { text: string; refIds: string[] }

const doi = (d: string) => `https://doi.org/${d}`;

export const FORAMEN_REFS: ForamenRef[] = [
  { id: 'romano2019', pmid: '30877408', shortLabel: 'Romano 2019', url: doi('10.1186/s13244-019-0719-5'),
    citation: 'Romano N, Federici M, Castaldi A. Imaging of cranial nerves: a pictorial overview. Insights Imaging. 2019;10(1):33. doi:10.1186/s13244-019-0719-5.' },
  { id: 'muslu2025', pmid: '40428901', shortLabel: 'Muslu 2025', url: doi('10.3390/medicina61050943'),
    citation: 'Muslu M, Karaca Ö, Kökçe A, Acer N. A computed tomography-based morphometric assessment of the foramen lacerum in a Turkish population using the 3D Slicer method. Medicina (Kaunas). 2025;61(5):943. doi:10.3390/medicina61050943.' },
];
export const FORAMEN_REF = new Map(FORAMEN_REFS.map((r) => [r.id, r]));

const c = (text: string, ...refIds: string[]): ForamenClaim => ({ text, refIds });
const CAROTID = c('The carotid canal surrounds the petrous segment of the internal carotid artery and opens at the posterolateral margin of the foramen lacerum.', 'muslu2025');

/** What passes through each located foramen, by landmark name. */
export const FORAMEN_CONTENTS: Record<string, ForamenClaim[]> = {
  'Superior orbital fissure': [c('The ophthalmic nerve leaves the skull through the superior orbital fissure, with the oculomotor, trochlear and abducens nerves and the superior ophthalmic vein.', 'romano2019')],
  'Internal acoustic meatus': [
    c('The vestibulocochlear nerve enters the temporal bone through the internal acoustic meatus, together with the facial nerve.', 'romano2019'),
    c('In the meatus the facial nerve lies anterosuperior, the superior vestibular nerve posterosuperior, the cochlear nerve anteroinferior and the inferior vestibular nerve posteroinferior.', 'romano2019'),
  ],
  'Stylomastoid foramen': [c('The facial nerve leaves the skull base at the stylomastoid foramen and reaches the parotid gland.', 'romano2019')],
  'Jugular foramen': [c('The glossopharyngeal nerve leaves the skull through the jugular foramen (pars nervosa); the vagus nerve leaves through its pars vascularis, between the glossopharyngeal and accessory nerves.', 'romano2019')],
  'External opening of carotid canal': [CAROTID],
  'Internal opening of carotid canal': [CAROTID],
  'Foramen lacerum': [
    c('Bordered in front by the body of the sphenoid, behind by the basilar part of the occipital bone, and laterally by the petrous part of the temporal bone and the carotid canal.', 'muslu2025'),
    c('The segment of the internal carotid artery immediately above it is the lacerum segment.', 'muslu2025'),
  ],
  'Cribriform plate': [c('The olfactory nerves enter the anterior cranial fossa through the cribriform plate.', 'romano2019')],
};
