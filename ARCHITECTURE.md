# Architecture

How the code is put together, in one place (the site audit's P1-21). The README says what each section shows and
where its data comes from; HANDOFF.md is the record of what was done, why, and what is open. This file is the map
for someone about to change the code.

## The shape of it

A static site with no server of its own. Vite builds eleven pages with a relative base, so the build runs from any
path on a plain web server: the home page and one page per section (`dbs/`, `tracts/`, `cortex/`, `brainstem/`,
`ventricles/`, `vascular/`, `spine/`, and the skull base three times: `skullbase/`, `skullbase-v1/`, `skullbase-ct/`).
At run time a page loads only its own files; the browser tests fail on any request that leaves the local server.

```
pipeline/ (Python, offline)              src/ (TypeScript)                      the browser
source atlases, CTs  ──►  meshes  ──►  public/assets/<section>/*.glb  ──►  viewer/Viewer.ts
                          manifests ─►  src/data/generated/*.json  ──►  each section's index.ts (zod)
                                        cards, references (typed modules)  ──►  each section's page
```

## One section

Every section is the same five parts. `src/brainstem/` is a small one to read first.

| Part | Where | What it does |
|---|---|---|
| Data | `src/<section>/index.ts` | Imports the pipeline's JSON and the section's content, parses both with zod, and cross-checks them as the module loads (a card that cites a missing reference stops the page). The DBS section's is `src/data/`. |
| State and link | `src/<section>/state.ts` | The section's state (it extends the viewer's `ViewState`), with `encodeX` and `decodeX` to and from the address's hash. A link is a complete description of a view. The DBS section's is `src/state.ts`. |
| Scene | `src/<section>/scene.ts` | A pure function from the state to a plan: which structures are drawn and how (`looks`), the camera, what the camera frames. No three.js. |
| Page | `src/ui/<section>-atlas.ts`, `-pages.ts` | The atlas page (toolbar, 3D stage, panel, legend) and the other pages (sources, credits). Plain DOM through `ui/h.ts`; no framework. |
| Entry | `src/<section>-main.ts` | The configuration handed to `bootSection` (`src/ui/section.ts`): the pages, how links read and write, the help's keys. |

The three skull base pages share one code path: each page names its model in `<meta name="sb-model">`, read once
as `SB_MODEL` in `src/skullbase/index.ts`.

## What the sections share

- **The frame** (`src/ui/section.ts`): theme, header and tabs, the address both ways, the help dialog, the keys.
  A change to the view goes through one `update(fn)`: the state is cloned, changed, made valid (`sanitize`),
  written to the address and drawn.
- **The address** (`src/ui/address.ts`, `src/viewlink.ts`): the hash is rewritten in place as the view changes; a
  change of view proper (another indication, group or region) adds a history entry, so Back steps through views.
  The parts of a link every section writes the same way (camera, side, layers, slice planes, hidden structures, a
  measured distance) live in `viewlink.ts`.
- **The viewer** (`src/viewer/Viewer.ts`): one class for every section. It is given a catalogue of structures (from
  the manifest) and the section's plan function, loads the GLBs a plan needs, and draws them. Slices, the DBS
  lead, the endoscope view and picking are its helpers in `src/viewer/`.
- **Shared page pieces** (`src/ui/`): the stage and its overlays (`stage.ts`), the Measure tool (`measure.ts`), the
  selected structure's bar, citations, the Save image dialog.

## Data

- **Meshes**: `public/assets/<section>/<id>.glb`, quantized and meshopt-compressed, one file per structure with a
  node per side named `L` and `R`. Millimetres: MNI ICBM 2009b for the template sections, each CT's own frame for
  the others (the manifest's `space` says which).
- **Manifests**: `src/data/generated/*-manifest.json` (and a copy in `public/assets/`, served with the site): per
  structure its file, colour, source, licence, citation, how it was derived, and its centroid by side
  (where its label stands).
- **Content**: cards, statements and references are typed TypeScript modules beside each section's code, each
  statement with the ids of its references.
- **Colours**: `src/data/palette.json`, shared with the pipeline; `npm run check:palette` holds contrast and
  colour-vision distances.

## The pipeline

`pipeline/` is offline Python (its own virtual environment) and is not needed to build the site: its results are
committed. `pipeline/config.py` declares what goes in; `fetch_sources.py` downloads it into `pipeline/data/raw/`
(git-ignored) and pins hashes in `sources.lock.json`. Each section has a build script that writes uncompressed GLBs
to `pipeline/data/build/<section>/` and its manifest; `compress.mjs` writes the shipped files; a `finalize` or
`validate` step then checks the result and exits 1 on any failure. The README's section "The anatomy pipeline" and
each script's opening comment give the steps and their order.

Two rules to keep: in the skull base's chain a step that changes another step's mesh writes a file of its own and
points the manifest at it (the source's file is never overwritten); and a measured figure on a card comes from a
file the pipeline wrote, not from the text.

## Tests and CI

- `npm test` (vitest, `tests/unit/`): content and references, links, manifests, and the geometry of the shipped
  GLBs (inside out, in the wrong frame, in bone).
- `npm run build && npm run test:e2e` (Playwright, `tests/e2e/`): runs against the built `dist/` served by
  `vite preview`. `smoke.spec.ts` takes a picture of every view; `audit-fixes.spec.ts` holds behaviour.
- CI (`.github/workflows/checks.yml`) runs two jobs on every push, `checks` (types, lint, unit tests, palette,
  dependency audit) and `browser` (build, then Playwright); `main` requires both. `pages.yml` builds and deploys
  the site.
- `dist/` is committed as well as built in CI (a workflow choice: HANDOFF.md), so a change to `src/` or to the
  shipped data is followed by a rebuilt `dist/` in its own commit.
