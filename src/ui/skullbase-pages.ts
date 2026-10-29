import { APPROACH_GEOM, DEFINITIONS, LANDMARKS, SB_MANIFEST, SB_MODEL, V3_FIT } from '../skullbase';
import { APPROACH_REFS } from '../skullbase/approaches';
import { FORAMEN_REFS } from '../skullbase/foramina';
import { TB_REFS } from '../skullbase/temporal';
import { h } from './h';

/** Sources and Credits of the skull-base section. */

const link = (href: string, text: string) => h('a', { href, target: '_blank', rel: 'noopener' }, text);

/** The temporal-bone model's sources: how a real ear was registered into the CT, and the references of its notes. */
function temporalSourcesPage() {
  const el = h('div', { class: 'page wrap' });
  const f = V3_FIT;
  const sides = ['R', 'L'] as const;
  const sideName = { R: 'Right', L: 'Left' };
  el.append(
    h('h1', {}, 'Sources'),
    h('section', { class: 'card' },
      h('h2', {}, 'How this model is made'),
      h('p', {}, f.skull
        ? 'Bone and the labelled arteries and deep veins: the TopBrain 2025 CT angiogram (case 011), in Skull base v2’s frame (millimetres from the fitted hypophysial fossa). A CT does not show the nerves, and this one blurs the canals of the temporal bone, so its contents come from a real ear.'
        : 'Bone and the labelled arteries and deep veins: the TopBrain 2025 CT angiogram (case 011), the same meshes as Skull base v2, in its frame (millimetres from the fitted hypophysial fossa). A CT does not show the nerves, and this one blurs the canals of the temporal bone, so its contents come from a real ear.'),
      f.skull ? h('p', {}, `The skull is completed beyond the scan (pipeline/skullbase_v3_skull.py). The angiogram is a box around the head that cuts off the front of the forehead, the lower maxillae and parts of the vault, and it resolves the thin facial bones only in pieces. So the Z-Anatomy model, fitted onto this CT as in Skull base v2 (scaled ${f.skull.fit.scale}, median distance ${f.skull.fit.warpedMedianMm} mm), stands in where the scan does not reach, and for the face (${f.skull.faceBones.join(', ').toLowerCase()}) throughout. Its face was first fitted again on its own onto the CT’s facial bone (pairs both ways, an affine map held close to a rotation; within 4 mm: ${Math.round(f.skull.face.withinBefore * 100)} % of points before, ${Math.round(f.skull.face.withinAfter * 100)} % after), and the whole model again within ${f.skull.edgeFitMm} mm of the scan’s edge (median distance ${f.skull.edge.medianBeforeMm} mm before, ${f.skull.edge.medianAfterMm} mm after). One bone field then gives one surface: the CT’s bone inside the scan, the model beyond it, the CT giving way to the model over the last ${f.skull.blendMm} mm inside the edge, and the model’s face blended into the CT’s cranium across the sutures over ${f.skull.seamMm} mm. Its surface is taken as Skull base v2 takes the CT’s, with the voxels softened (a Gaussian of about one voxel) so gently sloping surfaces do not show the grid’s steps. On the skull’s outer surface, the walls Skull base v2 draws by rule around enclosed air (which made ridges, and a shelf over the frontal sinus) and the CT’s bone within 5 mm of them give way to the model as well. Each bone’s card says how much of it is the model.`) : null,
      h('p', {}, 'The OpenEar library holds eight cadaver temporal bones, imaged by cone-beam CT and micro-slicing and segmented at 0.125 mm (Sieber et al. 2019). Each was registered onto each temporal bone of this CT (pipeline/skullbase_v3.py): a rotation, shift and one scale that make the specimen’s bone, blurred to the CT’s resolution, correlate best with the CT’s bone within 14 mm of the labyrinth. The search tries 1500 rotations, the specimen as it is and mirrored, and refines the best twelve, starting from the labyrinth picked by hand on the CT’s slices. Specimen ALPHA fitted best: its structures were then carried into the CT with that transform, so they stay consistent with each other as they were in that ear (the facial nerve in its canal, the stapes in the oval window). The left ear is ALPHA mirrored.'),
      h('table', { class: 'coords' },
        h('thead', {}, h('tr', {}, ...['Ear', 'Correlation', 'Scale', 'Canal contents on the CT', 'Carotid on the CT'].map((t) => h('th', {}, t)))),
        h('tbody', {}, ...sides.map((sd) => h('tr', {},
          h('td', {}, sideName[sd] + (f.fit[sd].mirrored ? ' (mirrored)' : '')), h('td', {}, String(f.fit[sd].correlation)), h('td', {}, String(f.fit[sd].scale)),
          h('td', {}, `${f.fit[sd].checksHU['Nerves in the internal acoustic meatus (VII, VIII)']} HU`), h('td', {}, `${f.fit[sd].checksHU['Internal carotid artery (petrous part)']} HU`))))),
      h('p', { class: 'aside' }, 'A check independent of the fit: the CT’s values inside the carried-over structures. The meatus’ contents fall on fluid and nerve (under 100 HU), the carotid on its contrast-filled lumen (about 150–300 HU), not on bone (over 1000 HU).'),
      h('p', {}, 'Cross-check: two other ears, registered the same way, put the same landmarks this far from ALPHA’s:'),
      h('ul', {}, ...sides.flatMap((sd) => Object.entries(f.crossCheck[sd] ?? {}).map(([spec, r]) => h('li', {}, `${sideName[sd]}, ${spec}: `,
        r.failed || !r.distanceMm ? `registration failed (correlation ${r.correlation}); not compared` : Object.entries(r.distanceMm).map(([k, v]) => `${k.toLowerCase()} ${v} mm`).join(', '))))),
      h('p', {}, 'The greater petrosal nerve, which no specimen segments, is drawn by rule from the carried-over geniculate ganglion forwards and medially along this CT’s middle fossa floor, for its published mean length (Nguyen 2026). The bone over the superior semicircular canal is the CT’s bone surface directly above the carried-over canal’s top.')),
    h('section', { class: 'card' },
      h('h2', {}, 'Cranial nerves, foramina and sinuses'),
      h('p', {}, 'The cranial nerves are routed through this CT (pipeline/skullbase_v3_base.py, skullbase_nerves.py). The Z-Anatomy model fitted onto the CT (Skull base v2) gives each nerve’s course: where it leaves the brainstem and which way it runs. The path drawn is the least-cost path near that course through the CT, where bone costs sixty times more than soft tissue, and air and the vessels’ lumens twenty-five times more. So a nerve keeps to its fitted course in the cisterns, and crosses the skull base through this CT’s own opening nearest to it. Its cisternal course stays approximate (the brainstem is not in the CT). The optic nerves follow TotalSegmentator’s segmentation of them; VII and VIII run to the registered ear’s internal acoustic meatus.'),
      h('table', { class: 'coords' },
        h('thead', {}, h('tr', {}, ...['Nerve', 'Bone crossed (R / L)', 'Furthest from the fitted course (R / L)'].map((t) => h('th', {}, t)))),
        h('tbody', {}, ...Object.entries(f.nerves).map(([n, r]) => h('tr', {}, h('td', {}, n),
          h('td', {}, `${r.R.boneCrossedMm} / ${r.L.boneCrossedMm} mm`), h('td', {}, `${r.R.maxFromFittedMm} / ${r.L.maxFromFittedMm} mm`))))),
      h('p', { class: 'aside' }, '“Bone crossed”: where the 0.5 mm bone mask closes a small canal with a voxel of blurred bone (the right foramen rotundum here), the path may cross it rather than detour through another opening.'),
      f.trigeminal ? h('p', {}, 'The trigeminal complex is drawn on this CT by rule from published means (Chaware 2023, 80 sides), not traced: each division leaves the ganglion its mean intracranial length before its foramen as located here (V1 27.4 mm to the superior orbital fissure, V2 11.2 mm to the foramen rotundum, V3 4.5 mm to the foramen ovale); the ganglion is the crescent through those three origins, as wide as the published mean, kept off bone; the sensory root runs from where it leaves the side of the fitted pons to the ganglion’s concave margin. ',
        `Meckel’s cave so placed lies ${f.trigeminal.R.movedFromFittedMm} mm (right) and ${f.trigeminal.L.movedFromFittedMm} mm (left) from where the fitted model’s divisions begin; the origins of V1 and V3 lie ${f.trigeminal.R.spanMm} / ${f.trigeminal.L.spanMm} mm apart. `,
        'Near the brainstem, the nerves’ fitted courses and the fitted anterior inferior and superior cerebellar arteries follow the posterior fossa fit (the deformation that fits the cerebellum and brainstem into this skull, in full within 6 mm of them, none beyond 16 mm), and the two arteries are then kept just outside the fitted cerebellum and brainstem.') : null,
      h('p', {}, 'Foramina are located from the routes: where a nerve first passes between bone on most sides; the superior orbital fissure where III, IV, V1 and VI run closest together; the jugular foramen from IX, X and XI. The foramen lacerum and the foramen magnum are the cranial floor’s through-holes seen from above; the carotid canal’s outer opening is the top of TotalSegmentator’s internal carotid artery. Independent checks: ',
        `the mandibular nerve leaves ${f.nerveChecks.mandibularNerveToOvaleHoleMm.R} mm (right) and ${f.nerveChecks.mandibularNerveToOvaleHoleMm.L} mm (left) from the foramen ovale hole the floor shows; `,
        `the optic nerve’s route lies ${f.nerveChecks.opticNerveToSegmentationMm.R} mm from TotalSegmentator’s; `,
        `IX–XI pass ${Math.min(...Object.values(f.nerveChecks.jugularNervesToBulbMm.R), ...Object.values(f.nerveChecks.jugularNervesToBulbMm.L))}–${Math.max(...Object.values(f.nerveChecks.jugularNervesToBulbMm.R), ...Object.values(f.nerveChecks.jugularNervesToBulbMm.L))} mm from the jugular bulb (they run beside it).`),
      h('p', {}, 'The sigmoid and transverse sinuses are traced through this CT’s own contrast-filled lumen, from the jugular bulb to the transverse sinus near the midline, along the middle of the enhanced channel: ',
        sides.map((sd) => `${sideName[sd].toLowerCase()} ${Math.round(f.sinuses[sd].inLumenShare * 100)} % of the trace at least 1.5 mm inside the lumen, median radius ${f.sinuses[sd].medianRadiusMm} mm`).join('; '), '. The middle meningeal artery is routed like the nerves, through the foramen spinosum; the cervical carotids and jugular veins are TotalSegmentator’s (headneck_bones_vessels).'),
      h('p', {}, 'Arteries: the circle of Willis and its large branches are TopBrain’s expert labels of this angiogram. This patient’s carotid between the cervical segment and the cavernous one is traced the same way as the sinuses, through its contrast-filled lumen in the carotid canal and foramen lacerum: ',
        sides.map((sd) => `${sideName[sd].toLowerCase()} ${Math.round(f.carotids[sd].inLumenShare * 100)} % of the trace at least 1.5 mm inside the lumen, median radius ${f.carotids[sd].medianRadiusMm} mm, a median ${f.carotids[sd].medianFromSpecimenMm} mm from the registered specimen’s carotid`).join('; '),
        '. Branches too small for this CT to show (the lateral striate and pontine branches, the anterior spinal artery) are the fitted Z-Anatomy branches moved to start on this patient’s own parent vessel; the ethmoidal arteries and the accessory meningeal branch are routed from it through the CT like the nerves. Their courses are approximate and their cards say so.')),
    ...(f.brain && APPROACH_GEOM.pterional ? [h('section', { class: 'card', id: 'surgical' },
      h('h2', {}, 'The surgical views: craniotomies and brain'),
      h('p', {}, 'The right pterional craniotomy is cut out of this CT’s own bone (pipeline/skullbase_v3_approach.py): an outline through four burr holes placed from the fitted landmarks as the sources describe, removing along each line of sight the skull’s thickness there, then the lateral sphenoid ridge drilled. A cut bone keeps the CT model’s own surface except within 3 mm of the cut, where the cut bone’s surface is meshed again, so it meets the bones next to it without gaps. ',
        `${APPROACH_GEOM.pterional.removedMl} ml of bone removed.`),
      APPROACH_GEOM.lso ? h('p', {}, 'The right lateral supraorbital (LSO) craniotomy is cut the same way: a frontolateral flap over the orbital roof with one burr hole posteriorly below the temporal line, cut down to the anterior fossa floor and kept to the frontal bone, without drilling the sphenoid ridge. Its outline is placed by hand on this skull and drawn larger than the usual LSO (the mean in Cha 2012 is 1275 mm²) to show the anatomy: ',
        `${APPROACH_GEOM.lso.removedMl} ml of bone removed.`) : null,
      APPROACH_GEOM.interhemispheric ? h('p', {}, 'The right parasagittal craniotomy for the interhemispheric view is cut the same way: a flap at the coronal suture from the midline (over the superior sagittal sinus) to the right, its length and width illustrative (the sources describe a right precoronal parasagittal or frontoparietal midline craniotomy without giving its size), the bone on the left of the midline kept. Bregma is placed where this skull’s frontal and parietal bones meet at the midline: ',
        `${APPROACH_GEOM.interhemispheric.removedMl} ml of bone removed.`) : null,
      APPROACH_GEOM.suboccipital ? h('p', {}, 'The midline suboccipital craniotomy for the telovelar view is cut the same way, without the floor rule (its bone is the floor of the posterior fossa): from 10 mm below the internal occipital protuberance (the confluence of the sinuses) down through the posterior rim of the foramen magnum, 25 mm to each side of the midline (illustrative), the posterior arch of C1 left. The squama is thin there: ',
        `${APPROACH_GEOM.suboccipital.removedMl} ml of bone removed.`) : null,
      APPROACH_GEOM.retrosigmoid ? h('p', {}, 'The right retrosigmoid craniotomy is placed on this patient’s own sinuses: the transverse and sigmoid sinuses traced through the CT’s contrast-filled lumen, their junction found where the transverse sinus’ lower margin meets the sigmoid sinus’ posterior margin (the keypoint, as Jian 2021, 2022 and 2024 define it) and carried out through the bone. The flap’s upper edge runs 28 mm back along the transverse sinus’ lower margin and its front edge 35 mm down along the sigmoid sinus’ posterior margin, against the sinuses as they describe, straight edges behind and below closing it, its corners rounded: drawn by hand, larger than their keyhole (18–20 × 20–25 mm) to show the anatomy, about the size of the craniotomies in Tang 2025 (a mean 3.8 cm across). Its burr hole 3.5 mm behind and below the keypoint, its edge smoothed like the lateral supraorbital one: ',
        `${APPROACH_GEOM.retrosigmoid.removedMl} ml of bone removed.`) : null,
      h('p', {}, 'A CT angiogram does not show the cortex well enough to segment it, so the brain is a template, the Lead-DBS MNI 2009b pial surface (the cortex section’s), fitted into this skull by a smooth deformation (pipeline/skullbase_brain.py, brain_deform.py). The deformation is an affine map plus Gaussian radial basis functions on grids from 18 to 5 mm. It is found by minimising together: the brain’s hull (sulci bridged) ',
        `${f.brain.params.tableGapMm} mm inside the CT’s cranial cavity and never within ${f.brain.params.boneGapMm} mm of bone; every artery and deep vein TopBrain labels outside the cortex; the M2 segments on the insula and the M3 segments in the Sylvian fissure; the falx and tentorium (fitted in v2) outside the cortex; and a penalty wherever the local volume would shrink below 45 % of the overall scale, so that it never folds. The vertices still touching bone or a vessel, or across the falx, are then pushed clear (off the falx sideways, where the falx is), the surface around them following as rigidly as possible (ARAP).`),
      h('table', { class: 'coords' },
        h('thead', {}, h('tr', {}, ...['Measure', 'Right', 'Left'].map((t) => h('th', {}, t)))),
        h('tbody', {},
          h('tr', {}, h('td', {}, 'M2 centre line to the insula (median)'), h('td', {}, `${f.brain.fit.m2InsulaMedianMmR} mm`), h('td', {}, `${f.brain.fit.m2InsulaMedianMmL} mm`)),
          h('tr', {}, h('td', {}, 'M3 centre line to the fissure’s surfaces (median)'), h('td', {}, `${f.brain.fit.m3FissureMedianMmR} mm`), h('td', {}, `${f.brain.fit.m3FissureMedianMmL} mm`)),
          h('tr', {}, h('td', {}, 'Vertices pushed clear of bone / of a vessel / back across the falx'), ...(['R', 'L'] as const).map((sd) => {
            const c = f.brain!.clear[sd];
            const left = c.inBoneWayAfter + c.inVesselAfter + c.acrossFalxAfter;
            return h('td', {}, `${c.inBoneWayBefore} / ${c.inVesselBefore} / ${c.acrossFalxBefore} (max ${c.maxMovedMm} mm), ${left ? `${left} left` : 'none left'}`);
          })),
          h('tr', {}, h('td', {}, 'This patient’s M1, as TopBrain labels it'), h('td', {}, `${f.brain.m1LengthMm.R} mm`), h('td', {}, `${f.brain.m1LengthMm.L} mm`)))),
      h('p', { class: 'aside' }, `The hull’s distance from its place inside the cavity: median ${f.brain.fit.tableMedianMm} mm. The smallest local volume left is ${Math.round(f.brain.fit.minRelativeVolume * 100)} % of the overall scale, so the deformation does not fold; a few triangles deep in tight sulci touch across (${f.brain.crossedTriangles.R.fitted} right, ${f.brain.crossedTriangles.L.fitted} left).`),
      h('p', {}, `The opening is a shape deformation, not a simulation of the tissue. The lips of the right fissure (the opercular cortex near the brain’s surface) are moved apart, the frontal and parietal ones ${f.brain.params.openFrontalMm} mm up and the temporal ${f.brain.params.openTemporalMm} mm down. The insula, the cortex held against the inner table and the brain beyond ${f.brain.params.openRoiMm} mm do not move; the rest follows as rigidly as possible, with facing banks of other sulci held together. The slider blends the fitted and the opened surfaces.`),
      h('p', {}, `A second shape, on top of the opening, lifts the frontal lobe off the orbital roof as a spatula would hold it: the orbital surface within ${f.brain.params.liftCoreMm} mm of a line over the right orbital roof, from the anterior clinoid process through the orbital part of the frontal bone to behind the orbital rim under the frontal pole (fitted landmarks), raised ${f.brain.params.liftMm} mm (fading out by ${f.brain.params.liftReachMm} mm), the front half of the insula up to ${Math.round(f.brain.params.liftInsulaShare * 100)} % of that, the temporal lobe and the back of the insula still. The second slider adds it; with both at full the shape is the one solved for the two together. The lateral supraorbital view lifts the same way by ${f.brain.params.lsoLiftMm} mm (illustrative), but along its own corridor: from the anterior clinoid process out over the lateral orbital roof to under that craniotomy’s lower edge (fitted landmarks), which lies lateral to the first line, so the first lift would open nothing beneath it.`),
      h('p', {}, `For the interhemispheric view a third shape, from the fitted surface, holds the right hemisphere off the falx as a retractor blade would: the brain moved to the right by ${f.brain.params.interhemisphericMm} mm within ${f.brain.params.interhemisphericFlatMm} mm of the midline, less further out (none ${f.brain.params.interhemisphericReachMm} mm from it), over the craniotomy’s length (fading out ${f.brain.params.interhemisphericFadeMm} mm beyond it), and only above the corpus callosum: nothing below the top of the template’s medial wall (its cut through the callosum), all from ${f.brain.params.interhemisphericAboveCallosumMm} mm above it. So the callosum stays and the medial surface, the cingulate gyrus with it, moves off it. A shift that falls off more slowly than it rises keeps the surface from folding or crossing itself; the few points it would carry out of the cranial cavity are moved back in. The arteries in the fissure stay where the CT shows them.`),
      f.pfossa ? h('p', {}, `For the telovelar view the cerebellum (by lobule), the brainstem and the fourth ventricle are Z-Anatomy’s (one adult, from BodyParts3D), carried onto this CT by v2’s fit of the Z-Anatomy model to the bones (pipeline/skullbase_pfossa_export.py, skullbase_ct.py). That fit follows the bones and left this patient’s basilar and vertebral arteries inside the brainstem, so the contents are fitted again (pipeline/skullbase_pfossa.py) by a smooth deformation of the same kind as the cerebrum’s: their hull ${f.pfossa.params.tableGapMm} mm inside the posterior fossa behind the petrous bones (median error ${f.pfossa.fit.tableMedianMm} mm) and at least ${f.pfossa.params.tableMinMm} mm inside it everywhere, this patient’s basilar, vertebral, posterior cerebral, superior and posterior inferior cerebellar arteries outside them (${Math.round(f.pfossa.fit.before.vesselInsideShare * 100)} % of their centre-line points inside before, ${Math.round(f.pfossa.fit.vesselInsideShare * 100)} % after), the tentorium above, and no folding (smallest local volume ${Math.round(f.pfossa.fit.minRelativeVolume * 100)} % of the overall scale). The ${f.pfossa.clear.inVesselBefore} vertices then still within an artery’s reach and the ${f.pfossa.clear.inBoneBefore} in bone were pushed clear, each push spread over its neighbours (${f.pfossa.clear.inVesselAfter} left). The telovelar slider draws each tonsil ${f.pfossa.params.tvMm} mm out to its side and a little up, the rest of its hemisphere following less with distance (none ${f.pfossa.params.tvReachMm} mm from the tonsil), and lifts the nodule and uvula ${f.pfossa.params.tvVermisMm} mm up and back off the roof of the fourth ventricle, the rest of the cerebellum following less with distance (none ${f.pfossa.params.tvVermisReachMm} mm from them). Each shift changes by less than its size over its reach per millimetre, together under 1, so the cerebellum cannot fold; the brainstem, fourth ventricle and arteries stay.${f.pfossa.retrosigmoid ? ` For the retrosigmoid view the same model’s right hemisphere and tonsil are drawn ${f.pfossa.params.rsMm} mm away from the corridor along the back of the petrous bone (from the internal acoustic meatus, the registered ear’s, out through the craniotomy just inside its keypoint), square to it, less with distance (none ${f.pfossa.params.rsReachMm} mm from it), then kept off bone and the arteries: the cerebellum’s points within 4 mm of the corridor go from ${f.pfossa.retrosigmoid.inCorridor.rest} to ${f.pfossa.retrosigmoid.inCorridor.moved}, its nearest point to the meatus from ${f.pfossa.retrosigmoid.meatusToCerebellumMm.rest} to ${f.pfossa.retrosigmoid.meatusToCerebellumMm.moved} mm. The anterior inferior cerebellar artery, which this angiogram does not label, is the Z-Anatomy model’s, carried onto this CT by the skull’s fit and its origin moved onto this patient’s basilar artery (approximate).` : ''}`) : null,
      h('p', {}, 'The middle cerebral artery’s M2 and M3 branches stay where the CT shows them, except where they lie on cortex that is moved: they rise with the frontal and parietal opercula as the fissure opens, and with the frontal lobe and insula as these are lifted (each point the mean movement of that cortex within 3 mm of it, other cortex counted as still).'))] : []),
    h('section', { class: 'card' },
      h('h2', {}, 'References'),
      h('p', {}, 'Every note on the cards cites its source; each was checked against the open-access full text.'),
      h('ul', { class: 'refs' }, ...[...TB_REFS, ...APPROACH_REFS].map((r) => h('li', {}, r.citation, ' ', link(r.url, r.url.includes('doi.org') ? 'DOI' : 'Article'), ' · ',
        link(`https://pubmed.ncbi.nlm.nih.gov/${r.pmid}/`, 'PubMed'), ' · ', link(`https://pmc.ncbi.nlm.nih.gov/articles/${r.pmcid}/`, 'full text'))))),
    h('section', { class: 'card' },
      h('h2', {}, 'Definitions'),
      h('p', {}, `The definitions on the cards (${Object.keys(DEFINITIONS).length}) are the Wikipedia texts that Z-Anatomy ships with its model, under CC BY-SA 3.0, shortened to their lead section; they have not been checked against the literature.`)),
  );
  return { el, render() { /* stateless */ } };
}

function temporalCreditsPage() {
  const el = h('div', { class: 'page wrap' });
  const d = SB_MANIFEST.dataset;
  el.append(
    h('h1', {}, 'Credits and licences'),
    h('section', { class: 'card', id: 'openear' },
      h('h2', {}, 'OpenEar library'),
      h('p', {}, h('strong', {}, 'Licence: '), 'CC BY 4.0. Specimen ALPHA’s segmentations (facial nerve, chorda tympani, cochleovestibular nerve, scala tympani, scala vestibuli, malleus, incus, stapes, tympanic membrane, carotid, round window), cross-checked against EPSILON and ZETA.'),
      h('p', {}, 'Sieber D, Erfurt P, John S, Ribeiro dos Santos G, Schurzig D, Sørensen MS, Lenarz T. ', link('https://zenodo.org/records/1473724', 'Zenodo record 1473724'), '.'),
      h('p', { class: 'aside' }, 'Changes made: each segmentation meshed (smoothed, decimated), moved into this CT by the specimen’s registration, mirrored for the left ear; the cochleovestibular nerve shown as the contents of the internal acoustic meatus (it fills the canal); landmarks derived from the facial nerve’s centre line, the stapes and the round window; files converted to compressed glTF.')),
    ...(() => {
      const b = SB_MANIFEST.structures.find((x) => x.category === 'brain');
      return b ? [h('section', { class: 'card', id: 'leaddbs' },
        h('h2', {}, 'Lead-DBS template brain'),
        h('p', {}, h('strong', {}, 'Licence: '), b.licence, '. The surgical view’s brain: the MNI ICBM 2009b pial surface shipped with Lead-DBS, its lobes from the Desikan-Killiany labels and the insula from the Destrieux labels (FreeSurfer’s automatic parcellations of that template), as in the cortex section.'),
        ...b.citation.map((c, i) => h('p', { class: 'cite' }, c, ' ', link(b.citationUrls[i], 'DOI'))),
        h('p', { class: 'aside' }, 'Changes made: surfaces decimated, deformed to fit this CT, pushed clear of its bone and vessels, split by lobe (the medial wall apart), the opened, lifted and retracted shapes of the right hemisphere stored as morph targets; files converted to compressed glTF.'))] : [];
    })(),
    h('section', { class: 'card', id: 'zanatomy' },
      h('h2', {}, 'Z-Anatomy (BodyParts3D)'),
      h('p', {}, h('strong', {}, 'Licence: '), 'CC BY-SA 4.0 (Z-Anatomy), CC BY-SA 2.1 Japan (BodyParts3D). The cranial nerves’ courses (and the middle meningeal artery’s) come from the Z-Anatomy model fitted onto this CT (Skull base v2), rerouted through the CT’s foramina; the telovelar view’s cerebellum (by lobule), brainstem and fourth ventricle are Z-Anatomy’s, fitted into this CT’s posterior fossa (deformed, pushed clear of its arteries and bone, the tonsils’ retraction and the vermis’s lift stored as a morph target); the interhemispheric view’s falx is v2’s fitted one. Adapted versions stay under CC BY-SA with attribution. Definitions: Wikipedia, CC BY-SA 3.0, as shipped with Z-Anatomy.')),
    h('section', { class: 'card', id: 'totalsegmentator' },
      h('h2', {}, 'TotalSegmentator'),
      h('p', {}, 'The optic nerves, cervical internal carotid arteries and internal jugular veins are TotalSegmentator’s segmentations of this CT (tasks head_glands_cavities and headneck_bones_vessels; open models, Apache-2.0). Wasserthal J, et al. Radiol Artif Intell. 2023;5(5):e230024.')),
    h('section', { class: 'card', id: 'topbrain' },
      h('h2', {}, 'TopBrain 2025 CT angiogram'),
      h('p', {}, h('strong', {}, 'Licence: '), 'open use with the source given, non-commercial (commercial use needs the data owner’s permission; University Hospital Zurich). The bone and vessel meshes are Skull base v2’s: see its credits.'),
      h('ul', {}, ...d.attribution.map((a) => h('li', {}, a))),
      ...d.citation.map((c, i) => h('p', { class: 'cite' }, c, ' ', link(d.citationUrls[i], 'DOI')))),
    h('section', { class: 'card' },
      h('h2', {}, 'Software'),
      h('p', {}, 'three.js, zod, Vite and glTF-Transform (MIT), meshoptimizer (MIT); scikit-image, SciPy and trimesh for the build. Font: Atkinson Hyperlegible, SIL Open Font License 1.1, self-hosted. The source code is GPL-3.0.')),
  );
  return { el, render() { /* stateless */ } };
}

export function skullSourcesPage() {
  if (SB_MODEL === 'v3') return temporalSourcesPage();
  const el = h('div', { class: 'page wrap' });
  const d = SB_MANIFEST.dataset;
  const urls = [...new Set(Object.values(DEFINITIONS).map((x) => x.url).filter((u): u is string => !!u))].sort();
  el.append(
    h('h1', {}, 'Sources'),
    h('section', { class: 'card' },
      h('h2', {}, 'Anatomy'),
      SB_MODEL === 'ct'
        ? h('p', {}, 'The detailed model: ', h('a', { href: d.url, target: '_blank', rel: 'noopener' }, d.name), '. The bone is the CT’s own surface and the arteries and deep veins are the surfaces of TopBrain’s expert labels of the same scan; what a CT does not show (the cranial nerves, the dural sinuses and arteries TopBrain does not label, the soft tissue and the landmark names) comes from the Z-Anatomy model, scaled and smoothly deformed onto this skull (pipeline/skullbase_ct.py), so those positions are approximate. Nothing is placed by hand.')
        : h('p', {}, 'All geometry and every landmark come from one model: ', h('a', { href: d.url, target: '_blank', rel: 'noopener' }, d.name), '. Nothing is placed by hand. The pipeline (pipeline/skullbase_export.py) reads the model in Blender and records how each point was derived.'),
      ...d.citation.map((c, i) => h('p', { class: 'cite' }, c, ' ', h('a', { href: d.citationUrls[i], target: '_blank', rel: 'noopener' }, 'DOI'))),
      h('p', { class: 'aside' }, d.note)),
    h('section', { class: 'card' },
      h('h2', {}, 'Definitions'),
      h('p', {}, `The definitions on the cards (${Object.keys(DEFINITIONS).length}) are the Wikipedia texts that Z-Anatomy ships with its model, under CC BY-SA 3.0, shortened to their lead section. They have not been checked against the literature yet; peer-reviewed teaching notes will be added on top of them.`),
      h('details', { class: 'more' }, h('summary', {}, `Wikipedia source pages (${urls.length})`),
        h('ul', { class: 'refs' }, ...urls.map((u) => h('li', {}, h('a', { href: u, target: '_blank', rel: 'noopener' }, decodeURIComponent(u.replace(/^https?:\/\/en\.wikipedia\.org\/wiki\//, '')).replace(/_/g, ' '))))))),
    h('section', { class: 'card' },
      h('h2', {}, 'Landmarks'),
      h('p', {}, `${LANDMARKS.filter((l) => !l.how && !l.placed).length} labelled points on the cranial bones, each the point Z-Anatomy anchors to its bone (the label line’s hooked end), with the bone and part from Z-Anatomy’s anatomical hierarchy.`),
      LANDMARKS.some((l) => l.placed && l.part !== 'Floor of fourth ventricle') ? h('p', {}, `${LANDMARKS.filter((l) => l.placed && l.part !== 'Floor of fourth ventricle').length} points on the cranial floor (the clinoid processes, the sella’s parts, the petrous apex and others) are put on this CT’s bone: the clinoids and petrous apex found on the bone itself, the others the Z-Anatomy model’s points, fitted onto this CT and moved to its bone, mirrored for the side the model does not label (pipeline/skullbase_v3_floor.py; each card says how).`) : null,
      LANDMARKS.some((l) => l.part === 'Floor of fourth ventricle') ? h('p', {}, `${LANDMARKS.filter((l) => l.part === 'Floor of fourth ventricle').length} points on the floor of the fourth ventricle (the facial colliculi, the hypoglossal and vagal trigones, the vestibular areas, the median sulcus and the obex) are the Z-Anatomy model’s: Z-Anatomy does not label them, so each is put on its fitted fourth ventricle over the model’s nucleus beneath it (the abducens, hypoglossal and vagal nuclei, the vestibular nuclei), the obex at the floor’s caudal tip, and carried into this CT with the ventricle (pipeline/skullbase_v3_rhomboid.py; each card says how).`) : null,
      SB_MODEL === 'ct' ? null : [
        h('p', {}, `${LANDMARKS.filter((l) => l.how).length} more points (both sides) mark foramina Z-Anatomy does not label: each is located where the nerves or vessels that pass through it cross the bone (pipeline/skullbase_foramina.py; the rule is on its card). What passes through each comes from these open-access sources:`),
        h('ul', { class: 'refs' }, ...FORAMEN_REFS.map((r) => h('li', {}, r.citation, ' ', h('a', { href: r.url, target: '_blank', rel: 'noopener' }, 'DOI')))),
      ]),
  );
  return { el, render() { /* stateless */ } };
}

export function skullCreditsPage() {
  if (SB_MODEL === 'v3') return temporalCreditsPage();
  const el = h('div', { class: 'page wrap' });
  const d = SB_MANIFEST.dataset;
  el.append(
    h('h1', {}, 'Credits and licences'),
    h('section', { class: 'card', id: 'zanatomy' },
      h('h2', {}, d.name),
      h('p', {}, h('strong', {}, 'Licence: '), d.licence, SB_MODEL === 'ct'
        ? '. These files are not under the GPL like the project’s code: the TopBrain-derived parts may be used non-commercially with the source given (commercial use needs the data owner’s permission); the Z-Anatomy-derived parts stay under CC BY-SA with attribution.'
        : '. These files are not under the GPL like the project’s code: adapted versions must stay under CC BY-SA with attribution.'),
      h('p', {}, 'Attribution, as the authors ask:'),
      h('ul', {}, ...d.attribution.map((a) => h('li', {}, a))),
      h('p', { class: 'aside' }, 'Authors of the original model: Kousaku Okubo (BodyParts3D); Gauthier Kervyn (Z-Anatomy design, 3D, anatomy); Marcin Zielinski (Blender add-on); Lluis Vinent (Unity development).'),
      SB_MODEL === 'ct' ? h('p', { class: 'aside' }, 'Detailed model, changes made: the bone surface taken from the TopBrain CT angiogram (case 011) at 400 HU (thin bone down to 170 HU where it adjoins that bone, so partial volume does not open holes in it) within TotalSegmentator’s skull mask, with the walls of the air sinuses added as a thin shell (bone thinner than a voxel next to air, such as the sellar floor, falls below any threshold), the facial bones (cut off by the scan) left out, smoothed, decimated and named bone by bone after the fitted Z-Anatomy model; the TopBrain vessel labels meshed; the CT turned rigidly into the Z-Anatomy model’s frame; the Z-Anatomy nerves, the vessels TopBrain does not label, the soft tissue and the landmarks scaled and smoothly deformed onto this skull. Data source: TopBrain 2025 challenge, University Hospital Zurich (https://zenodo.org/records/16878417).') : '',
      h('p', { class: 'aside' }, 'Changes made: bones, soft tissue, vessels and cranial nerves of the head exported from the Z-Anatomy Blender file; coordinates converted to millimetres from the hypophysial fossa landmark (patient right, anterior, superior); midline structures cut at the midline; bones smoothed by one subdivision level, decimated and shaded with baked ambient occlusion; vessels and nerves rebuilt as tubes around their centre lines with Z-Anatomy’s modelled radius (at least 0.3 mm) and cropped to the head; files converted to compressed glTF; definitions shortened to their lead section.'),
      ...d.citation.map((c, i) => h('p', { class: 'cite' }, c, ' ', h('a', { href: d.citationUrls[i], target: '_blank', rel: 'noopener' }, 'DOI'))),
      h('p', {}, h('a', { href: d.url, target: '_blank', rel: 'noopener' }, 'Z-Anatomy repository'))),
    h('section', { class: 'card' },
      h('h2', {}, 'Software'),
      h('p', {}, 'three.js, zod, Vite and glTF-Transform (MIT), meshoptimizer (MIT); Blender (GPL) to read the model during the build. Font: Atkinson Hyperlegible, SIL Open Font License 1.1, self-hosted. The source code is GPL-3.0.')),
  );
  return { el, render() { /* stateless */ } };
}
