/**
 * Stimulation-induced side effects per DBS target, and the structure current is thought to reach for each (the site
 * audit's A-013, the owner's choices of 15 November 2026: a block on each target's card and a line on each drawn
 * landmark's card; structures not drawn here are named and said to be not drawn; rates by study).
 *
 * Sources, both open access and read in full: Koeglsperger 2019 (PMC6558426), a review of DBS programming, for the
 * STN, Vim and GPi (each effect, and the neighbouring structure and its direction); Kim 2021 (PMC8220085), 93 patients
 * with essential tremor, one lead through the PSA (its lower contacts) and the Vim (its upper ones), Table 5, for the
 * rates at the Vim and the PSA.
 */
export interface SideEffect {
  /** what the patient has or reports (and how often, where a study gives it) */
  effect: string;
  /** where the current is thought to spread: the structure and its direction from the target; a structure not drawn
   * in this section says so */
  cause?: string;
  /** a drawn structure the cause names (its card is linked) */
  drawnId?: string;
  refIds: string[];
}
export interface TargetSideEffects { items: SideEffect[]; note?: { text: string; refIds: string[] } }

const K = ['koeglsperger2019'];
const KIM = ['kim2021'];

export const SIDE_EFFECTS: Record<string, TargetSideEffects> = {
  stn: {
    items: [
      { effect: 'Muscle contractions, often “facial pulling” of the upper face on both sides and the lower face on the opposite side', cause: 'the internal capsule, lateral and anterior to the STN', drawnId: 'cst', refIds: K },
      { effect: 'Dysarthria, in about 25% of STN DBS', cause: 'the internal capsule (strained or spastic speech), or else pallidal and cerebellothalamic fibres medial and dorsal to the STN', drawnId: 'cst', refIds: K },
      { effect: 'Reduced gaze towards the stimulated side, sometimes deviation to the other side', cause: 'fibres from the frontal eye field that run in the internal capsule (not drawn as such)', refIds: K },
      { effect: 'Deviation of one eye and diplopia', cause: 'third-nerve fibres, which run inferomedial to the STN and through the red nucleus below it (the fibres are not drawn)', drawnId: 'rn', refIds: K },
      { effect: 'Paraesthesiae on the opposite side', cause: 'the medial lemniscus, ventroposterior to the STN', drawnId: 'ml', refIds: K },
      { effect: 'Nausea and sweating', cause: 'spread medially and anteriorly, presumably to the hypothalamus (not drawn) and the red nucleus', drawnId: 'rn', refIds: K },
      { effect: 'Dyskinesia like levodopa-induced dyskinesia; during the first programming after surgery the contact that induces it is usually the most effective', refIds: K },
      { effect: 'Hypomania, hypersexuality or compulsive gambling, most likely from the most ventral contacts', cause: 'the ventromedial, limbic part of the STN; in one patient acute depression came from a contact in the substantia nigra', refIds: K },
    ],
  },
  gpi: {
    items: [
      { effect: 'Dysarthria, close to 30% in follow-up studies of primary dystonia; also stuttering', cause: 'the internal capsule, medial and posterior to the GPi', drawnId: 'cst', refIds: K },
      { effect: 'Phosphenes', cause: 'the optic tract, ventral to the GPi', drawnId: 'optic_tract', refIds: K },
      { effect: 'Parkinsonian signs (hypokinesia, micrographia, postural and gait problems) in dystonia, more with the ventral contacts, which control dystonia best', cause: 'the posteroventral GPi itself', refIds: K },
    ],
  },
  vim: {
    items: [
      { effect: 'Paraesthesiae, the commonest short-term effect: passing within seconds to minutes, or lasting until the stimulation is turned down', cause: 'the thalamic sensory nuclei (not drawn); the medial lemniscus, the Vim’s posterior border, gave hemibody paraesthesiae when stimulated', drawnId: 'ml', refIds: [...K, 'sammartino2016'] },
      { effect: 'Dysarthria: 15% of 93 patients with Vim stimulation, against 4% with PSA stimulation; dysarthria is common in essential tremor without DBS too', cause: 'the internal capsule’s motor fibres lateral to the Vim (spastic dysarthria), or cerebellothalamic fibres', drawnId: 'cst', refIds: [...K, ...KIM] },
      { effect: 'Gait and limb ataxia, which can also be part of essential tremor itself', cause: 'dentatothalamic fibres lateral and ventral to the Vim', drawnId: 'drtt', refIds: K },
    ],
  },
  psa: {
    items: [
      { effect: 'Gait disturbance and clumsiness of the leg: 14% of 93 patients with PSA stimulation, none with Vim stimulation', refIds: KIM },
      { effect: 'Paraesthesiae: 14%, against 6.5% with Vim stimulation; they resolved on lowering the amplitude or switching to bipolar stimulation', refIds: KIM },
      { effect: 'Dysarthria: 4%, against 15% with Vim stimulation', refIds: KIM },
    ],
    note: { text: 'One series, one lead through the PSA (its lower contacts) and the Vim (its upper ones); gait disturbance and dysarthria were more frequent with leads on both sides than on one.', refIds: KIM },
  },
};
