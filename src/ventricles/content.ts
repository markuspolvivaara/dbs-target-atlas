import type { Claim } from '../brainstem/schema';

/**
 * What the sources say, by topic. Each claim was checked against the full text of the sources it cites
 * (src/ventricles/references.ts). Measurements made on this CT are generated with the geometry
 * (ve-trajectories.json) and shown apart from these.
 */
const c = (text: string, ...refIds: string[]): Claim => ({ text, refIds });

/** the lateral ventricle's walls */
export const LATERAL_WALLS: Claim[] = [
  c('Radiations of the genu, body and splenium of the corpus callosum contribute to the walls of the frontal horn, the body and the atrium of the lateral ventricle respectively.', 'gangal2026'),
  c('Frontal horn: fibres of the rostrum contribute to its floor and the forceps minor to its anterior and medial walls; fibres of the genu form its lateral wall together with the head of the caudate nucleus.', 'gangal2026'),
  c('Body: transverse fibres of the body of the corpus callosum form its roof; its medial wall is the septum dorsally and the body of the fornix ventrally; the thalamus forms its floor, and the caudate nucleus contributes to its lateral wall.', 'gangal2026'),
  c('Atrium and occipital horn: the tail of the caudate nucleus forms the front of the atrium’s lateral wall; the forceps major forms the medial wall of the atrium and occipital horn.', 'gangal2026'),
  c('The caudate nucleus follows the lateral ventricle from the frontal horn into the temporal horn: superolateral to the thalamus in the body, posterolateral to it in the atrium and inferolateral to it in the temporal horn.', 'gangal2026'),
];

/** the foramina of Monro, between the lateral ventricles and the third */
export const MONRO: Claim[] = [
  c('The frontal horn is the part of the lateral ventricle in front of the foramen of Monro; the body extends from the foramen’s posterior limit to where the septum disappears and the corpus callosum and fornix meet.', 'gangal2026'),
  c('The foramina of Monro are the highest points in the anterior wall of the third ventricle, at the junction of its roof and anterior wall.', 'azab2014'),
  c('The columns of the fornix arch along the foramen’s superior and anterior margins; the anterior tubercle of the thalamus forms its posterior border.', 'azab2014', 'gangal2026'),
  c('The choroid plexus of each lateral ventricle runs through the foramen of Monro, continuous with the two strands of choroid plexus in the roof of the third ventricle.', 'azab2014'),
  c('In 30 adults without hydrocephalus (models from MRI) the foramen was an oval opening of 5.23 mm² on average, larger above the age of 55 and on the left; in hydrocephalus it averaged 32.6 mm².', 'jean2019'),
];

/** the floor of the third ventricle, the target of an endoscopic third ventriculostomy */
export const THIRD_FLOOR: Claim[] = [
  c('From front to back the floor of the third ventricle comprises the supraoptic recess, the optic chiasm, the infundibulum, the tuber cinereum and the mammillary bodies.', 'abdalavargas2022'),
  c('The tuber cinereum is the part fenestrated in an endoscopic third ventriculostomy: bounded in front by the optic chiasm, behind by the mammillary bodies and at the sides by the hypothalamus, it rests on the basilar artery complex.', 'abdalavargas2022'),
  c('Among 180 patients the floor was thinned in 22 %, thickened in 53 %, globose in 6 %, partly erased in 7 % and narrow in 12 %; a thinned floor was found in 37 % of those with chronic hydrocephalus.', 'abdalavargas2022'),
];

/** freehand frontal ventriculostomy: where it enters and where it is aimed */
export const KOCHER: Claim[] = [
  c('Kocher’s point is commonly located 1 cm in front of the coronal suture and 2.5 cm from the midline; 10 mm in front of the coronal suture in the midpupillary line; or 10 cm behind the nasion and 3 cm from the midline.', 'chen2025'),
  c('From Kocher’s point the catheter is aimed at the external auditory canal in the sagittal plane, and in the coronal plane at the ipsilateral medial canthus (IMC), the midpoint between the two external acoustic meatus (MAM), the contralateral medial canthus (CMC), or perpendicular to the skull (P).', 'chen2025'),
  c('Park placed Kocher’s point 30 mm from the sagittal suture and 10 mm in front of the coronal suture.', 'park2020'),
];

/** published accuracy of the trajectories, by target (for the result card) */
export const ACCURACY: Record<string, Claim[]> = {
  IMC: [
    c('In 412 simulated punctures on 206 CTs (Kocher’s point 1 cm in front of the coronal suture, 2.5 cm from the midline), 13.3 % reached the ipsilateral frontal horn, at a depth of 41.8 ± 4.6 mm from the outer table.', 'chen2025'),
    c('Not recommended unless the frontal horns are wider than 45 mm or Kocher’s point is moved inward.', 'chen2025'),
    c('In 132 virtual ventriculostomies from a point 30 mm from the midline none reached the ipsilateral ventricle: 77.3 % ended in the putamen and 22.7 % in the internal capsule.', 'park2020'),
  ],
  MAM: [
    c('74.5 % reached the ipsilateral frontal horn, at a depth of 43.6 ± 4.3 mm; its accuracy rose with the width of the frontal horns.', 'chen2025'),
  ],
  CMC: [
    c('All 412 (100 %) reached the ipsilateral frontal horn, at a depth of 47.2 ± 5.2 mm, whatever the width of the frontal horns.', 'chen2025'),
    c('From a point 30 mm from the midline, 26.5 % reached the ipsilateral ventricle and 73.5 % the contralateral one.', 'park2020'),
  ],
  P: [
    c('90.5 % reached the ipsilateral frontal horn and 99.5 % one or the other, at a depth of 49.4 ± 5.9 mm: the perpendicular trajectory may enter the contralateral ventricle.', 'chen2025'),
  ],
};

/** an aim between the canthi (Park's proposal) */
export const IDEAL: Claim[] = [
  c('The line from Kocher’s point through the middle of the ipsilateral ventricle aimed on average 6.7 mm across the midline: a third of the way from the midline to the contralateral medial canthus. Aiming at the midpoint between the medial canthi reached the ipsilateral frontal horn in 87.9 %.', 'park2020'),
];

/** placement in practice */
export const PRACTICE: Claim[] = [
  c('About 25 000 external ventricular drains are placed a year in the United States; a survey estimated 1.4 to 2.4 passes per placement.', 'chen2025'),
  c('With no cerebrospinal fluid at a depth beyond 65 mm the catheter should be withdrawn and re-aimed; fluid beyond 60 mm may come from the contralateral ventricle.', 'chen2025'),
  c('Kakarla grades: 1, optimal, in the ipsilateral frontal horn or the third ventricle; 2, functional but not ideal, in the contralateral ventricle or non-eloquent cortex; 3, in eloquent cortex or non-target spaces.', 'charcos2025'),
  c('Of 44 bedside drains (after trauma or haemorrhage), all placed with electromagnetic image guidance were optimal (Kakarla grade 1) in one pass; freehand, 88.2 % were optimal and 73.5 % took one pass.', 'charcos2025'),
];

export const TARGET_NAME: Record<string, string> = {
  IMC: 'Ipsilateral medial canthus', MAM: 'Midpoint between the external acoustic meatus', CMC: 'Contralateral medial canthus', P: 'Perpendicular to the skull',
};
