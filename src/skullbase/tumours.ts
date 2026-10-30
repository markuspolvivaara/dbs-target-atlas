import { z } from 'zod';
import data from '../data/generated/sbv3-tumours.json';
import type { ApproachClaim, ApproachSection } from './approaches';

/**
 * Skull base v3's tumours: a pituitary adenoma at each Knosp grade, a vestibular schwannoma at each Koos grade and
 * meningiomas at four sites, drawn by rule on this CT (pipeline/skullbase_v3_tumours.py), not patients' tumours. What
 * the grades are, what they predict and how each site is reached come from open-access sources, checked against their
 * full texts: Araujo-Castro 2021 (PMC8810816), Gupta 2020 (PMC7669921), Starnoni 2020 (PMC7550309), Ius 2021
 * (PMC8198762), Muskens 2018 (PMC5735207), Bruneau 2008 (PMC2077911), Singh 2019 (PMC6417359). How each was drawn,
 * and its grade checked again from the drawing, is generated with the geometry (sbv3-tumours.json).
 */
const V3 = z.tuple([z.number(), z.number(), z.number()]);
const Push = z.object({ pointsInside: z.number(), leftInside: z.number(), rounds: z.number(), maxMovedMm: z.number() });
const Circle = z.object({ c: z.tuple([z.number(), z.number()]), r: z.number() });
export const TUMOUR_FIT = z.object({
  knosp: z.object({
    planeY: z.number(), zMid: z.number(),
    sections: z.record(z.object({ y: z.number(), cavernous: Circle, supraclinoid: Circle })),
    lines: z.record(z.array(V3).length(2)),
    grades: z.record(z.object({ grade: z.string(), pastMm: z.record(z.number()), encasedShare: z.number(), ml: z.number() })),
    carotidRadiusMm: z.number(),
  }),
  koos: z.record(z.object({
    ml: z.number(), canalMm: z.number().optional(), centre: V3.optional(), diameterMm: z.number().optional(), extrameatalMaxMm: z.number().optional(),
    toBrainstemMm: z.number().optional(), fromBoneMm: z.number().optional(), push: Push.optional(),
  })),
  meningioma: z.record(z.object({ site: V3, centre: V3, diameterRuleMm: z.number(), ml: z.number(), normal: V3, push: Push.optional() })),
}).parse(data);

export type TumourFamily = 'knosp' | 'koos' | 'meningioma';
export interface TumourGrade {
  /** the grade (Knosp 0-4, Koos I-IV) or the meningioma's site */
  id: string;
  label: string;
  /** the tumour's structure id */
  structure: string;
  /** what the grade is (or where the site is), sourced */
  definition: ApproachClaim;
  /** the view it is drawn in: an approach's view, or its own (knosp) */
  view: string | null;
  /** what this site's sources say (meningiomas) */
  notes?: ApproachClaim[];
}
export interface TumourFamilyContent {
  family: TumourFamily;
  name: string;
  /** the chip's label */
  short: string;
  scale: string;
  summary: string;
  sections: ApproachSection[];
  notShown: string;
  grades: TumourGrade[];
}
const c = (text: string, ...refIds: string[]): ApproachClaim => ({ text, refIds });
const sec = (title: string, claims: ApproachClaim[]): ApproachSection => ({ title, claims });

/** Knosp's grades on the coronal section (Araujo-Castro 2021, stating Knosp 1993 and the revised scale) */
export const KNOSP_GRADES: { id: string; definition: string; cure: string; complications: string }[] = [
  { id: '0', definition: 'Medial to the medial tangent', cure: '86.5 % (45/52)', complications: '0 % (0/52)' },
  { id: '1', definition: 'Between the medial tangent and the intercarotid line', cure: '88.6 % (31/35)', complications: '2.9 % (1/35)' },
  { id: '2', definition: 'Between the intercarotid line and the lateral tangent', cure: '77.1 % (47/61)', complications: '6.6 % (4/61)' },
  { id: '3A', definition: 'Lateral to the lateral tangent, above the intracavernous carotid (the superior compartment)', cure: '56.0 % (14/25)', complications: '8.0 % (2/25)' },
  { id: '3B', definition: 'Lateral to the lateral tangent, below the intracavernous carotid (the inferior compartment)', cure: '30.0 % (3/10)', complications: '10.0 % (1/10)' },
  { id: '4', definition: 'Complete encasement of the intracavernous carotid', cure: '14.0 % (6/43)', complications: '18.6 % (8/43)' },
];
/** Koos's grades (Gupta 2020's table) */
export const KOOS_GRADES: { id: string; definition: string }[] = [
  { id: 'I', definition: 'Intracanalicular' },
  { id: 'II', definition: 'Extension into the cerebellopontine angle, < 2 cm' },
  { id: 'III', definition: 'Occupies the cerebellopontine angle, no brainstem displacement, < 3 cm' },
  { id: 'IV', definition: 'Brainstem displacement, > 3 cm' },
];
/** the skull base meningiomas' sites in Ius 2021's table: share of skull base meningiomas and the approaches listed */
export const MENINGIOMA_SITES: { id: string; name: string; share: string; approaches: string; view: string; viewName: string }[] = [
  { id: 'olfactory', name: 'Olfactory groove', share: '8–13 %', view: 'lso', viewName: 'Lateral supraorbital',
    approaches: 'Subfrontal, transbasal, pterional, fronto-lateral, supraorbital keyhole, endoscopic endonasal (alone, or with a bifrontal craniotomy for wide tumours invading the cribriform plate), transfacial' },
  { id: 'tuberculum', name: 'Tuberculum sellae / planum', share: '5–10 %', view: 'transsylvian', viewName: 'Pterional',
    approaches: 'Pterional, endoscopic endonasal, supraorbital keyhole' },
  { id: 'petroclival', name: 'Petroclival', share: '2 % of posterior fossa meningiomas', view: 'retrosigmoid', viewName: 'Retrosigmoid',
    approaches: 'Retrosigmoid, combined transpetrosal, retrolabyrinthine, translabyrinthine' },
  { id: 'foramen_magnum', name: 'Foramen magnum', share: '2.5 %', view: 'far_lateral', viewName: 'Far lateral',
    approaches: 'Posterior suboccipital with C1 laminectomy, far lateral, extreme lateral' },
];
export const MENINGIOMA_EEA: { site: string; gtr: [string, string]; csf: [string, string] }[] = [
  { site: 'Olfactory groove', gtr: ['70.9 %', '88.5 %'], csf: ['25.1 %', '10.5 %'] },
  { site: 'Tuberculum sellae', gtr: ['83.0 %', '85.8 %'], csf: ['19.3 %', '5.81 %'] },
];

const fit = TUMOUR_FIT;
const knospDef = (g: (typeof KNOSP_GRADES)[number]) => c(`Knosp ${g.id}: ${g.definition.toLowerCase()}.`, 'araujocastro2021');
const MENINGIOMA_NOTES: Record<string, ApproachClaim[]> = {
  olfactory: [
    c('A meta-analysis of 64 case series found gross total resection of olfactory groove meningiomas less often through the endoscopic endonasal approach than through a microsurgical transcranial one (70.9 % against 88.5 %) and cerebrospinal fluid leaks more often (25.1 % against 10.5 %); it concluded the endonasal approach was not superior.', 'muskens2018'),
  ],
  tuberculum: [
    c('For tuberculum sellae meningiomas the same meta-analysis found gross total resection about equal (endonasal 83.0 %, transcranial 85.8 %), visual improvement more often after the endonasal approach, but cerebrospinal fluid leaks (19.3 % against 5.81 %) and intraoperative arterial injury (4.89 % against 1.86 %) more often.', 'muskens2018'),
  ],
  petroclival: [
    c('The retrosigmoid approach suits most petroclival meningiomas: it allows a Simpson grade II excision when the tumour lies mainly in the posterior fossa (the cerebellopontine angle and lower clivus) with only a minor part in the middle fossa or on the cavernous sinus’s back wall; incising the tentorium or a suprameatal extension reaches more of the middle fossa part.', 'singh2019'),
    c('Of 17 patients (2009–2015), 9 were operated through it: Simpson grade II in 6, grade III in 3; 2 had new or worse deficits; none died (mean follow-up 24 months).', 'singh2019'),
  ],
  foramen_magnum: [
    c('Intradural foramen magnum meningiomas are posterior, lateral or anterior as their dural insertion lies behind the dentate ligament, in front of it, or in front of it and across the midline; the classification guides the approach, how far laterally to drill and where the lower cranial nerves will lie.', 'bruneau2008'),
    c('At Lariboisière the posterolateral (far lateral) approach is used even for anterior intradural tumours, the vertebral artery controlled above the C1 arch; drilling of the occipital condyle and the atlas’s lateral mass is almost never needed.', 'bruneau2008'),
    c('In the published series, permanent morbidity was lower through a far lateral approach (0–17 %) than through an extreme lateral transcondylar one (21–56 %).', 'bruneau2008'),
  ],
};

export const TUMOURS: TumourFamilyContent[] = [
  {
    family: 'knosp', name: 'Pituitary adenoma: Knosp grades', short: 'Pituitary adenoma (Knosp)', scale: 'Knosp grade',
    summary: 'A pituitary macroadenoma drawn by rule in this CT’s sella at each Knosp grade, on the right, seen from the front and cut at the coronal section through this patient’s own cavernous and supraclinoid carotid, where the three Knosp lines are drawn.',
    sections: [
      sec('The grades', [
        c('Knosp (1993) graded cavernous sinus invasion on coronal MRI by the adenoma’s relation to the lines between the supraclinoid and the intracavernous internal carotid artery.', 'araujocastro2021'),
        c('Knosp 0: medial to the medial tangent; 1: into the space between the medial tangent and the intercarotid line; 2: between the intercarotid line and the lateral tangent; 3: lateral to the lateral tangent; 4: complete encasement of the intracavernous carotid. Grades 3–4 were taken as invasive.', 'araujocastro2021'),
        c('The revised scale divides grade 3: 3A above the intracavernous carotid, into the superior compartment of the cavernous sinus; 3B below it, into the inferior compartment.', 'araujocastro2021'),
      ]),
      sec('What they predict', [
        c('In 228 patients after a first endoscopic endonasal operation (2009–2020), surgical cure fell from 86.5 % at grade 0 and 88.6 % at grade 1 to 14.0 % at grade 4, and major complications rose from 0 % to 18.6 % (the Grading page has each grade).', 'araujocastro2021'),
        c('Grade 3B tended to be cured less often than 3A (30.0 % against 56.0 %, p = 0.164). The Knosp scale gave the best accuracy for predicting surgical cure (AUC 0.820), its best cut-off at grade 3.', 'araujocastro2021'),
      ]),
    ],
    notShown: 'The adenoma is a shape drawn by rule, not a patient’s: a real one expands the sella and pushes the carotid, the gland and the optic apparatus; here the carotid stays where this CT shows it, the gland is not drawn, and the cavernous sinus is the one modelled round this CT, not compressed.',
    grades: KNOSP_GRADES.map((g) => ({ id: g.id, label: g.id, structure: `tm_knosp_${g.id.toLowerCase()}`, definition: knospDef(g), view: null })),
  },
  {
    family: 'koos', name: 'Vestibular schwannoma: Koos grades', short: 'Vestibular schwannoma (Koos)', scale: 'Koos grade',
    summary: 'A right vestibular schwannoma drawn by rule at each Koos grade, from the internal acoustic meatus into the cerebellopontine angle, in the retrosigmoid view: the cerebellum (and at grade IV the brainstem) pushed aside by it.',
    sections: [
      sec('The grades', [
        c('The Koos scale grades a vestibular schwannoma by its extension from the meatus and its relation to the brainstem: I intracanalicular; II into the cerebellopontine angle, under 2 cm; III occupying the angle without displacing the brainstem, under 3 cm; IV displacing the brainstem, over 3 cm.', 'gupta2020'),
        c('It combines the extrameatal size with the anatomy; tumours over 30 mm in the largest extrameatal diameter are “large” and over 40 mm “giant” (the 2003 consensus on reporting: linear measurement on post-contrast axial MRI).', 'starnoni2020'),
      ]),
      sec('The facial nerve', [
        c('With tractography checked at surgery in 11 vestibular schwannomas, the facial nerve lay on the anterior surface of the tumour in 5, anteroinferior in 3, anterosuperior in 2 and posteroinferior in 1. In one patient it was very thin and fragile from the tumour’s indentation, and it was cut during the removal.', 'choi2014'),
        c('Over large tumours the nerve thins and the landmarks are distorted, so it is harder to follow on high-resolution T2-weighted MRI; tractography has shown the cranial nerves displaced by the tumour in 80 to 100 % of the cases studied.', 'starnoni2020'),
      ]),
      sec('Management', [
        c('Observation (“watch and rescan”), surgery and radiotherapy are the options; in a systematic review of 41 papers tumours grew a mean 1–2 mm a year, and up to 75 % did not grow further.', 'gupta2020'),
        c('The middle fossa approach has been used for small intrameatal tumours, larger medially placed tumours through a retrosigmoid craniotomy; with serviceable hearing the middle fossa or retrosigmoid approach, without it the retrosigmoid or translabyrinthine. Class III evidence has not shown one approach better than another for hearing.', 'starnoni2020'),
        c('In a systematic review of 35 studies (5064 patients), facial nerve dysfunction was less likely after the retrosigmoid than after the translabyrinthine approach for tumours over 1.5 cm.', 'gupta2020'),
        c('Pooled data on large tumours removed through a retrosigmoid craniotomy: gross total resection in 79.1 %, a good facial nerve outcome (House–Brackmann I–II) in 62.9 %.', 'starnoni2020'),
      ]),
    ],
    notShown: 'The schwannoma is a shape drawn by rule, not a patient’s. Its displacement of the nerves is drawn by rule too: the facial nerve moved forwards onto the tumour’s anterior surface (its commonest place) and drawn thinned and flattened over grades III and IV, the other nerves of the angle and the fitted small arteries moved the shortest way out onto its surface, the vestibulocochlear nerve, from which it grows, running into it. The petrosal veins are not drawn. This model’s fitted pons lies only about 4 mm from the porus, closer than in life, so grade II is small here and grade III is moulded against the brainstem rather than placed clear of it.',
    grades: KOOS_GRADES.map((g, i) => ({ id: g.id, label: g.id, structure: `tm_koos_${i + 1}`, definition: c(`Koos ${g.id}: ${g.definition.charAt(0).toLowerCase()}${g.definition.slice(1)}.`, 'gupta2020'), view: 'retrosigmoid' })),
  },
  {
    family: 'meningioma', name: 'Skull base meningiomas', short: 'Meningiomas (sites)', scale: 'Site',
    summary: 'A meningioma drawn by rule on the dura of four sites of this CT’s skull base, each in the surgical view of this model that suits it, the brain pushed aside by it.',
    sections: [
      sec('Choosing the approach', [
        c('The approach is chosen by the site, in interdisciplinary consultation; complete resection is the goal of skull base meningioma surgery, often limited by the tumour’s relation to the brainstem, vessels and cranial nerves.', 'ius2021'),
        c('Approaches can be extended and combined according to the tumour’s size and the surgeon’s choice; removing more bone does not always bring better manoeuvrability or less retraction.', 'ius2021'),
      ]),
    ],
    notShown: 'The meningiomas are shapes drawn by rule (their sizes illustrative), not patients’ tumours: the bone they invade, a dural tail and the vessels they encase are not modelled. The cranial nerves and the fitted small arteries are not moved round them; they run through channels in the tumour.',
    grades: MENINGIOMA_SITES.map((s) => ({ id: s.id, label: s.name, structure: `tm_men_${s.id}`, view: s.view,
      definition: c(`${s.name}: ${s.share} of skull base meningiomas. Approaches listed: ${s.approaches.charAt(0).toLowerCase()}${s.approaches.slice(1)}.`, 'ius2021'),
      notes: MENINGIOMA_NOTES[s.id] })),
  },
];


export const TUMOUR_FAMILY = new Map(TUMOURS.map((t) => [t.family, t]));
/** each tumour's group id */
export const tumourGroupId = (family: TumourFamily, grade: string) => `${family}_${grade.toLowerCase()}`;

/** How the drawn tumour of a grade measures on this model (for its card). */
export function measuredOn(family: TumourFamily, grade: string): string[] {
  if (family === 'knosp') {
    const r = fit.knosp.grades[grade];
    if (!r) return [];
    const p = r.pastMm;
    return [
      `Section ${fit.knosp.planeY} mm in front of the hypophysial fossa. Graded again from the drawing: ${r.grade}.`,
      `Its furthest reach past the medial tangent ${p.medial} mm, past the intercarotid line ${p.intercarotid} mm, past the lateral tangent ${p.lateral} mm (negative: short of it).`,
      ...(r.encasedShare > 0 ? [`Round the cavernous carotid (where there is room): ${Math.round(r.encasedShare * 100)} %.`] : []),
      `${r.ml} ml.`,
    ];
  }
  if (family === 'koos') {
    const k = { I: '1', II: '2', III: '3', IV: '4' }[grade] ?? grade;
    const r = fit.koos[k];
    if (!r) return [];
    return [
      r.canalMm ? `The meatus from the fundus to the porus: ${r.canalMm} mm.` : null,
      r.extrameatalMaxMm !== undefined ? `Largest extrameatal extent: ${r.extrameatalMaxMm} mm (the ball drawn ${r.diameterMm} mm across).` : null,
      r.toBrainstemMm !== undefined ? (r.toBrainstemMm >= 0 ? `${r.toBrainstemMm} mm off the brainstem.` : `Reaching ${-r.toBrainstemMm} mm into where the brainstem lies${k === '4' ? ' (pushed aside)' : ' (moulded against it)'}.`) : null,
      r.push && r.push.maxMovedMm > 0 ? `The fitted hindbrain moved at most ${r.push.maxMovedMm} mm.` : null,
      `${r.ml} ml.`,
    ].filter((x): x is string => !!x);
  }
  const r = fit.meningioma[grade];
  if (!r) return [];
  return [`A ball ${r.diameterRuleMm} mm across (illustrative), cut by the bone and the dura: ${r.ml} ml.`,
    r.push && r.push.maxMovedMm > 0 ? `The fitted brain moved at most ${r.push.maxMovedMm} mm.` : 'It does not reach the fitted brain.'];
}
