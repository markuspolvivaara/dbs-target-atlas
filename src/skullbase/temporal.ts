/**
 * Teaching notes of the temporal-bone model (Skull base v3), keyed by structure or landmark name. Every statement cites
 * an open-access source and was checked against its full text: Gupta 2013 (PMC3676972), Kalaiarasi 2018 (PMC6171777),
 * Nguyen 2026 (PMC13337827), García-Barrios 2021 (PMC8510941), Sieber 2019 (PMC6326113, the OpenEar data descriptor),
 * Romano 2019 (PMC6420596) for the cranial nerves' courses and exits, Sugano 2022 (PMC9785582) for the foramen spinosum.
 * What this model itself measures (segment lengths, distances) comes from sbv3-fit.json and is shown next to them.
 */
export interface TbRef { id: string; shortLabel: string; citation: string; url: string; pmid: string; pmcid: string }
export interface TbClaim { text: string; refIds: string[] }

const doi = (d: string) => `https://doi.org/${d}`;
export const TB_REFS: TbRef[] = [
  { id: 'sieber2019', pmid: '30620342', pmcid: 'PMC6326113', shortLabel: 'Sieber 2019', url: doi('10.1038/sdata.2018.297'),
    citation: 'Sieber D, Erfurt P, John S, Ribeiro dos Santos G, Schurzig D, Sørensen MS, Lenarz T. The OpenEar library of 3D models of the human temporal bone based on computed tomography and micro-slicing. Sci Data. 2019;6:180297. doi:10.1038/sdata.2018.297.' },
  { id: 'gupta2013', pmid: '23766904', pmcid: 'PMC3676972', shortLabel: 'Gupta 2013', url: doi('10.1155/2013/248039'),
    citation: 'Gupta S, Mends F, Hagiwara M, Fatterpekar G, Roehm PC. Imaging the facial nerve: a contemporary review. Radiol Res Pract. 2013;2013:248039. doi:10.1155/2013/248039.' },
  { id: 'kalaiarasi2018', pmid: '30324041', pmcid: 'PMC6171777', shortLabel: 'Kalaiarasi 2018', url: doi('10.7759/cureus.3085'),
    citation: 'Kalaiarasi R, Kiran AS, Vijayakumar C, Venkataramanan R, Manusrut M, Prabhu R. Anatomical features of intratemporal course of facial nerve and its variations. Cureus. 2018;10(8):e3085. doi:10.7759/cureus.3085.' },
  { id: 'nguyen2026', pmid: '42416242', pmcid: 'PMC13337827', shortLabel: 'Nguyen 2026', url: doi('10.3389/fsurg.2026.1780349'),
    citation: 'Nguyen HD, Le TQ, Ngo HM, Kieu HD. Morphometric anatomy of the middle cranial fossa via the anterior petrosal (Kawase) approach: a bilateral cadaveric study. Front Surg. 2026;13:1780349. doi:10.3389/fsurg.2026.1780349.' },
  { id: 'romano2019', pmid: '30877408', pmcid: 'PMC6420596', shortLabel: 'Romano 2019', url: doi('10.1186/s13244-019-0719-5'),
    citation: 'Romano N, Federici M, Castaldi A. Imaging of cranial nerves: a pictorial overview. Insights Imaging. 2019;10(1):33. doi:10.1186/s13244-019-0719-5.' },
  { id: 'sugano2022', pmid: '36556942', pmcid: 'PMC9785582', shortLabel: 'Sugano 2022', url: doi('10.3390/medicina58121740'),
    citation: 'Sugano GT, Pauris CC, Silva YBE, Pandini FE, Palermo RBS, Buchaim DV, et al. Topographic and morphometric study of the foramen spinosum of the skull and its clinical correlation. Medicina (Kaunas). 2022;58(12):1740. doi:10.3390/medicina58121740.' },
  { id: 'muslu2025', pmid: '40428901', pmcid: 'PMC12113558', shortLabel: 'Muslu 2025', url: doi('10.3390/medicina61050943'),
    citation: 'Muslu M, Karaca Ö, Kökçe A, Acer N. A computed tomography-based morphometric assessment of the foramen lacerum in a Turkish population using the 3D Slicer method. Medicina (Kaunas). 2025;61(5):943. doi:10.3390/medicina61050943.' },
  { id: 'garciabarrios2021', pmid: '34542698', pmcid: 'PMC8510941', shortLabel: 'García-Barrios 2021', url: doi('10.1007/s00276-021-02834-2'),
    citation: 'García-Barrios A, Cisneros AI, Obon J, Crovetto R, Benito J, Whyte J. Anatomical study between the correlation of the arcuate eminence and the superior semicircular canal. Surg Radiol Anat. 2021;43(11):1845–1850. doi:10.1007/s00276-021-02834-2.' },
  { id: 'chaware2023', pmid: '37200762', pmcid: 'PMC10186047', shortLabel: 'Chaware 2023', url: doi('10.4103/abr.abr_261_20'),
    citation: 'Chaware P, Kumar V, Srivastava A, Raj S, Rathinam BAD. Neurovascular structures at risk during surgical access to trigeminal ganglion and Meckel’s cave: an anatomical study. Adv Biomed Res. 2023;12:62. doi:10.4103/abr.abr_261_20.' },
];
export const TB_REF = new Map(TB_REFS.map((r) => [r.id, r]));

const c = (text: string, ...refIds: string[]): TbClaim => ({ text, refIds });

/** Notes per structure or landmark name (the model's names). */
export const TB_NOTES: Record<string, TbClaim[]> = {
  // ---- the cranial nerves and the foramina they leave by
  'Olfactory nerve (I)': [
    c('Olfactory fibres enter the anterior cranial fossa through the cribriform plate and end in the olfactory bulb; the tract then runs between the gyrus rectus and the medial orbital gyrus.', 'romano2019'),
  ],
  'Optic nerve (II)': [c('It leaves the orbit for the cranial cavity through the optic canal.', 'romano2019')],
  'Trigeminal ganglion': [
    c('It lies in a shallow depression at the apex of the petrous temporal bone, just outside the posterior part of the lateral wall of the cavernous sinus, in a dural pouch: Meckel’s cave. It is semilunar, its convexity forwards and laterally; the ophthalmic, maxillary and the sensory part of the mandibular nerve leave its convex margin.', 'chaware2023'),
    c('In 80 cadaveric sides it measured 15.4 mm long, 4.4 mm wide and 2.5 mm thick. Meckel’s cave lay 4.5 mm from the foramen ovale, 11.2 mm from the foramen rotundum, 6.4 mm from the foramen spinosum, 27.4 mm from the superior orbital fissure and 16.5 mm from the arcuate eminence; the abducens, trochlear and oculomotor nerves passed 2.5, 4.9 and 6.3 mm from it.', 'chaware2023'),
  ],
  'Oculomotor nerve (III)': [c('It enters the cavernous sinus, where it is the most superior nerve, and reaches the orbit through the superior orbital fissure.', 'romano2019')],
  'Trochlear nerve (IV)': [c('It curves over the superior cerebellar peduncle, runs between the superior cerebellar and posterior cerebral arteries and along the free edge of the tentorium, enters the cavernous sinus below the oculomotor nerve and above the ophthalmic nerve, and reaches the orbit through the superior orbital fissure.', 'romano2019')],
  'Trigeminal nerve (V)': [c('It emerges straight forward from the lateral pons into Meckel’s cave, where the trigeminal ganglion lies and the nerve divides into its three divisions.', 'romano2019')],
  'Ophthalmic nerve (V1)': [c('It runs in the lateral wall of the cavernous sinus and leaves the skull through the superior orbital fissure, with the oculomotor, trochlear and abducens nerves and the superior ophthalmic vein.', 'romano2019')],
  'Maxillary nerve (V2)': [c('It runs in the lateral wall of the cavernous sinus, leaves the skull through the foramen rotundum and crosses the pterygopalatine fossa.', 'romano2019')],
  'Mandibular nerve (V3)': [c('It leaves the skull through the foramen ovale into the infratemporal fossa, where it divides into its branches.', 'romano2019')],
  'Abducens nerve (VI)': [c('It descends along the back of the clivus, through Dorello’s canal into the cavernous sinus, the only cranial nerve that runs through the sinus’ central venous part, and enters the orbit through the superior orbital fissure.', 'romano2019')],
  'Vestibulocochlear nerve (VIII)': [c('It enters the temporal bone through the internal acoustic meatus, with the facial nerve.', 'romano2019')],
  'Glossopharyngeal nerve (IX)': [c('From the lateral medulla it crosses the lateral cerebellomedullary cistern and leaves the skull through the jugular foramen (pars nervosa).', 'romano2019')],
  'Vagus nerve (X)': [c('From the lateral medulla it crosses the lateral cerebellomedullary cistern and leaves the skull through the jugular foramen (pars vascularis), between the glossopharyngeal and accessory nerves; its superior ganglion lies in and below the foramen.', 'romano2019')],
  'Accessory nerve (XI)': [c('Its spinal roots rise through the foramen magnum; joined with the cranial roots it leaves through the jugular foramen, behind the glossopharyngeal and vagus nerves.', 'romano2019')],
  'Hypoglossal nerve (XII)': [c('From the ventrolateral sulcus of the medulla it crosses the lateral cerebellomedullary cistern, near the vertebral and posterior inferior cerebellar arteries, and leaves the skull through the hypoglossal canal.', 'romano2019')],
  'Middle meningeal artery': [c('A branch of the first part of the maxillary artery, it enters the skull through the foramen spinosum.', 'sugano2022')],
  'Optic canal': [c('The optic nerve’s passage between the orbit and the cranial cavity.', 'romano2019')],
  'Superior orbital fissure': [c('The oculomotor, trochlear, ophthalmic and abducens nerves and the superior ophthalmic vein pass through it.', 'romano2019')],
  'Foramen rotundum': [c('The maxillary nerve leaves the skull through it to the pterygopalatine fossa.', 'romano2019')],
  'Foramen ovale': [c('The mandibular nerve leaves the skull through it to the infratemporal fossa.', 'romano2019')],
  'Foramen spinosum': [
    c('In the greater wing of the sphenoid, posterolateral to the foramen ovale; it transmits the middle meningeal artery and vein and the meningeal branch of the mandibular nerve.', 'sugano2022'),
  ],
  'Jugular foramen': [c('The glossopharyngeal nerve passes through its pars nervosa; the vagus and accessory nerves through its pars vascularis.', 'romano2019')],
  'Hypoglossal canal': [c('The hypoglossal nerve leaves the skull through it.', 'romano2019')],
  'Foramen magnum': [c('The spinal roots of the accessory nerve rise through it into the skull.', 'romano2019')],
  'Internal acoustic meatus': [c('The facial and vestibulocochlear nerves pass through it into the temporal bone.', 'romano2019')],
  'Foramen lacerum': [
    c('Bordered in front by the body of the sphenoid, behind by the basilar part of the occipital bone, and laterally by the petrous part of the temporal bone and the carotid canal.', 'muslu2025'),
    c('The segment of the internal carotid artery immediately above it is the lacerum segment.', 'muslu2025'),
  ],
  'Internal carotid artery (petrous and lacerum parts)': [
    c('The carotid canal surrounds the petrous segment of the internal carotid artery and opens at the posterolateral margin of the foramen lacerum.', 'muslu2025'),
    c('The segment immediately above the foramen lacerum is the lacerum segment.', 'muslu2025'),
  ],
  'External opening of carotid canal': [c('The carotid canal surrounds the petrous segment of the internal carotid artery and opens at the posterolateral margin of the foramen lacerum.', 'muslu2025')],
  // ---- the temporal bone
  'Facial nerve (VII)': [
    c('Its bony canal has three segments: labyrinthine, tympanic and mastoid.', 'gupta2013'),
    c('The labyrinthine segment, from the fundus of the internal acoustic meatus to the geniculate ganglion, is the narrowest (under 0.7 mm) and shortest (3–5 mm); it runs anterolaterally, above the cochlea.', 'gupta2013'),
    c('At the geniculate ganglion the nerve turns about 75° backwards into the tympanic segment, which passes medial to the incus, above and lateral to the oval window and below the lateral semicircular canal.', 'gupta2013'),
    c('At the pyramidal process it turns down (95–125°, the second genu) into the mastoid segment, which runs to the stylomastoid foramen; the mastoid segment gives the nerve to the stapedius and the chorda tympani.', 'gupta2013'),
    c('In 50 dissected temporal bones the labyrinthine, tympanic and mastoid segments measured 4.1 ± 0.6, 9.34 ± 1.12 and 12.8 ± 1.8 mm; the tympanic segment lay 3.1 ± 1.03 mm from the posterior edge of the oval window.', 'kalaiarasi2018'),
    c('Bony dehiscence of the tympanic segment’s canal is reported in 41–75 % of people; in that dissection series it was seen in 6 %.', 'gupta2013', 'kalaiarasi2018'),
    c('The specimens were dehydrated for embedding, so the facial nerve may have shrunk and no longer fill its bony canal entirely.', 'sieber2019'),
  ],
  'Chorda tympani': [
    c('A branch of the mastoid segment of the facial nerve.', 'gupta2013'),
    c('In all 50 dissected temporal bones it took an ascending path.', 'kalaiarasi2018'),
  ],
  'Nerves in the internal acoustic meatus (VII, VIII)': [
    c('The facial nerve runs in the anterosuperior quadrant of the canal. At its lateral end the transverse (falciform) crest separates it from the cochlear nerve below, and a vertical bar of bone (Bill’s bar) from the superior vestibular nerve behind.', 'gupta2013'),
    c('The anterior inferior cerebellar artery can run within the canal, close to its nerves.', 'gupta2013'),
  ],
  'Greater petrosal nerve': [
    c('The facial nerve’s first branch: it leaves the geniculate ganglion anteriorly and runs along the anterior surface of the temporal bone into the pterygoid (Vidian) canal, carrying preganglionic parasympathetic fibres to the pterygopalatine ganglion (lacrimal gland, nasal and palatal glands).', 'gupta2013'),
    c('From the geniculate ganglion it measured 13.78 ± 1.78 mm, and lay 1.84 ± 1.52 mm (0–5.65 mm) from the petrous carotid, touching it on 2 of 42 sides.', 'nguyen2026'),
  ],
  'Geniculate ganglion': [
    c('Usually covered by bone, but in up to 18 % of cases in direct contact with the dura of the middle cranial fossa.', 'gupta2013'),
    c('It lay 3.39 ± 0.98 mm from the cochlea and 8.82 ± 1.49 mm from the superior semicircular canal (42 sides).', 'nguyen2026'),
  ],
  'Second genu of facial nerve': [
    c('Where the tympanic segment turns down at the pyramidal process, at 95–125°.', 'gupta2013'),
  ],
  'Fundus of internal acoustic meatus': [
    c('The labyrinthine segment of the facial nerve starts here.', 'gupta2013'),
  ],
  'Bone over the superior semicircular canal': [
    c('The arcuate eminence marks the canal directly only when it is flat (under 1 mm high; 20.3 % of 295 temporal bones). A prominent eminence (74.6 %) was raised by air cells or cancellous bone over the canal, not by the canal itself.', 'garciabarrios2021'),
  ],
};
