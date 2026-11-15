/**
 * Foramina the Z-Anatomy model does not label: located by the pipeline (pipeline/skullbase_foramina.py) from where the
 * structures that pass through them cross the bone. What passes through each, from open-access sources: Romano 2019
 * (PMC6420596) for the nerves, Muslu 2025 (PMC12113558) for the carotid canal and foramen lacerum; since the site audit's
 * B5: Raut 2012 (PMC3698894) for the vessels, Katsuta 1997 (abstract) for the jugular foramen's compartments,
 * Triantafyllou 2025 (PMC12043748) and Kempa 2025 (PMC12725769) for the foramen ovale, Trimble 2023 (PMC10550638) for the
 * carotid's sympathetic plexus, Jeican 2026 (PMC13302864) for the labyrinthine artery.
 */
export interface ForamenRef { id: string; shortLabel: string; citation: string; url: string; pmid: string }
export interface ForamenClaim { text: string; refIds: string[] }

const doi = (d: string) => `https://doi.org/${d}`;

export const FORAMEN_REFS: ForamenRef[] = [
  { id: 'romano2019', pmid: '30877408', shortLabel: 'Romano 2019', url: doi('10.1186/s13244-019-0719-5'),
    citation: 'Romano N, Federici M, Castaldi A. Imaging of cranial nerves: a pictorial overview. Insights Imaging. 2019;10(1):33. doi:10.1186/s13244-019-0719-5.' },
  { id: 'muslu2025', pmid: '40428901', shortLabel: 'Muslu 2025', url: doi('10.3390/medicina61050943'),
    citation: 'Muslu M, Karaca Ö, Kökçe A, Acer N. A computed tomography-based morphometric assessment of the foramen lacerum in a Turkish population using the 3D Slicer method. Medicina (Kaunas). 2025;61(5):943. doi:10.3390/medicina61050943.' },
  { id: 'raut2012', pmid: '23833423', shortLabel: 'Raut 2012', url: doi('10.4103/0971-3026.111485'),
    citation: "Raut AA, Naphade PS, Chawla A. Imaging of skull base: Pictorial essay. Indian J Radiol Imaging. 2012;22(4):305–316. doi:10.4103/0971-3026.111485." },
  { id: 'katsuta1997', pmid: '9218307', shortLabel: 'Katsuta 1997', url: doi('10.1097/00006123-199707000-00030'),
    citation: "Katsuta T, Rhoton AL, Matsushima T. The jugular foramen: microsurgical anatomy and operative approaches. Neurosurgery. 1997;41(1):149–201; discussion 201–2. doi:10.1097/00006123-199707000-00030. Checked against its abstract: the full text is not open access." },
  { id: 'triantafyllou2025fo', pmid: '40025319', shortLabel: 'Triantafyllou 2025', url: doi('10.1007/s12565-025-00826-5'),
    citation: "Triantafyllou G, Papadopoulos-Manolarakis P, Luzzi S, Olewnik Ł, Tsakotos G, Zielinska N, et al. Foramen ovale morphology and relationship with the lateral pterygoid process plate: proposal for a new classification system. Anat Sci Int. 2025;100(3):354–365. doi:10.1007/s12565-025-00826-5." },
  { id: 'kempa2025', pmid: '41446453', shortLabel: 'Kempa 2025', url: doi('10.7759/cureus.97572'),
    citation: "Kempa A, Sinou N, Sinou N, Filippou D, Shihada A. Anatomical Variations of the Foramen Ovale and Trigeminal Neuralgia. Cureus. 2025;17(11):e97572. doi:10.7759/cureus.97572." },
  { id: 'trimble2023', pmid: '37070686', shortLabel: 'Trimble 2023', url: doi('10.3171/case2375'),
    citation: "Trimble DJ, Dawes BH, Zeineddine HA, Guttenberg KB, Yao WC, Bhattacharjee M, et al. Neurofibroma of the internal carotid artery cavernous sympathetic plexus: illustrative case. J Neurosurg Case Lessons. 2023;5(16):CASE2375. doi:10.3171/case2375." },
  { id: 'jeican2026', pmid: '42356086', shortLabel: 'Jeican 2026', url: doi('10.3390/medicina62061073'),
    citation: 'Jeican II, Siserman CV, Toader C, Trombitaș VE. Microsurgical anatomy of the labyrinthine artery: a cadaveric microdissection study of number, origin and course at the cerebellopontine angle. Medicina (Kaunas). 2026;62(6):1073. doi:10.3390/medicina62061073.' },
];
export const FORAMEN_REF = new Map(FORAMEN_REFS.map((r) => [r.id, r]));

/** What passes through a foramen, each structure on its own row: whether its passage is the usual one or variable, the
 * model's own structures that stand for it (none: not modelled, which does not mean absent), and the evidence. */
export interface Passage { structure: string; passage: 'usual' | 'variable'; note?: string; model: string[]; refIds: string[] }
export const PASSAGES: Record<string, Passage[]> = {
  'Foramen ovale': [
    // (open-access sources since the site audit's C-011; Khairnar 2013, whose abstract lists no contents, removed)
    { structure: 'Mandibular nerve (V3)', passage: 'usual', model: ['Mandibular nerve (V3)'], refIds: ['romano2019', 'triantafyllou2025fo'] },
    { structure: 'Accessory meningeal artery', passage: 'usual', model: ['Accessory branch of middle meningeal artery'], refIds: ['triantafyllou2025fo', 'kempa2025'] },
    { structure: 'Lesser petrosal nerve', passage: 'variable', note: 'sometimes', model: [], refIds: ['kempa2025'] },
    { structure: 'Emissary vein', passage: 'usual', note: 'joining the cavernous sinus to the pterygoid venous plexus', model: [], refIds: ['triantafyllou2025fo', 'kempa2025'] },
  ],
};

const c = (text: string, ...refIds: string[]): ForamenClaim => ({ text, refIds });
const CAROTID = c('The carotid canal surrounds the petrous segment of the internal carotid artery and opens at the posterolateral margin of the foramen lacerum.', 'muslu2025');
const SYMPATHETIC = c('Postganglionic sympathetic fibres from the superior cervical ganglion accompany the artery through its petrous and cavernous segments.', 'trimble2023');

/** What passes through each located foramen, by landmark name. */
export const FORAMEN_CONTENTS: Record<string, ForamenClaim[]> = {
  'Superior orbital fissure': [c('The ophthalmic nerve leaves the skull through the superior orbital fissure, with the oculomotor, trochlear and abducens nerves and the superior ophthalmic vein.', 'romano2019')],
  'Internal acoustic meatus': [
    c('The vestibulocochlear nerve enters the temporal bone through the internal acoustic meatus, together with the facial nerve.', 'romano2019'),
    c('The labyrinthine artery runs with them to the meatus, where it divides.', 'jeican2026'),
    c('In the meatus the facial nerve lies anterosuperior, the superior vestibular nerve posterosuperior, the cochlear nerve anteroinferior and the inferior vestibular nerve posteroinferior.', 'romano2019'),
  ],
  'Stylomastoid foramen': [c('The facial nerve leaves the skull base at the stylomastoid foramen and reaches the parotid gland.', 'romano2019')],
  'Jugular foramen': [
    c('Microsurgically it has three compartments: a larger posterolateral sigmoid part receiving the sigmoid sinus, a smaller anteromedial petrosal part receiving the inferior petrosal sinus, and between them a neural (intrajugular) part through which the glossopharyngeal, vagus and accessory nerves run.', 'katsuta1997'),
    c('In the older two-part scheme the pars nervosa holds the glossopharyngeal nerve and the inferior petrosal sinus, the pars vascularis the internal jugular vein, the vagus and accessory nerves and the posterior meningeal artery; sometimes the vagus too runs through the pars nervosa.', 'raut2012'),
  ],
  'External opening of carotid canal': [CAROTID, SYMPATHETIC],
  'Internal opening of carotid canal': [CAROTID, SYMPATHETIC],
  'Foramen lacerum': [
    c('Bordered in front by the body of the sphenoid, behind by the basilar part of the occipital bone, and laterally by the petrous part of the temporal bone and the carotid canal.', 'muslu2025'),
    c('The segment of the internal carotid artery immediately above it is the lacerum segment.', 'muslu2025'),
    c('It is not a true foramen: in life fibrocartilage covers its upper surface, and the internal carotid artery runs over that tissue, not through it.', 'muslu2025'),
  ],
  'Cribriform plate': [c('The olfactory nerves enter the anterior cranial fossa through the cribriform plate.', 'romano2019')],
};
