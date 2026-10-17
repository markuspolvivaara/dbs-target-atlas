# Open Neuroanatomy Atlas

Interactive 3D neuroanatomy for teaching, built from published atlases in MNI space. Sections:

- **DBS targets** (`dbs/`): described below.
- **White-matter tracts** (`tracts/`): described below.
- **Skull base** (`skullbase/`): described below.
- **Cortical anatomy** (`cortex/`): described below.

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

The cranial bones, cranial nerves I–XII, the main intracranial arteries and the dural sinuses from the
Z-Anatomy model (based on BodyParts3D: one adult male, CC BY-SA), in their own space: millimetres from the
model's hypophysial fossa landmark. Not MNI and not registered to the other sections.

- **Cranial floor** view with a cut-away height (the calvaria lifted off), from above or below.
- **Regions**: everything of the model within 15 mm of the hypophysial fossa, optic canal, petrous apex and
  foramen ovale (25 mm around the foramen magnum), measured, with the distance on each item.
- Vessels and nerves are tubes with the calibre Z-Anatomy models (its curve bevel; modelled, not measured).
  Each can be shown or hidden on its own; the cranial nerves are listed I–XII with their branches.
- Bones are smoothed by one subdivision level (then decimated) and shaded with baked ambient occlusion. The
  geometry is Z-Anatomy's simplified BodyParts3D model: finer open skull models were checked (BodyParts3D's own
  release, the SPL head and neck atlas, MUG500+ CT skulls) and are either no finer, unlabelled or too noisy.
- **Systems**: cranial nerves, arteries, veins and dural sinuses. **Bones**: each with the landmarks
  Z-Anatomy labels on it (126 in all: foramina, canals, clinoids, sella, grooves...).
- Landmarks are the points Z-Anatomy anchors to each bone (the label line's hooked end), checked against the
  bone surface (0–4 mm; opening centres such as the foramen magnum further). Not yet labelled in the model and
  so not shown: superior orbital fissure, foramen lacerum, carotid canal, jugular foramen, internal acoustic
  meatus, stylomastoid foramen, cribriform plate, clivus.
- Cards show the Wikipedia definition that Z-Anatomy ships (CC BY-SA 3.0, with its source link), labelled as
  such; peer-reviewed teaching notes are still to come.
- Pipeline: `pipeline/skullbase_export.py` runs inside Blender (installed under `.tools/`, or set `BLENDER`) and
  `pipeline/skullbase_build.py` writes the assets and checks sides, symmetry and landmark distances.

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
- **Cards**: Destrieux name and views, the Z-Anatomy/Wikipedia definition (CC BY-SA 3.0, labelled as such), and
  measured facts: lobe shares (via Desikan-Killiany, lobes as in Klein & Tourville 2012), borders, overlap with
  Desikan-Killiany regions and with the DBS section's cortical areas (HMAT motor areas, ACC, vmPFC proxy), and
  the area on the template next to the paper's mean.
- Pipeline: `pipeline/cortex_texts.py` (in Blender) reads the definition texts, `pipeline/cortex_build.py` writes
  the assets and checks them.

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
  targets, the red nucleus beside STN targets); an index of every structure.
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
  marker in the current view; clicking a name highlights it (tracts become opaque and thicker,
  structures solid and glowing, everything else fades back) and opens its card. Click again or
  press Esc to clear. Hidden items and the highlight are part of the shareable link.
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
Wikipedia definitions 3.0), not GPL. The cortex section's meshes (`public/assets/cortex/`, `ctx-*.json`) are
GPL-3.0, non-commercial like the other Lead-DBS-derived assets; their labels were made with FreeSurfer (MGH
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
