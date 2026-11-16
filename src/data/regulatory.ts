/**
 * Regulatory status of each indication and target, in the United States and the European Union (the site audit's
 * A-012; the owner's choices of 16 November 2026: a line on each indication card and a table on the References page;
 * the EU by disease, from the reviews; "Not an approved indication" where no approval names it; a note on responsive
 * neurostimulation on the epilepsy card).
 *
 * United States: the FDA's premarket approval (PMA) and humanitarian device exemption (HDE) records, read through
 * openFDA (api.fda.gov) and accessdata.fda.gov on the date below. The neurology HDE list holds two DBS exemptions,
 * dystonia (H020007) and obsessive-compulsive disorder (H050003); no record names the other indications or targets.
 * "Not named" is what the records say, not proof that nothing exists.
 * European Union: CE marks as two open-access reviews give them, by disease: Amon 2017 (PMC5565669), Table 1, per
 * device; Frey 2022 (PMC8959612), with targets. No current EU instructions for use were found in PubMed or Europe PMC.
 */
export const REGULATORY_CHECKED = '16 November 2026';

export interface RegulatoryRow {
  /** the target or targets the row is about, as shown */
  targets: string;
  /** the status in a few words, for the summary table */
  usShort: string;
  us: string;
  usRefIds: string[];
  euShort: string;
  eu: string;
  euRefIds: string[];
}
export interface IndicationRegulatory { rows: RegulatoryRow[]; note?: { text: string; refIds: string[] } }

const NOT_US = 'Not approved';
const EU_BY_DISEASE = 'Target not named';
const EU_NOT_NAMED = 'Not named';
const AMON = ['amon2017'];

/** a target in an approved disease that no approval names */
const targetNotNamed = (targets: string, what: string, disease: string): RegulatoryRow => ({
  targets,
  usShort: NOT_US,
  us: `Not an approved target: no FDA approval or exemption names ${what}.`,
  usRefIds: [],
  euShort: EU_BY_DISEASE,
  eu: `The CE marks are listed by disease (${disease}), not by target.`,
  euRefIds: AMON,
});

const DYSTONIA: IndicationRegulatory = {
  rows: [
    {
      targets: 'GPi or STN, one or both sides',
      usShort: 'Exemption, 2003',
      us: 'Humanitarian device exemption since 2003 for chronic, intractable (drug-refractory) primary dystonia, including generalized and segmental dystonia, hemidystonia and cervical dystonia, from age 7. An exemption does not require effectiveness to be shown.',
      usRefIds: ['fda2003hde', 'wu2021'],
      euShort: 'CE mark (dystonia)',
      eu: 'CE-marked for dystonia on every system the review lists; the targets are not named.',
      euRefIds: AMON,
    },
    {
      targets: 'GPi, both sides',
      usShort: 'Approved, 2025',
      us: 'Approved since November 2025 (Medtronic) for chronic, intractable primary dystonia: generalized, segmental dystonia of the head and neck, and cervical dystonia in adults; generalized dystonia from age 12.',
      usRefIds: ['fda2025dys'],
      euShort: 'CE mark (dystonia)',
      eu: 'As above.',
      euRefIds: AMON,
    },
  ],
};

/** an indication that no approval names; `more` adds a sentence with its sources */
const indicationNotNamed = (targets: string, what: string, more: { text: string; refIds: string[] } | null, eu: string, euRefIds = AMON): IndicationRegulatory => ({
  rows: [{
    targets,
    usShort: NOT_US,
    us: `Not an approved indication: no FDA approval or exemption names ${what}.${more ? ' ' + more.text : ''}`,
    usRefIds: more?.refIds ?? [],
    euShort: EU_NOT_NAMED,
    eu,
    euRefIds,
  }],
});
const PRIMARY_DYSTONIA = { text: 'The dystonia exemption and approval are for primary dystonia.', refIds: ['fda2003hde', 'fda2025dys'] };
const CE_LIST = 'Not among the CE-marked indications: Parkinson’s disease, tremor and dystonia, and on some Medtronic systems epilepsy and obsessive-compulsive disorder.';

export const REGULATORY: Record<string, IndicationRegulatory> = {
  pd: {
    rows: [
      {
        targets: 'STN or GPi, both sides',
        usShort: 'Approved, 2002',
        us: 'Approved as adjunctive therapy for levodopa-responsive Parkinson’s disease not adequately controlled with medication: for advanced disease since 2002, and for disease of at least 4 years’ duration since 2015 (Medtronic). Abbott’s and Boston Scientific’s systems: the STN since 2015 and 2017, the GPi since 2020.',
        usRefIds: ['fda2002', 'fda2015pd', 'fdaabbott', 'fdaboston'],
        euShort: 'CE mark (Parkinson’s disease)',
        eu: 'CE-marked for Parkinson’s disease on every system the 2017 review lists (Boston Scientific, Medtronic, St Jude); Frey 2022 names the STN, GPi and Vim.',
        euRefIds: ['amon2017', 'frey2022'],
      },
      {
        targets: 'Vim, one side, for parkinsonian tremor (not a target in the Parkinson’s view)',
        usShort: 'Approved, 1997',
        us: 'Approved since 1997: unilateral thalamic stimulation for upper-extremity tremor in essential or parkinsonian tremor not adequately controlled by medication (Medtronic); unilateral Vim stimulation on Boston Scientific’s systems since 2021.',
        usRefIds: ['fda1997', 'fdaboston'],
        euShort: 'CE mark (tremor)',
        eu: 'CE-marked for tremor (by disease); Frey 2022 names the Vim for Parkinson’s disease too.',
        euRefIds: ['amon2017', 'frey2022'],
      },
      targetNotNamed('STN with SNr', 'the SNr', 'Parkinson’s disease'),
    ],
  },
  et: {
    rows: [
      {
        targets: 'Vim',
        usShort: 'Approved, 1997',
        us: 'Approved since 1997 on one side (Medtronic: upper-extremity tremor in essential or parkinsonian tremor not adequately controlled by medication); on one or both sides on Abbott’s systems since 2015 and on Boston Scientific’s since 2024 (one side since 2021).',
        usRefIds: ['fda1997', 'fdaabbott', 'fdaboston'],
        euShort: 'CE mark (tremor)',
        eu: 'CE-marked for tremor on every system the 2017 review lists; Frey 2022 names the Vim, CE-marked since 1993.',
        euRefIds: ['amon2017', 'frey2022'],
      },
      targetNotNamed('PSA / caudal zona incerta', 'it (the tremor approvals name the thalamus or the Vim)', 'tremor'),
    ],
  },
  holmes: indicationNotNamed('Vim, PSA, GPi, Vo', 'Holmes tremor', { text: 'The tremor approvals name essential and parkinsonian tremor.', refIds: ['fda1997', 'fdaabbott', 'fdaboston'] },
    'Not named: the review lists a CE mark for tremor without naming its kinds.'),
  gdys: DYSTONIA,
  cdys: DYSTONIA,
  fhd: {
    rows: [
      targetNotNamed('Vo', 'the Vo', 'dystonia'),
      {
        targets: 'GPi',
        usShort: 'Not named',
        us: 'The 2003 exemption covers GPi or STN stimulation for chronic, intractable primary dystonia, “including” generalized and segmental dystonia, hemidystonia and cervical dystonia; it does not name focal hand dystonia, and the 2025 approval does not cover it.',
        usRefIds: ['fda2003hde', 'fda2025dys'],
        euShort: EU_NOT_NAMED,
        eu: 'CE-marked for dystonia (by disease); focal hand dystonia is not named.',
        euRefIds: AMON,
      },
    ],
  },
  md: indicationNotNamed('GPi, Vim', 'myoclonus-dystonia', PRIMARY_DYSTONIA, 'Not named: the review lists a CE mark for dystonia without naming its kinds.'),
  tard: indicationNotNamed('GPi, STN', 'tardive syndromes', PRIMARY_DYSTONIA, 'Not named: the review lists a CE mark for dystonia without naming its kinds.'),
  ts: indicationNotNamed('CM and Pf, GPi', 'Tourette syndrome', { text: 'Frey 2022 counts it among the indications under investigation.', refIds: ['frey2022'] }, CE_LIST),
  chorea: indicationNotNamed('GPi', 'chorea or Huntington’s disease', null, CE_LIST),
  epi: {
    rows: [
      {
        targets: 'ANT, both sides',
        usShort: 'Approved, 2018',
        us: 'Approved since 2018 (Medtronic) as adjunctive therapy from age 18 for partial-onset seizures, with or without secondary generalization, refractory to three or more antiepileptic drugs.',
        usRefIds: ['fda2018'],
        euShort: 'CE mark (epilepsy)',
        eu: 'CE-marked for epilepsy on Medtronic’s Activa PC (2017 review); Frey 2022 names the ANT.',
        euRefIds: ['amon2017', 'frey2022'],
      },
      targetNotNamed('CM, hippocampus', 'the CM or the hippocampus for DBS', 'epilepsy'),
    ],
    note: {
      text: 'Responsive neurostimulation, a different device, is approved in the US since 2013 as adjunctive therapy from age 18 for partial-onset seizures from no more than two foci: its depth or strip leads lie at the foci, mesial temporal ones included, and it stimulates when it detects abnormal activity.',
      refIds: ['fdarns', 'sun2014'],
    },
  },
};
