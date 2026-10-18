import type { Claim, ZoneContentInput } from './schema';

/**
 * Brainstem section content (October 2026). Every sentence paraphrases its source: the open-access full texts of
 * Cavalheiro 2015 (PMC4564452), Rajagopal 2019 (PMC6417313), Cavalcanti 2026 (PMC12953320), Erginoglu 2026
 * (PMC12967451), Olchanyi 2025 (PMC12514455) and Kim 2020 (PMC9431917, Table 1), and the abstracts of the others.
 * Nothing is added from memory: zones the sources here name without a definition that could be placed are listed
 * as not drawn.
 */

const c = (text: string, ...refIds: string[]): Claim => ({ text, refIds });

/** About safe entry zones in general (shown with the zone groups). */
export const SEZ_GENERAL: Claim[] = [
  c('Safe entry zones are surface points and directions for entering the brainstem where eloquent nuclei, tracts and perforating vessels are relatively sparse. They are conditional corridors: the entry is chosen for each lesion (how it grows, whether it reaches a pial or ependymal surface, how it displaces tracts and nuclei) and refined with image guidance and neurophysiological monitoring.', 'cavalcanti2026'),
  c('For a lesion below the surface, the safest approach is usually the shortest and most direct route.', 'yagmurlu2014'),
  c('A literature analysis found 21 proposed zones (6 in the midbrain, 9 in the pons, 6 in the medulla); only 4 were backed by more than 25 operated cases, the others by case reports or limited series.', 'yang2019'),
  c('Thirteen zones were reported and validated in cadaver dissections through ten surgical approaches.', 'cavalcanti2016'),
  c('Polarised light imaging and 11.7 T MRI of 13 brainstems suggested that a surgeon entering these zones need not consider microstructures that conventional MRI and tractography do not show.', 'guberinic2022'),
];

/** Zones named in the sources without a definition that this atlas could place. */
export const NOT_DRAWN: { name: string; refIds: string[] }[] = [
  { name: 'Lateral pontine zone', refIds: ['cavalcanti2016', 'guberinic2022'] },
  { name: 'Intercollicular region', refIds: ['cavalcanti2016', 'guberinic2022'] },
  { name: 'Interpeduncular zone', refIds: ['guberinic2022'] },
  { name: 'Interfacial and lateral sulcus limitans approaches (floor of the fourth ventricle)', refIds: ['cavalheiro2015'] },
  { name: 'Acoustic area', refIds: ['yagmurlu2014'] },
];

const FLOOR_SURFACE = c('The entry zones of the floor of the fourth ventricle are useful only when the lesion reaches its surface.', 'rajagopal2019');
const FLOOR_APPROACH = c('Reached from the midline: a suboccipital craniotomy with a telovelo-tonsillar or vermian-split approach.', 'rajagopal2019');
const MIDBRAIN_RISK = c('An incision carried deeper than the aqueduct would damage the oculomotor and trochlear nuclei and the medial longitudinal fasciculus; carried laterally, the superior cerebellar peduncle and its decussation and the mesencephalic tract of the trigeminal nerve.', 'cavalheiro2015');
const FAR_LATERAL = c('Ventrolateral medullary lesions are reached through a far-lateral approach: a lateral suboccipital craniotomy with removal of the C1 arch, with or without drilling of the occipital condyle.', 'rajagopal2019');
const AUTONOMIC = c('During surgery on the medulla, severe autonomic changes can occur: hypertension and tachycardia with right-sided lesions, bradycardia with left-sided ones.', 'cavalheiro2015');

export const ZONES: ZoneContentInput[] = [
  {
    id: 'sez_perioculomotor',
    summary: 'Into the front of the midbrain beside the oculomotor nerve, for anterior midbrain lesions.',
    borders: [
      c('Bordered medially by the exit of the oculomotor nerve and laterally by the corticospinal tract; limited above by the posterior cerebral artery and below by the superior cerebellar artery.', 'cavalheiro2015'),
      c('A corridor lateral to the emergence of the oculomotor nerve, between the superior cerebellar and posterior cerebral arteries, medial to the pyramidal tract.', 'rajagopal2019'),
      c('Also listed as the anterior mesencephalic zone.', 'cavalcanti2016', 'guberinic2022'),
    ],
    approach: [
      c('Entered through an incision parallel and lateral to the oculomotor nerve, in the space between the nerve and the pyramidal tract (described by Bricolo and colleagues).', 'cavalheiro2015'),
      c('Reached through a pterional or fronto-orbito-zygomatic transsylvian approach.', 'cavalheiro2015', 'rajagopal2019'),
    ],
    risks: [c('The red nucleus, the pyramidal tract and the oculomotor nerve are at risk.', 'cavalheiro2015')],
  },
  {
    id: 'sez_lateral_mesencephalic_sulcus',
    summary: 'The groove between the crus and the tegmentum on the side of the midbrain.',
    borders: [
      c('Runs on the surface of the midbrain from the medial geniculate body above to the pontomesencephalic sulcus below.', 'cavalheiro2015'),
      c('It is the limit between the anterolateral and the posterior midbrain; the lateral mesencephalic vein runs in it and marks it.', 'rajagopal2019'),
    ],
    approach: [
      c('Reached through a subtemporal transtentorial or a lateral supracerebellar infratentorial approach.', 'rajagopal2019'),
      c('In a paediatric series, central midbrain tumours approached through a paramedian supracerebellar infratentorial route were entered through this sulcus.', 'cavalheiro2015'),
    ],
    risks: [],
  },
  {
    id: 'sez_supracollicular',
    summary: 'A transverse entry just above the superior colliculus.',
    borders: [
      c('A transverse incision just above the upper edge of the superior colliculus, its depth limited by the aqueduct.', 'cavalheiro2015'),
      c('With the infracollicular zone, a narrow horizontal line immediately above or below the quadrigeminal plate.', 'rajagopal2019'),
    ],
    approach: [c('Midline lesions are reached through the median supracerebellar infratentorial route.', 'rajagopal2019', 'cavalheiro2015')],
    risks: [MIDBRAIN_RISK],
  },
  {
    id: 'sez_infracollicular',
    summary: 'A transverse entry just below the inferior colliculus, above the trochlear nerve.',
    borders: [
      c('A transverse incision between the trochlear nerve and the lower edge of the inferior colliculus.', 'cavalheiro2015'),
      c('With the supracollicular zone, a narrow horizontal line immediately above or below the quadrigeminal plate.', 'rajagopal2019'),
    ],
    approach: [c('Midline lesions are reached through the median supracerebellar infratentorial route.', 'rajagopal2019', 'cavalheiro2015')],
    risks: [MIDBRAIN_RISK],
  },
  {
    id: 'sez_supratrigeminal',
    summary: 'Into the front of the upper pons, below the pontomesencephalic sulcus.',
    borders: [
      c('A 4 mm vertical incision below the pontomesencephalic sulcus, in a line from the oculomotor to the trigeminal nerve, at the sagittal level of the oculomotor nerve’s exit; proposed for anterior and superior pontine lesions and used in three children without morbidity.', 'cavalheiro2015'),
      c('Listed among the zones validated in cadaver dissections.', 'cavalcanti2016'),
    ],
    approach: [c('Reached through a fronto-orbito-zygomatic route; the presigmoid approach also exposes it.', 'cavalheiro2015')],
    risks: [],
  },
  {
    id: 'sez_peritrigeminal',
    summary: 'Into the anterolateral pons, medial to the trigeminal nerve.',
    borders: [
      c('Between the emergence of the trigeminal and the facial nerves, medial to the trigeminal nerve and lateral to the pyramidal tract.', 'rajagopal2019'),
      c('The incision is made medial to the entry zone of the trigeminal nerve, between it and the facial nerve.', 'cavalheiro2015'),
    ],
    approach: [
      c('Reached through a retrosigmoid, a subtemporal transtentorial or a transpetrosal (presigmoid) approach.', 'rajagopal2019'),
      c('The presigmoid approach exposes the supra- and peritrigeminal zones well.', 'cavalheiro2015'),
    ],
    risks: [],
  },
  {
    id: 'sez_suprafacial',
    summary: 'On the floor of the fourth ventricle, above the facial colliculus and beside the midline.',
    borders: [
      c('Bordered above by the frenulum veli with the trochlear nerve, below by the facial colliculus, medially by the medial longitudinal fasciculus and laterally by the sulcus limitans.', 'cavalheiro2015'),
      c('Immediately above the facial colliculus, between the medial longitudinal fasciculus and the cerebellar peduncles.', 'rajagopal2019'),
    ],
    approach: [FLOOR_APPROACH],
    risks: [
      FLOOR_SURFACE,
      c('In a paediatric series, 45 tumours of the upper posterior pons were approached this way; in six of the patients the medial longitudinal fasciculus was injured, and three had facial paresis.', 'cavalheiro2015'),
    ],
    measures: [c('The sulcus limitans lies 3.09 ± 0.76 mm (right) and 3.03 ± 0.67 mm (left) from the median sulcus; the corridor between both sulci is about 31 % of the floor’s width (40 cadavers).', 'erginoglu2026')],
  },
  {
    id: 'sez_infrafacial',
    summary: 'On the floor of the fourth ventricle, below the facial colliculus and beside the midline.',
    borders: [
      c('Bordered above by the facial colliculus, below by the hypoglossal triangle, medially by the medial longitudinal fasciculus and laterally by the facial nucleus and the nucleus ambiguus.', 'cavalheiro2015'),
      c('Immediately below the facial colliculus, lateral to the medial longitudinal fasciculus, bordered below by the striae medullares and above and laterally by the facial nerve.', 'rajagopal2019'),
    ],
    approach: [FLOOR_APPROACH],
    risks: [
      FLOOR_SURFACE,
      c('Of 13 children with lower pontine tumours operated through this triangle, eight had facial paralysis afterwards, permanent in five.', 'cavalheiro2015'),
    ],
    measures: [c('The facial colliculus’s caudal margin lies 14.5 ± 1.68 mm above the obex (40 cadavers).', 'erginoglu2026')],
  },
  {
    id: 'sez_median_sulcus',
    summary: 'The midline groove of the floor of the fourth ventricle, above the facial colliculus.',
    borders: [
      c('The median sulcus above the facial colliculus is one of the entry zones of the pons.', 'yagmurlu2014', 'rajagopal2019'),
      c('The median sulcus is often chosen because it lies away from the motor and sensory nuclei, which lie lateral to the sulcus limitans.', 'erginoglu2026'),
    ],
    approach: [FLOOR_APPROACH],
    risks: [FLOOR_SURFACE],
    measures: [
      c('Floor of the fourth ventricle in 40 cadavers: 33.58 ± 2.49 mm long and 20.0 ± 1.83 mm wide; from the aqueduct to the rostral margin of the facial colliculus 14.6 ± 1.97 mm; the facial colliculus divided the floor into rostral and caudal parts of about 43 % each.', 'erginoglu2026'),
      c('These lengths differed significantly from earlier cadaver series, so the published values vary.', 'erginoglu2026'),
    ],
  },
  {
    id: 'sez_anterolateral_sulcus',
    summary: 'The preolivary groove of the medulla, below the hypoglossal rootlets.',
    borders: [
      c('Entry along the preolivary sulcus, between the caudal hypoglossal rootlets and the rostral C1 rootlets.', 'cavalheiro2015'),
      c('The preolivary sulcus lies between the olive and the pyramid, which carries the corticospinal tract; the hypoglossal rootlets leave the medulla along it.', 'cavalheiro2015'),
    ],
    approach: [FAR_LATERAL, c('Ventrolateral lesions can be entered between the hypoglossal nerve and C1 in the anterolateral sulcus.', 'rajagopal2019')],
    risks: [AUTONOMIC],
  },
  {
    id: 'sez_olivary',
    summary: 'The surface of the medulla over the olive.',
    borders: [
      c('The olivary region of the ventrolateral medulla is bounded by the preolivary sulcus in front and the postolivary sulcus behind.', 'cavalcanti2026'),
      c('The olivary zone is the entry into the ventrolateral medulla, as the posterior median sulcus is into the dorsal medulla.', 'cavalcanti2026'),
    ],
    approach: [c('The far-lateral route (often with partial removal of the C1 arch and limited condylar drilling) gives the best exposure of the ventrolateral medulla and the olive.', 'cavalcanti2026')],
    risks: [AUTONOMIC],
  },
  {
    id: 'sez_postolivary_sulcus',
    summary: 'The groove behind the olive, in front of the lower cranial nerve rootlets.',
    borders: [c('Lies between the olive and the inferior cerebellar peduncle; the glossopharyngeal, vagus and accessory nerves leave the medulla just dorsal to it.', 'cavalheiro2015')],
    approach: [FAR_LATERAL, c('Ventrolateral lesions can be entered at the level of the retro-olivary sulcus.', 'rajagopal2019')],
    risks: [AUTONOMIC],
  },
  {
    id: 'sez_posterior_median_sulcus',
    summary: 'The midline groove on the back of the medulla, below the obex.',
    borders: [
      c('Medullary lesions below the obex can be reached in the midline through the posterior median sulcus.', 'cavalheiro2015'),
      c('The posterior median fissure below the obex is one of three entry zones of the posterior medulla.', 'rajagopal2019'),
      c('The posterior median sulcus is the entry into the dorsal medulla.', 'cavalcanti2026'),
    ],
    approach: [c('Reached through a midline suboccipital approach.', 'rajagopal2019', 'cavalcanti2026')],
    risks: [AUTONOMIC],
  },
  {
    id: 'sez_posterior_intermediate_sulcus',
    summary: 'The groove between the gracile and cuneate fasciculi on the back of the lower medulla.',
    borders: [c('One of three entry zones of the posterior medulla, between the gracile and cuneate fasciculi.', 'rajagopal2019')],
    approach: [c('Reached through a midline suboccipital approach.', 'rajagopal2019')],
    risks: [AUTONOMIC],
  },
  {
    id: 'sez_posterolateral_sulcus',
    summary: 'The groove between the cuneate fasciculus and the spinal trigeminal tract.',
    borders: [c('One of three entry zones of the posterior medulla, between the cuneate fasciculus medially and the spinal trigeminal tract and nucleus laterally.', 'rajagopal2019')],
    approach: [c('Reached through a midline suboccipital approach.', 'rajagopal2019')],
    risks: [AUTONOMIC],
  },
];

/** The ascending arousal network nuclei (AAN 2.0), by the atlas's abbreviation. */
export const AAN_GENERAL: Claim[] = [
  c('The brainstem part of the ascending arousal network is made up of at least ten neurotransmitter-specific nuclei that modulate arousal and, in the end, consciousness. Beyond arousal they serve respiration, sleep and circadian rhythm, and pain modulation.', 'olchanyi2025'),
  c('In ex vivo diffusion MRI of three human brains, tractography linked the nodes of a proposed default ascending arousal network (in the brainstem, hypothalamus, thalamus and basal forebrain) with one another and with nodes of the default mode network; in vivo 7 T resting-state fMRI identified the dopaminergic ventral tegmental area as a widely connected hub between the subcortical arousal and the cortical awareness networks.', 'edlow2024'),
];
export const AAN_TRANSMITTER: Record<string, Claim> = {
  DR: c('Predominantly serotonergic.', 'olchanyi2025'),
  MnR: c('Predominantly serotonergic.', 'olchanyi2025'),
  LC: c('Noradrenergic.', 'olchanyi2025'),
  LDTg: c('Cholinergic.', 'olchanyi2025'),
  PTg: c('Cholinergic.', 'olchanyi2025'),
  PBC: c('Glutamatergic.', 'olchanyi2025'),
  PnO: c('Glutamatergic.', 'olchanyi2025'),
  mRt: c('Glutamatergic.', 'olchanyi2025'),
  VTA: c('Dopaminergic; the hub of the subcortical arousal network in 7 T resting-state fMRI.', 'olchanyi2025', 'edlow2024'),
  PAG: c('Uses several neurotransmitters.', 'olchanyi2025'),
};

/** Each cranial nerve's functional components (Kim 2020, Table 1, adapted there from Kelly 1993). */
export const NERVE_COMPONENTS: Record<number, Claim> = {
  3: c('Somatic efferent: superior, inferior and medial recti, inferior oblique and levator palpebrae superioris. General visceral efferent: sphincter pupillae and ciliary muscle.', 'kim2020'),
  4: c('Somatic efferent: superior oblique.', 'kim2020'),
  5: c('General somatic afferent: skin and deep tissues of the head, dura mater. Special visceral efferent: muscles of mastication, tensor tympani, tensor veli palatini, mylohyoid and the anterior belly of the digastric.', 'kim2020'),
  6: c('Somatic efferent: lateral rectus.', 'kim2020'),
  7: c('General somatic afferent: outer ear. Special visceral afferent: taste from the palate and the anterior two-thirds of the tongue. General visceral afferent: some mucous membranes of the nasopharynx. General visceral efferent: lacrimation and salivation (submandibular and sublingual glands). Special visceral efferent: muscles of facial expression, stapedius.', 'kim2020'),
  8: c('Special somatic afferent: hearing and equilibrium.', 'kim2020'),
  9: c('General somatic afferent: outer ear. Special visceral afferent: taste from the posterior third of the tongue. General visceral afferent: carotid body and sinus, mucous membranes of the pharynx and middle ear. General visceral efferent: salivation (parotid gland). Special visceral efferent: stylopharyngeus.', 'kim2020'),
  10: c('General somatic afferent: outer ear. Special visceral afferent: taste from the epiglottis. General visceral afferent: thoracic and abdominal viscera, mucous membrane of the larynx and hypopharynx. General visceral efferent: thoracic and abdominal viscera. Special visceral efferent: muscles of the larynx and pharynx, palatoglossus.', 'kim2020'),
  11: c('Special visceral efferent: sternocleidomastoid and trapezius.', 'kim2020'),
  12: c('Somatic efferent: intrinsic and extrinsic tongue muscles except palatoglossus.', 'kim2020'),
};
