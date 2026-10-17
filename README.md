# Open Neuroanatomy Atlas

Interactive 3D neuroanatomy for teaching, built from published atlases in MNI space. Sections:

- **DBS targets** (`dbs/`): described below.
- **White-matter tracts** (`tracts/`): in development.

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
`dbs/index.html` the DBS section; shared assets are under `assets/`. Copy it to any web server or
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

Load budget (mobile): about 2.6 MB for the first view (app 0.23 MB gzip, fonts, all nuclei,
and the cortex and tracts of the default Parkinson's view). Tracts and cortex load the first
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
src/viewer/                 three.js scene, loaders, materials, slices, lead, selection logic
src/ui/                     atlas page, other pages, theme
pipeline/                   offline Python pipeline (see below)
public/assets/              compressed GLBs, T1 volumes, manifest.json
tests/unit/                 schema, verbatim-port, manifest, GLB-decoding, AC-PC, URL tests
tests/e2e/                  Playwright visual smoke tests (one screenshot per indication)
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
   SHA-256 hashes in `sources.lock.json`.
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
3. `compress.mjs`: quantization plus meshopt compression (glTF-Transform).
4. `manifest.py`: `manifest.json` (id, name, type, file, colour, source, licence, citation,
   derivation, centroids) and `ATTRIBUTION.md`.
5. `validate.py`: left/right symmetry; mesh centroid against the source-volume centroid;
   orientation (left nodes at x < 0, tract terminals on the labelled side, cortex labels against
   an independent volumetric parcellation); everything inside the head. Exits 1 on any failure.

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
- `npm run test:e2e`: one screenshot per indication, a tools view, a mobile layout, all pages,
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
the Credits page.

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
