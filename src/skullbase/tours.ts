/**
 * Teaching tours (the audit's roadmap, section 3): an ordered list of the site's own views, each with a sentence or two.
 * A step is a link (the skull base's atlas parameters, as `#/atlas?…` holds them) and a text that must already be on
 * the site with the same sources: the pterional tour's sentences are its approach card's, word for word
 * (tests/unit/tours.test.ts holds them to it). No scoring, nothing recorded.
 *
 * DRAFT: the owner reads and corrects the tour's text before it is published.
 */

export interface TourStep {
  /** a short heading for the step */
  title: string;
  /** the view: the atlas link's parameters, without `#/atlas?` (the model is the tour's) */
  link: string;
  /** what to look at: a sentence from the site, with its sources */
  text: string;
  refIds: string[];
}

export interface Tour {
  id: string;
  title: string;
  /** the skull base model the tour's views are in */
  model: 'v3';
  /** the approach card the sentences come from */
  approach: string;
  steps: TourStep[];
}

export const TOURS: Tour[] = [{
  id: 'pterional',
  title: 'The pterional approach in six steps',
  model: 'v3',
  approach: 'pterional',
  steps: [
    {
      title: 'The craniotomy',
      link: 'g=transsylvian&op=0&lf=0&sr=0&sel=sb_appr_pterional__removed',
      text: 'Four burr holes: the keyhole (McCarty) anterior to the superior temporal line and above the frontozygomatic suture; one in the frontal bone near the superior orbital rim, avoiding the frontal sinus, 3–4 cm from the first; one below the superior temporal line, near or just anterior to the coronal suture; and one in the temporal squama behind the sphenotemporal suture. Osteotomies join them.',
      refIds: ['yilmaz2025'],
    },
    {
      title: 'The sphenoid wing',
      link: 'g=transsylvian&op=0&lf=0&sr=100&sel=sb_appr_pterional__ridge',
      text: 'Yaşargil’s 1975 modification limited the craniotomy, removed two-thirds of the sphenoid wing and opened the sylvian fissure and anterior cisterns to minimise frontal lobe retraction.',
      refIds: ['yilmaz2025'],
    },
    {
      title: 'The Sylvian fissure',
      link: 'g=transsylvian&op=100&lf=0&sr=100&sel=br_insula',
      text: 'Its dissection begins at the frontal operculum, typically at the pars triangularis, where the fissure is widest; dissection between the frontal and temporal lobes exposes the middle cerebral artery and its branches.',
      refIds: ['yilmaz2025'],
    },
    {
      title: 'A natural plane',
      link: 'g=transsylvian&op=100&lf=0&sr=100&sel=sb_middle_cerebral_artery_m2_segment',
      text: 'The pterional approach uses this naturally occurring plane to reach an aneurysm without extensive brain retraction.',
      refIds: ['ngando2013'],
    },
    {
      title: 'Lifting the frontal lobe',
      link: 'g=transsylvian&op=100&lf=100&sr=100&sel=tb_optic_nerve_ii',
      text: 'After the fissure is dissected, retracting the frontal and temporal lobes exposes the optic nerve, the vessels and the anterior and middle cranial fossae.',
      refIds: ['yilmaz2025'],
    },
    {
      title: 'The veins',
      link: 'g=transsylvian&op=100&lf=100&sr=100&sel=sb_superficial_middle_cerebral_vein',
      text: 'The superficial Sylvian veins are preserved, especially those draining into the temporal lobe; frontal draining veins may be sacrificed if necessary.',
      refIds: ['yilmaz2025'],
    },
  ],
}];

export const TOUR = new Map(TOURS.map((t) => [t.id, t]));
