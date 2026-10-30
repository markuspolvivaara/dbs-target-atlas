# Handoff: desktop session (CachyOS), 2026-10-30

Read this first when continuing on another computer. Before handing back, overwrite this file with a new handoff, then
commit and push it.

## Where things stand

- `main` on GitHub has everything below (commit `e212a99`, after `c7cd2d1`: vessel junctions, confluence of the
  sinuses, arteries out of the brainstem, the PICA's course).
- Sections: home, DBS targets, white-matter tracts, cortex, brainstem, ventricles, spine, skull base (default "v3"; v1
  Z-Anatomy and v2 CT are alternatives) and vascular.
- **Clean-up (done):**
  - The fitted PICA branches no longer run inside the cerebellum: `skullbase_v3.hindbrain_clearance` uses the parity
    fill (`skullbase_brain.fill`), and the continuation is cleared at its tube radius in rounds
    (`skullbase_v3_pica.py`). `skullbase_v3_clearance.py` lifts fitted courses only out of the brainstem; its
    cerebellum check is fissure-aware.
  - Fourth ventricle (about 1.3 mm off the CT's fluid) and left temporal horn (no CT evidence for a better place): left
    as they are, on purpose.
- **Vascular additions (done):** Hunt–Hess, WFNS and modified Fisher on the Grading page; clip, coil and flow-diverter
  views (`TREATMENTS` in `vascular_lesions.py`, the `tr` URL parameter); circle of Willis variants (fetal PCom,
  hypoplastic A1); the veins of Trolard and Labbé (drawn over the gyral crowns, `skullbase_brain.py`).
- **Skull base tumours (done):** `pipeline/skullbase_v3_tumours.py`, `src/skullbase/tumours.ts`, a "Tumours" row in
  the panel with grade chips, and a skull base Grading page:
  - Knosp 0, 1, 2, 3A, 3B, 4 on the coronal section through the CT's own cavernous and supraclinoid carotid; each
    drawing is graded again from its section (validation checks it). The view is cut at the section (`sec=0` turns
    the cut off).
  - Koos I–IV in the retrosigmoid view (opened with the cerebellum retracted). This model's fitted pons lies about
    4 mm from the porus, so II is small (6 mm) and III is moulded against the brainstem; IV pushes it.
  - Meningiomas of the olfactory groove (LSO view), tuberculum sellae (pterional), petroclival (retrosigmoid) and
    foramen magnum (far lateral).
  - The fitted brain is pushed out of each tumour, written as `<part>__<view>.glb` copies with `replaces` and
    `pushedFrom`, shown only in that tumour's view. Validation and the views ignore them elsewhere.
  - The viewer draws a tumour's inside darker where a section cuts it (`cutShown` in `Viewer.ts`).
- **Optic chiasm redrawn (done):** the fitted Z-Anatomy block (two pads, the nerves meeting at a point in front of it)
  is replaced by a flat X drawn by rule where the block lay (`skullbase_v3_chiasm.py`): width and height from Mncube 2019,
  the nerves turning in to its front corners and tapering, the optic tracts' first 12 mm. The endonasal step still keeps
  its burr off the old block (larger, so on the safe side); re-run it and restore its noise files if that matters.
- **New approaches (done):** orbitozygomatic (pterional flap plus the orbital rim, roof and zygomatic arch) and far
  lateral (lateral suboccipital, foramen magnum rim, posterior third of the condyle; C1 is not modelled). New camera
  presets `orbitozygomatic` and `farLateral`. `skullbase_v3.py approaches` rewrites only the approach items from
  `approach.json`, so the whole v3 step need not run.
- **Pipeline data changed on the desktop:** `pipeline/data/build/skullbase-v3` (the clean-up's chain, the tumours, the
  two approaches in `approach.json`) and `pipeline/data/build/vascular`. Copy `pipeline/data/` back before rebuilding
  those on the MacBook.
- **Build chain additions:**
  - Skull base v3: after `skullbase_v3_endonasal.py`, run `skullbase_v3_chiasm.py`, then `skullbase_v3_tumours.py` (about 3 minutes), then
    `node pipeline/compress.mjs skullbase-v3`, restore the noise GLBs on the desktop (memory note), then
    `skullbase_v3.py finalize`. New craniotomies: `skullbase_v3_approach.py only <id>`, then
    `skullbase_v3.py approaches`, then the tumours step (its views copy the approach views), compress and finalize.
  - Vascular: `vascular_build.py`, then `node pipeline/compress.mjs vascular`, then `vascular_build.py finalize`.

## Open items

- **Kawase (anterior petrosectomy) is done** (see the README); the temporal lobe is a fixed lifted copy for that view,
  not a slider. **A plain subtemporal approach** is still open: it could reuse the Kawase flap and lift without the apex
  drilling. Neither the dura nor the tentorium is modelled, so the tentorial cut is not shown.
- **Koos geometry.** The fitted pons fills more of the cerebellopontine angle than in life. A narrower brainstem fit
  near the porus would let grades II and III be drawn at their usual sizes.
- **Orbitozygomatic cut.** Thin strands of the zygomatic arch's surface remain at its cut ends; the orbital piece's and
  the arch's extents are drawn by rule.
- **Playwright on the desktop:** the 40 tests without visual baselines pass (including 6 new ones for the tumours and
  the new approaches). The visual baselines are macOS ones: on the MacBook, run `npx playwright test`, and refresh with
  `-u` the skull base v3 and vascular baselines that changed (the panel lists new chips). The new views have no
  baselines yet.
- **Self-test mode** across sections: deferred by the user.
- **Brain deformation roadmap.** Still to do: FEM. Heavy computation can run on the desktop (CachyOS, i7-12700K,
  32 GB RAM, RTX 5080). The MacBook has 8 GB of RAM.
- The README's "Open items" section lists the older ones.

## Standing rules (the user's)

- **Sources.** Every content claim is sourced from PubMed or Europe PMC, checked against the open-access full text
  where there is one. If there isn't, check the abstract and say so on the Sources page, as for Jean 2019. No numbers
  from memory. Cards show the cited short label.
- **Licences.** Only redistributable assets. The Brainstem Navigator is excluded because its licence forbids
  derivatives. ATTRIBUTION.md is generated by `pipeline/manifest.py` from `pipeline/config.py` and the section
  manifests; NOTICE is written by hand.
- **Commits.**
  - Commit and push only when the user asks, and run the full checks just before (see below). While iterating, run
    quick targeted checks only.
  - Git identity: Markus Polvivaara <markus.polvivaara@gmail.com>.
  - End every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Downloads.** Downloaded files are untrusted: put each in its own folder and run Python with `-I`.
- **Provenance labels.** Label what is the CT's own, what is a fitted model and what is drawn by rule. For thin
  structures a CT cannot resolve, a fitted, labelled model is fine; the user liked the smooth Z-Anatomy look.
- **Skull base v3.** Hand-placed points are allowed if they are the best option, but label them. Don't re-propose
  approach cut-outs on v1/v2. The shelved approaches are in a `git stash` that exists only on the MacBook; it was not
  pushed.
- **Spine.** Dorsal focus: no great vessels, psoas or viscera in the lumbar and thoracic spine; ventral anatomy only
  for the cervical spine. The lesion-to-root tool and its dermatome chart are on hold until colleagues give feedback.
- **iCloud duplicates.** On the MacBook, copies like `index 2.html`, `… 3.png` and `… 3.glb` appear (iCloud sync).
  Never commit them, ask before deleting them, and ignore winding-check failures in `… N.glb` files.

## Setting up another computer

- **Front end only.** Run `npm install` (Node 20 or later), then `npm run dev`. The generated assets
  (`public/assets/`, `src/data/generated/`) are committed, so no pipeline run is needed.
- **Not in git:**
  - `.tools/`: the MacBook's own Node and Blender. Elsewhere, use the system Node, and set `BLENDER=/path/to/blender`
    for the Z-Anatomy exports.
  - `pipeline/.venv`: run `python3 -m venv pipeline/.venv && pipeline/.venv/bin/pip install -r pipeline/requirements.txt`.
  - `pipeline/data/raw` (6.6 GB) and `pipeline/data/build` (0.5 GB, the caches). Copy them across: see "Moving the
    pipeline data" below. Fetching them again works too: `pipeline/fetch_sources.py`, `pipeline/fetch_openear.py` and
    the README's per-section notes; TopBrain case 011 comes from Zenodo 16878417.
- **Skull base v3 and ventricles build chain.** Run Python as `pipeline/.venv/bin/python -u -I -W ignore`:
  1. `skullbase_brain.py`
  2. `skullbase_pfossa.py`
  3. `skullbase_v3.py` (it deletes and rewrites its own `tb_*.glb`, the next two steps' included, so run them after it)
  4. `skullbase_v3_cavernous.py`
  5. `skullbase_v3_endonasal.py` (it ends by running `skullbase_v3_clearance.py` and `skullbase_v3_junctions.py`)
  6. `skullbase_v3_chiasm.py` (the optic chiasm and tracts drawn by rule, the optic nerves joined to it)
  7. `skullbase_v3_tumours.py` (the tumours and the brain pushed by them; it merges its items into the manifest)
  8. `node pipeline/compress.mjs skullbase-v3`, then restore the noise GLBs on the desktop (see the memory note),
     then `skullbase_v3.py finalize`
  9. `ventricles_export.py` (in Blender; it also exports the structures around the ventricles)
  10. `ventricles_build.py` (with `ventricles_etv.py`: the endoscopic view's structures and the hydrocephalus shape;
     about 10 minutes, most of it fitting that shape)
  11. `node pipeline/compress.mjs ventricles`
  12. `ventricles_build.py finalize`
  13. `manifest.py`
  14. `npm run build`
- **Full checks before a commit:**
  - `npx tsc --noEmit`
  - `npx vitest run` (314 tests)
  - `npm run build`
  - `npx playwright test` (130 tests, about 7 minutes, preview on port 4173)
  - `npm run check:palette`
  - `pipeline/winding_check.py`
  - each section's `finalize` validation
- **Playwright baselines** are macOS ones (`*-desktop-darwin.png`). On Linux, Playwright looks for `*-linux.png` and
  reports them as missing. Don't commit Linux baselines without asking.
- **Refreshing a stale baseline.** After geometry changes, `-u` won't rewrite a baseline that still matches within
  1 %. Delete the old PNG, run the test with `-u`, and look at the new image.

## Moving the pipeline data

Work on the app alone (cards, sources, text, UI, tests) needs none of this, because the generated assets are
committed. Changing a section's geometry needs that section's raw data and the build caches.

| `pipeline/data/raw/` | Size | Used for | Copy? |
|---|---|---|---|
| `totalseg_weights` | 3.0 GB | re-running TotalSegmentator (spine; the v3 carotids, jugular veins and optic nerves) | no. Its outputs are in `build/`, and TotalSegmentator downloads the weights itself if a re-run is needed. |
| `hcp1065` | 1.0 GB | white-matter tracts | yes |
| `verse` | 723 MB | spine CT | yes |
| `zanatomy` | 377 MB | skull base, brainstem, ventricles, cortex texts (Blender exports) | yes |
| `topbrain` | 213 MB | skull base v2/v3, ventricles | yes |
| `t1.nii`, `t2.nii`, `pd.nii`, `atlases`, `cortex`, `labeling`, `aan` | ~0.6 GB | DBS, cortex, brainstem, the v3 template brain | yes |
| `openear` | 88 MB | v3 temporal bone | yes |
| `bodyparts3d`, `mug500` | 0.6 GB | not used by any build | no |

`pipeline/data/build/` holds the intermediate results:
- Skull base v2's Z-Anatomy fit (8.5 minutes) and the v3 brain and posterior fossa fits;
- the Blender exports and the segmentations.

Copy it too. Its caches are keyed on their inputs, so they stay valid on the other machine. All in all, about 3.7 GB (1,634 files).

The exclude patterns drop the unused folders and the MacBook's iCloud duplicates (`name 2.ext`, `folder 3`). Replace
`<desktop>` and `<repo>` with the desktop's address and the clone's path. Never add `--delete`: nothing should be
removed on the receiving side.

**To the desktop** (run on the desktop; on the MacBook turn on System Settings → General → Sharing → Remote Login):

```bash
rsync -av --exclude 'totalseg_weights' --exclude 'bodyparts3d' --exclude 'mug500' --exclude '* [0-9]' --exclude '* [0-9].*' markus@Markus-MacBook.local:Documents/DBS-targets/pipeline/data/ <repo>/pipeline/data/
```

**Back to the MacBook** (run on the MacBook; the desktop needs its SSH server running). `-u` keeps a file that is
newer on the MacBook:

```bash
rsync -avu --exclude 'totalseg_weights' --exclude '* [0-9]' --exclude '* [0-9].*' <user>@<desktop>:<repo>/pipeline/data/ ~/Documents/DBS-targets/pipeline/data/
```

Copy back after `git pull`, so the code and the caches match. If the desktop changed only the app, there's nothing to
copy back.

## When handing back to the MacBook

Write a new handoff here (what changed, what's open, anything set up differently), then commit and push. Say which
sections' pipeline data changed, so the MacBook knows whether to copy `pipeline/data/` back (see above). On the
MacBook, Claude will pull from GitHub and read it before continuing.
