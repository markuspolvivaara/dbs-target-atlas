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
    { cells: ['Venous drainage', 'superficial only (the superior sagittal or transverse sinus)', '0'] },
    { cells: ['', 'any deep (the internal cerebral veins, basal veins, precentral cerebellar veins)', '1'] },
  ],
  foot: 'The points add up to the grade, I to V; grade VI is kept for lesions no treatment can reach.',
  refIds: ['naranbhai2023', 'hofman2018'],
  notes: [],
};

export const SM_GRADES: GradeTable = {
  id: 'sm-grades', title: 'Spetzler–Martin grade: what it means',
  head: ['Grade', 'Spetzler–Ponce class', 'Treatment, in general', 'Favourable outcome after surgery*'],
  rows: [
    { cells: ['I', 'A', 'Surgery is safe: immediate decompression, faster recovery, a shorter hospital stay.', '85 % (40 of 47)'], drawn: 'avm1' },
    { cells: ['II', 'A', 'As grade I.', '67 % (37 of 55)'] },
    { cells: ['III', 'B', 'The hardest to decide: some operate, others choose radiosurgery or several treatments combined.', '60 % (25 of 42)'], drawn: 'avm3' },
    { cells: ['IV', 'C', 'Considered by most inoperable: other, conservative measures are taken to reduce re-bleeding and morbidity.', '54 % (25 of 46)'] },
    { cells: ['V', 'C', 'As grade IV.', '60 % (6 of 10)'], drawn: 'avm5' },
  ],
  foot: '* Modified Rankin Scale 0–2 at the last follow-up, in 200 patients operated on in Helsinki (Hafez 2019); few had grade V.',
  refIds: ['assker2025', 'hofman2018', 'hafez2019'],
  notes: [
    c('In one simplified algorithm, Spetzler–Ponce class A patients may be offered surgery if they are good surgical candidates; class B, if the nidus is compact or the patient younger than 40 (for the rest of class B conservative management may be preferred); class C is generally not treated, unless the patient is young or has poorly controlled seizures and accepts the risk of a permanent deficit.', 'naranbhai2023'),
    c('Adverse outcomes of surgery are reported as 10 % for Spetzler–Ponce class A and 18 % for class B (each better than the class’s natural history over 5 and 10 years), and more than 30 % for class C.', 'naranbhai2023'),
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
  refIds: ['hafez2019', 'assker2025'],
  notes: [
    c('It adds the patient’s age, a history of haemorrhage and the type of nidus to the Spetzler–Martin factors; grade 6 is taken as the cut-off for acceptable surgical risk. Age and rupture change with time, and embolisation or radiosurgery can change the nidus, so the grade can change too.', 'hafez2019'),
    c('An unruptured AVM scores higher because those patients usually have no deficit before surgery, so they are more likely to gain a new one than patients already left with a deficit by a haemorrhage.', 'hafez2019'),
    c('It predicted the outcome after surgery better than the Spetzler–Martin grade: area under the ROC curve 0.70 against 0.63 at the last follow-up.', 'hafez2019'),
  ],
};

export const SUPP_GRADES: GradeTable = {
  id: 'supp-grades', title: 'Supplemented grade: outcome after surgery',
  head: ['Supplemented grade', 'Favourable outcome after surgery*'],
  rows: [
    { cells: ['2', '100 % (3 of 3)'] },
    { cells: ['3', '86 % (19 of 22)'] },
    { cells: ['4', '88 % (29 of 33)'] },
    { cells: ['5', '69 % (37 of 54)'] },
    { cells: ['6', '60 % (21 of 35)'] },
    { cells: ['7', '48 % (13 of 27)'] },
    { cells: ['8', '27 % (4 of 15)'] },
    { cells: ['9', '60 % (6 of 10)'] },
    { cells: ['10', '100 % (1 of 1)'] },
  ],
  foot: '* Modified Rankin Scale 0–2 at the last follow-up, in the same 200 patients (Hafez 2019); the highest grades are few.',
  refIds: ['hafez2019'],
  notes: [],
};

// ---------------------------------------------------------------- subarachnoid haemorrhage
export const HUNT_HESS: GradeTable = {
  id: 'hunt-hess', title: 'Hunt and Hess grade',
  head: ['Grade', 'The patient'],
  rows: [
    { cells: ['1', 'no symptoms, or a mild headache'] },
    { cells: ['2', 'a moderate to severe headache, a stiff neck'] },
    { cells: ['3', 'drowsy or confused, a mild focal neurological deficit'] },
    { cells: ['4', 'stupor, hemiparesis'] },
    { cells: ['5', 'coma, decerebrate posturing'] },
  ],
  refIds: ['thilak2024'],
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
    { cells: ['1', 'focal or diffuse, under 1 mm thick', 'none'] },
    { cells: ['2', 'focal or diffuse, under 1 mm thick', 'present'] },
    { cells: ['3', 'focal or diffuse, over 1 mm thick', 'none'] },
    { cells: ['4', 'focal or diffuse, over 1 mm thick', 'present'] },
  ],
  refIds: ['thilak2024'],
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
export const GRADE_TABLES = [...SAH_TABLES, ...AVM_TABLES, ...DAVF_TABLES];
