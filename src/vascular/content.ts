import type { Claim } from '../brainstem/schema';

/** What the sources say, by topic: each claim checked against its open-access full text (references.ts). */
const c = (text: string, ...refIds: string[]): Claim => ({ text, refIds });

// ---------------------------------------------------------------- aneurysms
export const ANEURYSM_SITES: Claim[] = [
  c('In 415 patients with ruptured saccular aneurysms, the commonest sites were the posterior communicating artery (32.0 %), the anterior communicating artery (28.7 %) and the middle cerebral artery (13.5 %). Their mean size was 5.3 mm (1.1–28.5 mm), varying by site: 5.8 mm at the posterior communicating artery.', 'zheng2019'),
];
export const FUSIFORM: Claim[] = [
  c('A fusiform aneurysm widens more than half of the vessel’s circumference and has no distinct neck.', 'xu2022'),
  c('Fusiform aneurysms make up 3–13 % of intracranial aneurysms: in the anterior circulation usually on the internal carotid and middle cerebral arteries, in the posterior circulation on the vertebral and basilar arteries. In one registry of 71, 62 % were in the posterior circulation.', 'xu2022'),
];
export const BLISTER: Claim[] = [
  c('Dissecting and blood blister-like aneurysms have a fragile wall, an indistinct neck and a longitudinal shape, which make clipping and coiling difficult; their re-rupture rate in the first day has been estimated as high as 40 % to 71.4 %.', 'wroe2025'),
  c('In the strict sense a blood blister-like aneurysm is a dissecting aneurysm of the dorsal wall of the internal carotid artery in its ophthalmic segment; the terms are often used interchangeably with dissecting aneurysm.', 'wroe2025'),
];

// ---------------------------------------------------------------- arteriovenous malformations
export const AVM_WHAT: Claim[] = [
  c('A brain AVM is a nidus of abnormal vessels between feeding arteries and draining veins: many arteriovenous shunts with no brain tissue between them and no capillary bed.', 'naranbhai2023'),
  c('Over time the high-flow shunting changes the vessels: the feeding arteries dilate, with smooth-muscle hyperplasia and fibromuscular cushions, and the draining veins dilate and thicken (“venous arterialisation”).', 'naranbhai2023'),
];
export const AVM_NIDUS: Claim[] = [
  c('Within a large nidus, blood flow settles into separate regions (compartments), each supplied by its own arterial feeder.', 'jain2019'),
  c('A theoretical model built a three-dimensional nidus of 97 interconnected vessels (93 plexiform, 4 fistulous; an arbitrary, randomly chosen arrangement) between four arterial feeders and three draining veins: the plexiform vessels 0.05 cm in radius, the intranidal fistula a direct connection from a feeder to a draining vein, 0.10 cm in radius. Fistulas are of larger calibre than plexiform vessels and carry more flow: in the model a mean of 98.9 mL/min through the fistulous vessels against 13.1 mL/min through the plexiform ones.', 'jain2019'),
  c('A nidus is called compact if its margins are clear, diffuse if its margins are unravelled and/or brain parenchyma is interspersed with it.', 'wu2024'),
];
export const SPETZLER_MARTIN: Claim[] = [
  c('Spetzler–Martin grading gives 1, 2 or 3 points for size (under 3 cm, 3–6 cm, over 6 cm); 1 point for an eloquent location (sensorimotor, language or visual cortex, hypothalamus, thalamus, internal capsule, brainstem, cerebellar peduncles, deep cerebellar nuclei); and 1 point for deep venous drainage (the internal cerebral veins, basal veins, precentral cerebellar veins). The points add up to the grade, I to V; a grade VI is kept for lesions no treatment can reach.', 'naranbhai2023'),
  c('Superficial venous drainage was taken as drainage to the superior sagittal or transverse sinus; any other, the sigmoid sinus included, as deep. A superficial AVM was a pial one with no part of the nidus deeper than 1 cm.', 'hofman2018'),
];
export const SPETZLER_PONCE: Claim[] = [
  c('The Spetzler–Ponce classes condense the grades: class A is grades I and II, class B grade III, class C grades IV and V.', 'hofman2018'),
  c('Spetzler and Ponce introduced this three-tier classification in 2011, for supratentorial AVMs; it keeps the original factors (size, eloquence, deep venous drainage) and is quick to work out.', 'assker2025'),
];
export const AVM_OTHER: Claim[] = [
  c('The Lawton–Young (supplemented Spetzler–Martin) grade adds the patient’s age, a history of haemorrhage and the type of nidus to the Spetzler–Martin factors.', 'assker2025'),
  c('In one simplified algorithm, patients in Spetzler–Ponce class A may be offered surgery if they are good surgical candidates; in class B, if the nidus is compact or the patient younger than 40.', 'naranbhai2023'),
  c('Known risk factors for rupture include a previous haemorrhage, exclusive deep venous drainage, a deep location and an associated aneurysm.', 'naranbhai2023'),
];

// ---------------------------------------------------------------- dural arteriovenous fistulas
export const DAVF: Claim[] = [
  c('Borden type I drains directly into a major venous sinus or meningeal vein; type II drains into a sinus but, with the pressure in it high, also backwards into subarachnoid (cortical) veins; type III drains directly into subarachnoid veins.', 'li2015'),
  c('The Cognard classification widens Borden’s three types to five categories, adding the direction of flow in the sinus (antegrade or retrograde) and venous ectasia.', 'shakeel2025'),
  c('Fistulas without cortical venous drainage usually run a benign course; those with it (Borden II and III, Cognard IIb to V) are more aggressive, with a haemorrhage risk as high as 65 % reported for Cognard type IV.', 'shakeel2025'),
  c('In 236 patients a higher Borden type was associated with intracranial haemorrhage; cortical venous drainage is the one widely recognised independent risk factor for a haemorrhagic presentation.', 'li2015'),
  c('They most often involve the transverse–sigmoid sinus junction.', 'shakeel2025'),
];

// ---------------------------------------------------------------- carotid-cavernous fistulas
export const CCF: Claim[] = [
  c('The Barrow classification: type A, a direct shunt between the internal carotid artery and the cavernous sinus; type B, a shunt from branches of the internal carotid; type C, from branches of the external carotid; type D, from branches of both.', 'mishra2022'),
  c('It describes only the arterial side: a direct or an indirect connection, and so a high- or a low-flow lesion.', 'mishra2022'),
];
export const CCF_VEINS: Claim[] = [
  c('Normally the cavernous sinus receives the superior and inferior ophthalmic veins in front and the sphenoparietal sinus and Sylvian and cortical veins at the side, and drains back through the superior and inferior petrosal sinuses to the jugular bulb, down through emissary veins to the pterygoid and parapharyngeal plexuses, and across to the other side.', 'mishra2022'),
  c('The raised pressure of a fistula redirects its drainage: forwards into the ophthalmic veins, backwards or down into the petrosal sinuses or the pterygoid and parapharyngeal plexuses, or sideways into the sphenoparietal sinus and middle cortical veins; most often it runs several ways at once.', 'mishra2022'),
  c('The Thomas classification sorts them by venous drainage: type 1 posterior and/or inferior; type 2 posterior or inferior and anterior (the ophthalmic veins); type 3 anterior only; type 4 retrograde into cortical veins, with or without other routes; type 5 a high-flow direct shunt (Barrow type A), with or without several routes.', 'mishra2022'),
  c('In 28 fistulas at a trauma centre, 24 were Barrow type A; the opposite cavernous sinus filled in 10 and cortical venous efflux was seen in 16.', 'mishra2022'),
];
