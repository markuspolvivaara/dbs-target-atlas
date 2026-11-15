# Handoff: desktop session (CachyOS), 2026-11-03

Read this first when continuing on another computer. Before handing back, overwrite this file with a new handoff, then
commit and push it.

## Audit fixes in progress (desktop, updated 2026-11-15)

- The site audit of 10–11 Nov is on branch `audit/2026-11-10` (`audit/README.md`: findings, questions for an expert,
  a fix order). Batches 1–6 of its fixes are merged (`main` = `95b0b09`, 2026-11-13).
- The audit's decisions on the models were made one at a time with the user on branch `fix/surgical-views` and are
  merged (PR 11, `main` = `f140650`, 2026-11-15; then Dependabot's PR 7, `bcd1a12`).
- Now: B1, the DBS views review (audit A-001..A-003), on branch `fix/b1-dbs-views` (off `main` at `bcd1a12`) in the
  same worktree `.claude/worktrees/audit-fixes`. **Local commits only: not pushed, no pull request.** Push or open one
  only when the user asks.
  - A-001, the PD dyskinesia view (the user's choice, C = both):
    - A: the view is now "Stimulation-induced dyskinesia" (Tsuboi 2021: dorsal GPi and GPe, associative and
      SMA/premotor connectivity), a side effect with no target marker and no tract;
    - B: a new view, "Levodopa-induced dyskinesia" (`pd-lid`): GPi and STN with the ansa lenticularis (beneath the
      GPi) and the lenticular fasciculus (above the STN), no marker, no cortex; from Fan 2020 and Aquino 2019 (full
      texts), Krack 1998, D'Souza 2026 and Katayama 2006 (abstracts). D'Souza 2026's below-average zone (GPe, dorsal
      GPi) is also a line in the stimulation-induced view.
  - A-002, Hollunder 2024's dystonia and Tourette maps (all from subthalamic DBS), the user's choices:
    - Tourette: not drawn in the Tourette views (no STN target there); the Tics card says why;
    - generalized dystonia: shown with the STN, the alternative target, in the alternative look
      (`alternativeTracts`, and a new `alternativeVolumes` field for the sweet spot);
    - all four named ", STN DBS (Hollunder 2024)" and drawn in the STN's colour (`pipeline/config.py`, then
      `manifest.py`); their cards and S1's say so.
  - A-003, markers (the user's choices: relabel and add published targets; Horn 2022's printed peaks; keep the
    tremor hotspot and explain it):
    - centroids are badged "Nucleus centroid, not a surgical target" (card eyebrow "Nucleus centroid"); the lead tool
      says "marker", and says when its marker is a centroid;
    - new kind `publishedTarget` (`targets.ts`: printed AC-PC millimetres placed with `acpcToMni`): the Voa–Vop
      junction (Shimizu 2018, Horisawa 2019; focal hand dystonia only: Holmes tremor keeps the Vo centroid), the
      ANT–MTT junction (Schaper 2020; epilepsy), Guiot's indirect Vim target (Sammartino 2016; Holmes tremor,
      myoclonus-dystonia); each card says where it lies against the drawn nuclei (computed with the audit's mesh
      helpers: scratch `b1/a003/targets_check.py`);
    - the two Horn 2022 markers at the printed peaks (the maps' maxima lie within 1 to 2.5 mm);
    - the tremor hotspot keeps its place; its card says it is on or 1.5 mm outside the drawn Vim, inside the drawn
      Vo, 8 to 9 mm from Guiot's Vim target.
  - B1 is complete (A-001..A-003), and the STN is drawn whole by default (the user's request; `stn=z` asks for the
    zones). Pushed to `origin/fix/b1-dbs-views` (2026-11-15) at the user's word; no pull request yet.
- B2, DBS statements and references (A-004, A-006..A-011, A-015, A-016), the user's choices: A-004 Liu 2014 in place
  of a meeting abstract; A-009 Voa pallidal, most of Vop cerebellar (Ilinsky 2018; the mesh is named "VLa (Morel),
  approximately Voa"); A-010 the Vim at 3/12 with the 2/12–3/12 range printed; A-011 the SNr as investigational
  context. The rest from the sources: Reich 2019's abstract (volume, not electrode position; no ansa lenticularis),
  Horisawa 2021's pilot for MRgFUS Vo thalamotomy, Sammartino 2016 for the pyramidal tract and lemniscus as the Vim's
  borders, the SWI, 7T FGATIR, MRgFUS preprint and epilepsy texts to their sources. The 52 original references are
  rebuilt from Europe PMC records with DOIs (barbe2018 and barrow had pointed to other papers); the References page
  lists only this section's datasets (107 references, was 197). The name labels' layout now tries the other
  direction and side before it drops a name (the SNr's move re-framed the Parkinson's view and hid "STN"). Local
  commit on `fix/b1-dbs-views`; pushed at the user's word.
- B4, the white-matter tract cards (B-006..B-010, MA-02..MA-04, MA-14), the user's choices, on the same branch:
  - the optic radiation keeps "Meyer's loop": rechecked at the user's question, the atlas bundle does have a shallow
    loop (41 % / 12 % of streamlines run > 5 mm forward of their thalamic end; front 44–46 mm behind the temporal
    pole); the audit's "no loop" was wrong. Its card says the loop is shallow and the bundle starts in the posterior
    thalamus, not at the lateral geniculate body;
  - medial lemniscus, reticulospinal tract, extreme capsule, anterior commissure: kept, each card says what the bundle
    connects (ends re-measured from the source files: scratch `b4/ends.py`);
  - the DRTT is two tracts, `wm_drtt` (crossed) and `wm_ndrtt` (uncrossed): `WmTract.keep`; split tracts draw from
    their own random stream and `replays` keeps the shared stream as it was, so no other tract changed (checked
    byte for byte);
  - the acoustic radiation is withdrawn (`withdrawn=True`: replayed, not written or listed; `C.WM_SHOWN`); its colour
    token is now `wmNDRTT`;
  - SLF I without the "dorsal SLF" alias, with the Wang 2016 / Komaitis 2020 dispute; the arcuate sentence (Duffau
    2008), the posterior corticostriatal tract (parietal and occipital), and "Brodmann areas the bundle touches"
    with Yeh 2022's caveat. Pushed at the user's word.
- B5, the skull base texts (C-001..C-011), the user's choices: meningioma shares "of all intracranial meningiomas" from
  papers that state it (Calvanese 2024, Cuellar-Hernandez 2021, Hammed 2021), petroclival Singh 2019's 5–11 % of
  posterior fossa ones; the foramen notes with vessels and neuraxis (Raut 2012, Kalthur 2023, Trimble 2023, Jeican
  2026; the foramen ovale from Triantafyllou 2025 and Kempa 2025, Khairnar 2013 removed); the jugular foramen's three
  compartments first (Katsuta 1997), the two parts after (Raut 2012); Koos by the brainstem (Koos 1998, sizes
  approximate), Knosp from Knosp 1993 and Micko 2015 with its invasion rates and the grade 3 row. From the sources:
  the carotid over, not through, the foramen lacerum (Muslu 2025); the sphenoid ostium with its paper's caveat and
  mean ± SD; the LSO and minipterional about equal at the carotid bifurcation (Mosteiro 2026's table). C-002 was
  already fixed (1eae262). C-009: `DEFINITION_EDITS` in `src/skullbase/index.ts` corrects shipped definitions in the
  front end (facial nerve; the callosomarginal artery's text withdrawn), so the pipeline files the user's endonasal
  work touches stay as they are. Pushed at the user's word.
- B6, the vascular and brainstem tables (D-003..D-007), the user's choices: Hunt and Hess in its fuller wording
  (Patel 2021, Marcolini 2019: a cranial nerve palsy stays grade 2); modified Fisher thin / thick, the footnote
  quoting Claassen 2001's thick clot and both-ventricle blood (Frontera 2006's full text not read); Spetzler–Martin's
  drainage "superficial only" / "any deep", Hofman 2018's rule kept as one series' on the card; Spetzler–Ponce "for
  cerebral AVMs" (Spetzler 2011's abstract); the brainstem's "Supratrigeminal zone (Cavalheiro 2015)" (renamed in
  `brainstem_build.py` and in `bs-zones.json` / `bs-manifest.json` by the same string), the Cavalcanti line replaced
  by Al-Afif 2026's other use of the name. Local commit, not pushed.
- The step-by-step state (each decision, its scripts and backups, what is still to tell the user) is in
  `.claude/audit-fixes-PROGRESS.md`, and the figures shown to the user in `.claude/audit-fixes-figures/`. Both are on
  the desktop only (`.claude/` is ignored by git).
- The main checkout stays on `audit/2026-11-10` with the user's uncommitted v1 endonasal rework (this file's
  `skullbase_v1_endonasal.py` paragraph among it). The fix branches leave that work alone.
- Decisions done:
  1. Surgical views (AP-01..03): `eff0493` (views open opened, new cameras, the camera kept from one tumour to
     another); far lateral sliders `e9c16a5` (tonsil and biventral lobule lifted), `60cea95` (cerebellum drawn back),
     `a12cef6`.
  2. Pterional ridge (AP-04): `9e79e00` (two-thirds of the sphenoid ridge drilled, an anterior clinoidectomy switch),
     `0e9845e` (the ridge's start drilled; a switch shows the ridge intact).
  3. MB-06: `de3b6b5` (v3's skull carved round V2, VI and the petrosal sinuses; no thin-bone rule in the cavernous
     sinus).
  4. MC-10: `b57bce7` (v2's nerve cards say where each crosses the skull base off the CT's opening:
     `skullbase_ct_openings.py`).
  5. MC-11: `b4628b0` (v1's straight and occipital sinuses at the confluence, the basilar artery off the clivus, the
     middle meningeal artery through the foramen spinosum: `skullbase_v1_vessels.py`).
  6. Tumours run to run: `652c4c9` (the tumour step seeded, so every rebuild draws the same; v3's Koos II is now 8 mm;
     v1's vessels step moved before the tumours) and `af08633` (v1's Koos IV closed: the Koos grid reaches past
     the largest ball; it had been cut open at the grid's lateral edge).
  7. MC-02: `a6b5798` (the T10–T11 disc is calcified on this CT, as the user reads it: drawn by rule in the dense band,
     the two bodies cut back to it, its calcification from the CT inside it; `CALCIFIED_DISCS` in `spine_build.py`).
  8. Foramina transversaria: `73cb75e` (the cards lead with the CT's own bone at 200 HU, the drawn bone's beside where
     they differ by 5 mm² or more; opening the foramina in the drawn bone was tried and left: at C3 the CT's thin,
     grainy ring gives no stable edge).
  9. P1-03, the per-view copies (56 % of the default skull base's mesh bytes, 49 % of v1's): left as they are, the
     user's choice (2026-11-15). Loading per view keeps them out of readers' downloads; sharing a copy's untouched
     side would save about 7 MB of deploy but make a direct visit to an approach load the whole original too.
- v1's posterior fossa: `1044aff` (the far lateral view's two sliders on v1 too; its step's samples seeded, so a
  rebuild repeats; the cerebellar arteries' tubes no longer fold). Its brainstem moved at most 0.35 mm, and
  `skullbase_v1_endonasal.py`, which reads it, was not rerun: the user's endonasal rework replaces that data.
- The cerebellar arteries out of the cerebellum (the user saw the PICA running through it): v1 `c269048` (its
  onto-the-surface step filled open lobules as a shell: half of the PICA lay inside), the default model `03a4bfb`
  (`skullbase_v3_clearance.py`: lobules filled one by one, the fitted courses pushed out pose by pose, the AICA and
  SCA given shapes). Both validators now hold every pose to under 3 % inside and 1 mm deep. Upstream,
  `skullbase_v3.hindbrain_clearance` still fills each pf file half whole (its overlapping lobules cancel out); the
  clearance step lifts what that leaves, so a full rebuild converges, but fixing it there too would be cleaner.
- v1's cameras: the default model's for the pterional, interhemispheric, orbitozygomatic and far lateral views; the
  retrosigmoid keeps v1's own (from below it meets Z-Anatomy's mastoid).
- Still open from this round: `skullbase_v1_brain.py` still samples surfaces
  unseeded (two `m.sample` calls): seed them (`seed=0`) when v1's cortex is next rebuilt, or a rebuild will not repeat.
- Pipeline data: the worktree has its own `pipeline/data/build` (its `raw` is a link to the main checkout's). These
  fixes changed `skullbase` (v1), `skullbase-v3` and `skullbase-ct` there; copy from the worktree, not the main
  checkout, before rebuilding those on the MacBook.
- Browser tests on the desktop: `CI=1 npx playwright test` (182 tests). Without `CI=1` the untracked Linux picture
  baselines from 11 Nov fail; the tracked ones are macOS ones.

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
    4 mm from the porus, so II is small (8 mm since the step was seeded, 2026-11-15) and III is moulded against the
    brainstem; IV pushes it.
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
- **Skull base v1 gets v3's views (all 4 phases done: the approaches; the ear views and Kawase; the cavernous sinus, triangles and endonasal view; the tumours and the Grading page).** The user asked (2026-11-03) for everything
  in the v3 module on v1, built from v1's own Z-Anatomy models, not v3's CT, template or ear. Where Z-Anatomy lacks
  something, it is drawn by rule on Z-Anatomy and labelled so. Built afresh on the desktop; the MacBook stash is not
  used. The phases: (1) the approaches, done; (2) the ear views, then Kawase (it needs the geniculate ganglion and
  the greater petrosal nerve, drawn by rule); (3) the cavernous sinus, triangles and endonasal view; (4) the tumours
  and the Grading page. Commit after each phase.
  - `skullbase_v1_skull.py`: Z-Anatomy's bones rasterised at 0.5 mm. Nearly closed meshes are filled by a 3-axis
    parity majority, plus 0.5 mm round the surface; the sinus air is taken out; the gaps between bones are bridged
    (`close_sutures`). The cavity is 1736 ml at a 7 mm seal.
  - v1 cut fixes (2026-11-04) for bone remnants (the lace in the pterional and OZ views): the flap's run is capped at
    `V1_FLAP_RUN_MM`; `thin_by_cut`; the smoothing mask is extended into air; the pinhole seal applies outside the cut only.
  - `SB_PROFILE=v1 skullbase_v3_approach.py`: the same craniotomy code on that grid. v1 differences, each under
    `PROFILE == "v1"`: the floor rule is stricter (Z-Anatomy's wall slopes about 45° by the pterion and has ledges),
    and the sphenoid ridge is found from the skull. Kawase is cut on v1 since phase 2.
  - `skullbase_v1_brain.py`: Z-Anatomy's cortex patches (`skullbase_v1_brain_export.py`, in Blender, now with each
    hemisphere's white matter), remade as closed surfaces (0.25 mm grid; temporal lobe, insula and the rest apart).
    Opercula: within 10 mm of Z-Anatomy's M1/M2/M3. The opened fissure's floor is its white matter (`white_floor`). They are pushed out of their own bone by a smooth field (up to 7 mm;
    v3's per-vertex push folded the sulci), then shaped by v3's open, lift, LSO-lift and interhemispheric rules.
  - `skullbase_v1_pfossa.py`: Z-Anatomy's cerebellum, brainstem and fourth ventricle. Outside the cranial cavity
    counts as bone, except the foramen magnum's way out (the cerebellum passes through its thin squama). Then v3's
    telovelar and retrosigmoid shapes. The superior, anterior inferior and posterior inferior cerebellar arteries
    carry the same morph targets.
  - `skullbase_v1.py approaches` / `brain`: merge the items into `sb-manifest.json` and write `sb-approaches.json` and
    `sb-v1fit.json`.
  - v1's retrosigmoid camera is `retrosigmoidLevel`: on this skull the opening lies level with the porus, so v3's view
    from below meets the mastoid. `V1_NAMES` and `V1_ABSENT` (`approaches.ts`) map v3's context names to v1's, or
    leave them out.
  - Phase 2: `skullbase_v1_ear_export.py` (Blender) and `skullbase_v1_ear.py`. These give Z-Anatomy's ear, plus by rule
    the geniculate ganglion (the facial nerve's first genu), the second genu, the oval window, the bone over the
    superior canal and the GSPN (v3's rule on v1's grid). `skullbase_v1.py ear` merges the items, landmarks
    (`placed`), definitions and the `ear` report. Kawase on v1: `KW_KEEP_MM` under v1 names, edge smoothed 1 mm, insula
    hidden in that view (`V1_TEXT.kawase.hide`). The lifted temporal lobe is redone in `skullbase_v1.py brain`.
  - Fixes after the user's look (2026-11-04):
    - `skullbase_v1_pfossa.py`: `onto_surface` (the cerebellar arteries out of the cerebellum), `tentorium` (kept
      off as bone) and `rhomboid` (v3's floor landmarks over Z-Anatomy's nuclei; the brainstem export is a
      translation away).
    - `skullbase_v1_nerves.py`: the optic nerves and olfactory nerve off the arteries, the chiasm by
      `skullbase_v3_chiasm.draw`.
    - `V1_TEXT.retrosigmoid.add`: the tentorium.
  - Phase 3:
    - `skullbase_v1_cavernous.py`, then `skullbase_v1.py cavernous`: Z-Anatomy's sinus with drawn walls and the
      triangles; `sb-cavernous.json`.
    - `skullbase_v1_endonasal.py`: `public/assets/skullbase/endonasal.bin.gz` and `sb-endonasal.json`. The sinus by the
      parity vote (both halves); the nose the enclosed air, its outside closed; each side's corridor aimed at its own
      half; empty pieces left out.
    - The front end picks the cavernous and endonasal data by `SB_MODEL`. The v3 endonasal tests set the page marker
      (`vi.hoisted`); the v1 ones are in `endonasal-v1.test.ts`.
    - `skullbase_v1_skull.py` now carves the sinuses' air (it never did: their meshes are open).
  - Phase 4 (2026-11-05):
    - `SB_PROFILE=v1 skullbase_v3_tumours.py` (about 4 minutes): v3's tumour rules on v1's grid (`v1_grid`: v1's bone
      field, and Z-Anatomy's internal carotids' lines with their radius as the label), v1's cavernous sinus and
      endonasal box, its own brain pushed. It merges into `sb-manifest.json` and writes `sb-tumours.json`.
    - Z-Anatomy's cavernous carotid runs in the sphenoid's body about 10 mm below its cavernous sinus, and its
      supraclinoid carotid reaches back only to 6 mm in front of the fossa. So on v1 the Knosp section is looked for
      at 6–9 mm (`KNOSP_Y_MM`), the lobe is level with the gland's lower part, and only grades 0–3A are drawn
      (`KNOSP_GRADES`); 3B and 4 would lie in bone. The cards say so.
    - Koos I: Z-Anatomy's temporal bone has no meatal lumen, so the canal is drawn by rule (`V1_CANAL_MM`, 2 mm,
      illustrative) and taken out of the bone. This needed a "Fundus of internal acoustic meatus" landmark
      (`skullbase_v1_ear.py`, drawn by rule where the facial and vestibulocochlear nerves part).
    - Z-Anatomy's nerves are meshes, so `displaced_meshes` moves their vertices (v3's `displaced_nerves` moves tubes).
    - The foramen magnum site on v1 is found by a level walk from the foramen's centre towards the right occipital
      condyle, at the rim's level (`FM_RIM_IN_MM`); v3's walk passes through Z-Anatomy's wider foramen.
    - Front end: `tumourGroups()` serves both models; `TUMOUR_FIT_V1`/`_V3`; the Grading page is in v1's nav.
      `ofKind` and the nerve highlight skip the tumour views' copies (the highlight bug was in v3 too).
  - v1 chain (updated 2026-11-15): `skullbase_build.py`, `skullbase_v1_xii.py`, `skullbase_v1_nerves.py`,
    `skullbase_v1_skull.py`, `skullbase_v1_ear.py`, `skullbase_v1.py ear`,
    `SB_PROFILE=v1 skullbase_v3_approach.py only pterional lso interhemispheric suboccipital retrosigmoid
    orbitozygomatic far_lateral kawase`, `skullbase_v1.py approaches`, `skullbase_v1_brain.py`,
    `skullbase_v1_pfossa.py`, `skullbase_v1.py brain`, `skullbase_v1_cavernous.py`, `skullbase_v1.py cavernous`,
    `skullbase_v1_endonasal.py`, `skullbase_v1_vessels.py` (before the tumours: their pushed copies of the AICA start
    from it as moved), `SB_PROFILE=v1 skullbase_v3_tumours.py`, `skullbase_v1_inbone.py` (last: it measures the tubes as
    built), `node pipeline/compress.mjs skullbase <the changed files>`, `skullbase_build.py finalize`.
  - Compress v1 by file list (`node pipeline/compress.mjs skullbase a.glb b.glb …`), not whole: the desktop's v1 build
    cache holds stale GLBs, and compressing all of it on 2026-11-15 changed 213 shipped files and added 43.
- **Pipeline data changed on the desktop:** `pipeline/data/build/skullbase` (the whole v1 port), `pipeline/data/build/skullbase-v3` (the clean-up's chain, the tumours, the
  two approaches in `approach.json`) and `pipeline/data/build/vascular`. Copy `pipeline/data/` back before rebuilding
  those on the MacBook.
- **Build chain additions:**
  - Skull base v3: after `skullbase_v3_endonasal.py`, run `skullbase_v3_chiasm.py`, then `skullbase_v3_tumours.py` (about 3 minutes), then
    `node pipeline/compress.mjs skullbase-v3`, restore the noise GLBs on the desktop (memory note), then
    `skullbase_v3.py finalize`. New craniotomies: `skullbase_v3_approach.py only <id>`, then
    `skullbase_v3.py approaches`, then the tumours step (its views copy the approach views), compress and finalize.
  - Skull base v2: `skullbase_ct.py`, `skullbase_build.py ct`, `node pipeline/compress.mjs skullbase-ct`, then, after
    v3's chain (it reads v3's routed nerves), `skullbase_ct_openings.py`, then `skullbase_build.py ct finalize`.
  - Vascular: `vascular_build.py`, then `node pipeline/compress.mjs vascular`, then `vascular_build.py finalize`.

## Open items

- **External review of 3–4 Nov 2026** (the user's notes; my comments are in the session). Done (2026-11-04/05):
  - Content, each checked against the source's full text (abstract where noted):
    - C2 Yeh 2018; C3 Naranbhai 2023 and Wu 2024; C4 Lee 2022.
    - C5: the Spetzler–Martin table is now a surgical-risk estimate (Assker 2025; Naranbhai 2023), the practice
      statements reported separately.
    - C6: Fidan 2026's population values kept apart from the limits it quotes without their setting.
    - C7: shape, containment, sequestration and migration as four descriptors (Angileri 2026; Fardon 2014's full
      text is not open).
    - C8: Gruber 2018 added, its primary endpoint not significant (abstract only; a correction list in
      content.test.ts records the change from the port).
    - C9: functional overlays from labels said to be approximations.
    - C11: a passage table on the foramen ovale card (Khairnar 2013), "not modelled" kept apart from "absent".
  - Technical:
    - C10, T1, T4/T5, T10.
    - T2: `.github/workflows/checks.yml`: the typecheck, the tests and the palette on every push and pull request.
    - T3: the inputs' SHA-256 pinned in `pipeline/sources/sources.lock.json` (fetch fails on a mismatch;
      `--relock`); Blender found on Linux in `run_all.sh`; the v1 scripts seeded (reproducible files).
    - T6: `pipeline/modifications.py` writes `<prefix>-modifications.json`, from v3's clearance and junction steps
      and v1's nerves, pfossa and brain steps. v3's file so far holds the shipped assets' validation only.
    - T7: labels on by default on touch screens (`src/labels.ts`; `lb=h` keeps hover in a link).
    - T8: without WebGL an inert renderer and a note; every section's page still works (checked with WebGL off).
  - Left:
    - C1 (the user checks it).
    - T9: `preserveDrawingBuffer` is what lets the e2e tests read the canvas; unchanged, unmeasured.
    - T11: CI Playwright needs Linux baselines (the user's call).
    - §4–§6.
  - Found while recording T6: v3's clearance check fails on the shipped assets ("Posterior inferior cerebellar artery
    (fitted course): 30 % of it, up to 3.7 mm, inside the cerebellum"; the limit is 20 %). Since T1 the endonasal
    step stops on it. To fix before v3 is rebuilt.
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
- **Skull base v3.** Hand-placed points are allowed if they are the best option, but label them. v1 now gets v3's views
  on its own Z-Anatomy models, at the user's request (above). v2 stays as it is. The older shelved v1/v2 approaches in
  the MacBook's `git stash` are not used.
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
  - `npx eslint . --quiet`
  - `npx vitest run` (424 tests on `fix/b1-dbs-views`)
  - `npm run build`
  - `npx playwright test` (182 tests, about 6 minutes, preview on port 4173; `CI=1` on the desktop, see above)
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
