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

/** the aqueduct, from the third ventricle to the fourth */
export const AQUEDUCT: Claim[] = [
  c('The aqueduct opens at the back of the third ventricle and runs down through the periaqueductal grey of the midbrain to the fourth ventricle. It is arc-shaped: an upper segment more horizontal and a lower, wider one more vertical, meeting at an angle between the superior and inferior colliculi.', 'xiao2025'),
  c('In 30 healthy adults aged 61–88 (MRI) it was 19.63 ± 1.88 mm long and 1.98 ± 0.42 mm across where it leaves the third ventricle, 1.27 ± 0.23 mm at its narrowest and 2.49 ± 0.50 mm where it opens into the fourth; in idiopathic normal-pressure hydrocephalus it was as long but wider.', 'xiao2025'),
];

/** the fourth ventricle */
export const FOURTH: Claim[] = [
  c('Floor of the fourth ventricle in 40 cadavers: 33.58 ± 2.49 mm long and 20.0 ± 1.83 mm wide; from the aqueduct to the rostral margin of the facial colliculus 14.6 ± 1.97 mm.', 'erginoglu2026'),
  c('Its caudal roof: the uvula and nodulus of the vermis; the inferior medullary velum branching off the nodulus on each side to the flocculus just outside the foramina of Luschka; below, the tela choroidea with the choroid plexus, fixed by the taeniae beside the foramen of Magendie.', 'longatti2026'),
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

/** the endoscopic third ventriculostomy: what the endoscope passes and what lies around the stoma */
export const ETV_ANATOMY: Claim[] = [
  c('Seen from above, the column of the fornix passes in front of the foramen of Monro; the thalamostriate, caudate, choroidal and septal veins of each lateral ventricle converge and drain through its posterior border; the choroid plexus lies on the choroidal fissure.', 'dasilva2024'),
  c('The floor is fenestrated behind the infundibular recess and in front of the basilar artery and the mammillary bodies. The anterior wall near the lamina terminalis is avoided (the optic chiasm and the infundibular recess), and so is the column of the fornix.', 'dasilva2024'),
  c('The basilar artery is not always visible through the semi-translucent floor; its injury risks fatal blood loss.', 'dasilva2024'),
  c('In 200 MRIs of adults without hydrocephalus, measured from the anterior commissure’s posterosuperior border along the AC–PC line: the mammillary bodies’ anterosuperior point 8.56 ± 1.18 mm behind it and 7.01 ± 1.65 mm below; the lowest point of the infundibular recess 0.49 ± 1.60 mm behind and 13.34 ± 1.78 mm below; the top of the basilar artery 9.79 ± 2.22 mm behind and 13.97 ± 4.08 mm below.', 'dasilva2024'),
  c('With dilated ventricles the distance from the basilar apex to the floor was 2.75 mm, against 6.54 mm in controls (Aydin 2009, as cited); in hydrocephalus the floor may be pushed down, but the apex not.', 'dasilva2024'),
];

/** the endoscope's trajectory: through the foramen of Monro to the tuber cinereum */
export const ETV_TRAJECTORY: Claim[] = [
  c('On 187 MRIs, the line from the outer table through the foramen of Monro to the tuber cinereum, drawn as close to perpendicular to the bone as possible: in the 157 without hydrocephalus it was 88.5 ± 3.9 mm long, reached the foramen at 72.6 ± 3.8 mm and the lateral ventricle’s wall at 53.5 ± 4.8 mm; in the 30 with hydrocephalus 93.5 ± 7.2, 74.8 ± 5.8 and 38.8 ± 7.1 mm.', 'sousa2025'),
  c('Its entry lay 14.7 ± 5.5 mm from the sagittal suture and a median 8.0 mm from the coronal suture without hydrocephalus (19.0 ± 8.6 and 10.6 mm with it); its angulation, measured relative to the AC–PC plane, was 2.2 ± 3.4° in the sagittal and 7.5 ± 3.5° in the coronal plane (2.5 ± 3.6° and 11.0 ± 6.1° with hydrocephalus).', 'sousa2025'),
  c('Each 0.1 rise in Evans’ index lengthened the way to the tuber cinereum by about 6 mm and shortened the way to the lateral ventricle’s wall by about 7 mm.', 'sousa2025'),
];

/** hydrocephalus: how large the ventricles become (the slider's full extent) */
export const HYDRO: Claim[] = [
  c('In 68 adults with hydrocephalus (one centre, CT and MRI), the median Evans’ index was 0.42 (interquartile range 0.39–0.49) and the third ventricle’s median width 23.5 mm (18.2–26.0), measured as its greatest transverse diameter at or near the level of the foramina of Monro; 44 had triventricular, 16 tetraventricular and 8 biventricular hydrocephalus.', 'rosu2026'),
  c('Without hydrocephalus Evans’ index averaged 0.262 ± 0.024 in 157 adults, and 0.375 ± 0.070 in 30 with it.', 'sousa2025'),
];
