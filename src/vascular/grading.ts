import type { Claim } from '../brainstem/schema';

/**
 * The grading tables of the vascular section's Grading page: each cell from its sources (references.ts), checked against
 * the open-access full text; `drawn` marks the row a view of this atlas draws (its group id).
 */
export interface GradeRow { cells: string[]; drawn?: string }
export interface GradeTable {
  id: string;
  title: string;
  head: string[];
  rows: GradeRow[];
  /** a line under the table */
  foot?: string;
  refIds: string[];
  /** what the grades mean in the clinic */
  notes: Claim[];
}

const c = (text: string, ...refIds: string[]): Claim => ({ text, refIds });

// ---------------------------------------------------------------- arteriovenous malformations
export const SM_POINTS: GradeTable = {
  id: 'sm-points', title: 'Spetzler–Martin grade: the points',
  head: ['Feature', 'Finding', 'Points'],
  rows: [
    { cells: ['Size of the nidus', 'under 3 cm', '1'] },
    { cells: ['', '3–6 cm', '2'] },
    { cells: ['', 'over 6 cm', '3'] },
    { cells: ['Eloquence of the brain next to it', 'not eloquent', '0'] },
    { cells: ['', 'eloquent: sensorimotor, language or visual cortex, hypothalamus, thalamus, internal capsule, brainstem, cerebellar peduncles, deep cerebellar nuclei', '1'] },
    // (the site audit's D-005: one series' working rule for superficial drainage had stood in the table)
    { cells: ['Venous drainage', 'superficial only', '0'] },
    { cells: ['', 'any deep (the internal cerebral veins, basal veins, precentral cerebellar veins)', '1'] },
  ],
  foot: 'The points add up to the grade, I to V; grade VI is kept for lesions no treatment can reach. One series counted only drainage to the superior sagittal or transverse sinus as superficial (see the card).',
  refIds: ['naranbhai2023'],
  notes: [],
};

export const SM_GRADES: GradeTable = {
  id: 'sm-grades', title: 'Spetzler–Martin grade: the surgical risk it estimates',
  head: ['Grade', 'Spetzler–Ponce class', 'Adverse outcomes of surgery, by class†', 'Modified Rankin Scale score unchanged or improved after surgery*'],
  rows: [
    { cells: ['I', 'A', 'about 10 %', '85 % (40 of 47)'], drawn: 'avm1' },
    { cells: ['II', 'A', 'about 10 %', '67 % (37 of 55)'] },
    { cells: ['III', 'B', 'about 18 %', '60 % (25 of 42)'], drawn: 'avm3' },
    { cells: ['IV', 'C', 'over 30 %', '54 % (25 of 46)'] },
    { cells: ['V', 'C', 'over 30 %', '60 % (6 of 10)'], drawn: 'avm5' },
  ],
  foot: '† As reported for each Spetzler–Ponce class (Naranbhai 2023). * A Modified Rankin Scale score unchanged or improved, against the score before surgery, at the last follow-up, in 200 patients operated on in Helsinki (Hafez 2019); few had grade V. The grade estimates the risk of an operation; it is not a treatment recommendation.',
  refIds: ['assker2025', 'naranbhai2023', 'hofman2018', 'hafez2019'],
  notes: [
    c('The score aims to estimate the risk of an operation, in mortality and morbidity. Whether to operate also depends on the natural history, the patient’s other illnesses, the treatments available and the patient’s own expectations: the grade is a first step in judging operability.', 'assker2025'),
    c('Adverse outcomes of surgery are reported as 10 % for Spetzler–Ponce class A and 18 % for class B (each better than the class’s natural history over 5 and 10 years), and more than 30 % for class C.', 'naranbhai2023'),
    c('As one review summarises practice: in grades I and II surgery offers immediate decompression, faster recovery and a shorter hospital stay; grade III is the hardest to decide (some operate, others choose radiosurgery or several treatments combined); grades IV and V are considered by most inoperable, and other measures are taken to reduce re-bleeding and morbidity.', 'assker2025'),
    c('In one simplified algorithm, Spetzler–Ponce class A patients may be offered surgery if they are good surgical candidates; class B, if the nidus is compact or the patient younger than 40 (for the rest of class B conservative management may be preferred); class C is generally not treated, unless the patient is young or has poorly controlled seizures and accepts the risk of a permanent deficit.', 'naranbhai2023'),
    c('In grades I to III radiosurgery has outcomes similar to surgery apart from the time to obliteration; in grade IV, staged-dose radiosurgery obliterated the AVM in only 50 % of cases.', 'assker2025'),
    c('Grade III is a mixed group: an eloquent AVM of 3–6 cm (S2E1V0) carries a high surgical risk and is managed conservatively, like grades IV and V, while one of that size with deep drainage (S2E0V1) is sometimes operated on.', 'assker2025'),
    c('Most surgical morbidity came with eloquence rather than deep venous drainage: in one series 0.6 % in non-eloquent areas against 9.5 % in eloquent ones.', 'assker2025'),
  ],
};

export const SUPP_POINTS: GradeTable = {
  id: 'supp-points', title: 'Supplementary (Lawton–Young) grade: the points',
  head: ['Factor', 'Finding', 'Points'],
  rows: [
    { cells: ['Age', 'under 20 years', '1'] },
    { cells: ['', '20–40 years', '2'] },
    { cells: ['', 'over 40 years', '3'] },
    { cells: ['Presentation', 'ruptured', '0'] },
    { cells: ['', 'unruptured', '1'] },
    { cells: ['Nidus', 'compact', '0'], drawn: 'avm3' },
    { cells: ['', 'diffuse', '1'], drawn: 'avm5' },
  ],
  foot: 'The supplemented Spetzler–Martin grade is the Spetzler–Martin grade plus these points: 2 to 10.',
  refIds: ['lawton2010', 'hafez2019', 'assker2025'],
  notes: [
    // (the site audit's D-010: the scale's own paper)
    c('The scale was derived from 300 patients operated on by one surgeon, by the change in the Modified Rankin Scale score from before surgery to the last follow-up: 76 % were unchanged or improved, 18 % worse, and 6 % died. It predicted that change better than the Spetzler–Martin grade did (area under the ROC curve 0.73 against 0.65).', 'lawton2010'),
    c('It adds the patient’s age, a history of haemorrhage and the type of nidus to the Spetzler–Martin factors; grade 6 is taken as the cut-off for acceptable surgical risk. Age and rupture change with time, and embolisation or radiosurgery can change the nidus, so the grade can change too.', 'hafez2019'),
    c('An unruptured AVM scores higher because those patients usually have no deficit before surgery, so they are more likely to gain a new one than patients already left with a deficit by a haemorrhage.', 'hafez2019'),
    c('It predicted the outcome after surgery better than the Spetzler–Martin grade: area under the ROC curve 0.70 against 0.63 at the last follow-up.', 'hafez2019'),
  ],
};

export const SUPP_GRADES: GradeTable = {
  id: 'supp-grades', title: 'Supplemented grade: outcome after surgery',
  // (the site audit's D-010: the original series beside the later one; the later one's column stays last)
  head: ['Supplemented grade', 'Unchanged or improved after surgery, the original series†', 'Favourable outcome after surgery, Helsinki*'],
  rows: [
    { cells: ['2', '100 % (7 of 7)', '100 % (3 of 3)'] },
    { cells: ['3', '100 % (21 of 21)', '86 % (19 of 22)'] },
    { cells: ['4', '91 % (50 of 55)', '88 % (29 of 33)'] },
    { cells: ['5', '79 % (71 of 90)', '69 % (37 of 54)'] },
    { cells: ['6', '73 % (51 of 70)', '60 % (21 of 35)'] },
    { cells: ['7', '45 % (20 of 44)', '48 % (13 of 27)'] },
    { cells: ['8', '50 % (4 of 8)', '27 % (4 of 15)'] },
    { cells: ['9', '60 % (3 of 5)', '60 % (6 of 10)'] },
    { cells: ['10', 'no patients', '100 % (1 of 1)'] },
  ],
  foot: '† A Modified Rankin Scale score unchanged or improved at the last follow-up, in the 300 patients the scale was derived from (Lawton 2010). * Favourable as the study defines it: a Modified Rankin Scale score unchanged or improved, against the score before surgery, at the last follow-up, in 200 patients operated on in Helsinki (Hafez 2019). In both series the highest grades are few.',
  refIds: ['lawton2010', 'hafez2019'],
  notes: [
    c('In the original series, supplemented grades of 6 or less fell into its low-risk (up to 3) and moderate-risk (4 to 6) groups, which its authors take to predict acceptably low surgical morbidity; grades 7 to 10 formed the high-risk group.', 'lawton2010'),
  ],
};

// ---------------------------------------------------------------- unruptured lesions (the site audit's D-010; the
// owner's choice of 16 November 2026: ARUBA with its final follow-up and the pooled natural history for AVMs; ISUIA and
// PHASES for aneurysms). Mohr 2014 was read in full; the others have no open-access full text and were checked against
// their abstracts. ISUIA's rates are the abstract's (PubMed's copy has lost their decimal points; two open papers
// that quote them, Golshani 2010 and Chen 2018, give them as here).
export const ARUBA: GradeTable = {
  id: 'aruba', title: 'Unruptured AVMs: treated or watched (the ARUBA trial)',
  head: ['Mean follow-up', 'Medical management alone', 'With interventional therapy', 'Hazard ratio'],
  rows: [
    { cells: ['33 months, when randomisation was halted', '11 of 109 (10.1 %)', '35 of 114 (30.7 %)', '0.27 (95 % CI 0.14–0.54)'] },
    { cells: ['50 months, the final follow-up', '15 of 110 (3.39 per 100 patient-years)', '41 of 116 (12.32 per 100 patient-years)', '0.31 (95 % CI 0.17–0.56)'] },
  ],
  foot: 'Patients who died or had a symptomatic stroke, counted in the group they were assigned to. The surgical grade above estimates the risk of an operation; it does not say whether an AVM that has not bled should be treated.',
  refIds: ['mohr2014', 'mohr2020'],
  notes: [
    c('ARUBA assigned adults with an unruptured AVM at random to medical management alone or with interventional therapy (neurosurgery, embolisation or stereotactic radiotherapy, alone or combined), at 39 centres in nine countries. Randomisation was halted in 2013, when a monitoring board found medical management alone superior.', 'mohr2014'),
    c('What the intervention was: of the 114 patients assigned to it, 5 were treated by neurosurgery alone, 30 by embolisation alone, 31 by radiotherapy alone and 28 by a combination; 20 had not begun treatment when the trial was analysed. No AVM was above Spetzler–Martin grade IV, and 62 % were grade II or lower.', 'mohr2014'),
    c('Followed without intervention in the trial, the AVMs bled at 2.2 % a year (95 % CI 0.9–4.5).', 'mohr2014'),
    c('After a mean of 50 months medical management alone remained superior; the trialists add that the still longer-term risks and differences between the two approaches remain uncertain.', 'mohr2020'),
    c('Natural history, pooled from four cohorts (6074 patient-years): 2.3 % of untreated AVMs bled each year, 1.3 % of those unruptured when found against 4.8 % of those that had already bled. A haemorrhage at presentation (hazard ratio 3.86) and increasing age (1.34 per decade) independently predicted bleeding; the AVM’s size did not.', 'kim2014'),
  ],
};

export const ISUIA: GradeTable = {
  id: 'isuia', title: 'Unruptured aneurysms: rupture within 5 years, by size and site (ISUIA)',
  head: ['Largest diameter', 'Internal carotid, anterior communicating or anterior cerebral, or middle cerebral artery', 'Posterior circulation or posterior communicating artery'],
  rows: [
    { cells: ['under 7 mm', '0 %', '2.5 %'] },
    { cells: ['7–12 mm', '2.6 %', '14.5 %'] },
    { cells: ['13–24 mm', '14.5 %', '18.4 %'] },
    { cells: ['25 mm or more', '40 %', '50 %'] },
  ],
  foot: 'Cumulative rupture over 5 years in patients with no earlier subarachnoid haemorrhage whose aneurysm was not repaired (Wiebers 2003).',
  refIds: ['wiebers2003'],
  notes: [
    c('The International Study of Unruptured Intracranial Aneurysms followed patients prospectively at centres in the USA, Canada and Europe: of 4060, 1692 had no repair, 1917 open surgery and 451 an endovascular procedure. The rupture rates above were often equalled or exceeded by the risks of surgical or endovascular repair of comparable aneurysms; age strongly predicted the surgical outcome, and the aneurysm’s size and site both the surgical and the endovascular one.', 'wiebers2003'),
    c('PHASES pooled 8382 people from six prospective cohorts (230 ruptures in 29 166 person-years): the mean risk of rupture was 1.4 % in the first year and 3.4 % over 5 years. Its predictors were age, hypertension, an earlier subarachnoid haemorrhage, the aneurysm’s size and site, and geographical region.', 'greving2014'),
    c('By those predictors the estimated 5-year risk ran from 0.25 % (younger than 70, no vascular risk factors, an internal carotid aneurysm under 7 mm) to more than 15 % (70 or older, hypertension, an earlier subarachnoid haemorrhage, a posterior circulation aneurysm over 20 mm) in populations from North America and from Europe other than Finland; Finnish people had 3.6 times and Japanese people 2.8 times that risk.', 'greving2014'),
  ],
};

// ---------------------------------------------------------------- subarachnoid haemorrhage
export const HUNT_HESS: GradeTable = {
  id: 'hunt-hess', title: 'Hunt and Hess grade',
  head: ['Grade', 'The patient'],
  rows: [
    // (the site audit's D-003: the fuller wording, which keeps a cranial nerve palsy in grade 2)
    { cells: ['1', 'asymptomatic, or minimal headache and slight nuchal rigidity'] },
    { cells: ['2', 'moderate or severe headache, nuchal rigidity, no neurological deficit other than a cranial nerve palsy'] },
    { cells: ['3', 'drowsiness, confusion, or a mild focal deficit'] },
    { cells: ['4', 'stupor, moderate to severe hemiparesis, possibly early decerebrate rigidity and vegetative disturbance'] },
    { cells: ['5', 'deep coma, decerebrate posturing, moribund appearance'] },
  ],
  refIds: ['patel2021', 'marcolini2019'],
  notes: [
    c('A clinical grade from 1 to 5, from the symptoms and signs: from a mild headache to coma.', 'robba2024'),
  ],
};

export const WFNS: GradeTable = {
  id: 'wfns', title: 'World Federation of Neurosurgical Societies (WFNS) grade',
  head: ['Grade', 'Glasgow Coma Scale', 'Focal deficit'],
  rows: [
    { cells: ['1', '15', 'none'] },
    { cells: ['2', '13–14', 'none'] },
    { cells: ['3', '13–14', 'present'] },
    { cells: ['4', '7–12', 'with or without'] },
    { cells: ['5', 'under 7', 'with or without'] },
  ],
  refIds: ['thilak2024'],
  notes: [
    c('The preferred clinical scale, based on the Glasgow Coma Scale; grades 4 and 5 indicate a poor outcome.', 'thilak2024'),
  ],
};

export const MOD_FISHER: GradeTable = {
  id: 'modified-fisher', title: 'Modified Fisher grade (the CT)',
  head: ['Grade', 'Subarachnoid blood', 'Intraventricular blood'],
  rows: [
    { cells: ['0', 'none', 'none'] },
    // (the site audit's D-004: thin and thick, not the original Fisher scale's 1 mm)
    { cells: ['1', 'focal or diffuse, thin', 'none'] },
    { cells: ['2', 'focal or diffuse, thin', 'present'] },
    { cells: ['3', 'focal or diffuse, thick', 'none'] },
    { cells: ['4', 'focal or diffuse, thick', 'present'] },
  ],
  foot: 'The scale is graded on the cisternal and the intraventricular blood. In the same group’s earlier study the best predictors of delayed cerebral ischaemia were a thick clot completely filling any cistern or fissure and blood in both lateral ventricles. The 1 mm cut-off belongs to the original Fisher scale. The full text of the modified scale’s paper, with its own definitions, was not read.',
  refIds: ['patel2021', 'frontera2006', 'claassen2001'],
  notes: [
    c('Imaging scales such as the modified Fisher grade quantify the subarachnoid, intraventricular and intraparenchymal blood and are associated with outcome.', 'robba2024'),
    c('A poor clinical grade (Hunt and Hess or WFNS) and a poor radiographic grade (modified Fisher) are established predictors of delayed cerebral ischaemia; a higher clinical and radiological grade is also among the risk factors for needing a ventriculoperitoneal shunt.', 'robba2024'),
  ],
};

// ---------------------------------------------------------------- dural arteriovenous fistulas
export const BORDEN: GradeTable = {
  id: 'borden', title: 'Borden types',
  head: ['Type', 'Drains into', 'Cortical venous reflux', 'Course', 'Of 236 patients', 'Of the 56 who bled'],
  rows: [
    { cells: ['I', 'directly into a major venous sinus or meningeal vein', 'no', 'benign', '91 (38.6 %)', '2 (3.6 %)'] },
    { cells: ['II', 'a venous sinus, but with the pressure in it high, also backwards into subarachnoid (cortical) veins', 'yes', 'aggressive', '54 (22.9 %)', '9 (16.1 %)'], drawn: 'davf' },
    { cells: ['III', 'directly into subarachnoid (cortical) veins', 'yes', 'aggressive', '91 (38.6 %)', '45 (80.4 %)'] },
  ],
  foot: 'Borden and colleagues also told a simple fistula (one meningeal artery straight into a vein or sinus) from multiple fistulas (a more complex lesion fed by several arteries). Patient numbers: Li 2015.',
  refIds: ['li2015', 'baharvahdat2020'],
  notes: [
    c('In 236 patients a higher Borden type was associated with intracranial haemorrhage; cortical venous drainage is the one widely recognised independent risk factor for a haemorrhagic presentation.', 'li2015'),
  ],
};

export const COGNARD: GradeTable = {
  id: 'cognard', title: 'Cognard types',
  head: ['Type', 'Drains into', 'Flow in the sinus', 'Cortical venous reflux', 'Course'],
  rows: [
    { cells: ['I', 'a dural sinus', 'antegrade', 'no', 'benign'] },
    { cells: ['IIa', 'a dural sinus, with reflux into another sinus', 'retrograde', 'no', 'benign'] },
    { cells: ['IIb', 'a dural sinus', 'antegrade', 'yes', 'aggressive'] },
    { cells: ['IIa+b', 'a dural sinus, with reflux into another sinus and a cortical vein', 'retrograde', 'yes', 'aggressive'], drawn: 'davf' },
    { cells: ['III', 'a cortical vein, without venous ectasia', '–', 'yes', 'aggressive'] },
    { cells: ['IV', 'a cortical vein, with venous ectasia', '–', 'yes', 'aggressive'] },
    { cells: ['V', 'a cortical vein, with spinal perimedullary drainage', '–', 'yes', 'aggressive'] },
  ],
  refIds: ['baharvahdat2020'],
  notes: [
    c('Fistulas without cortical venous reflux (Cognard I or IIa, Borden I) are considered benign, with only a 2 % risk of developing reflux. Those with persistent reflux (Cognard IIb to V, Borden II and III) are aggressive: an annual mortality of 10.4 %, an annual haemorrhage risk of 8.1 % and an annual risk of a non-haemorrhagic neurological deficit of 6.9 %.', 'baharvahdat2020'),
    c('A haemorrhage risk as high as 65 % has been reported for Cognard type IV.', 'shakeel2025'),
    c('Treatment: for Cognard type II fistulas, with or without reflux, the transvenous approach is the best, though transarterial embolisation with Onyx can avoid sacrificing the draining sinus; for types III to V, the transarterial approach with Onyx has had much success. Low-risk fistulas (Cognard or Borden type I) can be good candidates for stereotactic radiosurgery.', 'baharvahdat2020'),
  ],
};

export const AVM_TABLES = [SM_POINTS, SM_GRADES, SUPP_POINTS, SUPP_GRADES];
export const SAH_TABLES = [HUNT_HESS, WFNS, MOD_FISHER];
export const DAVF_TABLES = [BORDEN, COGNARD];
/** what is known of lesions that have not bled: not grades, but what the grades are weighed against */
export const UNRUPTURED_ANEURYSM_TABLES = [ISUIA];
export const UNRUPTURED_AVM_TABLES = [ARUBA];
export const GRADE_TABLES = [...SAH_TABLES, ...UNRUPTURED_ANEURYSM_TABLES, ...AVM_TABLES, ...UNRUPTURED_AVM_TABLES, ...DAVF_TABLES];
