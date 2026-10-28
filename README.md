# Open Neuroanatomy Atlas

Interactive 3D neuroanatomy for teaching, built from published atlases in MNI space. Sections:

- **Cortical anatomy** (`cortex/`): described below.
- **White-matter tracts** (`tracts/`): described below.
- **Skull base** (`skullbase/`), with its earlier versions **Skull base v1** (`skullbase-v1/`) and **Skull base v2** (`skullbase-ct/`) under Alternative versions: described below.
- **Brainstem** (`brainstem/`): described below.
- **Ventricles** (`ventricles/`): described below.
- **DBS targets** (`dbs/`): described below.
- **Spine** (`spine/`): described below.

The home page (`index.html`) links the sections; they share the viewer, the anatomy pipeline,
the design and the Settings. The project name and section list live in `src/brand.ts`.

## DBS targets

An interactive 3D atlas of deep brain stimulation targets for movement disorders. Pick an
indication or a symptom: the involved nuclei light up, unrelated nuclei ghost, the tracts
thought to carry the effect appear as streamlines, the connected cortex lights up on a
translucent brain, and the camera moves to a view of the target.

**Teaching tool, not surgical planning software.** All geometry is group-level atlas anatomy
in MNI ICBM 2009b nonlinear asymmetric space. Individual anatomy varies.

- Static site: Vite + TypeScript + three.js. No backend, no runtime requests to other hosts.
- Content (targets, rationale, evidence, imaging, calculator, references) is ported verbatim
  from the original teaching page (`source/dbs-targets.html`); tests check it is word-for-word.
- **Epilepsy** is a researched addition (`src/data/epilepsy.ts`), not part of the original page:
  ANT for focal seizures, CM for generalized seizures, hippocampus for temporal lobe seizures.
  Each sentence is checked against the cited paper's PubMed abstract; its 14 references sit under
  their own "Epilepsy" topic, and tests keep them separate from the original content.
- Geometry comes from published atlases distributed with Lead-DBS through an offline Python
  pipeline (`pipeline/`). Nothing is hand-modelled and no coordinate is typed by hand.

## White-matter tracts

Tracts from the HCP-1065 population-averaged tractography atlas (Yeh 2022), in two separate sets:

- **Core** (15): the tracts that matter most in tumour and epilepsy surgery: arcuate fasciculus,
  SLF I–III, IFOF, ILF, uncinate fasciculus, frontal aslant tract, cingulum (dorsal and
  parahippocampal), fornix, optic radiation, corticospinal and corticobulbar tracts, corpus callosum.
- **Extended** (12): middle longitudinal fasciculus, temporo-parietal aslant tract, vertical
  occipital fasciculus, extreme capsule fasciculus, anterior commissure, anterior / superior /
  posterior thalamic radiations, acoustic radiation, corticostriatal tracts (anterior, superior,
  posterior). Their cards are shorter where the literature is thin.
- **Posterior fossa** (9): superior, middle and inferior cerebellar peduncles, dentato-rubro-thalamic
  tract, medial lemniscus, reticulospinal tract, frontal / parietal / occipital corticopontine
  tracts. Cranial nerves are left for a future skull-base section.

- A switch at the top of the panel picks Core, Extended or Posterior fossa; each set has its own
  groups **by function** ("All" first; core: language, vision, motor and speech initiation,
  memory/emotion/social cognition; extended: language and hearing; posterior fossa: cerebro-cerebellar
  loop) and **by anatomy** (core: SLF–arcuate complex, association, projection, commissural;
  extended: posterior ventral system, thalamic radiations, anterior commissure, corticostriatal;
  posterior fossa: cerebellar peduncles, brainstem long tracts). Each group opens on its own hemisphere and view (language:
  left lateral; SLF complex: right).
- The fornix card also reports a pipeline check: near the hypothalamus this atlas's fornix lies
  about 3 mm from the independent fornix label used in the DBS section.
- Each **tract card** gives course, connections, function, effects of damage and stimulation,
  surgical relevance and notes on the atlas version of the tract. Every sentence cites a paper
  retrieved from PubMed and was checked against its abstract or open-access full text
  (`src/tracts/content.ts`, `src/tracts/references.ts`). Nothing is written from memory.
- **Cortical connections measured in the atlas**: the Brodmann areas each tract reached in at
  least 95% of the 1065 subjects, straight from the published tract-to-region table.
- Same viewer as the DBS section: slices (T1/T2/PD), cut-away, labels, legend highlight, measure,
  shareable links. Camera presets: lateral and medial (relative to the shown hemisphere), coronal,
  axial, posterior-oblique.
- The tracts are CC BY-SA 4.0 (not GPL) and derived from HCP data; see Licence below.
- Keyboard: `1`–`5` camera, `H` hemisphere, `[` `]` previous/next tract, `N` labels, `S` axial
  slice, `M` measure, `Esc` close, `?` help.

## Skull base

Three models of the skull base share the section's page and switch between each other on its **Model** chips
(the same view opens in the other model where it has it). The default (`skullbase/`) is a real CT with its anatomy
made to fit it; its two earlier versions stay available under **Alternative versions** on the home page and in the
section menu: Skull base v1 (`skullbase-v1/`, the Z-Anatomy model) and Skull base v2 (`skullbase-ct/`, the CT with the
Z-Anatomy anatomy fitted onto it).

### The default model (`skullbase/`): the CT with its anatomy made to fit it

The section's default ("Skull base" on the home page, first on the **Model** chips; the pipeline and its files call it
v3): Skull base v2's CT (its TopBrain vessel meshes reused; its bone completed, below) with a real ear's contents
inside each temporal bone. A CT does not show the nerves and this one blurs
the canals, so the contents come from the OpenEar library (Sieber et al. 2019, CC BY 4.0): eight cadaver temporal
bones, cone-beam CT and micro-slicing, segmented at 0.125 mm. `pipeline/fetch_openear.py` reads only the bone and label
volumes from the 4–14 GB Zenodo zips (HTTP ranges) and pins their hashes.

- **The skull, completed** (`pipeline/skullbase_v3_skull.py`): the angiogram is a box that cuts off the front of the
  forehead, the lower maxillae and parts of the vault, and resolves the thin facial bones only in pieces (v2 leaves the
  face out). v3 draws every bone of the Z-Anatomy model: the CT's bone where the scan reaches, the fitted model beyond
  it, and the face (maxillae, zygomatic, nasal, lacrimal and palatine bones, vomer, inferior conchae) from the model
  throughout. The model's face is fitted again on its own onto the CT's facial bone (pairs both ways, an affine map held
  close to a rotation), the whole model again near the scan's edge; then one bone field (the CT inside, the model
  beyond, blended over the last 6 mm inside the edge, the face blended in across the sutures over 1.5 mm, all voxels
  softened by about one voxel so gently sloping surfaces show no grid steps) gives one surface, split into bones as v2
  splits it. On the skull's outer surface, v2's rule-drawn walls around enclosed air (they made ridges and a shelf over
  the frontal sinus) and the CT's bone within 5 mm of them give way to the model too. The craniotomies are cut out of it. Each bone's card says how much of it is the model. No mandible.
- **Registration** (`pipeline/skullbase_v3.py`): each specimen's bone, blurred to the CT's resolution, is matched to
  the CT's bone within 14 mm of the labyrinth by a similarity transform (1500 rotations, as is and mirrored, then a
  local optimisation of the best twelve), started from the labyrinth picked by hand on the CT's slices. Specimen ALPHA
  fits both ears best (bone correlation 0.72 right, 0.66 left, scale 0.99 and 0.95; the left is ALPHA mirrored), and
  its structures follow the transform: facial nerve, chorda tympani, the contents of the internal acoustic meatus,
  scala tympani, scala vestibuli with the vestibule and semicircular canals, ossicles, tympanic membrane and petrous
  carotid. Checks independent of the fit: on the CT, the meatus' contents fall on fluid (about 60 HU) and the carotid on
  its contrast-filled lumen (about 280 HU). EPSILON and ZETA, registered the same way, put the geniculate ganglion within
  0.9–1.5 mm and the oval window within 0.6 mm of ALPHA's (ZETA's left fit fails and is left out).
- **Landmarks** from the carried-over structures: the fundus of the meatus, the geniculate ganglion (the facial nerve's
  sharpest turn), the second genu (half way between its tympanic and mastoid directions), the oval and round windows
  and the CT's bone surface over the superior semicircular canal. Measured on the model and shown on the cards next to
  the published values: the facial nerve's segments (tympanic 10.7–11.0 mm, mastoid 14.0–14.7 mm, second genu 120°),
  the geniculate ganglion's distance to the cochlea and to the superior canal.
- **Drawn by rule**: the greater petrosal nerve, from the geniculate ganglion forwards and medially along the CT's
  middle fossa floor, kept 1 mm clear of the carotid, for its published mean length (Nguyen 2026).
- **The rest of the skull base** (`pipeline/skullbase_v3_base.py`, `pipeline/skullbase_nerves.py`): the cranial nerves
  I–XII are routed through this CT: from the fitted Z-Anatomy course of Skull base v2 (where each leaves the brainstem,
  which way it runs), the least-cost path near that course that cannot cross the model's bone except through an
  opening (bone costs 60 times more, so a canal the 0.5 mm mask closes with a voxel of blurred bone can still be
  passed; at most 1.2 mm is). Each nerve thus leaves the skull through this CT's own foramen; VII and VIII run to the
  registered ear's internal acoustic meatus. The optic nerves follow TotalSegmentator's segmentation of them
  (`head_glands_cavities`, 0.2 mm apart). Foramina are located from the routes (the first stretch where a nerve is
  mostly surrounded by bone; the superior orbital fissure where III, IV, V1 and VI run closest together; the jugular
  foramen from IX–XI), from the cranial floor's through-holes seen from above (foramen lacerum, foramen magnum) and
  from TotalSegmentator's carotid (`headneck_bones_vessels`: the carotid canal's outer opening). Checks: the mandibular
  nerve's foramen lies 1.2–1.4 mm from the floor's own foramen ovale holes; IX–XI pass 3–5.5 mm from the jugular bulb.
  The sigmoid and transverse sinuses are traced through the CT's enhanced lumen (84–92 % of the trace at least 1.5 mm
  inside it), the middle meningeal artery routed through the foramen spinosum; the cervical carotids and jugular veins
  are TotalSegmentator's. The nerves' cisternal courses stay approximate (the brainstem is not in the CT); near the
  brainstem they follow the posterior fossa fit's deformation (in full within 6 mm of the fitted cerebellum and
  brainstem, none beyond 16 mm), so they leave the brainstem where it is drawn. The fitted anterior inferior and
  superior cerebellar arteries are carried the same way and then kept just outside the fitted cerebellum and brainstem.
- **The trigeminal complex**, drawn by rule (Chaware 2023, 80 sides): each division leaves the ganglion its mean
  intracranial length before its foramen as located on this CT (V1 27.4 mm to the superior orbital fissure, V2 11.2 mm
  to the foramen rotundum, V3 4.5 mm to the foramen ovale); the ganglion is the crescent through those origins, as wide
  as the published mean, kept off bone (Meckel's cave landmark at its middle), and the sensory root runs from the side
  of the fitted pons to it. The fitted model's own divisions began 18–19 mm away, medial of this skull's foramina.
- **Arteries**: TopBrain's expert labels for the circle of Willis and its large branches; this patient's carotid
  through the carotid canal and foramen lacerum traced through its contrast-filled lumen (97–100 % of the trace at
  least 1.5 mm inside it, a median 2.1–2.3 mm from the registered specimen's carotid, which only guides it), so the
  carotid runs continuously from TotalSegmentator's cervical segment to TopBrain's cavernous one. Branches this CT
  cannot show (lateral striate and pontine branches, anterior spinal artery) are the fitted Z-Anatomy branches moved to
  start on this patient's own parent vessel; the ethmoidal arteries and the accessory meningeal branch are routed from
  it through the CT's openings; all marked approximate.
- **The surgical views** (Surgical views: "Pterional transsylvian approach", "Lateral supraorbital approach",
  "Interhemispheric transcallosal approach", "Telovelar approach", "Retrosigmoid approach"). The
  lateral supraorbital (LSO) craniotomy is a frontolateral flap over the orbital roof with one burr hole posteriorly below
  the temporal line, cut down to the anterior fossa floor and kept to the frontal bone (Cha 2012, Choque-Velasquez 2018),
  its outline placed by hand and drawn wider than the mean LSO (about 1450 against 1275 mm², Cha 2012) to show the
  anatomy; it shares the brain and its two sliders. The right pterional craniotomy is
  cut out of the CT's own bone (`pipeline/skullbase_v3_approach.py`: burr holes placed from the fitted landmarks as
  Yilmaz 2025 and Sevgi 2026 describe, the skull's thickness removed inside their outline, the lateral sphenoid ridge
  drilled). A cut never bridges the cranial cavity into the floor beyond it. Each cut bone keeps v2's own mesh except
  within 3 mm of the cut, where the cut mask's surface (meshed as v2 meshes the skull) takes over, each new face going
  to the bone of the nearest v2 face, so the cut bones meet their untouched neighbours without gaps. A template brain, the Lead-DBS MNI 2009b pial surface
  of the cortex section, is fitted into this CT (`pipeline/skullbase_brain.py`, `pipeline/brain_deform.py`): a smooth
  deformation (affine, then Gaussian radial basis functions from 18 to 5 mm, a penalty against folding) puts its hull
  2 mm inside the CT's cranial cavity, every artery TopBrain labels outside the cortex, the M2 segments on the insula
  and the M3 segments in the Sylvian fissure (medians 1.0 and 1.1 mm on the right); what still touches bone or a vessel,
  or lies across the falx, is pushed clear (as-rigid-as-possible surface deformation; off the falx sideways, the falx
  taken as a height field over the sagittal plane). The slider opens the right Sylvian fissure: a shape
  deformation (ARAP, facing sulcal banks held together, cortex against the inner table held, the insula fixed) that
  lifts the frontal and parietal lips and lowers the temporal one by 6 mm each (illustrative), stored as morph
  target 0. A second slider (morph target 1, solved on top of the opening) lifts the frontal lobe off the orbital roof
  by 8 mm (illustrative) along a corridor from the anterior clinoid process forward to the frontal pole, the front of the insula
  with it, to look under it at the carotid and the optic nerve. The M2 and M3 branches stay where the CT shows them except on cortex moved on
  purpose: the frontal and parietal opercula when the fissure opens, the frontal lobe and insula when they are lifted. The cards cite open-access sources on the
  craniotomy, the fissure's dissection, the middle cerebral artery's segments and the insula
  (`src/skullbase/approaches.ts`).
  The interhemispheric view cuts a right parasagittal flap at the coronal suture (from 40 mm in front of bregma to 20 mm
  behind it, 40 mm wide: illustrative; Nair 2016, Symss 2014) and shows both hemispheres with v2's fitted falx; its
  slider holds the right hemisphere off the falx by 8 mm (illustrative) over the craniotomy's length, only above the
  corpus callosum (the template's medial wall, drawn apart, stays). The shift falls off with distance from the midline
  more slowly than 1 mm per mm, so the surface cannot fold. The arteries stay where the CT shows them: this CT labels a
  right A3 and a third anterior cerebral artery arising at the anterior communicating artery (the accessory or median
  artery of Chrissicopoulos 2024 and Triantafyllou 2025), no left A3.
  The telovelar view cuts a midline suboccipital flap from below the internal occipital protuberance through the
  posterior rim of the foramen magnum (C1 left, Cho 2024). The cerebellum by lobule, the brainstem and the fourth
  ventricle are Z-Anatomy's (`pipeline/skullbase_pfossa_export.py`), carried onto the CT by v2's fit
  (`skullbase_ct.py` writes them) and fitted again into its posterior fossa (`pipeline/skullbase_pfossa.py`: the hull
  inside the cavity behind the petrous bones, this patient's basilar, vertebral, superior and posterior inferior
  cerebellar arteries outside, the tentorium above, no folding; then what still touches an artery or bone pushed
  clear). Its slider draws both tonsils 6 mm apart and lifts the nodule and uvula 5 mm up and back (illustrative), the
  rest of the cerebellum following less with distance (each shift under 1 mm per mm together, so nothing folds),
  opening the cerebellomedullary fissure onto the fourth ventricle; sources: Pettersson 2023, Wang 2023, Liu 2014,
  Longatti 2026, Cho 2024, Pantu 2026, Cavalheiro 2015.
  The retrosigmoid view cuts a right craniotomy whose upper edge runs 28 mm along the transverse sinus' lower margin and
  whose front edge runs 35 mm along the sigmoid sinus' posterior margin (Jian 2021: the window's margins against them),
  straight edges behind and below closing it, its corners rounded: drawn by hand, larger than Jian's keyhole (18-20 x
  20-25 mm) to show the anatomy, about the size of Tang 2025's craniotomies (a mean 3.8 cm); the sinuses are this patient's own (traced through the CT's lumen;
  `skullbase_v3.py` writes them to `sinuses.json`), and the keypoint is where the two margins meet (Jian 2021, 2022,
  2024). Its slider draws the right cerebellar hemisphere up to 12 mm away from the corridor
  from the internal acoustic meatus out through the opening along the back of the petrous bone (illustrative; 12/40 mm
  per mm, so nothing folds), clearing it. The anterior inferior cerebellar artery, which this angiogram does not label,
  is the Z-Anatomy model's, carried by the skull's fit (`skullbase_v3_skull.py`) and its origin moved onto this
  patient's basilar artery (approximate). Sources: Jian 2021, 2022, 2024, Hu 2023, Choque-Velasquez 2018 (abstract),
  Hamelinck 2024, Meybodi 2023, Jeican 2026, Basamh 2020, Watanabe 2013, Tang 2025, Przepiorka 2023, Aftahy 2024.
  Pipeline: `pipeline/skullbase_v3_approach.py`, then `pipeline/skullbase_brain.py` (it reads the interhemispheric
  craniotomy's span) and `pipeline/skullbase_pfossa.py`, before `pipeline/skullbase_v3.py` (it takes their items);
  the fits are cached in `pipeline/data/build/skullbase-v3/`.
- **The endoscopic endonasal (transsphenoidal) view** (`pipeline/skullbase_v3_endonasal.py`,
  `src/skullbase/endonasal.ts`, `src/ui/skullbase-endonasal.ts`): a 0° endoscope through one nostril into the sphenoid
  sinus, the way opened step by step, onto the hypophysis. The CT around the sphenoid is cropped to fields on a 0.5-mm grid
  (`public/assets/skullbase-v3/endonasal.bin.gz`): the bone as v2/v3 draw it, what is not air (its surface is the
  lining the scope sees: the CT at −400 HU, never less than the bone, holes in walls thinner than a voxel closed), the CT
  (to colour the lining and the cut), and the distances to what the burr must not enter: TopBrain's arteries, the optic
  nerves (TotalSegmentator) and chiasm, nerves III–VI as routed through this CT, the fitted pituitary and cavernous
  sinuses and the fitted brain (these only where the CT shows soft tissue). The scan reaches only the back of the
  nasal cavity: the scope starts there. Its way through each side of the nose is the path along TotalSegmentator's
  nasal cavity with the most room, to the last air before the sinus (at its natural ostium on this CT); the CT's
  passages being narrower than a 4-mm scope, a corridor 4 mm across is opened along it (the turbinates and mucosa
  pushed aside: a drawing choice), stopping short of the sinus's front wall. From near the corridor's end the scope goes
  straight on the way it looks, as far as it has a 2.5-mm clear core, so drilling where it looks (a round 3-mm burr,
  swept as a sphere: it widens a hole narrower than itself before passing) opens its way into the sinus and on to the
  sella (the burr is offered once the sinus's septa are taken away, for what the steps do not take; it goes right down
  onto the arteries' wall, never into their lumen, an exercise in anatomy, the wall laid bare drawn red, and stops
  0.3 mm short of the nerves, the hypophysis and the brain). Step by step, six pieces are taken away by clicking
  them in the scope's view, or toggled in a list (clicked again, put back): the sinus's front wall, its septa, the sellar floor, the dura over the sella, the tuberculum and planum and the upper clivus, each
  a region of smooth conditions on this CT (distances to the nose's and the sinus's air, to the hypophysis, planes about
  the midline) stored as a label and a level so that its cut surfaces are smooth; the sellar floor, planum and clivus
  take only bone and its mucosa, and every piece keeps clear of the carotids and nerves (drawing choices, not measured
  extents). In the scope's view a drag turns the scope and the wheel moves it in and out. X-ray vision draws the
  carotids, the optic nerves and chiasm, the hypophysis, the cavernous sinuses, nerves III-VI or the basilar artery
  over the scope's view, see-through, whatever lies in front of them; the dura over the sella is drawn grey-blue.
  The hypophysis is modelled in this CT's own fossa (it replaces v2's fitted pituitary in v3): what is not bone there,
  1 mm inside the bone (the dura), under the diaphragma sellae taken as the plane from the tuberculum's back to the
  dorsum's top, its upper surface slightly concave, within about 6 mm of the midline and clear of the carotids; on this
  CT 12.5 x 10 x 5.5 mm (Paudel 2025: 12.3 x 9.4 x 5.4 mm at 21-30 years). Its posterior lobe and stalk are drawn by
  rule. Opening the dura shows it to the scope, coloured as the lobes look (rendering choices). Sources added: Paudel
  2025, Singh 2018, Yohannan 2015. The view is the ventricles'
  endoscope (`src/viewer/endoscope.ts`), its walls meshed by surface nets in chunks (`src/viewer/surfacenets.ts`,
  shared with the spine's drilling). Measured on this CT: the sinus's volume and how far back it reaches, the
  carotids' distance through the sella. Sources: Solari 2012, van Lindert 2010, Famurewa 2018, Nguyen 2026 (the
  ostium). The pipeline also carries v2's fitted pituitary, cavernous and intercavernous sinuses and chiasm into v3's
  manifest; run it after `pipeline/skullbase_v3.py`.
- Cards cite open-access sources checked against their full texts (`src/skullbase/temporal.ts`): Gupta 2013,
  Kalaiarasi 2018, Nguyen 2026, García-Barrios 2021, Sieber 2019.
- Pipeline: `pipeline/fetch_openear.py volumes`, `pipeline/skullbase_ct.py` (writes the frame and the bone grid),
  TotalSegmentator's `head_glands_cavities` and `headneck_bones_vessels` on the CT (into
  `pipeline/data/build/skullbase-ct/ts/`), then `pipeline/skullbase_v3.py`, `node pipeline/compress.mjs skullbase-v3`,
  `pipeline/skullbase_v3.py finalize`.

### Skull base v1: the Z-Anatomy model (`skullbase-v1/`)

The cranial bones, cranial nerves I–XII, the main intracranial arteries and the dural sinuses from the
Z-Anatomy model (based on BodyParts3D: one adult male, CC BY-SA), in their own space: millimetres from the
model's hypophysial fossa landmark. Not MNI and not registered to the other sections.

- **Cranial floor** view with a cut-away height (the calvaria lifted off), from above or below.
- **Regions**: everything of the model within 15 mm of the hypophysial fossa, optic canal, petrous apex and
  foramen ovale (25 mm around the foramen magnum), measured, with the distance on each item.
- Vessels and nerves are tubes with the calibre Z-Anatomy models (its curve bevel; modelled, not measured).
  Each can be shown or hidden on its own; the cranial nerves are listed I–XII with their branches. The trigeminal
  nerve is drawn as its trunk and three divisions (V1–V3, each with its branches merged in), and the chorda tympani
  with the facial nerve; selecting a nerve's trunk highlights all of it.
- Arteries are limited to those kept for skull-base teaching (an editorial selection, `ARTERY_SYSTEMS` in
  `pipeline/skullbase_build.py`): internal carotid with ophthalmic and posterior communicating, anterior (with the
  anterior communicating, pericallosal, callosomarginal and orbitofrontal branches), middle (M1–M3, lenticulostriate
  and its cortical branches) and posterior cerebral, vertebral with PICA and anterior spinal, basilar with AICA, SCA and
  pontine branches, middle meningeal and ethmoidal arteries, and the maxillary artery with the sphenopalatine
  branches and the artery of the pterygoid canal (endoscopic endonasal landmarks). The panel and legend list them by
  system.
- Bones are smoothed by one subdivision level (then decimated) and shaded with baked ambient occlusion. The
  geometry is Z-Anatomy's simplified BodyParts3D model: finer open skull models were checked (BodyParts3D's own
  release, the SPL head and neck atlas, MUG500+ CT skulls) and are either no finer, unlabelled or too noisy.
- **Systems**: cranial nerves, arteries, veins and dural sinuses. **Bones**: each with the landmarks
  Z-Anatomy labels on it (126 in all: foramina, canals, clinoids, sella, grooves...).
- Landmarks are the points Z-Anatomy anchors to each bone (the label line's hooked end), checked against the
  bone surface (0–4 mm; opening centres such as the foramen magnum further).
- Foramina the model does not label are located on both sides from where what passes through them crosses the bone
  (`pipeline/skullbase_foramina.py`: rays cast across each nerve or vessel show where bone encloses it): the internal
  acoustic meatus (VII, VIII entering the temporal bone), stylomastoid foramen (VII leaving it), jugular foramen (the
  passage of IX–XI), superior orbital fissure (where III, IV, V1 and VI bundle at the orbital apex), the carotid canal's
  external and internal openings (the carotid's passage through the temporal bone), the foramen lacerum (just below
  and beyond the canal's internal opening) and the cribriform plate (the olfactory filaments' passage). Each card says
  how its point was found and what passes through it (Romano 2019, Muslu 2025). The first model only: on the detailed
  model the fitted nerves and carotid do not follow the CT's own canals closely enough. Not shown yet: the clivus.
- **All bones**: every bone with all its landmarks at once, next to the single-bone views.
- Cards show the Wikipedia definition that Z-Anatomy ships (CC BY-SA 3.0, with its source link), labelled as
  such; peer-reviewed teaching notes are still to come.
- Pipeline: `pipeline/skullbase_export.py` runs inside Blender (installed under `.tools/`, or set `BLENDER`) and
  `pipeline/skullbase_build.py` writes the assets and checks sides, symmetry and landmark distances.

### Skull base v2: the detailed model (`skullbase-ct/`)

The second version, under Alternative versions on the home page ("Skull base v2"), to compare with the others, and switched to from either page's **Model** chips (the same view opens in the other model):
one head CT angiogram of the TopBrain 2025 release (case `topcow_ct_011`, 0.5 mm isotropic; University Hospital
Zurich, open use with the source given, non-commercial), fetched member by member from the Zenodo zip.

- **Bone**: the CT's own surface (400 HU; thin bone down to 170 HU where it adjoins that bone, so partial volume
  does not open holes in the orbital roofs and wings), outside the labelled vessels and within TotalSegmentator's
  skull mask; named bone by bone after the nearest bone of the fitted Z-Anatomy model. The cranial bones only: the
  scan cuts the face off. Where bone is thinner than a voxel next to air (the sellar floor over the sphenoid sinus, the
  sinus septa) its HU is averaged with the air and no threshold finds it, so the walls of the air enclosed in the skull
  (sinuses and air cells, told from outside air by closing their narrow openings, and grown back only within the head,
  so the thin air around the scalp does not give the skin a wall) are added as a 1 mm shell; the fit
  to Z-Anatomy uses the bone without these walls. The orbital roofs are thinner still in places (under 200 HU, some
  under 100), leaving holes that look from the cranial cavity into the orbit; these are closed by rule
  (`fill_orbital_roofs`): over each orbit, where a column has no bone under the cavity, a 1 mm plate at the roof's
  height interpolated from the columns around (about 80 mm² on each side).
- **Arteries and deep veins**: the surfaces of TopBrain's expert labels of the same scan (ICA, ACA A1–A3, ACom,
  MCA M1–M3, PCom, PCA P1–P4, VA, BA, SCA, PICA, ophthalmic; vein of Galen, straight and superior sagittal sinuses,
  internal cerebral and basal veins). Vessels this patient does not have (here the anterior choroidal and AICA) are
  left out.
- **Fitted from Z-Anatomy** (cards say "approximate position"): the cranial nerves, the dural sinuses and
  arteries TopBrain does not label (middle meningeal, maxillary, ethmoidal...), the soft tissue and the landmark
  names. Z-Anatomy is scaled onto the CT skull by ICP, then deformed by a smooth field (Gaussian-weighted
  closest-point moves, 24 → 6 mm): its bone ends a median 1.5 mm (90% within 3.6 mm) from the CT's.
- The CT is moved rigidly (true size) into the Z-Anatomy frame, origin at the fitted hypophysial fossa, so the
  groups, cut-aways and cameras work unchanged. Pipeline: `pipeline/skullbase_ct.py`, then
  `pipeline/skullbase_build.py ct`, `node pipeline/compress.mjs skullbase-ct`, `pipeline/skullbase_build.py ct finalize`.

## Brainstem

The midbrain, pons and medulla in MNI space (ICBM 2009b), with what lies on and in them, and the published safe
entry zones for brainstem surgery.

- **Anatomy**: the Z-Anatomy model's brainstem (its surface features: crus, colliculi, olive, pyramid, medial
  geniculate body), the aqueduct and fourth ventricle, the cranial nerve nuclei the model has (all but the trigeminal
  nuclei), cranial nerves III–XII and the vertebrobasilar arteries next to the brainstem. Fitted into MNI space by
  `pipeline/brainstem_fit.py`: the ICBM 2009b T2 template, averaged with its mirror image, gives the tissue–fluid
  boundary (cisterns, aqueduct, fourth ventricle); the model's brainstem and ventricle walls are matched to it where
  their normals agree, by a similarity transform kept on the midline (pitch, shift, one scale) and then a smooth,
  left–right symmetric deformation. The matched surface lies a median 0.8 mm (90 % within 2.6 mm) from the
  template's boundary, and 98.5 % of the HCP-1065 corticospinal tract's points between z −55 and −30 mm (built
  independently) lie inside the fitted pons and medulla. Nerves, arteries and the model's nuclei (simple shapes) are carried along, so the cards call
  them approximate; the model's red nucleus, for one, sits about 5 mm below the Lead-DBS one, so the red nucleus,
  substantia nigra, STN, thalamus and dentate nucleus come from the DBS section's atlases instead.
- **Ascending arousal network**: the ten brainstem nuclei of the Harvard AAN atlas 2.0 (CC0; MNI-native).
- **Tracts**: the brainstem tracts of the white-matter section (HCP-1065).
- **Safe entry zones** (15): perioculomotor (anterior mesencephalic), lateral mesencephalic sulcus, supra- and
  infracollicular; supratrigeminal and peritrigeminal; suprafacial and infrafacial triangles and the median sulcus
  on the floor of the fourth ventricle; anterolateral (preolivary) sulcus, olivary zone, postolivary sulcus, and the
  posterior median, posterior intermediate and posterolateral sulci of the medulla. Each is drawn by rule on the
  fitted surface from its published definition (the rule is on its card, with the model's measurements); the facial
  colliculus and sulcus limitans are placed by the floor proportions measured by Erginoglu et al. 2026. Zones the
  sources name without a definition that can be placed (lateral pontine zone, intercollicular region...) are listed
  as not drawn.
- **Cards**: every statement cites its source (`src/brainstem/content.ts`, `references.ts`): open-access full texts
  (Cavalheiro 2015, Rajagopal 2019, Cavalcanti 2026, Erginoglu 2026, Olchanyi 2025, Kim 2020) and abstracts
  (Cavalcanti 2016, Yagmurlu 2014, Yang 2019, Guberinic 2022, Edlow 2024). Nerve cards give each nerve's functional
  components (Kim 2020, Table 1); the model's structures also show the Wikipedia definition Z-Anatomy ships,
  labelled as such. The Brainstem Navigator atlas was not used: its licence forbids redistributing information
  derived from it.
- Pipeline: `pipeline/brainstem_export.py` (in Blender), then `pipeline/brainstem_build.py` (fit, meshes, zones,
  manifest), `node pipeline/compress.mjs brainstem`, `pipeline/brainstem_build.py finalize` (checks sides, positions,
  the fit and the zones).

## Ventricles

The ventricular system of one CT, Skull base v2's (TopBrain 2025 case 011, in its frame): the lateral ventricles, the
foramina of Monro, the third ventricle, the aqueduct and the fourth ventricle, a frontal ventriculostomy simulated
on it, and an endoscopic third ventriculostomy view with the structures around the ventricles and a hydrocephalus
shape.

- **Ventricles as the CT shows them** (`pipeline/ventricles_build.py`): in its brain window the ventricular fluid is
  darker than the brain; the fluid below 27 HU (smoothed by 1 mm), at least 10 mm inside the cranial cavity and away
  from the labelled vessels, is taken. The lateral ventricles are its largest body; the third ventricle is the body on
  the midline below and between them. This young adult's ventricles are narrow (frontal horns about 25 mm across both,
  Evans' index about 0.21), so the threshold sets their size where they are a few millimetres wide, and it misses what
  is narrower than the CT resolves: the temporal horns, the foramina of Monro, the third ventricle's floor.
- **Ventricles as drawn**: Z-Anatomy's lateral and third ventricles (`pipeline/ventricles_export.py`, run in Blender)
  fitted onto the CT's: scaled as v2 scaled the model, a similarity, then a smooth deformation in which the CT's surface
  pulls the model's (within 5 mm) and the model's is pulled onto the CT's only within 2.5 mm, so that where the CT shows
  no fluid the model stays. The CT's surface lies a median 0.8 mm from the fitted model's; along the fitted right
  temporal horn the CT is a little darker than the brain around it (its faint fluid), along the left no darker (its
  course is the model's). The drawn surface joins the CT's ventricles, the fitted model and the foramina, softened (its
  signed distance smoothed by 0.75 mm) and drawn 0.5 mm outside, the lateral ventricles kept apart at the septum, then
  split by part.
- **Foramina of Monro**: drawn by rule, a tube of the mean cross-section Jean 2019 measured (5.23 mm²) between the points
  where the fitted lateral ventricle comes closest to the fitted third ventricle, at the third ventricle's front upper
  corner (Azab 2014). The CT is about 10 HU darker along them than around them.
- **Aqueduct and fourth ventricle**: the CT shows the fourth ventricle's upper part (about 0.5 ml of fluid near the
  model's), which the fit pulls the model onto; the rest is the model's. The aqueduct, which this CT does not resolve,
  is a tube along the fitted model's course, run on into the third and fourth ventricles, of the diameters Xiao 2025
  measured (1.98 mm leaving the third ventricle, 1.27 mm at the narrowest, put midway, 2.49 mm into the fourth): the
  drawn ventricles are one cavity, checked by the build.
- **Kocher's point and the trajectories**: the coronal suture where the CT's frontal and parietal bones meet; Kocher's
  point 10 mm in front of it along the outer table, 25 mm (Chen 2025) or 30 mm (Park 2020) from the midline, and 10 mm
  further forward or back for comparison; the external acoustic meatus where each ear canal, the shortest way through
  air from the registered tympanic membrane to outside, leaves the bone. The CT stops at the forehead, so the medial
  canthi are placed at half Chen's mean intercanthal distance and projected onto the line between the meatus, as Chen
  does. From each entry the four freehand trajectories (ipsilateral canthus, midpoint between the meatus,
  contralateral canthus, perpendicular) are followed 65 mm from the outer table (Chen: with no fluid by then the
  catheter is withdrawn and re-aimed) to the first lateral ventricle they meet: side, depth from the outer table,
  course inside, or how far they miss. The card shows that result beside the published accuracy of the same
  aim.
- **Around the ventricles** (`pipeline/ventricles_etv.py`): the fornix, septum pellucidum, choroid plexus, thalamus,
  caudate nucleus, stria terminalis, hypothalamus, mammillary bodies, optic chiasm and tracts, the commissures,
  habenula, pineal gland and corpus callosum are the Z-Anatomy model's (exported with its ventricles), carried onto
  this CT by the same fit as its ventricles. Where the CT shows the ventricles larger than the model, each is pushed
  out to the wall (along the shortest way, the pushes smoothed over it); the choroid plexus stays in the ventricles.
  The model's mammillary bodies lay about 6 mm too far forward, and are thin plates: each is drawn as a sphere where
  the model's lies, of the volume Vann 2022's growth curve gives a young adult (62 mm³, 4.9 mm across), drawn a
  little larger (5.5 mm, a display choice, so they show as the bulges an endoscopist sees), moved to da Silva 2024's
  mean (8.56 mm behind the anterior commissure along the AC–PC line), at the height of the model's floor, and the
  ventricle is drawn round them. Checks against da Silva's 200 MRIs: the infundibular recess and the basilar apex (TopBrain's
  label) lie within about one standard deviation of the published positions. The vessels (the basilar artery, P1–P2,
  posterior communicating and superior cerebellar arteries, the internal cerebral veins and the veins of Galen and
  Rosenthal) are this CT angiogram's; the oculomotor and optic nerves are routed through it and the midbrain and pons
  are the fitted model (Skull base v3).
- **Endoscopic third ventriculostomy**: the target is the midline floor halfway between the infundibular recess and
  the mammillary bodies (fenestrated behind the recess, in front of the mammillary bodies and the basilar artery: da
  Silva 2024); the endoscope starts from Sousa 2025's line, from the target through the middle of the foramen of
  Monro out to the outer table. The user moves its burr hole over the skull (forwards and sideways; the scope stays
  aimed at the target, and the panel says how far its line passes from the foramen), tilts it about the burr hole,
  moves it in or out and rotates the view (A and P on the rim mark forwards and backwards). It opens at 75 % of the
  hydrocephalus shape, the burr hole 12 mm in front of Sousa's entry and tilted 2° back. Its view is drawn, not
  photographed: a 75° field through a lens with an endoscope's barrel distortion, a light at the tip falling off with
  the square of the distance (the exposure set by how near what it sees is), wet walls seen from inside, each showing
  what lies just behind it, more through the thin strip of floor between the infundibular recess and the mammillary
  bodies (which thins as the ventricles enlarge): what touches it sharp, what lies deeper blurred and bluish, fine
  capillaries on it, and the floor white and bulging over the mammillary bodies. The choroid plexus is drawn
  lobulated and glistening, raspberry red (its mesh subdivided, its surface pushed into lobules). These are rendering
  choices on the fitted shapes. Pointing at the view names what is under the pointer, and what shows through the
  wall or the floor.
- **Hydrocephalus**: a shape (morph target) on the ventricles and everything around them. At full extent the
  ventricles measure as the medians of Roşu 2026's 68 adults with hydrocephalus (Evans' index 0.42, third ventricle
  23.5 mm wide), triventricular (the aqueduct and fourth ventricle unchanged), and the floor is brought down towards
  2.75 mm from the basilar apex (Aydin 2009 as da Silva 2024 cites it; 3.3 mm as drawn, held by the left P1 segment
  that runs under it here). Each wall moves out along its normal (the septum, the
  lateral ventricles' floors and the columns of the fornix stay; the foramina of Monro grow backwards and outwards,
  from Jean 2019's 5.23 to 32.6 mm²), the walls are draped over this CT's arteries at the skull base, which do not
  move (the basilar artery and its branches, the carotids, the A1 segments; the floor comes down over the P1
  segments, not through them; and over the mammillary bodies, placed where da Silva 2024 measured them in 24 MRIs
  with hydrocephalus, 11.30 mm behind the anterior commissure, their tops 4 mm above the floor and the floor wrapped
  onto each: a modelling choice), and everything around follows a smooth field, checked not to fold (the choroid
  plexus at each foramen shifted with it towards the thalamus, its posterior border, as its tela is fixed there:
  Azab 2014),
  then is pushed out of the shaped ventricles as at rest;
  the amplitudes are found by iteration to meet those three measures. Sousa's line is recomputed with it. The drawn
  ventricles are also kept clear of this patient's internal cerebral veins (the fitted model reached over them).
- **Cards**: every statement cites its source (`src/ventricles/content.ts`, `references.ts`), checked against the
  open-access full texts: Chen 2025, Park 2020, Charcos 2025, Gangal 2026, Abdala-Vargas 2022, Azab 2014, Xiao 2025,
  Erginoglu 2026, Longatti 2026, Sousa 2025, da Silva 2024, Roşu 2026; Jean 2019 (no open full text) against its
  abstract.
- Pipeline: after `pipeline/skullbase_ct.py` and the v3 build (it uses the bone, the fitted brain and the registered
  tympanic membrane), and `pipeline/ventricles_export.py` in Blender: `pipeline/ventricles_build.py`,
  `node pipeline/compress.mjs ventricles`,
  `pipeline/ventricles_build.py finalize` (checks sizes, the model's fit, the foramina, landmark positions and every
  trajectory).

## Cortical anatomy

The 74 gyri and sulci of FreeSurfer's Destrieux 2009 parcellation (Destrieux et al. 2010) on the Lead-DBS MNI
2009b template surface, the same surface the DBS section uses.

- **Views**: lateral, medial, basal and insular. Each highlights the labels Destrieux et al. 2010 (Table 1)
  list as visible on that view; the insular view lists the insula and its circular sulcus and, on the pial
  surface, cuts away everything lateral of the insula over its outline (the opercula).
- **Pial and inflated surface**: the inflated surface is computed by smoothing the pial one, so every vertex has
  both positions and the viewer morphs between them. Shading is sulcal depth (light = crown, dark = depth).
- **Colours** by lobe (Okabe-Ito colours, checked for colour-vision deficiency), by the Destrieux atlas colours,
  or plain. A lobe filter narrows the list.
- **Function** selector: motor (M1, SMA, pre-SMA, PMd, PMv) and somatosensory (S1) areas from HMAT (Mayka 2006),
  vertex by vertex on this surface; Broca's area (pars opercularis and triangularis; Bulut 2023), Wernicke's area
  (the superior temporal gyrus behind the centre of Heschl's gyrus; Kiernan 2012, Barba 2026), V1 (calcarine sulcus
  and occipital pole; Ribeiro 2025) and A1 (Heschl's gyrus; Kiernan 2012) from the Destrieux labels, drawn over
  the labels with their areas and sources.
- **Cards**: Destrieux name and views, the Z-Anatomy/Wikipedia definition (CC BY-SA 3.0, labelled as such), and
  measured facts: lobe shares (via Desikan-Killiany, lobes as in Klein & Tourville 2012), borders, overlap with
  Desikan-Killiany regions and with the DBS section's cortical areas (HMAT motor areas, ACC, vmPFC proxy), and
  the area on the template next to the paper's mean.
- Pipeline: `pipeline/cortex_texts.py` (in Blender) reads the definition texts, `pipeline/cortex_build.py` writes
  the assets and checks them.

## Spine (craniocervical junction, cervical, thoracic, lumbar)

Surgical anatomy of the spine from one adult CT: VerSe 2020 sub-verse823 (CC BY-SA 4.0, 0.72 × 0.72 × 0.7 mm,
C1 to the pelvis), with TotalSegmentator (Apache-2.0 open tasks) run on the same CT. One subject throughout, in
its own space (mm from the centre of the L5 vertebral body), except the craniocervical junction (below).

- **Region and level selectors**: craniocervical junction, cervical (C1–C7; the region the section opens on), thoracic (T1–T12) and lumbar (L1–S1).
- **Cervical** (phase 2a): vertebrae C1–C7, discs C2–C3 to C7–T1, canal contents, canal and disc height per level;
  schematic roots C3–C8 by the cervical rule (each above the vertebra of its number, C8 between C7 and T1; Moreno
  2021), through the lower part of foramina found in planes turned 30° forwards (their size is not reported); the
  foramina transversaria C1–C7 measured, and a schematic vertebral artery from the subclavian artery through them
  (entry level inferred from their size, C6 on both sides here), behind the lateral mass of the atlas and over the
  groove on its posterior arch. The neck from TotalSegmentator (common and internal carotids, internal jugular veins,
  trachea, oesophagus, thyroid, larynx, prevertebral muscles, sternocleidomastoids) on two layers of their own,
  shown in this region only and off at first (Layers and cut, or the legend's eye, turns them on).
- **Cervical screws** (phase 2b): lateral mass screws at C3–C6 by Magerl (offered; Roy-Camille and An are kept in the
  code, not offered; Joaquim 2018) from the
  lateral mass measured on this CT (posterior face between the lamina junction, the outer edge and the facet joint
  lines; facet joint inclination), 3.5 mm and bicortical (Rathinavelu 2021), read by breach direction, not the
  pedicle-screw grade; a pedicle screw at C7 along the measured axis, beside Jiang 2024's CT values.
- **C1–C2** (phase 2c): C1 lateral mass screw (Joaquim 2020), C2 pedicle, pars and translaminar screws (Singh 2022)
  and the C1–C2 transarticular screw (checked against the atlas and axis together, the joint counted as bone), each
  from landmarks measured on this CT; the C2 isthmus height and the bone over the vertebral artery's groove beside
  the usual high-riding definition (Kucherina 2026); the C1 and C2 cards link to the skull base section.
- **Odontoid screw** (C2): one midline screw from the anteroinferior C2 body to the apex of the dens, 4 mm, through
  the apical cortex (Figà 2025; Sung 2018; González-Vargas 2026); its angles are read looking backwards and its
  breaches along its own line (front and back walls of the dens, the far cortex at the apex).
- **Craniocervical junction** (its own region): the whole-spine CT ends just above C1, so the junction comes from a
  second VerSe CT, a cervical scan reaching the clivus (sub-gl090, 0.27 × 0.27 × 1.25 mm; mm from the tip of the
  dens), shown on its own: the occipital bone around the foramen magnum, C1–C3, the canal contents. In its
  midsagittal plane the ADI, PADI, McRae's line (and the dens tip below it), BDI, BAI and the clivus–canal angle
  are measured between landmarks found automatically and compared with 500 adults' CT values (Fidan 2026); the card
  draws each on a midsagittal CT of the scan, with its range when the plane is moved up to 1 mm sideways.
  `pipeline/spine_ccj.py` (run by `spine_build.py`, or alone followed by compress and finalize).
- **Anterior approach (ACDF)** (phase 2d, cervical level card): from either side, with the carotid sheath, trachea,
  oesophagus, thyroid, larynx, prevertebral muscles and vertebral arteries shown; the approach plane, side choice,
  nerve injuries (Hasan 2025; Arumalla 2021), landmark levels and their variability (Siribumrungwong 2018;
  Alicandri-Ciufelli 2020) beside the levels the hyoid, thyroid cartilage and cricoid project to on this CT, and the
  width between the foramina transversaria per level.
- **Thoracic**: vertebrae T1–T12, discs, canal contents, schematic roots T1–T12 (from the sac level with the upper part
  of their foramen, straight out beneath the pedicle: a drawing choice) with a short intercostal course;
  canal and disc height measured per level; the foramen's size is not reported (the rib heads, not drawn, form
  part of its wall). No ribs and no ventral anatomy: the section serves the dorsal approaches.
- **Bone**: vertebrae C1–L5 from the CT's bone surface (VerSe's hand-corrected masks only assign bone to each
  vertebra; their outlines step every few slices). Sacrum (TotalSegmentator's sacrum and S1 classes) and pelvis
  from TotalSegmentator.
- **Discs** (TotalSegmentator, split by the two bones each disc touches) and the **dural sac** (TotalSegmentator's
  "spinal cord" class, which on CT follows the canal contents). The section is for the dorsal approaches: no great
  vessels, psoas or psoas zones.
- **Measured per level**: canal width, depth and area; foraminal height, antero-posterior extent and area (L1–L4
  both sides; the plane method does not capture L5–S1 in this CT); disc height.
- **Schematic, and labelled so**: roots L1–S1, each with its ganglion as one structure (sac at the disc above → lateral recess → upper part
  of the foramen; L5 and S1 exits estimated).
- **Lesion-to-root tool** (level card): paracentral, foraminal or far-lateral herniation per side; the affected root,
  its ISNCSCI key muscle, other movements and key sensory point on a leg chart.
- **Pedicles, measured beside published values** (T1–T12, L1–L5): narrowest width and height at the isthmus,
  transverse and sagittal angle, chord; published lumbar regional means (Wang 2023) and transverse angles
  (Moncada-Habib 2025, Nkwerem 2024), and the range of the thoracic study means tabulated by Verma 2020, read from
  the papers' tables by `pipeline/spine_published.py`.
- **Virtual screw** (a box of its own under the level chips, closed at first; it stays while structures are picked):
  the pedicle screw at T1–T12 (the straight-forward trajectory; the anatomic one is kept in the code; Lehman 2003;
  at the published mean transverse angle where a narrow pedicle's measured axis falls outside the study means; start size
  from the measured pedicle width and body depth by the 80% rules in Mandelka 2023), traditional trajectory and
  cortical bone trajectory at L1–L5, tricortical S1 screw, each from its published start; angles, length,
  diameter and entry adjustable; breach depth and direction against this CT's bone surface, graded after
  Gertzbein–Robbins, the screw diameter as a share of the pedicle width, and the nearest structures at risk; a cut
  along the screw. Data from `pipeline/spine_screw.py` (a bone distance field per level, loaded on demand).
- **Drilling: posterior foraminotomy or anterior discectomy (ACDF)** (a box of its own for C2–C7): the selected level and the vertebra below it are
  drilled with a round 4-mm burr held against the bone along the line of sight (its speed set by a slider: at first 4 mm a
  second in the neck and 8 in the lumbar spine, where the burr is 5 mm; drawing choices);
  the bone is this CT's own (each vertebra's field, built as its drawn surface: within 0.25 mm median of it), cut
  bone coloured by the CT's density, and where little bone is left over the dural sac, a root or the vertebral
  artery, its colour shows through. The burr's clearance to the dural sac (segmented) and to the root and the
  vertebral artery (schematic) is read out, with the bone removed from each vertebra; undo per stroke. The disc is
  not drawn while drilling. The technique notes (V-point, the medial half of the facet, under 50% resected) are from
  Zhang 2020 and Kang 2022. Data from `pipeline/spine_drill.py` (the fields per pair, 0.5–0.8 MB, loaded on demand).
  The ACDF is drilled from the front (straight on) with the disc taken out, and the two vertebrae can be drawn up to
  5 mm apart along the spine (each half the distance; Kang 2022: 2–3 mm beyond the disc's own height opened the
  foramina most); its notes (the uncovertebral joint as the lateral limit, the vertebral artery 1–2 mm beyond it) are
  from Cheung 2016 and Sugawara 2015. The foraminotomy starts straight from behind; the other bones are see-through.
- **Drilling: cervical laminectomy** (the same box, C2–C7; the level alone is drilled, the vertebra below drawn as it is),
  en bloc or piece by piece. Bone no longer joined to its vertebral body becomes a loose piece: en bloc, once troughs
  are drilled through on both sides (the panel says on which side the lamina still holds), the laminae and spinous
  process are lifted off in one piece (Chang 2014); piece by piece, a rongeur takes the spinous process off at its base
  (a fifth of the way from the canal's back wall to its tip: a drawing choice) and the laminae are drilled away (Dave
  2020 on the conventional rongeur and the burr). The ligamentum flavum is not drawn.
- **Disc herniation, while drilling a lumbar pair** (schematic; this CT has none): paracentral, foraminal or far
  lateral, left or right, a protrusion (a base wider than its depth) or an extrusion (a neck and a fragment, migrated up
  or down; Eslami 2026), its size by a slider. It grows from the disc's margin towards the zone's position measured on
  this CT (a foraminal one aimed at the exiting root in the foramen's upper part). The dural sac and the two levels'
  roots are drawn pushed out of it (the sac dented, a root shifted as a whole); where bone holds a root it is
  flattened and red, and drilling that bone away lets it go. The dural sac's cross-section at the disc is read out
  (Sobański 2023: no agreed threshold; 75–145 mm² have been used). A paracentral one is reached by retracting the dural
  sac and the traversing root medially (a slider; Berry 2019), which narrows the sac too; once a 5-mm corridor straight
  back to it is free of bone (and, paracentral, of the sac and the root) it can be taken out, the sac and the root
  returning. A central one (lumbar too) presses on the dural sac alone. `src/spine/herniation.ts` holds the geometry,
  apart from the drilling, so the lesion-to-root card can use it later.
- **Disc herniation, while drilling a cervical pair** (the same tool, C2–C3 to C7–T1): central, paracentral or foraminal
  (no far lateral: the vertebral artery's place), pressing on the dural sac (the cord and fluid together on this CT) and
  the root that exits at that disc (C6 at C5–C6, C8 at C7–T1). From behind (a foraminotomy, a laminectomy) only one
  lying clear of the sac can be taken out, through a 3-mm corridor: the cord is not retracted; from the front (an
  anterior discectomy) through the disc space, the back lips of the vertebral bodies drilled where they overhang it
  (Kang 2022 on which suits which). The cervical herniation positions are measured as the lumbar ones
  (`spine_build.py`, now for every cervical disc).
- **Drilling readouts and review**: at a foraminotomy and the lumbar decompressions, the share of each facet joint's
  bone taken (schematic: either vertebra's bone within about 4 mm of the other's, lateral to the dural sac, behind the
  bodies), cautioned at half (Kang 2022 for the neck; Li 2026 for the lumbar spine, where it is a reference: 51
  patients with more than half of the inferior articular process taken had no instability); "Bone as it was" shows the
  vertebrae before drilling as a translucent skin where bone was taken. The drill speed slider and undo work as before.
- **Drilling: open-door laminoplasty** (the same box, C2–C7, the level alone; open on the left or right): a trough
  through on the open side and one on the other leaving at most 2 mm of bone under it (standing for the inner cortex:
  a drawing choice); the door, the lamina and spinous process, then turns about a line along the vertebra's axis
  through the hinge, opened up to 60° with a slider (Mitsunaga 2012 and Cho 2026 on the technique; Wang 2018: the
  open angle averaged 40°, 20–69°, and neck pain at 6 months was commoner at 40° or more).
- **Drilling: lumbar decompressions** (L1–L5, with the vertebra below; at L5 with S1, TotalSegmentator's S1 class, the rest
  of the sacrum drawn from its sacrum class while drilling; the fields 1.4–1.7 MB): an over-the-top
  decompression (unilateral laminotomy for bilateral decompression) from the left or right, its view turned 15° to
  the approach side (Immanuel Rajan 2026), and a spinous process-splitting decompression: an osteotome (cuts drawn
  1.5 mm wide) splits the upper vertebra's spinous process in the midline and detaches its base, and the halves are
  drawn up to 12 mm apart (Ma 2025: 10–12 mm was a safe retraction in cadavers). No vertebral artery here; clearances
  are to the dural sac and the roots.
- **Dorsal approaches to a thoracic disc** (level card): transpedicular, costotransversectomy and lateral
  extracavitary, from either side: what each removes (published technique descriptions), the share of the ventral
  canal each exposed in cadavers for the level's region (Kshettry 2015), which discs suit which approach
  (Epstein 2023), the artery of Adamkiewicz as text (Taterra 2019; not drawn), and a view from the approach side
  with the vertebrae at the disc see-through.
- Pipeline: `pipeline/spine_segment.py` (TotalSegmentator in `pipeline/.venv-seg`, about an hour on Apple
  silicon for the main task), `pipeline/spine_verify.py` (TotalSegmentator's vertebrae against VerSe's: same
  labels, overlap), `pipeline/spine_build.py` + `pipeline/spine_geom.py` (meshes, measurements, schematic parts,
  validation), `pipeline/spine_screw.py` (pedicles, screw start positions, distance fields; the browser's breach
  computation is checked against its reference results), `pipeline/spine_published.py`. The spine steps read the CT
  and masks in blocks and stay under about 2.5 GB of memory; do not run them alongside TotalSegmentator on an 8 GB
  machine.

## Quick start

Requirements: Node ≥ 20. Python ≥ 3.10 only if you rebuild the anatomy.

```bash
npm install
```

```bash
npm run dev
```

The generated assets (`public/assets/`, `src/data/generated/`) are committed, so the app builds
without running the pipeline.

## Build and deploy

```bash
npm run build
```

`dist/` is a self-contained static site with a relative base path: `index.html` is the home page,
`dbs/index.html` the DBS section, `tracts/index.html` the white-matter section, `skullbase/index.html`
the skull-base section, `cortex/index.html` the cortex section; shared assets are under `assets/`. Copy it to any web server or
subfolder; the app uses hash routing, so no rewrite rules are needed. Check locally with:

```bash
npm run preview
```

### GitHub Pages

`.github/workflows/pages.yml` runs the unit tests, builds the site and publishes `dist/` to
GitHub Pages on every push to `main` (live at https://markuspolvivaara.github.io/dbs-target-atlas/, DBS section under `dbs/`).
One-time setup: repository Settings → Pages → Source: **GitHub Actions**. A run can also be started
by hand from the Actions tab ("Run workflow").

Server notes:

- Serve `.glb` as `model/gltf-binary` (most servers default to `application/octet-stream`,
  which also works).
- The T1 slice volumes (`assets/t1/*.u8.gz`) are gzip files the app decompresses itself. If your
  server adds `Content-Encoding: gzip` for `.gz` files, that works too: the app detects
  already-decoded data.
- WebGL 2 is required (all current desktop and mobile browsers).

Load budget (mobile): about 2.6 MB for the first view of the DBS section (app 0.23 MB gzip, fonts,
all nuclei, and the cortex and tracts of the default Parkinson's view) and about 3 MB for the
white-matter section's default language view (seven tracts, cortex, four orientation nuclei). Tracts and cortex load the first
time they are needed; slice images (about 3 MB per sequence) load only when a slice is switched
on or another sequence is picked.

## Using it

- **Indication / symptom chips** in the side panel (bottom sheet on phones).
- **Camera presets**: coronal (from the front), sagittal (anterior on the left), axial (from above,
  anterior up), posterior-oblique, surgeon's view (along the
  lead trajectory). The orientation disc shows R/L, A/P and S/I.
- **Hemisphere**: left, both, right.
- **Labels** (toolbar): *All* labels highlighted structures and markers with leader lines; *Hover*
  (default) labels only what you hover in the legend or select; *Off* gives clean images. Labels
  fade while the view moves.
- **Layers** tab: nuclei, tracts, cortex, targets and electrode, each with an opacity slider; name
  labels; landmarks (CST and medial lemniscus around Vim/PSA targets, the optic tract beneath GPi
  targets except in Parkinson's, the red nucleus beside STN targets); an index of every structure. The STN can be
  shown as its three zones or as one nucleus (Overview); the Parkinson's views leave out the PPN.
- **Slices** tab: axial, coronal and sagittal planes with an ICBM 2009b template drawn on them
  (choose **T1, T2 or PD**; each loads on first use), an mm
  slider, and a "Cut away" choice (nothing / patient's left half / patient's right half) that removes
  all structures on that side of the midline while the slices stay whole: one half shows the T1
  slice unobstructed, the other slice plus anatomy.
- **Lead** tab: generic quadripolar lead (1.27 mm diameter, 1.5 mm contacts, 0.5 or 1.5 mm
  spacing) on the primary target, with a depth offset (drag the lead along its axis) and an
  illustrative stimulation sphere. The sphere is not a VTA model. Contact coordinates are listed.
  Choose which part of the lead sits on the target (array centre, C0–C3 centre or tip) plus an
  offset; anchor, offset and spacing are remembered per target marker in this browser, with an
  optional default for other targets. Links carrying their own lead position override this.
- **Legend** (bottom left): the dot button shows or hides each structure, tract, cortical area or
  marker in the current view; clicking a name highlights it (tracts become opaque and thicker;
  structures solid and glowing, outlined, and shown faintly through whatever covers them) and
  opens its card. Click again or press Esc to clear. Hidden items and the highlight are part of
  the shareable link.
- **Settings** (header, every section): "Fade the rest when a structure is selected" fades
  everything else back as well (off by default; remembered in this browser). A click goes to
  what is drawn solid before anything faded, and through faded bone to what it encloses.
- **Click or tap** any structure, tract or marker for its card: role in the source content,
  indications that use it, imaging, data source, licence, centroid.
- **Readout**: MNI coordinates under the pointer plus approximate AC–PC coordinates (see below).
- **Measure**: pick two points for a distance in mm.
- **Settings** page: show or hide individual indications (for example to keep only the common
  ones for a teaching session) and pick the colour theme. Saved in the browser's local storage on
  that device; a shared link to a hidden indication still opens it. By default Holmes tremor,
  myoclonus-dystonia, tardive syndromes, Tourette syndrome and chorea are hidden ("Reset to
  default" restores this).
- **Copy link**: the URL hash holds indication, symptom, hemisphere, camera, layers, slices, lead
  and the open card, so teaching links reopen the exact view.

Keyboard: `1`–`5` camera presets, `H` hemisphere, `[` `]` indication, `,` `.` symptom,
`N` name labels, `L` lead, `S` axial slice, `M` measure, `Esc` close, `?` help.

### AC–PC coordinates (approximate)

The readout converts MNI to AC–PC with the method of Lead-DBS `tools/acpc2mni/ea_mni2acpc.m`:
the template fiducials AC (0.25, 1.298, −5.003), PC (−0.188, −24.756, −2.376) and a mid-sagittal
point (0.25, 1.298, 55) define an orthonormal frame centred on the mid-commissural point.
Lead-DBS warps these into each patient; this app does not, so the values describe the template
brain and are labelled approximate everywhere they appear.

## Project layout

```
source/dbs-targets.html     original teaching page (content source)
src/data/                   typed content, validated with zod
  references.ts indications.ts symptoms.ts targets.ts imaging.ts calculator.ts structures.ts
  schema.ts                 zod schemas for all of the above
  palette.json              colour tokens (light/dark) shared with the pipeline
  generated/                manifest.json, coordinates.json (written by the pipeline)
src/tracts/                 white-matter section: tract cards, groups, references (zod-checked),
                            URL state, scene source
src/brainstem/              brainstem section: entry-zone and nucleus content, references, groups, URL state,
                            scene source (also skullbase/, cortex/, spine/, ventricles/ for those sections)
src/viewer/                 three.js scene, loaders, materials, slices, lead, selection logic
src/ui/                     atlas pages of both sections, shared stage pieces, other pages, theme
pipeline/                   offline Python pipeline (see below)
public/assets/              compressed GLBs (wm/: white-matter tracts), T1 volumes, manifests
tests/unit/                 schema, verbatim-port, manifest, GLB-decoding, AC-PC, URL tests
tests/e2e/                  Playwright visual smoke tests (one screenshot per indication and per tract group)
scripts/check-palette.ts    WCAG contrast + colour-vision-deficiency check
```

## The anatomy pipeline

The pipeline converts source atlases into web assets in one shared space (MNI ICBM 2009b
nonlinear asymmetric, RAS millimetres).

```bash
python3 -m venv pipeline/.venv
```

```bash
pipeline/.venv/bin/pip install -r pipeline/requirements.txt
```

```bash
npm run pipeline
```

`pipeline/run_all.sh` runs these steps:

1. `fetch_sources.py`: pulls only the needed files from the official Lead-DBS data archive
   (an 8.5 GB zip) with HTTP range requests into `pipeline/data/raw/` (git-ignored), and records
   SHA-256 hashes in `sources.lock.json`. For the white-matter section it downloads the HCP-1065
   tract archive once (590 MB, checked against a pinned SHA-256), extracts the 69 needed files
   and fetches the tract-to-region table.
2. `build.py`:
   - label volumes → Gaussian pre-smoothing → marching cubes → affine to MNI mm → Taubin
     smoothing → quadric decimation (one GLB per structure, nodes `L` and `R`)
   - sweet-spot maps → isosurface of every region at ≥ 50% of the positive maximum; marker =
     value-weighted centroid of the region with the largest summed value (validate.py checks the
     marker lies in its own region and reports how much of the map that region holds)
   - cortex: Lead-DBS template surface, decimated; parcels from HMAT (M1, S1, SMA, pre-SMA, PMd,
     PMv) and Desikan-Killiany (ACC; medial orbitofrontal as a vmPFC proxy)
   - streamlines → filtered → resampled to 2 mm → fixed-seed subsample of up to 300 per
     hemisphere → line geometry
   - T1, T2 and PD templates → 1.5 mm whole head plus a 0.5 mm subcortical crop each (uint8, gzip)
   - white-matter tracts (HCP-1065 `.trk.gz`) → the same subsample of 300 streamlines per
     hemisphere on both sides (the corpus callosum cut at x = 0) → `public/assets/wm/`; the
     Brodmann block of the tract-to-region table → `src/data/generated/wm-connectome.json`
3. `compress.mjs`: quantization plus meshopt compression (glTF-Transform).
4. `manifest.py`: `manifest.json` (id, name, type, file, colour, source, licence, citation,
   derivation, centroids), `wm-manifest.json` for the white-matter tracts, and `ATTRIBUTION.md`.
5. `validate.py`: left/right symmetry; mesh centroid against the source-volume centroid;
   orientation (left nodes at x < 0, tract terminals on the labelled side, cortex labels against
   an independent volumetric parcellation); everything inside the head; white-matter tracts lie
   in white matter on the 2009b T1 and no 2 mm shift improves that (the atlas is built in ICBM
   2009a space); the thin fornix, whose T1 samples include CSF, is instead compared with the
   Neudorfer 2020 fornix label (median distance under 4 mm). Exits 1 on any failure.

What goes in is declared in `pipeline/config.py`. Dataset citations in
`pipeline/sources/citations.json` are Crossref records looked up by DOI.

## Tests

```bash
npm test
```

```bash
npm run build && npm run test:e2e
```

```bash
npm run check:palette
```

- `npm test`: content schemas, every refId resolves, every structure or tract an indication or
  symptom references exists in the manifest and on disk, verbatim comparison with
  `source/dbs-targets.html`, shipped GLBs decoded and checked against the pipeline meshes,
  AC–PC maths and URL round-trips.
- `npm run test:e2e`: one screenshot per indication and per tract group, a tools view, a mobile layout, all pages,
  plus assertions that no request leaves the local server and no console errors occur.
  Baselines were recorded on macOS with SwiftShader. On another platform, regenerate them with
  `npx playwright test --update-snapshots`.

## Licence

GPL-3.0-only (see `LICENSE`). `NOTICE` explains which files fall under which terms: the
code and the Lead-DBS-derived anatomy are GPL-3.0, and the atlas owners ask that the anatomy
not be used commercially; the T1 slices carry the McGill/MNI notice; bundled third-party
software licences are in `public/THIRD_PARTY_LICENSES.txt` (also published with the site).
Tracts generated from Human Connectome Project data are additionally subject to the WU-Minn HCP
Open Access Data Use Terms; the required acknowledgement is in `NOTICE`, `ATTRIBUTION.md` and on
the Credits page. The white-matter section's tract files (`public/assets/wm/`, `wm-manifest.json`,
`wm-connectome.json`) are **CC BY-SA 4.0** (HCP-1065 atlas) plus the HCP terms, not GPL. The skull-base
files (`public/assets/skullbase/`, `sb-*.json`) are **CC BY-SA** (Z-Anatomy 4.0, BodyParts3D 2.1 Japan,
Wikipedia definitions 3.0), not GPL. The skull base's detailed model (`public/assets/skullbase-ct/`, `sbct-*.json`)
is derived from TopBrain 2025 data (University Hospital Zurich: open use with the source given, **non-commercial**;
commercial use needs the data owner's permission) and from Z-Anatomy (CC BY-SA). The brainstem section's files (`public/assets/brainstem/`, `bs-*.json`) are **CC BY-SA**
(Z-Anatomy, fitted into MNI space), except its arousal network nuclei (`bs_aan_*.glb`), which come from the Harvard
Ascending Arousal Network atlas 2.0 (**CC0**). The cortex section's meshes (`public/assets/cortex/`, `ctx-*.json`) are
GPL-3.0, non-commercial like the other Lead-DBS-derived assets; the spine section's files (`public/assets/spine/`,
`spine-*.json`) are **CC BY-SA 4.0** (VerSe); their labels were made with FreeSurfer (MGH
licence, research use) and the definition texts in `ctx-labels.json` are CC BY-SA 3.0.

## Data, licences, attribution

See `ATTRIBUTION.md` and the in-app Credits page. In short: the Lead-DBS licence states that
its standard-space atlases are released under GPL-3.0 at their owners' request and should not be
used commercially, so the derived assets here are **GPL-3.0, non-commercial**, with this
pipeline as their corresponding source. The ICBM 2009b template carries the McGill/MNI notice.

## Open items

Tracked here and in the final report:

- **Typical trajectory.** No source gives one, so lead angles default to illustrative values
  (60° above AC–PC, 15° lateral) that the UI labels as such. Add a sourced trajectory to
  `Target.trajectory`.
- **Rajamani 2024 symptom tracts.** Not distributed as files. The PD symptom views show labelled
  subsets of the Hollunder 2024 PD sweet streamlines instead.
- **Circuit edges without a tract file.** STN to GPi/SNr, nigral output to the brainstem, Vim to
  M1, Vo to SMA, CM to striatum and to sensorimotor cortex. Each card lists these.
- **Published Vo coordinates** (Voa/Vop junction). Not in the attached content; the Vo marker is
  the Morel VLa centroid.
- **vmPFC.** Shown with the Desikan-Killiany medial orbitofrontal label as a proxy.
- **Spine, later phases.** Reflexes per root (no source with checkable text yet); S2-alar-iliac screw (needs the
  dorsal sacral foramina located on this CT); Kambin's triangle and lumbar approach presets. Cervical: the vertebral
  artery is drawn by rule (no open segmentation; this CT has no contrast), and the cord cannot be told from CSF on
  CT (the PAM50 cord atlas has no stated licence), so the cord cross-section is the canal's. Thoracic: the ribs, the
  pleura and the aorta are not drawn, so the screw tool checks lateral and anterior breaches only against the bone.
- **Cortex overlays (later phase).** Functional areas (HCPex), arterial territories (Liu 2023), the
  direct-stimulation points of Sarubbo et al. 2020 (CC BY 4.0) and tract terminations. Julich-Brain
  cytoarchitecture is left out for now (CC BY-NC-SA 4.0; its insular subdivisions are the main gain).
- **Morel atlas citation.** Confirm the "Jakab 2008" publication Lead-DBS credits for the MNI
  version.
- **Fragmented sweet-spot maps.** The Hollunder 2024 dystonia and Tourette maps split into many
  regions, and their largest region is not in the target the content names (thalamus/ZI for
  dystonia, white matter for Tourette). They are shown as volumes without a point marker. The
  Horn 2022 generalized-dystonia marker comes from a region holding 38% of its map.
- **Red nucleus** as an STN landmark is a researched addition (card text and references in
  `src/data/additions.ts`, including Danish 2006, which found the RN–STN relationship inconsistent
  on conventional MRI). The geometry is the existing DISTAL red nucleus.
- **Optic tract** (GPi landmark) is a researched addition (`src/data/additions.ts`, PD25 histology
  label). The Ilinsky optic-tract files in the Lead-DBS archive were not used: both lie in the right
  hemisphere.
- **Epilepsy targets.** No ANT, CM or hippocampal outcome map is distributed as a file. The ANT
  marker is an atlas-derived ANT–MTT junction (Morel labels), the CM and hippocampus markers are
  label centroids. No sourced indirect ANT coordinates were added to the calculator. NAUTILUS
  tested responsive neurostimulation, not continuous DBS.
- **Colour vision.** GPi/SNr/PPN, Vim/PSA and STN/Vo from the original palette are hard to tell
  apart under deuteranopia. They are separated by look (solid, outline, line) and by labels, not
  by colour.
