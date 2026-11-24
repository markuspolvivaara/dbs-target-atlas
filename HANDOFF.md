# Handoff: desktop session (CachyOS), 2026-11-03

Read this first when continuing on another computer. Before handing back, overwrite this file with a new handoff, then
commit and push it.

## The site audit: what is left (checked 2026-11-19)

The audit of 10–11 November (branch `audit/2026-11-10`, commit `bcb8038`: `audit/README.md`, the findings as data in
`audit/findings/`) has 275 items: 266 findings and 9 design decisions. On 2026-11-19 every one was checked against
`main` at `d85092d` (after PR 28). The 141 that a fix record names (`.claude/audit-fixes-PROGRESS.md`, commit messages,
pull requests) were read from those records. The 134 that no record names were checked against the code, data and
shipped files, and many were re-measured (scratch scripts in the session's scratchpad, not kept). Line numbers below
are as of `d85092d`.

**Done: 124 items.** Both P0s and every P1 except four (below). B1–B7, the DBS additions (A-001..A-016), the
cortex text fixes, the tract cards (B-006..B-010, MA-02..MA-04, MA-14), the tract ends (B-007), the skull base text
(C-001..C-011, C-019), the vascular, brainstem and ventricle additions (D-001..D-010), the spine (E-001..E-018,
MC-01..MC-08), the default skull base's geometry (MB-01..MB-06, MB-08), v1 and v2 (MC-03, MC-04, MC-09..MC-11), the
approaches (AP-01..AP-05, AP-08..AP-10), loading, picking, phones and keyboard (P1-01, P1-02, P1-04..P1-07, P1-09,
P1-10, P1-12, P1-13, P1-16, P1-20, UI-01..UI-06, UI-08, UI-09, UI-11, UI-12, UI-17, UI-18, UI-21), CI and
dependencies (P2S-06..P2S-09). Partly done: P1-15 (versioned addresses; the cache rule waits on hosting), UI-20
(7d10e29, in part), D-002 (largely resolved by the brainstem refit), B-001 (the occipital labels still show under
the Parietal filter by the 25 % rule: taking lobes wholly from Destrieux is the user's call), B-015 (no sentence on
the paracentral lobule). Left as it is, by the user's choice: P1-03 (per-view copies).

**The four P1s still open all wait on the user:** P2S-01 (Enforce HTTPS is off: `http://openneuroatlas.net/` answers
200 with no redirect; the Pages certificate state is still `dns_changed`), P2S-02 (licence terms of meshes that
combine Z-Anatomy or Lead-DBS shapes with the non-commercial TopBrain CT: write to University Hospital Zurich, or take
legal advice), MA-05 (the motor template's "M1" covers a third to a half of the postcentral gyrus: clip it, or use
gyral labels; no card says so meanwhile), UI-07 (pairs red-green colour-blind readers cannot tell apart; the DBS pairs
come from the user's palette, the skull base nerve/tumour and AVM pairs are the project's own).

**Found on 2026-11-19, not in the audit or worse than it said** (from the files and code; not looked at in the app):
- Skull base tumour views (MC-18, worse): all 75 tumour-view copies (33 in v3, 42 in v1) have a right node only, and
  the parts they stand in for are hidden, so with Side = Both the left pons, medulla, cerebellum, fourth ventricle and
  nerves (and the left frontal lobe in the olfactory and tuberculum views) are not drawn. The views open on the right.
- v1 Kawase: 66 % of the right cochlear nerve (mirrored in after the audit, `82bd5bf`) lies inside the drilled piece
  (fixed: `2c7f462`, below).
- Single-node midline files named R (v1's basilar artery, sagittal, straight and occipital sinuses, the meningiomas:
  MC-17) vanish with Side = Left. `tests/unit/mesh-checks.test.ts` accepts that convention; the viewer does not.
- The Koos card says the small arteries are moved onto the tumour (`src/skullbase/tumours.ts:173`), but v3 ships no
  artery copies for the tumour views; the Koos III AICA overlap rose from 30 % to 61 % as the tumour shrank (MB-09;
  fixed: `60f0e34`, below).
- v3's manifest centroids are stale for the inferior petrosal sinus (about 10 mm off its mesh) and the PICA origin
  (rechecked 2026-11-23, below: the PICA origin's was, and is fixed; the petrosal sinuses' are not stale).
- `public/assets/spine-manifest.json` has drifted from `src/data/generated/spine-manifest.json` (9 references
  missing, 15 citations differ): `spine_build.py refs` refreshes only the generated one.
- `public/THIRD_PARTY_LICENSES.txt` says zod 3.23.8; zod 4.6.7 ships.
- Horn 2022's printed-peak markers (`src/data/targets.ts:34-37`) lie 0.2–0.9 mm outside their own sweet-spot meshes
  (rechecked 2026-11-23, below: the maps as distributed end at the printed peaks; the markers now say so).
- After the half-voxel shift the reticulospinal tract runs more in CSF (left 25 → 42 %, right 0 → 14 %; T2 > 225 as
  the CSF mask), the left SCP less (25 → 10 %); the fornix is now held to the Neudorfer label only.
- The facial nerve definition fix (C-009) is in the skull base's `DEFINITION_EDITS` only; the brainstem card still
  shows the old text. The epilepsy "Focal seizures" view still opens with "multifocal or poorly localized", which B2
  removed elsewhere. The References pages of the DBS, brainstem, ventricles, vascular and skull base sections claim
  more about sourcing than holds (A-017, D-024, B-011).
- The skull base help lists v3's keys only, and not D, A, R, F, B (P1-19, worse); the palette check now reports 153
  near pairs (P1-22, UI-26).

**Waiting on the user (decisions, settings, outside contacts)**
- Hosting and settings: P2S-01, P2S-03 (`www` certificate), P2S-05 (verify the domain with GitHub), P2S-04 and the
  cache half of P1-15 (choose Cloudflare's proxy or another host), P2S-18 (CAA, DNSSEC, `security.txt`, private
  vulnerability reporting).
- Licences and privacy: P2S-02, P2S-10 (Morel atlas terms), P2S-11 (privacy note: wording and controller), P2S-17 (a
  private e-mail address and the laptop's host name appear in this file).
- Design system: DS-01..DS-09 (`audit/08-design/`); they also settle UI-07 and UI-15.
- Content questions (each finding holds its question): A-019, A-021 (the lead's insulated tip), B-020, B-025, B-026,
  C-012 (table), C-018, D-011 (angle), D-013, D-014, D-015, D-018 (second source), D-019, D-023, D-025, D-026, D-027
  (the skull base already names the vessel: `approaches.ts:362`), P1-18 (keep the manifest copies as a data
  interface?), P1-26 / A-018 (three uncited references).
- Model questions: MA-05, MA-07 (the right fornix's front end), MA-08 (tremor view), MA-09 (DISTAL Vim against Morel),
  MA-11 (which PPN), MA-19 (left dentate on T2), MB-14, MB-15, MB-20, MC-19 (v1 at life size?), AP-13 (keyhole
  placement), AP-14 (an operative-line camera option?).

**Done without a decision (2026-11-19, the user: "Lets do the ones that can be done without decisions").** On
`fix/audit-leftovers` (off this handoff's `17ac00e`), six local commits, not pushed:
- `379bd0f`: links (P2S-12 `c=constructor`, P2S-13 camera numbers: `okCamera`), reduced motion (UI-25) and the
  camera reported where a flick ends (UI-13), overlays, markers and the drill free their materials and lines (P1-28,
  P1-27), the page without WebGL (P1-17, UI-24).
- `84513b7`: BodyParts3D's and Wikipedia's terms today (P2S-15, `UPSTREAM_NOTE`), the meshoptimizer notice and zod
  4.6.7, the home pictures' licence (P2S-16), the served spine manifest resynced and a test that every served
  manifest is its generated file, with byte counts and shared entries checked (P1-11), stale docs (P1-21).
- `06624b2`: a note under the header when a link names something the section lacks (P1-24, `src/ui/linknote.ts`;
  v2's `#/grading` opens the atlas), the skull base help from the views' own keys (P1-19), name-keyed notes checked
  both ways (P1-25, `NOT_IN_MODEL`), dead code (P1-23).
- `be2f643`: the palette check fails on a warning or close pair not in `scripts/palette-accepted.json` and covers
  the views it skipped (P1-22, UI-26); styles through the CSS object model, palette variables as a constructed
  stylesheet, the redirect out of the inline script (P2S-20); no referrer (P2S-14); a 404 page; "View options" and
  "Indications shown" (UI-19); swatch edges (UI-16); the legend's height cap applies (UI-14); a phone held sideways
  (UI-10); panel order (UI-22); cortex label chips (UI-23); touch wording, the home disclaimer, the ventricles' help
  (UI-27); label modes stated absolutely in links, a copied link announced (UI-13).
- `6776313`: card texts against their sources: DBS A-020 (Horn 2022 46 of 80; Wiggerts 2026 matched controls;
  Wang 2020; Andrade-Souza 2005), A-022, A-023 (abbreviations), A-024, A-025, MA-08, MA-10, MA-15; tracts and
  cortex B-011, B-012, B-013, B-017, B-018, B-021 to B-023; skull base C-012 to C-017 (Signoretti 2025's table,
  Nguyen HD and MQ 2026, definitions cleaned in every model); brainstem, ventricles and vascular D-012, D-016,
  D-017 (each against its full text), D-020 (an edit table for the brainstem's definitions), D-021, D-022 in part,
  D-024.
- `fa43d6c`: midline structures stay with Side = Left (MC-17); tumour views draw the untouched left half beside the
  moved copies (MC-18); DBS and epilepsy citations say when Europe PMC records the full text as not open access
  (A-017); texts where the model differs: MB-09, MB-10, MB-12, MC-14, MC-19, AP-07, AP-12, MA-06, MA-07.
- Checks at `fa43d6c`: tsc, lint, 540 unit tests, build, palette; 209 browser tests (`CI=1`). **On the MacBook**:
  stage baselines change again (cortex label chips, swatch edges, the legend's cap, "View options").

**Done next (2026-11-20/21, the user: "Please do 1-5"; MB-09 by the user's choice "Move them off").** On
`fix/audit-rebuilds` (off `f1d867e`, PR 29's merge), local commits, not pushed:
- `2c7f462` AP-06: v1's Kawase drilling keeps its margins (the drilled piece is cut round the protected structures)
  and keeps 1 mm off the right cochlear and vestibular nerves (63 % of the cochlear nerve was inside); a unit test.
- `5cb8f24` MA-12: the arousal network's labels sit 0.5 mm right of the midline in their own file; shifted back
  (the raphe halves 72.1 and 72.0 mm³, were 32.8 and 111.2), the thin nuclei kept (the LDTg 19.1 mm³ a side, was 0.1).
- `60f0e34` MB-09: v3's tumours move the fitted small arteries they reach onto their surface, 12 copies (the Koos IV
  AICA was 65 % inside, the foramen magnum meningioma's anterior spinal artery 45 %); copies a midline tumour needs
  hold both halves (`copySides`). Not moved: the CT's own arteries (the tumours keep 0.4 mm off them already; pushed
  out of their channels they tore), v1's (its tumours keep off all of them), the pituitary stalk (the tuberculum
  meningioma surrounds it whole). Two copies keep 2.5 and 2.7 % inside, near the surface.
- `9a9052a` MB-16, MC-12: triangles that draw nothing (a corner repeated, no area in any morph shape, the same
  triangle twice) are taken out by `pipeline/triangles.mjs` in `compress.mjs`, and from 101 shipped files by
  `recompress.mjs --cleaned` (6312 triangles; reordered for size as compress does, so no file grows). Left: back-to-back
  pairs, triangles that gain area in a morph target, non-manifold edges that are the meshes' own shape (cavernous
  sinus, falx, vertebrae), the coarse transverse sinus.
- Merged `refactor/section-shell` (`1ea3a6c`, `4db106c`: P1-14, the eight entry scripts are configurations of
  `src/ui/section.ts`; link helpers in `src/viewlink.ts`; 10,370 links decoded and encoded the same before and after)
  and `fix/audit-text` (`2385139`: B-014, B-016 but three sentences, B-019, B-020 but "restiform body", B-024, D-029).
- MA-13 (committed after the others): the white-matter midline cut keeps no stubs (`pipeline/build.py`
  `midline_pieces`, `config.py` `WM_MIDLINE_MIN_PIECE_MM`; the MCP's right stubs 49 % → 0, the SCP's left 37 % → 0;
  `wm_ac`, `wm_cc`, `wm_mcp`, `wm_scp` rebuilt, the other 32 tract files byte for byte as they were). `manifest.py`
  refreshed only those four entries (centroid, bytes, source streamlines); the permission check had refused it once
  and allowed it on the second try.

**PR 30 merged 2026-11-21 (main `27ee8a6`). Done after it (2026-11-22, the user: "Let's move to the next items in
the list").** On `fix/audit-models-2` (off `27ee8a6`), local commits, not pushed:
- `ae236bc` MA-16, MA-17, MA-18: a sweet-spot mesh is the map's own surface at 50 % of its maximum
  (`build.level_surface`; it held 36 to 67 % of the regions' volume, now 88 to 97 %, the coarse tremor map 67 and
  78 %), each piece reduced gently so thin plates do not fold (the Tourette map's file 17 → 121 KB); the caudal zona
  incerta, SNc, PPN and the STN's limbic zone smoothed less (94 to 98 % of their labels, were 86 to 90 %). Only those
  ten meshes rebuilt.
- `466367b` MA-20 (and MA-17): fins (two triangles on the same corners facing opposite ways, with a free edge) taken
  out by `triangles.mjs`: 167 in 76 shipped files. The every-shipped-mesh test allows none.
- `b176779` MB-13: the accessory meningeal branch and the anastomotic veins joined to the vessels they leave; the
  ophthalmic artery's label pieces joined to one another (`OWN_PIECES`). The junction lookup skips tumour-view copies.
- `e51edd2` MB-19: an aneurysm dome with over 10 % of its surface in bone is sited afresh on its artery's wall within
  5 mm (the ophthalmic one moved 4.3 mm, now points up, back and towards the midline; 46 % → 0 of the dome in bone);
  a nidus's junctions in or near bone are moved into the cranial cavity (grade III: 93 of 241). The vascular section
  again follows v3's vessels (it had not been rebuilt since the cerebellar arteries were lifted off the brainstem):
  26 files changed, 108 the same vertex for vertex and kept as shipped. `compress.mjs` cleans triangles again after
  quantisation.
- `b70ff92` D-028 (the owner: "please move them"): in Z-Anatomy's own model (before any fit) the oculomotor nucleus
  lies at the level of the inferior colliculus and the trochlear nucleus at the aqueduct's lower end (along the
  aqueduct, from its middle: superior colliculus −0.1 mm, inferior −4.4, oculomotor nucleus −4.9, trochlear −10.6).
  The oculomotor, accessory and trochlear nuclei are moved together 4.8 mm up along the model's aqueduct before the
  fit (`brainstem_build.nuclei_rise`; `brainstem_build.py nuclei` redoes only them), so that the oculomotor nucleus is
  level with the superior colliculus; each card says so and gives its level from Ruchalski and Hathout 2012
  (PMC3366251, full text). The accessory nucleus's upper end stands above the model's cut midbrain.
- `2efc489` MB-11 (the owner: "cut"): the routed nerves III to XII began 0.9 to 3.7 mm inside the fitted brainstem and
  are cut at its surface (`skullbase_v3_roots.py`, run after the junctions in v3's chain; then the tumour step, whose
  nerve copies follow). The petroclival meningioma and what it pushes changed a little (no channels for the stubs).
  Left then: the trochlear nerve ran up to 4.4 mm under the fitted midbrain's surface for a third of its length
  further along; lifting it ring by ring tore the tube (done since: the trochlear entry below).
- **MB-07 done as a refit (the owner, 22 November: "I think a refit would be good").** On `fix/hindbrain-refit` (off
  PR 31's branch), pushed as PR 32 on 23 November at the owner's word:
  - `skullbase_pfossa.py` has a new fit term, "v4": this CT's fourth-ventricle fluid (deep fluid further than 8 mm
    from bone, within 8 mm of the carried model's ventricle: 0.5 ml, its upper part) inside the model's fourth
    ventricle. In the RBF stages only: in the affine stage it moved the whole model (midbrain 6 mm) and folded the
    carried courses. The CT's fluid outside the fitted ventricle falls from 48 % (worst 4.9 mm) to 16 % (1.2 mm); the
    other terms are as they were. The parts move: pons a median 2.0 mm, midbrain 4.0 (2 mm of it to the left: the old
    ventricle's top lay 2.5 mm right of the CT's), culmen 3.9, medulla 0.5.
  - The ventricles section takes that ventricle as its fourth (`ventricles_build.v3_fourth`): its drawn fourth
    ventricle is the skull base's, softened and joined to the aqueduct as before. The two overlapped 52 % and 40 %;
    now the section's holds 94 % of the skull base's, and none of it lies in the drawn cerebellum.
  - What followed in v3: the nerves' roots, the trigeminal ganglion and its divisions and the cavernous triangles
    move with the carried courses (about 1 mm), so the skull was carved again round V2 and VI
    (`skullbase_v3_skull.py`) and the approaches cut again: every bone and approach bone copy is re-meshed (the same
    surfaces). Koos IV sits lower (15.8 ml, was 18.4).
  - Rules changed on the way: `PUSH_ROUNDS` 40 → 120 in the clearance (the AICA under the lifted far-lateral
    cerebellum); a fitted course's last sharp corner is rounded where it lies (`skullbase_v3_base.round_corners`: the
    left AICA turned 119°); the far lateral shape's bone correction repeats; a tumour view's moved arteries go away
    from the tumour's middle, not the shortest way out (most of the AICA lies in Koos IV, and the shortest ways tore
    it); the retrosigmoid corridor check allows 2 % (22 of 1904 points; was 1 %); `skullbase_v3_roots.py` skips the
    chiasm's files in a full rebuild.
  - **The chain's order that settles** (routes, the cavernous constraints and the skull's carve feed one another):
    `skullbase_pfossa.py`, then `skullbase_v3.py`, `skullbase_v3_cavernous.py`, `skullbase_v3_skull.py`,
    `skullbase_v3_approach.py`, `skullbase_v3.py`, `skullbase_v3_cavernous.py`, `skullbase_v3_endonasal.py`,
    `skullbase_v3_chiasm.py`, `skullbase_v3_tumours.py`, compress, finalize; then `skullbase_ct_openings.py` and
    `skullbase_build.py ct finalize`, `vascular_build.py`, `ventricles_build.py` (15 minutes). The skull fit's cache
    key hashes `skullbase_ct.py`, which `b57bce7` refactored without touching the fit: the cache was copied to the new
    key (`skull_fit_c47edd211b32f64a.npz`).
  - Shipped files kept as they were where the refit did not touch them: a file is restored when its build file is byte
    for byte as before, or its vertices and shapes match the shipped one's.
  - **Seen on the CT, not acted on:** about 1.6 ml of fluid above and behind the ventricle (the supracerebellar and
    quadrigeminal cisterns, joined to the ventricle's fluid at this resolution) lies about 80 % inside the model's
    culmen and tectum, before and after. Fitting to it would lower the superior vermis. **The owner's decision
    (23 November): the cisterns stay as they are.**
- **The trochlear nerve laid round the brainstem (the owner, 23 November: "Let's go with trochlear").** On
  `fix/trochlear-course` (off `fix/hindbrain-refit`), local:
  - **What the refit had done, unnoticed when PR 32 was pushed:** with the hindbrain moved, the routed trochlear
    course lay inside the fitted brainstem from its start for 18.2 mm (left) and 16.5 mm (right), and the root cut
    (MB-11) took all of that off: the nerve in PR 32 begins at the front of the pons. No other nerve's cut changed by
    more than 1.5 mm. PR 32's auto-merge was paused for this fix.
  - **Why the course is wrong at its source:** in Z-Anatomy's own model, before any fit, the trochlear nerve's line
    lies 1 to 3 mm inside the pons mesh's upper rim, under the midbrain, for its first 38 mm; its first centimetre is
    the way through the brainstem (from in front of the aqueduct across the midline behind it). The posterior fossa
    fit carries it faithfully (the carry's weight is 1 there), and `skullbase_nerves.route`, which knows bone but not
    the brain, then cuts the loop off as a chord through the brainstem.
  - **What is drawn now** (`skullbase_v3_roots.py`, `ROUND`): from where the fitted course runs furthest back, moved
    straight back onto the surface, the least-cost path over the surface (outside the midbrain, pons, medulla,
    superior cerebellar peduncle and fourth ventricle, and off the drawn arteries and veins; each step costs more the
    further it is from the fitted course) to where the routed tube has left the brainstem; smoothed, the pushes back
    out spread along the line so it turns wider than the brainstem's edges, and blended into the routed line over its
    next 3 mm. From there on the routed tube keeps its vertices, so the cavernous sinus, its triangles, the superior
    orbital fissure and the tumours are as they were (the tumour step rerun: no file changed). The nerve leaves the
    back of the pons 6 to 8 mm from the midline, below the inferior colliculus, runs in the groove between the pons
    and the midbrain, for most of the way between the posterior cerebral artery above and the superior cerebellar
    artery below, and comes down in front of the pons; 74 mm (left) and 67 mm (right) long (70 and 63 mm since the
    hook at the cavernous sinus went, below). Its first 7 to 9 mm run
    inside the cerebellum's mesh, which lies against the brainstem there (the model has no fissure).
  - The step now takes each nerve from the file its source wrote, so it can be run again on its own
    (`pipeline/.venv/bin/python -I -W ignore pipeline/skullbase_v3_roots.py`, then `compress.mjs skullbase-v3
    tb_trochlear_nerve_iv.cleared.glb` and `skullbase_v3.py finalize`); the other nine nerves' files come out byte
    for byte as before. Only the trochlear nerve's file and card, the manifest and the modification record changed.
  - Validation 923/923 (two new checks: the trochlear nerve's centre line nowhere more than 0.75 mm inside the
    brainstem); a unit test that the nerve begins behind the midbrain's middle on each side.
  - **Left as it was:** the brainstem section's own trochlear nerve (the MNI model) is another file and was not
    looked at.
- **III and IV come to the cavernous sinus in one bend (the owner, 23 November: "Yes on both").** On
  `fix/trochlear-corner` (off PR 32's head `cbdeaeb`), local:
  - **What was wrong:** `skullbase_v3_cavernous.py` spliced each nerve from its route's point nearest the dural
    entry drawn there. The routes pass 2.3 to 4.4 mm from those entries, so each nerve ran past its entry and hooked
    back to it (turns of 108 to 155° within 3 mm); the trochlear nerve then climbed 4 mm to its level in the wall
    within 5 mm. It was so before the refit.
  - **The rule now** (`ENTRY_LEAD_MM`, `lead_in`, `ENTRY_GAP_MM`, `ENTRY_STEP_MM`): the oculomotor nerve's splice
    begins 12 mm and the trochlear nerve's 10 mm back along the route. The oculomotor nerve's straight way to its
    entry cuts the posterior clinoid (its route runs over that process's top, its entry lies below and beside it),
    so its lead-in is relaxed off the CT's bone (1 mm where there is room; the centre line keeps 0.46 mm off on the
    left, 0.90 mm on the right; before 0.66 and 0.41 mm). The trochlear nerve's first point in the wall lies at least
    5 mm in front of its entry, so it climbs to its level over 9 mm. Both curves' points lie 0.3 mm apart, so their
    tubes' rings are 0.6 mm apart as on the routes (the spline's own steps gave rings up to 1.6 mm apart).
    Sharpest turn between 0.5 mm steps: III 38° and 41° before, 15° and 11° now; IV 55° and 48° before, 11° and 7°.
  - **The middle (supratrochlear) triangle changed with it.** Its front corner was "where III and IV come closest
    in front of their entries". In the wall the two run side by side 1.6 to 1.9 mm apart, so that place was decided
    by the search's starting point: 4 mm in front of the entries on both sides, because the trochlear nerve climbed
    steeply there. With the gentler climb it fell 7 mm in front of them on the right and at the fissure on the left. The
    corner is now the furthest-forward point within 0.1 mm of their least distance, behind the fissure
    (`front_most`, `SIDE_BY_SIDE_MM`): at the superior orbital fissure on both sides, as the inferior triangle's
    already was. The triangle is 22 mm long and 48 mm² on each side (was 13 and 15 mm²). v1 keeps the old rule
    (`triangles(..., side_by_side=0)`). The inferior and superior triangles' front corners moved 0.1 to 0.4 mm.
    **The owner has not seen this change yet: it is in the report of 23 November.**
  - **What changed with them:** the tumour copies that keep a channel for these nerves (Knosp 3A, 3B, 4, the
    tuberculum sellae meningioma), the endonasal grid (the sinus's medial-wall steps, 3 and 5 mm³ larger), the trochlear
    nerve's laid part (it blends into the new curve: 70 mm on the left, 63 mm on the right; sharpest turn 22° and
    20°). No artery, vein or other nerve file changed; clearances from vessels, brain and other nerves are within
    0.1 mm of before.
  - **Chain run:** `skullbase_v3_cavernous.py`, `skullbase_v3_endonasal.py` (clearance, junctions, roots),
    `skullbase_v3_chiasm.py`, `skullbase_v3_tumours.py`, `compress.mjs skullbase-v3` for the nine changed shipped files,
    `skullbase_v3.py finalize` (923/923), `skullbase_ct_openings.py` and `skullbase_build.py ct finalize` (228/228,
    no file changed). `sbv3-fit.json`'s `drawnBone` keeps the full rebuild's values but for these two nerves (run
    after the chiasm step, the clearance also measures the chiasm, the tracts and the confluence, which a full
    rebuild does not).
  - **Left as they were then (both done on 2026-11-23, see "The abducens nerve at Dorello's canal" below):** the
    abducens nerve has the same hook at Dorello's canal (turns up to 80° between 0.5 mm
    steps on the left); the skull is carved round that nerve, so smoothing it means the skull step and every bone
    and approach copy again. **Found on the way, not fixed:** `skullbase_v3_cavernous.centre_lines` tries 8-sided
    rings first, and a 6-sided tube whose vertex count also fits 8 sides is read wrongly (17 of v3's tubes now). Of
    those it reads the right abducens nerve (the skull's carve round it), the greater petrosal nerve on both sides
    (its seat on the skull, the posterolateral and posteromedial triangles, the Kawase cut) and the right mandibular
    nerve (the Kawase cut). The centres it returns stay within the tube, so the error is under the tube's radius
    (0.3 to 0.5 mm); `skullbase_v3_roots.tube_part` reads the same tubes rightly. Mending it changes the skull's
    carve, so every bone copy again.

**Still left without a decision, and why not done this round:**
- MC-13 (v1's bone raster): it needs v1's skull step run again, which the later v1 steps depend on: see "v1's
  endonasal view" below for what it needs. MC-15 (v1's right "Insula") was done on 2026-11-24 with the brain step
  made reproducible: see "v1's brain step gives the same files every time". (AP-11, AP-15 and MC-16 were done on the night of 2026-11-24, same section.) MA-17's rest: the
  sensorimotor GPi's 18 edges shared by more than two triangles (in the label's own shape).
- Text for the owner: B-016's three cortex sentences a clinician should judge (the lunate sulcus as the V1/V2 border,
  receptive aphasia from supramarginal lesions, the inferior temporal gyrus "underneath the central temporal
  sulcus"); B-020's "restiform body" (Keser 2015, PMC4389543, calls the inferior peduncles "also known as restiform
  bodies" and describes a smaller juxtarestiform body).
- Engineering left: P1-08 (release memory: the audit says only if phones still struggle, unmeasured), P2S-19
  (dependency majors, through Dependabot one at a time), P1-27's `preserveDrawingBuffer` (the browser tests read the
  canvas) and `dist/` in git (a workflow choice), UI-14's docked legend or camera offset, UI-22's jump row, UI-27's
  shorter phone disclaimer.
  Done on 2026-11-23 (below): UI-13 (Back history, measurements and the endonasal endoscope in links), the
  ARCHITECTURE.md, the cortex's `ax=abc`, the endoscopes' keys in the help.

**From the audit's roadmap (`audit/07-roadmap.md`), not started:** teaching tours, approach comparison, side-by-side
targets, sourced lead trajectories (no source yet), a changelog page, a coordinate readout relative to a chosen
landmark, a text alternative to the 3D view; one claim schema with review dates and a reference-check script
(section 4); surface anatomy, one landmark schema and a frame registry (section 5); one asset contract in the
pipeline, preview deployments, `dist/` out of git, fit checks that fail both ways beyond the brainstem (section 6).
The tract data (section 2) is done as far as open data go: the acoustic radiation is a shell from the Pandora atlas
(below), the DRTT has been crossed and uncrossed since B4, and the optic radiation keeps HCP-1065's streamlines (Pandora's
starts at the lateral geniculate body, but its loop reaches only 4 to 5 mm further forward). Done from it: help and reset, cards into view, "what this bundle shows", surgical views,
loading per view, side effects, geometry checks and browser tests in CI, a linter, figure export, isolate and
per-structure opacity, slices under the cortex, the citation panel, keyboard control of the 3D view.

## v1's brain step gives the same files every time; its halves mirror each other (desktop, 2026-11-24)

Branch `fix/v1-brain-reproducible`, on top of `fix/v1-adenoma-sinus`. **Local only: not pushed.** The owner's word of
24 November: make the step reproducible on the desktop first. The audit's MC-15 is done with it.

- **Why it differed from run to run:** in `hemisphere`, a face whose three corners lie in three different lobes took
  `max(set(lobes), key=count)`: one of the three by the set's order, which follows Python's string hashing and
  changes with every run. Twenty faces a side; twelve of them touch the temporal lobe or the insula, which are
  remade apart from the rest, so two faces went to the insula's group or not. The surface sampling then drew other
  points everywhere, and every surface, shape and carried artery came out a little different. Now the first by name
  (`sorted`). Two runs give byte-identical files (all 304 in v1's build).
- **Found on the way: a piece of cortex was missing on one side.** Reducing each remade surface to its share of
  90 000 triangles pinches thin sheets off it; the largest of the three surfaces (all but the temporal lobe and the
  insula) comes out in 81 pieces on the right and 57 on the left, nearly all flaps of two triangles, and `remesh`
  kept "the largest piece only". One of the pieces is 32.6 cm² of the medial parietal
  surface. It was dropped on the left in the build shipped until now, and on the left or the right as a run went.
  - Now every piece of `REMESH_KEEP_MM2` (25 mm²) or more is kept: of that surface seven on the right and four on
    the left here; 1.5 to 1.8 cm² of flaps a side are dropped.
  - A piece with no held point drifts in the as-rigid-as-possible solve (one went 86 mm in the lift). So the
    opening and the lifts are solved on the surface without the pinched-off pieces, and each of their points then
    moves as the nearest point of that surface.
- **MC-15 (the right "Insula" twice the left, reaching the occipital region):** Z-Anatomy names the left artery
  "Middle cerebral artery (M3 segment)" and the right one "(M3-segment)". `fissure_course` read the second form
  only, so the left course had M1 and M2 and the right one all 80 mm of M3 too, which runs back to 70 mm behind
  the fossa.
  - `segment_name` reads both forms.
  - The course ends where Z-Anatomy's own lateral fissure ends (`fissure_span`: its fissure patches and the
    circular sulcus, from 54.2 mm behind the fossa to 26.2 mm in front). M3's last 16 mm run on the cortex.
  - The white-matter floor is kept within the same span.
  - Result: both floors 31 565 triangles (were 39 406 right, 18 932 left). The opercula are 2 427 vertices on the
    right (were 2 758): the opening no longer parts cortex behind the fissure's end.
- **The halves now mirror each other** (areas in cm², and the surface more than 2 mm from the other side's mirror
  image):

  | | Before, R / L | Now, R / L | Unmatched before | Unmatched now |
  |---|---|---|---|---|
  | Cortex without the insula | 2028 / 1992 | 2030 / 2022 | 1.5 | 0.1 |
  | Insula with its floor | 271 / 147 | 222 / 222 | 116 | 0.1 |

- **Shapes on the new surface:** the opening moves 7 122 vertices, at most 6.65 mm (5 733 and 6.26 before); the lifts
  8.15 and 13.05 mm at most (8.19 and 12.28); the interhemispheric shape 8.23 mm (8.25).
- **Chain run after the brain step** (`chain.sh` in the scratchpad's `v1brain/`): `skullbase_v1.py brain`,
  `skullbase_v1_endonasal.py`, `skullbase_v1_vessels.py`, `skullbase_v1_ends.py`,
  `SB_PROFILE=v1 skullbase_v3_tumours.py`, `skullbase_v1_inbone.py`, `compress.mjs skullbase` for the 31 changed
  files, `skullbase_build.py finalize` (675/675, six new checks: each brain piece's halves mirror each other).
  - Changed: the six brain pieces, the 16 cortical arteries carried with the cortex, the temporal lobe's two
    lifted copies, the olfactory groove and tuberculum sellae meningiomas with their four brain copies, Koos IV.
  - The manifest's five subtemporal approach items now come before the brain's, as a full rebuild orders them.
  - The tumours' report takes this run's figures throughout (the foramen magnum meningioma's by one point and
    0.01 mm, as found on 24 November).
- **Not rebuilt:** the steps before the brain step (skull, ear, approaches) and the posterior fossa step, which do
  not read the cerebrum.
- **Tests:** `tests/unit/skullbase.test.ts` asks that each v1 brain piece's halves mirror each other within 1 mm (the
  insula's centres lay 23 mm apart front to back, the frontal lobe's 2 mm).
- **MacBook baselines:** every v1 picture that shows the brain.

## v1's adenomas by the gland without its stalk; v1's cavernous sinus exact (desktop, 2026-11-24)

Branch `fix/v1-adenoma-sinus`, on top of `fix/chiasm-under-aca`. **Local only: not pushed.** The owner's word of
24 November: both mended together, after the chiasm.

- **The adenomas** (`SB_PROFILE=v1 skullbase_v3_tumours.py`): the ellipsoid is centred 2.5 mm above the middle of the
  anterior lobe as built, that is, without the stalk `skullbase_v1_stalk.py` names apart. Its centre is 1.95 mm lower
  and 0.7 mm further forward than with the whole lobe.
- **The cavernous sinus** (`mesh_inside` in `skullbase_v1_endonasal.py`): Z-Anatomy's sinus mesh is a closed shell of
  512 triangles and 9 216 more that enclose nothing (in pairs: a ribbon from the sinus's top towards the posterior
  intercavernous sinus). The sinus is now what the shell encloses: 1 270 mm³ on the grid (the shell: 1 269.8 mm³).
  Before, the whole mesh's surface was widened by a voxel and filled: 1 795 mm³, the ribbon with it.
- **What changed:**
  - The four adenomas, all still graded as meant: 1.06, 1.12, 1.16 and 1.35 ml (were 1.11, 1.20, 1.24, 1.50).
  - The endonasal view's two medial-wall steps: 1 249 and 1 248 mm³ (were 1 786 and 1 785), 159 and 158 mm³ of them
    bone (were 326 and 325). No other piece, the way or the scope's reach changed.
  - `cavernous_cond.npz` in v1's build.
- **Run alone and unchanged first, the tumours' step gave the committed files** but for two things, neither from this
  change: Knosp 3A moved by 0.01 mm (its nerves' tubes are read rightly since 2026-11-23), and the foramen magnum
  meningioma's report by one point and 0.01 mm (its files byte for byte the same). The items that only moved by
  that are put back from git; `sb-tumours.json` keeps the committed Koos and meningioma parts.
- **Chain run:** `skullbase_v1_endonasal.py`, `SB_PROFILE=v1 skullbase_v3_tumours.py`, `skullbase_v1_inbone.py`,
  `compress.mjs skullbase` for the four adenomas, `skullbase_build.py finalize` (669/669).
- **The tumours' step also cleared four stale files** from the desktop's v1 build folder (copies no run makes any
  more: the callosomarginal artery's for the olfactory groove meningioma, the lateral pontine branches' for Koos
  2 to 4). None was shipped.
- **MacBook baselines:** v1's Knosp pictures and the endonasal view with a cavernous sinus's wall taken away.

## v3's optic chiasm at the height the CT shows it; the stalk traced on the CT (desktop, 2026-11-24)

Branch `fix/chiasm-under-aca`, from main after pull requests 39 and 40 were merged. **Local only: not pushed.** The
owner's word of 24 November: try to mend the chiasm running through the anterior cerebral arteries.

- **What was wrong:** the chiasm was drawn where the fitted Z-Anatomy block lies, 17.8 mm above the fossa and tilted
  33°. This CT's A1 segments run at 17 to 20 mm, so they pierced it (14 % of its surface up to 1 mm inside them).
  Lowering the tilted slab clear of them took 5 mm and ran its front corners into the carotids (the night's finding).
- **What the CT shows:** the chiasm itself. Between the suprasellar cistern (fluid, about 10 HU) and the third
  ventricle's recess above (fluid again) lies a band of soft tissue (about 38 HU) 2.5 mm thick, directly under the
  two A1 segments. The fitted block lay in the recess's fluid. The stalk shows too: it takes up contrast (60 to
  100 HU), from the gland up and back to the floor behind the chiasm.
- **The rule now** (`pipeline/skullbase_v3_chiasm.py`, `on_ct`):
  - Across and front to back the chiasm stays at the fitted block's centre, with its length.
  - Its height is `ct_height`: columns every 0.25 mm within 2.5 mm of the fitted centre, the CT blurred by 0.3 mm; a
    column counts where the cistern below falls under 17 HU, the band rises over 25 HU and falls under it again
    above, with nothing over 90 HU in it (an artery, the stalk). The height is the median of the bands' middles:
    15.48 mm, from 157 of 441 columns (quartiles 15.03 and 15.73 mm; with other windows and blurs 15.45 to 15.65).
  - It is drawn level. The band is too short and too noisy to read a tilt from.
  - It is then lowered in steps of 0.05 mm until no point of its surface is in or within 0.1 mm of an artery's mesh:
    0.1 mm here, off the A1 segments. So its middle is at 15.38 mm.
- **The tracts** are flat now (as wide as the nerves, as thick as the chiasm), start 1.5 mm inside the chiasm and
  bend out of its plane where an artery lies within their width (`clear_tract`): the right one 0.58 mm down under
  the A1 segment's origin, the left one not at all. The round tubes, 3.5 mm thick, could not pass between the A1
  origin above and the posterior cerebral and posterior communicating arteries below (the night's finding).
- **The stalk** (`stalk_on_ct` in `pipeline/skullbase_v3_endonasal.py`): from the gland's top, level by level
  (0.25 mm), the brightness-weighted centre of what is between 45 and 150 HU within 2 mm of the level below's
  centre, to where less than a quarter of that disc is as bright. From (0, 0.8, 9.1) to (0.4, −3.8, 14.9) mm: 5.8 mm
  up and 4.6 mm back (the rule before: 5.5 up and 2.5 back, which now ran 1.2 mm into the chiasm). Its top is flat
  where it fades, and it keeps 0.3 mm off the chiasm as drawn. Its thickness is still by rule (2 mm at the gland,
  2.8 mm above).
- **The endonasal fields:** the distance to the nerves takes the chiasm as drawn (it took v2's fitted block, 2.4 mm
  too high). No piece's volume changed. The step asks `skullbase_v3_chiasm.on_ct` for the frame, so it needs v3's
  manifest and the optic nerves' routes first, as before.
- **What changed with it:** the six Knosp adenomas are 0.06 ml smaller each (they keep off the nerves, and the chiasm
  is lower: 1.02 → 0.96 ml for grade 0; every grade is still drawn and graded as meant); the tuberculum sellae
  meningioma (2.52 → 2.49 ml) and the four brain copies of its view. Nothing else in v3's build changed (md5 of all
  299 build files before and after).
- **Checked against everything round it** (a scratch sweep over v3's 97 plain structures): the chiasm, the tracts,
  the nerves' ends and the stalk lie in no artery, vein, nerve or gland; they touch only each other where they join.
- **Chain run:** `skullbase_v3_endonasal.py` (3 min), `skullbase_v3_chiasm.py`, `skullbase_v3_tumours.py`,
  `compress.mjs skullbase-v3` for the 15 changed files, `skullbase_v3.py finalize` (1275/1275, six new checks: the
  height read from the CT; the chiasm's and the tracts' surfaces in no artery and not in the stalk; the chiasm's
  middle where it was placed), `ventricles_build.py refresh` (the ventricles section shows four of the changed
  copies by reference). `sbv3-fit.json` is put back from git: run alone, the endonasal step also measures the
  chiasm, the tracts and the confluence against the bone, which a full rebuild does not. One centroid that moved by
  0.01 mm in an untouched item (rounding) is put back too.
- **v1 is unchanged:** `skullbase_v1_nerves.py` calls the same `draw` with Z-Anatomy's own frame (checked: with the
  old frame and no arteries the three files come out byte for byte as before).
- **Tests:** `tests/unit/mesh-checks.test.ts` holds the chiasm, the tracts and the stalk out of six arteries and the
  chiasm and tracts out of the stalk, on the shipped meshes.
- **For the owner to judge:**
  - The chiasm is level. The CT gives no slope here, and with the fitted model's 33° it cannot pass under the A1
    segments; whether it should slope a little is the owner's to say.
  - The height's uncertainty is about 0.2 mm (which columns count), and the last 0.1 mm is set by the arteries'
    meshes, not by the CT.
  - The adenomas' tops now stop under the lower chiasm. A real adenoma that size lifts the chiasm; the cards say the
    adenoma is a shape drawn by rule.
  - The intracranial optic nerves are not in the endonasal fields' distance to the nerves (only TotalSegmentator's
    orbital part and the chiasm are): the burr is not stopped by them. As before; not changed here.
- **MacBook baselines:** every v3 picture that shows the chiasm, the tracts or the stalk (the nerves, cavernous,
  endonasal and anterolateral views, the Knosp grades, the tuberculum sellae meningioma).

## v1's pituitary stalk, and the gland measured as a closed body (desktop, 2026-11-24)

Branch `fix/v1-items` (pull request 40). The owner's word of 24 November: the upper part of Z-Anatomy's hypophysis is
drawn as the stalk.

- **The stalk** (`pipeline/skullbase_v1_stalk.py`, a new step after `skullbase_build.py`): Z-Anatomy's
  "Adenohypophysis" and "Neurohypophysis" are each an open shell; they share one rim of 56 vertices (flat within
  0.07 mm) and close each other. Both go on above the gland as a narrow neck. Both shells are cut level where the
  hypophysis, going up from its widest level, is first narrower than a third of its greatest width
  (`STALK_WIDTH_SHARE`): 10.36 mm above the fossa (11.9 mm across at 6.4 mm; 3.9 mm at the cut; 3.3 to 3.9 mm from
  there up). What lies above is the new item `sb_pituitary_stalk` "Pituitary stalk", 3.9 mm high; the lobes keep the
  rest. No vertex is moved, and like Z-Anatomy's lobes the three parts are open towards each other.
  - **A third, not a half:** at a half the cut falls on the gland's shoulder (5.7 mm across, 4.6 mm front to back);
    at a third it falls where the shoulder ends. A drawing choice; the panel and the item say so.
  - It writes the three GLBs, the manifest items, the three items' entries in `sb-regions.json` and its record in
    `sb-modifications.json`. Run `compress.mjs skullbase sb_adenohypophysis.glb sb_neurohypophysis.glb
    sb_pituitary_stalk.glb` and `skullbase_build.py finalize` after it (the manifest does not parse while the new
    item's size is 0).
  - Front end: `V1_ABSENT` no longer lists the stalk, so v1's pterional, supraorbital and orbitozygomatic views draw
    it as v3's do (AP-08); v1's cavernous and endonasal views list it.
  - **The tumours were not moved in that commit** (the step read Z-Anatomy's whole lobe, stalk part included). Since
    the owner's word of 24 November the adenomas follow the gland without its stalk: see "v1's adenomas" above.
- **Found on the way and fixed: the endonasal step measured the gland as a hollow skin.** `mesh_inside` took each
  shell alone; an open shell encloses nothing, so each lobe was only its surface, a voxel thick and a voxel too
  large all round, and the "gland" their union. The figures of the night before (14.5 mm high, 526 mm³, 7.5 mm above
  the diaphragma, 321 mm³ below it) were that skin's. Now the hypophysis is what the two shells enclose together
  (`skullbase_v1_stalk.closed`, filled on the grid), the lobes parted at the plane of their common rim, the stalk
  above the neck (label 3 in the `gland` field, as v3's).
  - **Figures, from the meshes** (`volume_within`: exact; the 0.5 mm grid holds 6 % less than the closed mesh): the
    gland without its stalk 11.9 × 9.2 × 8.7 mm, 541.0 mm³ (anterior lobe 296.4, posterior 244.6); 2.6 mm of it above
    the diaphragma's level, 6.0 mm and 408.5 mm³ below; the stalk 24.6 mm³. The whole, 565.6 mm³, is 12.6 mm high.
  - **What moved with it:** the sellar floor's piece 157 → 198 mm³ and the dura's 125 → 71 mm³ (the gland's surface
    is half a millimetre further in); the other pieces, the way and the scope's reach are as they were.
- **Found on the way and fixed:** the "Hypophysis" see-through group in the endonasal panel listed v3's names for the
  lobes only, so it lit nothing on v1. It lists Z-Anatomy's names too; a unit test asks that every group lights
  something on v1.
- **Found then, mended since (see "v1's adenomas" above): v1's cavernous sinuses are a voxel too large in the
  endonasal step.** Z-Anatomy's sinus meshes
  are not watertight either, so `mesh_inside` takes their surface widened by a voxel and filled: 1795 mm³ on the
  grid against 1273 mm³ in the mesh. `cavernous_cond.npz` holds this, and the Knosp section and the sinus's
  medial-wall steps (1786 mm³ each) are made on it. Mending it changes v1's tumours and those two steps, so it wants
  the tumours' step run again and the grades looked at.
- **Checks:** `skullbase_build.py finalize` has four new checks (the three meshes together span Z-Anatomy's two; they
  meet at the cut's level; the stalk is under half the gland's width; no vertex off the source surface).
  `tests/unit/endonasal-v1.test.ts`: the lobes fill the gland, the stalk lies above them and is narrow, every
  see-through group lights something.

## v1's endonasal view: the scope's way, the slider's note, the gland (desktop, night of 2026-11-24)

Branch `fix/v1-items`, on top of `fix/nerves-through-vessels`. Pushed on 2026-11-24 on the owner's word (pull request 40).
The audit's AP-15, AP-11 and MC-16; MC-13 and MC-15 are not done (below).

- **Found on the way: on v1 the scope never reached the sphenoid sinus.** It stopped 26 mm in, on both sides, with
  the committed data too. The scope needs a clear core 2.5 mm across (`ScopePath.room`, `ENDO_SCOPE_ROOM_MM`); under
  Z-Anatomy's nasal bones the space the bones enclose is a slit 2–3 mm high against the closure of the outside, and
  from 28 to 38 mm along the way there was 1.5–2 mm. No test asked how far v1's scope goes (v3's asks only for more
  than 3 mm). The audit's figures for v1 (52 of 78 mm) were measured on the live site, an older build of v1.
  - **The rule now** (`WAY_CORE_MM = 1.75` in `pipeline/skullbase_v1_endonasal.py`): the way keeps its course, and
    within 1.75 mm of its line it is opened whatever lies there, bone or closure. The scope goes 83.25 mm on both
    sides, to the sinus, and the burr opens its way in (three rounds, 84 mm³ of bone). The panel says so
    (`corridorCoreMm` in `sb-endonasal.json`).
  - **Tried and dropped:** letting the way run through the closure of the outside. With all of it allowed the way
    took another course (along x = 4 mm, low, then up into the sinus from behind and below; 99 mm); with only the
    closure within 3 mm of the nose it still had 1.5–2.5 mm in three places under the nasal bones.
  - **Found once the scope got through, not fixed: the way comes to the sinus from below and beside it, not at its
    front wall.** The scope rests at (±9, 16, −11) mm, under the sinus's floor (z −9.5 mm), looking up, back and
    towards the midline. Taking away step 1, "Front wall of the sphenoid sinus" (centre (0, 20.5, −1.8) mm), opens
    nothing in its line; only the burr does. The way takes "the thinnest wall" between the nose and the sinus, and
    the air Z-Anatomy's bones enclose lies below and beside the sphenoid's body. Tried: the wall crossed only in
    front of the sinus (nearest sinus air within 45° of straight back), and the way forbidden within 4 mm of the
    sinus anywhere else. The way then ended under the sinus's floor near the midline (±2.5, 14.5, −11.5): the model
    has no air in front of the sinus's face for it to follow. Left as it was, by the owner's word of 24 November
    ("current is fine").
  - **For the owner to judge too:** the way starts under the nasal bones (the front-most air the bones enclose),
    high for a nostril; Z-Anatomy has no soft nose. The course is as it was; only its width changed.
- **AP-15 (both models):** the "In" slider's read-out says how far the way is open: "In 26.0 mm (the way is open to
  83.3 of 106 mm)" (`openTo()` in `src/ui/skullbase-endonasal.ts`; recomputed only when the scope's side or turn or
  what is taken away changes). On v3 the right side reads 9.0 of 37 mm until the front wall is taken away.
- **MC-16:** the step measures the way's width as drawn (`corridor.L/R.freeMm`: least, median, share under 3.5 mm;
  twice the distance from the opened way to the nearest lining, on the 0.5 mm grid). After the fix: least 2.8 mm
  (right) and 3.0 mm (left), median 3.7 mm. The panel states it beside the 4 mm the turbinates are pushed aside to.
- **AP-11:** Z-Anatomy's hypophysis is 14.5 mm high because its two lobes reach 7.5 mm above the diaphragma's level
  (the plane through its tuberculum and dorsum sellae). Below that level it is 7.0 mm high and 321 mm³. The panel
  states both (`gland.aboveDiaphragmaMm`, `gland.belowDiaphragma`). **These figures were wrong (a hollow, widened
  skin was measured) and are replaced: see "v1's pituitary stalk" above.** The owner's word of 24 November: the
  upper part is drawn as the stalk.
- **The step was not reproducible:** trimesh's surface sampler does not follow numpy's seed, so the gland's and the
  pieces' volumes differed by about 1 % between runs. `mesh_inside` now samples with `seed=0`; two runs give
  byte-identical files. The data also differs from the committed files because `centre_lines` (mended on
  2026-11-23) now reads v1's nerve tubes rightly, which moves the nerve distance field a little (pieces by under
  2 mm³).
- **Not done, and what each needs:**
  - **MC-13** (v1's bone raster 0.5–0.9 mm fatter than the bone meshes): `SURF_MM = 0.5` in
    `pipeline/skullbase_v1_skull.py` thickens the nearly closed bones by design. Changing it redoes v1's skull
    field, hence every v1 approach copy, the endonasal fields and the brain's cavity. A full v1 rebuild, and a
    decision on the value.
  - **MC-15** (v1's right "Insula" holds the fissure's white-matter floor back to the occipital region): done on
    2026-11-24, with the brain step made reproducible (the section "v1's brain step gives the same files every
    time" above).
- **Tests:** `tests/unit/endonasal-v1.test.ts` (the scope reaches the sinus and the burr opens its way in;
  the way's width and the gland below the diaphragma are stated), `tests/e2e/audit-fixes.spec.ts` (the slider's
  note on both models).
- **MacBook baselines:** v1's endonasal pictures change in the front 40 mm of the way (wider under the nasal bones).
- **v1 has not been rebuilt** after the tube-reader fix, except this step.

## Structures through each other: the sweep, and the jugular foramen (desktop, night of 2026-11-24)

- Branch `fix/nerves-through-vessels` (off `fix/abducens-in-sinus`, pull request 38's head), in the worktree
  `.claude/worktrees/audit-fixes`. **Local, not pushed: the owner checks it first** ("I would like to check them in
  the morning"). The owner had seen the abducens nerve run into the carotid; asked what to run overnight, they chose
  a sweep of the models for more of the same, fixing what has a clear rule.
- **The sweep** (`sweep.py` in the scratchpad's `sweep/`; read-only): every nerve, artery and vein as shown, its
  vertices tested against every artery, vein and brain part that is a closed mesh (a ray's parity), in v3, v1 and
  v2. 239 pairs with something inside in v3, 308 in v1, 161 in v2; most are by design (a branch at its parent
  artery, a vein at its sinus, the carotid and the nerves in the cavernous sinus, the abducens nerve in the inferior
  petrosal sinus at Dorello's canal). Not tested: the brain parts, whose halves are not closed meshes on their own;
  the artery-artery, vein-vein and artery-vein pairs were not read one by one.
- **Fixed: the jugular foramen (v3).** Routed like the other nerves, 17 to 21 % of the glossopharyngeal nerve's tube
  and 7 to 19 % of the accessory nerve's lay in the sigmoid sinus (up to 1.7 mm deep), 11 % of the left vagus
  nerve's in the inferior petrosal sinus, and the left IX and XI ran through each other. TopBrain does not label
  these veins, so the routing did not know them. Now (`skullbase_v3_base.jugular_routes`, `skullbase_nerves.route`'s
  `avoid`):
  - the sigmoid sinus as traced, the inferior petrosal sinus as laid and TotalSegmentator's jugular vein count as
    vessel lumen for IX, X and XI (0.8 mm round the sinuses' tubes), as TopBrain's labels do for every nerve;
  - each of the three keeps 1.2 mm from the centre lines of those routed before it;
  - the accessory nerve is led beside the vagus nerve through the foramen (`beside_vagus`);
  - the order is X, IX, XI. **This order is tuned to this CT**: with IX first the left XI went the long way round
    the sinus (55 mm against 46, 100° within 3 mm); with IX last it went the long way (52 mm against 49).
  - Sources (PubMed abstracts only, full texts not read): Ayeni 1995 (PMID 7472562): IX through a smaller
    anteromedial opening of the dura, X and XI through one larger opening; all three anteromedial to the jugular
    bulb. Rubinstein 1995 (PMID 7900591, PMC8337704): X and XI could not be separated on CT. Katsuta and Rhoton
    1997 (PMID 9218307): the neural part lies between the sigmoid and petrosal parts of the foramen. **They are in
    the code's comments and the README, not on a card or in the reference list** (the owner, 24 November: no need to
    put them on the cards).
  - Result: none of the three touches a vein or an artery; they pass 1.2 to 2.9 mm from each other. Lengths and
    sharpest turns (between 0.5 mm steps; over 3 mm): left IX 48.6 mm, 27°, 73° (was 46.2, 41°, 82°); left X 42.1,
    19°, 64° (41.4, 34°, 60°); left XI 45.6, 21°, 67° (48.1, 20°, 61°); right IX 42.3, 14°, 52°; X as it was;
    XI 46.4, 18°, 76°. The accessory nerve lies up to 11 mm (left) and 8 mm (right) from where the fitted model has
    it; the check of that distance takes the nearer of its fitted course and the vagus nerve's route
    (`maxFromGuideMm`: 4.1 and 4.9 mm).
  - **The landmark "Jugular foramen" stays where it was.** It was taken from the three nerves as drawn (where they
    are most enclosed by bone); with the nerves in the medial part of the opening it moved 4 to 6 mm, which moved the
    petroclival meningioma (its site lies a third of the way from the petrous apex to this landmark) and dropped
    three of that view's copies. It is now taken from the three nerves' plain least-cost paths through the whole
    opening (`through` in `build`), as before; the landmark's text says so.
  - Not the sinus that gives way: the inferior petrosal sinus is one of the courses the skull is carved round, so
    moving it means the skull chain. **Each skull chain re-meshes every bone and its approach copies: about 25 MB of
    binary files in git, twice with `dist/`.** Three ran on 23 November.
  - Chain: `v3 cav endo chiasm tumours` (8 minutes; six times, as the faults came to light), `compress.mjs`, the
    unchanged files put back, `skullbase_v3.py finalize` (1269/1269, with 18 new checks: the three nerves' centre
    lines inside none of the three veins' meshes), v2's openings (228/228), vascular, ventricles refresh. Six shipped
    files changed: the three nerves and their copies for the Koos III and IV views. A unit test on the shipped meshes
    holds IX, X, XI out of the three veins and III, IV, VI out of the carotid.
  - Still so, as before: 4 to 21 % of these nerves' tubes lie up to 0.9 mm under the *drawn* bone of the foramen (the
    skull as drawn is thicker than the CT's bone there; the right XI rose from 11 to 21 %, the left fell from 22 to
    11 %); in the Koos IV view three points each of IX's and XI's copies are left within the tumour's margin.
- **Mended on 2026-11-24 (see "v3's optic chiasm at the height the CT shows it" above): the optic chiasm and the
  anterior cerebral arteries (v3).** As found that night: this CT's A1 segments run
  through the middle of the chiasm as drawn: 13 to 14 % of its surface lies up to 1 mm inside them, and a few
  vertices of the drawn optic tracts. The chiasm is drawn where the fitted model puts it (its centre 17.8 mm above
  the fossa, tilted 33°). Tried, and taken out again (`chiasm_scan.py`, `chiasm_probe.py` in the scratchpad's
  `night/`): lowering it along its own normal or straight down clears the arteries only at 5 mm, and from 2 to
  3 mm its front corners meet the supraclinoid carotids; the tracts as drawn (tubes 1.7 mm in radius, 12 mm long)
  meet the artery at every position tried. The whole fitted optic apparatus sits about 4 to 5 mm high against this
  patient's arteries; where it should lie is a judgement, not a rule found.
- **Small contacts left in v3** (a few vertices each, under 0.5 mm unless said): the left trigeminal nerve and the
  superior cerebellar artery's fitted course (5 vertices); the left trigeminal ganglion and the petrous carotid
  (2 vertices, 1.6 mm from the artery's surface); the right mandibular nerve and the accessory meningeal artery at
  the foramen ovale (7); the left hypoglossal nerve and the vertebral artery (3); the left optic nerve and the
  ophthalmic artery (1); III, IV and VI and the ophthalmic veins at the superior orbital fissure (0.7 to 2.2 % of
  each nerve, up to 1 mm).
- **v1 (Z-Anatomy's own courses), not changed:** the glossopharyngeal nerve through the internal carotid artery in
  the neck (2.5 % of its tube, 1.9 mm deep, both sides); the abducens nerve in the inferior petrosal sinus (3.5 %)
  and in the carotid (1.2 %, 1.3 mm); the trochlear nerve in the superior ophthalmic vein (3.2 %); the hypoglossal
  nerve in the carotid, the accessory and vagus nerves in the vertebral artery, the oculomotor nerve in the
  posterior cerebral artery (each under 1 %). 27 nerve-artery pairs in all, most under 0.5 %.
- **v2**, whose nerves are kept as fitted and say so on their cards: the left glossopharyngeal nerve in the
  vertebral artery (3.9 %), the left oculomotor nerve in the posterior cerebral artery (2.4 %), and smaller ones.

## The abducens nerve at Dorello's canal, and the nerves through the carotid (desktop, 2026-11-23)

- Branch `fix/abducens-dorello` (off `feat/endonasal-link`, pull request 36's head), in the worktree
  `.claude/worktrees/audit-fixes`. Local until the owner says push. The owner: "Let's go with 2" (the abducens
  nerve's hook, with the tube reader in the same pass); then, on seeing the first result: "It looks like the nerve
  goes into the artery".
- **Three faults in the abducens nerve's 15 mm from the clivus to the carotid.**
  1. *The hook.* As for III and IV, `skullbase_v3_cavernous.py` spliced the nerve from its route's point nearest the
     entry drawn at Dorello's canal. The route passes 2.5 mm (left) and 2.2 mm (right) from that entry, so the nerve
     ran past it and hooked back: 80° (left) and 43° (right) between points 0.5 mm apart.
  2. *The dip on the left.* After the canal the nerve is led against the carotid's posterior vertical segment, "4 mm
     up the segment". The segment is drawn from the foramen lacerum, which lies 2.5 mm lower on this CT's left. So
     on the left the nerve met the carotid 3 mm *below* its entry, dipping through 6 mm of the CT's bone, and then
     climbed 8 mm; on the right it met it 2 mm above its entry.
  3. *Through the artery* (the owner saw it). The entry lies behind the artery and a little medial of it, the nerve's
     place beside the artery lateral: the straight way between them cut through the artery. And the point beside it
     was set by the carotid line's radius (1.7 mm there), which is smaller than the traced part's tube as drawn
     (2.4 mm). The nerve's centre line ran 2.5 mm (left) and 3.8 mm (right) inside the traced part's tube. It was so
     before this work.
- **The rules now** (`skullbase_v3_cavernous.py`).
  - `ENTRY_LEAD_MM["Abducens nerve (VI)"] = 8.0`: the splice begins 8 mm back along the route. No relaxation off the
    bone: the nerve runs on the clivus's dura there, and the skull is carved round it.
  - `VI_ON_CAROTID_MM = (4.0, 2.0)`: beside the carotid 4 mm up the segment, and no lower than 2 mm above the
    nerve's own entry.
  - `art_sd`: the distance to the carotid as drawn (TopBrain's label, and the traced part's tube by its centre line
    and radius). `round_carotid()` relaxes the curve between the entry and the place beside the horizontal segment
    off the artery, as `lead_in` relaxes a lead-in off the bone, and gives way points 1 mm apart (`VI_WAY_MM`); the
    aim is raised until the curve drawn through them keeps `OFF_CAROTID_MM` (0.8 mm) off the artery.
  - Its splice's points lie 0.3 mm apart (`ENTRY_STEP_MM`), as III's and IV's.
- **Result for the abducens nerve.** Sharpest turn between 0.5 mm steps: 17° (left) and 21° (right), where it turns
  forward inside the sinus, not at the canal. 67.4 mm long on the left (was 74.8), 66.0 mm on the right (68.5).
  Centre line and tube outside both carotid meshes on both sides; the centre line at least 0.9 mm from the artery's
  vertices. Its tube lay 22 % (left) and 15 % (right) under the drawn bone before the carve; now 12 % and 10 %, and
  the carve takes 0.017 and 0.014 ml (0.030 and 0.026).
- **The left oculomotor nerve ran through the carotid too** (found by the new check, below): 2.5 mm of its centre
  line inside the back of the artery's label, just before its entry (3.0 mm before pull request 33). Now: the
  lead-ins of III and IV keep off the carotid as they keep off the bone (`lead_in` is given the lesser of the two
  distances), their way points are moved to `OFF_CAROTID_MM` from it, and an entry nearer the artery than
  `ENTRY_OFF_CAROTID_MM` (1.2 mm) is moved straight away from it. Only the left oculomotor nerve changed: its entry
  moved 0.5 mm (it lay 0.8 mm from the artery), its centre line now keeps 0.7 mm off the artery; sharpest turn 17°
  (was 15°). The right oculomotor nerve and both trochlear nerves are as they were.
  - Kept off the artery, it is squeezed against the posterior clinoid, where the drawn skull is thicker than the
    CT's bone: 5 % of its tube lay up to 1 mm under the bone. So the skull is carved round it as round V2 and VI
    (`skullbase_v3_skull.CLEAR_COURSES`, 0.3 mm beyond its surface: 0.004 ml on the left, nothing on the right;
    `skullbase_v3_clearance.CARVED`; the Sources page's sentence on the carve names it).
- **The tube reader.** `centre_lines` takes the fit whose rings are round (`RING_ROUND`), so a 6-sided tube whose
  vertex count also fits 8 sides is read rightly: 17 of v3's tubes were not (the right abducens nerve, the greater
  petrosal nerve on both sides, the right mandibular nerve among them). With it the posterolateral and posteromedial
  triangles' corners moved 0.2 to 0.6 mm, the Kawase rhomboid's corner on the greater petrosal nerve 0.5 mm, and
  six of v2's `apartMm` figures (its nerves against v3's) by 0.1 to 1.0 mm.
  **v1 and v2 were not rebuilt.** The reader misread 12 of v1's tubes and 4 of v2's. Of those v1's steps read only the
  greater petrosal nerve (`skullbase_v1_cavernous.py`, for its triangles: up to 0.7 mm): v1's shipped triangles
  are as the old reader gave them, and its next rebuild will move those corners by that much.
- **Found: the Kawase corner ran one build behind.** The landmark "Apex of petrous part" is found on the *drawn*
  skull by `skullbase_v3.py`, and the carve round the abducens nerve is at that apex: it moved 0.7 mm (right) and
  0.5 mm (left). `skullbase_v3_approach.py` reads it from the landmarks file of the build before for the Kawase
  rhomboid's corner, so that corner lagged (it already did in the commit before this work: 9.67 against 10.17).
  **After any change to the skull's carve, run the approaches twice:** `skull appr v3 appr v3 cav endo chiasm
  tumours` (the chain script's step names; 21 minutes here). Corner and landmark now agree.
- **Chain run** (four times in all, as the faults came to light; the last with every rule above):
  `skullbase_v3_cavernous.py` (the new courses, which the skull step reads), then `skull appr v3 appr v3 cav endo
  chiasm tumours`; `compress.mjs skullbase-v3`; shipped files put back where the build file is byte for byte as
  before or every vertex lies within 0.06 mm of an old one (54 files); `skullbase_v3.py finalize` (1251/1251);
  `skullbase_ct_openings.py` and `skullbase_build.py ct finalize` (228/228); `vascular_build.py` and its finalize
  (it shows v3's bones: no file of its own changed); `ventricles_build.py refresh` (215/215).
- **What changed in the shipped files (66 of v3's meshes, and the endonasal grid).** The abducens and oculomotor
  nerves; the 13 bones and the 43 approach files made from them (bone copies, removed pieces, the Kawase guide); the
  superior, middle, posterolateral and posteromedial triangles (corners moved 0.2 to 0.6 mm; the first two on the
  left only, with the oculomotor nerve); the Knosp 3B and 4 tumours, the tuberculum sellae and petroclival
  meningiomas (they keep channels for these nerves or lie on the carved bone). The bones' surfaces are where they
  were, apart from the carves: in the first of the four runs half of every bone's vertices lay within 0.002 mm of
  the old surface and 99 % within 0.4 mm (`surfcmp.py` in the scratchpad). The rest is the skull's mesh coming out
  differently decimated in places and seam triangles falling to the neighbouring bone (single vertices up to 5 mm
  from the old surface). As in the refit, the bones are shipped as they come: they are pieces of one surface and
  must match at their seams.
- **New checks in `skullbase_v3.validate()`** (26 in all): III, IV and VI turn at most 30° between points 0.5 mm
  apart along their spliced courses (`ENTRY_TURN_MAX_DEG`; it fails on the abducens nerve as it was); none of the
  five re-routed nerves' centre lines lies inside either carotid mesh (`points_inside`, a ray's parity; it fails on
  the abducens nerve and the left oculomotor nerve as they were).
- **The bend inside the sinus** (the owner: "Please do"; branch `fix/abducens-in-sinus`, off this one). Beside the
  carotid's horizontal segment the nerve was set half a millimetre below the artery's centre line, so it climbed to
  the artery's side and came down 2.5 mm to its place under V1 within 4 mm: 42° (left) and 48° (right) over 1.5 mm.
  It now lies no higher there than it then runs under V1 (`under_v1`, `lateral[2] = min(...)`), so it climbs
  steadily from the canal (z 0 to 2.9 mm on the left, −1.0 to 1.1 on the right). Past its entry the sharpest turn
  between 0.5 mm steps is 8° (left) and 15° (right), and the most over 1.5 mm 22° and 34°; along the whole nerve
  17° and 18°, on its route through the cistern. 66.0 mm long on the left, 64.4 mm on the right; 0.8 mm off the
  carotid as before.
  - It was thought to need the cavernous step only. It did not: against the skull as carved for the old course,
    1.3 % of the left nerve's tube lay up to 0.5 mm under the bone near the fissure (the limit is 5 %, but its card
    would have said 0 %). So the skull chain ran again (`skull appr v3 appr v3 cav endo chiasm tumours`), and the
    bones are re-meshed once more: 59 of v3's meshes and the endonasal grid changed (the nerve, the 13 bones, their
    42 approach files, the Knosp 3B and 4 tumours and the petroclival meningioma). The carve round the nerve now
    takes 0.019 ml (left) and 0.014 ml (right); 14 % and 9 % of its tube lay under the bone before it.
    Validation 1251/1251; v2's openings, vascular and ventricles followed as above.
- **Left:** the check covers the carotid only: other nerves against other arteries' meshes were not looked at.
- The build backup made for this work (`pipeline/data/build/skullbase-v3.before-dorello`) was deleted on the owner's
  word once the picture had been seen.

## Rechecks and small engineering leftovers (desktop, 2026-11-23)

- Branch `fix/audit-leftovers-2` (off `feat/acoustic-radiation-shell`, pull request 34's head), in the worktree
  `.claude/worktrees/audit-fixes`; pull request 35, with auto-merge. The owner: "Please do 1 and 2" (the two findings
  of 19 November to recheck, and the small engineering leftovers).
- **v3's centroids, rechecked.** A centroid is where a structure's label stands and what the camera frames.
  - The petrosal sinuses' are **not stale**: each is the mean of the vessel's own vertices before
    `skullbase_v3_junctions.py` joins it to its neighbours, and lies 1 to 3 mm from the tube. The 10 mm of the
    19 November finding was the distance to the mean of the *joined* file's vertices, which the junction's dense
    drawn surface pulls towards the junction. Left as they are (as are the other joined vessels', for the same reason).
  - The PICA's origin **was stale**: the item came from v2's manifest with the centroid of the whole labelled
    artery, 4.5 mm (left) and 8.8 mm (right) from the first 6 mm that v3 draws of it. `skullbase_v3_pica.items()` now
    sets it from the built stub (`stub_centroid()`). Applied to the manifest with that function, not by a rebuild.
  - `skullbase_v3.validate()` holds every centroid to its mesh: no further from it than 3 mm or a quarter of the
    mesh's extent, whichever is more (1225/1225; it failed on exactly the two PICA sides before the fix).
- **Found with the same rule: the spine's nerve roots** had one point for both sides, the right foramen's, so with
  Side = Left the left root's label stood 15 to 39 mm from it (24 roots; S1's stood 20 mm from both sides).
  `spine_build.side_centroids()` gives each side the mean of its own vertices; `manifest_entries` takes a centroid by
  side; `validate()` has the rule (595/595). Applied to the manifest with that function. The other sections pass the
  rule as they are (v1 414 centroids, v2 173, brainstem 137, ventricles 105, vascular 285, cortex 170; files of
  lines, the tracts, were not read).
- **Horn 2022's printed peaks, rechecked.** The maps as the authors distribute them end at the peaks the paper prints:
  the generalized map's top is at z −0.1 mm (left) and −0.4 mm (right), the printed peak at −0.14; the cervical
  map's back edge on the right is 0.9 mm in front of the printed peak. So the markers lie 0.1 and 0.5 mm above the
  generalized volume (drawn at half the map's maximum), just inside the cervical one on the left and 0.8 mm behind
  it on the right. Each marker's note now says this, the cervical method gives the maximum's distance per side (1.6
  and 2.5 mm; it said "within 2.5 mm", and the right is 2.51), and `mesh-checks.test.ts` holds the markers within
  1 mm of their volumes. The markers stay at the printed peaks (the owner's choice of 15 November).
- **Back** (UI-13): going to another view (the link keys `i`, `g`, `v`, `r`: indication, group, view, region, or
  another page) adds a history entry (`ui/section.ts` `viewOf`, `ui/address.ts` `write(hash, push)`); the camera,
  sliders, selections and levels still replace the entry. The entry being left first takes the view as it was left
  (its camera may still be waiting for its timer), so Back returns to exactly that.
- **A measured distance in the link** (UI-13): `m=x,y,z,x,y,z`, to a hundredth of a millimetre, in every section
  (`ViewState.measured`; `viewlink.encodeMeasure`). The eight copies of the Measure tool are one class,
  `ui/measure.ts`: its finished measurement goes into the state, and `sync()` shows a link's with the tool on.
  The cortex drops a link's measurement on the inflated surface, which has no Measure tool. (The field is `measured`
  because the spine's state already has `measure`, its craniocervical lines.)
- **The endonasal view's endoscope and pieces in the link** (UI-13; its own branch, `feat/endonasal-link`, off this
  one, at the owner's "we should just do 2 next"). `SkullState.endo`: `sc=R,12.5,4,-2,0` (nostril, mm in, degrees to
  the side, up or down, rolled), `ev=3d` (its picture as the inset), `rm=face,septa` (the pieces taken away), on v3
  and v1.
  - The panel (`src/ui/skullbase-endonasal.ts`) reports its scope and pieces into the state as the camera does
    (`update(..., { camera: false })`: the address follows 0.4 s after the last move, the page is not drawn again).
  - A link's are taken up once the sinus is loaded: the pieces first, then the scope, which is held to its way and to
    what is open (`applyView`). The bone drilled with the burr is voxels and is not in a link; a scope a link puts
    behind bone that only the burr had opened stops where the way ends, and the panel says so. Both drilling
    panels say what a link keeps.
  - The state holds them only in the endonasal view (`sanitize`); the panel keeps its own while another view is
    shown, as before, and gives them back to the state on return. Back to an endonasal entry opens that entry's.
  - The main checkout held the owner's uncommitted work on that same file (the v1 endonasal view: the nose's drawn
    mucosa, cleft and septal cartilage; 15 files). **It was discarded on 2026-11-23 at the owner's word** ("it's
    useless now"; asked which was meant, the owner chose it). Before that it was saved, outside git, in the main
    checkout's `.claude/discarded/v1-endonasal-uncommitted-2026-11-23/` (`changes.patch`, a binary patch against
    `bcb8038`, and the built script it had left untracked): delete the folder when it is surely not wanted. The main
    checkout is clean, still on `audit/2026-11-10`.
  - (The ventricles' endoscope has been in its link all along: `es`, `ed`, `ea`, `eo`, `er`, `ev`.)
- **Small ones:** the cortex reads a slice plane whose value is not a number as the other sections do (shown at its
  own position; it had left it off); the ventricles' help lists the endoscope's keys and the skull base's the
  endonasal endoscope's; `ARCHITECTURE.md` is new (the audit's P1-21 asked for one; there was none).
- **Tests:** unit tests for the address writer's push, measurements, slice planes and the endonasal scope in links,
  the Horn markers; browser tests (a measurement through a link, Back and Forward through three views, what adds no
  entry; the endoscopes' keys in the help; the endonasal scope and pieces through a link, on v3 and v1).
- The three build backups (`skullbase-v3.before-refit`, `ventricles.before-refit`, `skullbase-v3.before-corner`,
  709 MB together) were deleted on the owner's word.

## The acoustic radiation as a shell (desktop, 2026-11-23)

- Branch `feat/acoustic-radiation-shell` (off `fix/trochlear-corner`, PR 33's head), in the worktree
  `.claude/worktrees/audit-fixes`. Local until the owner says push.
- **What the owner chose (23 November):** bring the acoustic radiation back as the slim shell (the surface round the
  voxels where the tract passed in at least 90 % of people), cut at the medial geniculate body, and "leave it hidden
  as a default so the user need to click on the eye to show it".
- **Sources looked at** (nothing but Pandora downloaded): Pandora (Hansen 2021, CC BY 4.0,
  github.com/MASILab/Pandora-WhiteMatterAtlas; population maps, no streamlines) is used. Not used: XTRACT's own
  atlases (SPMIC-UoN/XTRACT_atlases: no licence file), Maffei 2019's NeuroVault collection (could not be read),
  Tractfinder (Zenodo 10149873: optic radiation streamlines of 16 subjects, CC BY-NC 4.0, 1.5 GB), the TractSeg
  reference tracts (44 GB, native space), Shan 2019 (atlas not public), Fun With Tracts on OSF (heat maps only).
- **In `pipeline/data/raw/pandora/`:** `Xtract.nii.gz` and `Xtract_info.csv` (pinned in `config.PANDORA_FILES`,
  fetched by `fetch_sources.fetch_pandora`). `TractSeg.nii.gz` and its table, downloaded for the comparison of the
  optic radiation and read by nothing, were deleted on the user's word (2026-11-23).
- **What was measured before building** (scratch `tracts/measure.py`, gone with the scratchpad): the two atlases
  are in one space (HCP-1065's corticospinal streamlines in Pandora's corticospinal map: mean share 0.80, 95 to 97 %
  of their points at 0.1 or more; the best shift of up to 2 mm gains 0.03; `wm_shell.py` prints it and `validate.py`
  holds it). The acoustic radiation at half of the people: 10 ml, 11 to 12 mm thick; at 90 %: 2.3 ml, 6 to 7 mm
  thick. The optic radiation's front: Pandora y −14 to −15 (39 to 42 mm behind the temporal pole), HCP-1065 y −19
  (44 to 46 mm).
- **How it is built** (`pipeline/wm_shell.py`, `config.WM_SHELLS`): the largest piece of the map at or above 0.9,
  smoothed by 0.7 mm, the surface taken by marching cubes at the smoothed map's level that keeps the volume. The cut
  10.5 mm from the midline (the medial edge of the brainstem section's medial geniculate body) removes nothing at
  this level: the map ends there by itself (11.8 mm). `manifest.py` writes its entry (type `soft`, layer `tracts`,
  a `shell` block with what was measured) where the withdrawn tract stood, and `shellDataset`; `validate.py` has
  ten `shell` checks and two `alignment` checks for it (582/582).
- **In the app:** `isShell`, `hiddenAtFirst` (`src/tracts/index.ts`); the plan gives a shell the look `context`
  (the viewer draws it a little stronger, labels it, and draws it whole when selected); the legend lists it with a
  solid swatch and "(a shell)"; its card has "What the shell shows (measured)" from the manifest in place of
  "Where its streamlines end". `TractTopic.offAtFirst` hides it in every group that holds it (Language and
  hearing, Thalamic radiations, All extended) until its eye is clicked, its card opened, or `]` steps onto it. A
  link without `hid` hides the view's own; a link that shows it carries `hid=` (empty).
- **Colour:** `wmAR` is back in the palette (`#BF4059` light, `#FA2E57` dark), chosen so that no pair with the other
  extended tracts falls under ΔE 10 in any of the four vision modes; no pair was added to the accepted list.
- **References added:** Hansen 2021 and Maffei 2018 (abstracts, PubMed), Warrington 2020 (full text: the protocol's
  seed and target). Europe PMC was down that evening; the records are PubMed's.
- **MacBook baselines:** `tracts-ext_language`, `tracts-ext_thalamic` and `tracts-ext_all` (the legend has a row
  more and "Show all (1 hidden)").
- **Rerun:** `wm_shell.py`, `node pipeline/compress.mjs wm wm_ar.glb`, `manifest.py`, `validate.py`. It reads the
  cortex build's Heschl's gyrus and the brainstem build's medial geniculate body, so after those builds.
  `validate.py` needs `hcp1065_avg_tracts_nifti.zip` in the shared raw folder: it was only in another worktree's
  and was copied over (same pinned hash).

## White-matter tracts moved by half a voxel (desktop, 2026-11-18)

- Branch `fix/wm-half-voxel` (off `main` at `8ca4552`, after PR 25), in the worktree
  `.claude/worktrees/interesting-almeida-6ff762`. Pushed on 18 Nov at the user's word as pull request 26.
- What was wrong: `read_trk_gz` in `pipeline/build.py` read the HCP-1065 atlas's TrackVis files as nibabel does,
  from the corner of the first voxel; the files (DSI Studio's) give their points from its centre. Every white-matter
  tract was drawn (+0.5, +0.5, −0.5) mm from where the atlas has it (0.87 mm): the fault found on the HCP-YA files
  in D-008, below.
- Verified first (the user allowed the download): the atlas's own volumes of its tracts,
  `hcp1065_avg_tracts_nifti.zip` (3,372,106 bytes, the same GitHub release; a 0.5 mm grid; dated 2020, the streamline
  files 2023). Over the 68 files the section reads, the share of a file's points inside its own volume:
  - as nibabel reads them, 30.9 to 97.3 % (median 85.8 %);
  - moved by `voxel_to_rasmm[:3, :3] @ [0.5, 0.5, 0.5]` = (−0.5, −0.5, +0.5) mm, 97.80 to 99.99 % (median 99.90 %);
  - of 125 shifts (−1 to +1 mm in 0.5 mm steps on each axis) the half voxel is the best in 68 of 68 files, and a
    search in 0.1 mm steps along each axis peaks at exactly −0.5, −0.5, +0.5 mm in every file;
  - twelve files stay under 99 % (the thalamic radiations and the corticostriatal tracts, 97.8 to 98.7 %): why is
    not established;
  - the 2009b T1 cannot tell the two readings apart (median change of the mean T1 along a file −0.05 %), which is
    why `validate.py` never saw it.
- The fix (the user's choice: in the reader, before the midline cut): `read_trk` in `build.py` adds the half voxel;
  `read_trk_gz` returns its streamlines. 32 of the 36 tracts keep their streamlines and move by exactly
  (−0.5, −0.5, +0.5) mm. The four cut at x = 0 (`wm_cc`, `wm_ac`, `wm_scp`, `wm_mcp`) draw other streamlines: the
  cut now falls on the atlas's midline, so the pool of pieces changes (the corpus callosum's from 32,212 and 32,258
  to 32,202 and 32,211).
- Checks added: `fetch_sources.py` fetches and pins the volumes zip (`HCP1065_NIFTI_SHA256`, and the lock file);
  `validate.py` has `own-volume` (every file at 97 % or more, and better than without the half voxel): 566 of 566.
- **The fornix** (the user's choice, 18 November): with the half voxel a 2 mm shift raises the T1 along it by 6.5 %
  (4.1 % before; the limit is 5 %; every other tract is at 3 % or less). Its T1 rule is dropped (its check already
  said "brightness test not applied") and it is held to the Neudorfer 2020 fornix label only: a median 3.1 mm
  (left) and 3.9 mm (right) from it, against a tolerance of 4.0 mm, so **the right side has 0.1 mm to spare**. The
  dataset note, the Credits page and the slices pane say the fornix is the exception.
- Card figures are now pipeline code: `pipeline/wm_measure.py` writes `src/data/generated/wm-measured.json` (the
  optic radiation's loop, the ends of the medial lemniscus, reticulospinal tract, extreme capsule fasciculus and
  anterior commissure, the fornix against the label). They were measured by two scratch scripts before
  (`b4/or_loop.py`, `b4/ends.py`). The card texts in `src/tracts/content.ts` are written out (the browser tests
  import that file and cannot load JSON through it); `tests/unit/tracts.test.ts` holds every figure and named
  region to the JSON. What changed on the cards:
  - fornix: 2.8 and 3.7 mm are now 3.1 and 3.9 mm, and the closest shift is given for each side;
  - anterior commissure: the right ends' 78 % at the occipital pole is now 74 %, and the left's regions are named
    in their new order (occipital pole first). Of that, 79 to 74 is the half voxel; 78 to 79 is the template's pial
    surface, which the pipeline script uses in place of the cortex section's decimated meshes;
  - optic radiation: "about 30 mm from the midline" is now "29–31 mm"; the rest of the sentence holds;
  - the medial lemniscus's and the reticulospinal tract's sentences hold as they were.
- The brainstem's Sources page: the corticospinal tract inside the fitted pons and medulla is 99.4 % (was 99.3 %).
  `brainstem_build.py cst` is a new step that takes only that figure again (the fit came out identical to the cached
  one); then `brainstem_build.py finalize` (322 of 322). The README's figure there was stale (98.5 %) and is 99.4 %.
- How it was built, in this order: `build.py wm`, `wm_measure.py`, `compress.mjs wm`, `manifest.py`, `validate.py`,
  `brainstem_build.py cst`, `brainstem_build.py finalize`, `npm run build`. Before the change, `build.py wm` and
  `compress.mjs wm` gave all 36 shipped files byte for byte in this worktree, so the diff is the fix's own.
- Changed files: the 36 `public/assets/wm/*.glb`, `wm-manifest.json` (centroids, sizes, the four tracts' source
  counts, the note), `manifest.json` and `ATTRIBUTION.md` (the note, the changes made), `bs-manifest.json` (one
  figure), `NOTICE`, `README.md`, and `dist/`.
- Pipeline data: this worktree has its own `pipeline/data` (`raw`: links into the main checkout's, with the volumes
  zip beside them in `raw/hcp1065/`; `build`: `wm`, `report.json`, the brainstem's export and fit). The main
  checkout's raw folder does not have the volumes zip: `fetch_sources.py` fetches it, or copy it, before
  `validate.py` is run elsewhere.
- **Picture baselines to retake on the MacBook**: all 20 `tracts-*-desktop-darwin.png` and
  `brainstem-tracts-desktop-darwin.png` (the five of the colour change below are among them). The Linux copies are
  stale too and were left. The home page's `public/assets/home/tracts.webp` was not retaken.
- Not checked: the DBS section's tracts. They are Lead-DBS `.mat` files and do not come through this reader;
  whether any of those atlases carried the same half voxel when it was converted is not known.
- The verification's scripts and full table: `.claude/half-voxel-check/` in this worktree (ignored by git;
  `RESULTS.md` first).

## White-matter tract colours (desktop, 2026-11-17)

- Branch `fix/wm-mcp-colour` (off `main` at `4d58cf8`), pushed on 18 Nov as pull request 24 and merged that day
  (`main` = `a4a731f`).
- The middle cerebellar peduncle (`wmMCP`) and the corticospinal tract (`wmCST`) had the same light colour
  (`#0B847C`), and the reticulospinal tract (`wmRST`) was close to both (CIEDE2000 6.8; 2.5 under tritanopia). No
  white-matter group draws them together, but the brainstem section's "Tracts and deep nuclei" view does.
- The user's choice (17 Nov): `wmMCP` blue (`#0E81EC` light, `#9FD0FF` dark) and `wmRST` lavender (`#8978A9` light,
  `#A69CD4` dark); `wmCST` stays. Every pair of these with a tract drawn beside it in a checked view is now at 10 or
  more in normal vision and under the three simulated deficiencies (smallest: 10.3 light, 10.1 dark).
- Changed by hand in `src/data/palette.json` and in both copies of `wm-manifest.json` (the `colour` entries of `wm_mcp`
  and `wm_rst` only). The white-matter pipeline was not rerun; a later run reads the palette and writes the same values.
- `scripts/check-palette.ts` now lists the brainstem tracts view (`brainstem: tracts`).
  - `fix/d008-brainstem` added the same row with its four tracts: main was merged into that branch on 18 Nov and
    its longer row kept.
  - Its `bsStt` (violet) was 4.2 (light) and 5.2 (dark) from the new `wmMCP` under deuteranopia, and 6.4 from the new
    `wmRST` in the dark theme under protanopia: chosen again on that branch, a dark maroon (see D-008 below).
  - The new row also lists `wmML`/`wmSCP` at 9.0 (dark theme, protanopia). Both colours are as they were; not changed.
  - Not in the row: the deep nuclei drawn in the same view. In the dark theme the new `wmRST` is 7.5 from the dentate
    nucleus under deuteranopia.
  - The check leaves out the "all" groups. In "All posterior fossa tracts" the dark `wmRST` is 6.9 from `wmCPTP`
    under deuteranopia.
- **Picture baselines to retake on the MacBook** (`tests/e2e/smoke.spec.ts-snapshots/`, `*-desktop-darwin.png`):
  `tracts-fossa-loop`, `tracts-fossa-peduncles`, `tracts-fossa-brainstem`, `tracts-fossa-all` and `brainstem-tracts`.
  Delete each old PNG, run its test with `-u`, and look at the new image. The Linux copies of the same five are stale
  too and were left as they are.

## Audit fixes in progress (desktop, updated 2026-11-19)

- What is left of the audit, checked item by item on 2026-11-19: "The site audit: what is left" at the top of this file.
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
    zones). Pushed to `origin/fix/b1-dbs-views` (2026-11-15) at the user's word.
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
  by Al-Afif 2026's other use of the name. Pushed at the user's word.
- B7, the spine texts (E-002, E-005..E-011), the user's choices:
  - each root's picture in radiculopathy first: L1–S1 from Bateman 2025's Table 1 (pain, sensory loss, weakness,
    reflex), C4–T1 from Hasan 2025's Table 3 (`RADICULOPATHY`). The ISNCSCI key muscle and sensory point follow under
    their own heading; the "Reflexes: to be added" placeholder is gone. Root cards show both, cervical and T1 too;
  - a central herniation on the level card as well as in the drilling tool (`herniaZones`, `zoneRoot`; links
    `les=…central…`). At a lumbar disc it names the cauda equina in the dural sac and cites Aduri 2026 on cauda equina
    syndrome. A lumbar paracentral extrusion migrated up past the disc's upper margin also names the exiting root
    (`migratedToExiting`; Ikuta 2013, Ahn 2022's grades), with how far the drawn fragment pushes it;
  - craniocervical limits: ADI under 3 mm in adults and 5 mm in children (Li 2025, Yang 2014); PADI under 14 mm
    predicts paralysis (Yang 2014), the unverifiable 19 mm sentence dropped; Harris's 12 mm for BDI and BAI with
    WFNS 2020's note on poor reader agreement (Alves 2020); the clivus–canal angle's sex difference and Botelho
    2013's controls against basilar invagination. Chamberlain and McGregor were not added (the CT here does not reach
    the hard palate);
  - published pedicle columns: thoracic shows the median of the study means and names the study at each end, with
    the material and sign notes (Singh 2011: negative = pointing outwards); C7 width and height from Chanplakorn
    2014's outer measures (read by `spine_published.py`), Jiang 2024's screw path in the statement, the earlier
    studies' unsigned sagittal angles dropped.
  Ten references added to `pipeline/sources/citations.json` and `REF_KEYS` (`spine_build.py refs`, no rebuild).
  Pushed at the user's word with B1–B7 opened as one pull request (`fix/b1-dbs-views` → `main`, 2026-11-15).
  PR 12 merged (2026-11-15) once the CI checks passed: `main` now requires the jobs `checks` and `browser`, and the
  repository allows auto-merge (both set at the user's request).
- A-013, stimulation side effects (the roadmap's next item), the user's choices, on `fix/a013-side-effects`:
  `src/data/sideeffects.ts` gives a "Stimulation side effects" block on the STN, GPi, Vim and PSA cards: what the
  patient has, the structure current is thought to reach and its direction from the target, a link to it where it is
  drawn (corticospinal tract for the internal capsule, medial lemniscus, optic tract, red nucleus, DRTT). Structures
  with no mesh here (third-nerve fibres, the hypothalamus, the sensory thalamus, frontal eye field fibres) are named
  and said to be not drawn. Sources, full text: Koeglsperger 2019 (STN, GPi, Vim) and Kim 2021 (Vim and PSA rates,
  93 patients). The four landmark cards gained a line each on what current reaching them does. ANT keeps SANTE's
  caveat. Pushed with its own pull request at the user's word (2026-11-16), set to merge once the checks pass.
- A-014, the circuits explained (the user's choices: a paragraph and a schematic per circuit; the basal ganglia, tremor
  and Papez circuits; both misleading texts fixed), on `fix/a014-circuits` (made on top of A-013):
  `src/data/circuits.ts` holds three circuits (nodes, connections, sourced sentences) and which indication shows which
  (`CIRCUITS_FOR`: Holmes both tremor and basal ganglia; epilepsy Papez); `src/ui/circuit.ts` draws each as an SVG on the
  indication's card, a box or arrow standing for a drawn structure or tract being a button that opens its card; a
  dashed box is not drawn. Excitatory / inhibitory only where the sources give it (basal ganglia: Galvan 2015, Chiken
  2016); the PD rate-model sentence on PD alone. Tremor: Gallay 2008, Akram 2018, Coenen 2020; Papez: Senova 2020,
  Schaper 2020 (now open in PMC), Piper 2022. Fixed: the Vim, dentate, non-decussating DRTT and hyperdirect cards (the
  drawn tract ends mostly in pre-SMA/SMA); "hyperdirect" defined in PD's "Why here" (CORRECTED in content.test.ts).
  A layout test checks every box lies inside its drawing, apart from the others, and every arrow runs edge to edge.
  Merged with its own pull request (PR 14) at the user's word (2026-11-16).
- A-012, regulatory status (the user's choices: a line on each indication card and a table on the References page;
  the EU by disease from the reviews; "Not an approved indication" where no record names it; a note on responsive
  neurostimulation on the epilepsy card), on `fix/a012-regulatory`: `src/data/regulatory.ts`
  gives each indication rows per target, US and EU, with the date checked (`REGULATORY_CHECKED`, 16 November 2026).
  US from the FDA's records (P960009 and its supplements S007, S229, S219, S482; H020007; P140009; P150031; P100026),
  read through openFDA (api.fda.gov) and accessdata.fda.gov (which sometimes shows a "please wait" page: not
  bypassed). EU from Amon 2017 (CE marks per device, by disease) and Frey 2022. Note: the FDA approved bilateral GPi
  for primary dystonia on 22 November 2025 (S482); before that dystonia had the 2003 exemption only. The status
  needs re-checking now and then: change the date when you do. Merged with its own pull request (PR 15) at the
  user's word (2026-11-16).
- The spine's small items, E-012 to E-018 (the user's choices: C5 palsy by operation; a sourced statement on thoracic
  cards, no tool; published chords added and the measured ones said to be longer; abstract-only references marked), on
  `fix/spine-e012-e018` (made on top of A-012):
  - E-012: `ACDF_STATEMENTS.nerves` gives C5 palsy by operation (Muthu 2026: 4% anterior, 6% laminoplasty, 10%
    laminectomy and fusion), no longer "4.6–10%" as an injury of the anterior approach.
  - E-013: a reference checked only against its abstract says so after its citation (`ACCESS_NOTES` in
    `pipeline/spine_build.py`; `python pipeline/spine_build.py refs` refreshes the manifest's references without a
    rebuild). Eleven say "not open access"; Valenzuela 2026, Rupp 2021 and Fardon 2014 have their own notes. Tudose
    2026 is open at Springer and was read there. The publishers' pages of Fardon 2014 and Valenzuela 2026, and PubMed
    Central for Rupp 2021, showed bot checks or refused: not passed. The breach grades' millimetre bands are credited
    to Miyamoto 2025, which gives them.
  - E-014: Zindrick 1987 (cited nowhere) is gone; Fardon 2014 is cited at the herniation terms, as Eslami 2026 quotes
    it. The chord row has published values, read from the papers' tables by `pipeline/spine_published.py`: thoracic
    screw path length (Soh 2021, MRI), lumbar chord (Arockiaraj 2025, CT). The chords measured on this CT are longer
    (lumbar by 12 to 19 mm than the mean): `STATEMENTS.publishedChord` said so and that the reason was not
    established. Looked into on 17 November 2026: see "The pedicle chord" below.
  - E-015: the Sources page calls a link what it is (DOI, PDF, Web page); the AO Surgery Reference's two pages are two
    references (`aosurgeryref`, `aosurgeryrefpedicle`).
  - E-016: the corridor's width, the hinge's remaining bone and the caps on the C2 screws' start lengths say they are
    drawing choices.
  - E-017: ACDF, JOA and ISNCSCI written out; "far lateral" is the lateral zone's one name, the others given beside
    it; the prevertebral muscles' card names the longus colli (Liu 2017).
  - E-018: each thoracic card has "Disc herniation at …": the cord in the dural sac, the root leaving at that disc,
    and `HERNIA_STATEMENTS.thoracic` (Yurtluk 2025, Corazzelli 2024, Hamid 2023, Khan 2026).
  - A unit test checks that every listed spine reference is cited by some statement.
  - Seen on the way: the dev preview answered a mesh's address with the page itself after a rebuild had rewritten the
    file (a "could not be loaded" notice for the L4 vertebra); restarting the dev server cleared it.
  Merged with its own pull request (PR 16) at the user's word (2026-11-16).
- C-019, what the cavernous sinus triangles hold (the user's choices: an open review's list for all ten, plus what the
  five anterior ones show from three routes; on each triangle's card and in the view's text; the hypoglossal canal as
  the limit of the condylar drilling, with stability), on `fix/c019-triangles` (made on top of the spine branch):
  `TRIANGLES` in `src/skullbase/approaches.ts`, keyed by the end of the triangle's structure id (`tb_triangle_<key>`
  on the CT, `sb_triangle_<key>` on Z-Anatomy), each with `holds` (Chavez-Herrera 2023, with Drazin 2017 where named)
  and, for the anterior five, `byRoute` (Corvino 2023, Table 1). The view's text gains "What each triangle holds" and
  "The anterior triangles by route"; a triangle's card shows "Contents" in place of "Z-Anatomy ships no definition".
  The far lateral text names the hypoglossal canal as the anterior limit of the condylar drilling and what drilling
  half or more costs (Luzzi 2022, Payman 2022, Pai 2018). Front end only: `pipeline/skullbase_build.py` is untouched.
  Merged with its own pull request (PR 17) at the user's word (2026-11-16).
- D-009, the ventricles' additions (the user's choices: the ETV Success Score as a table; Frazier's point with a
  marker on the skull; Keen's point left out), on `fix/d009-ventricles` (made on top of the triangles branch):
  - The ETV Success Score (`ETV_SCORE` in `src/ventricles/content.ts`, shown on the endoscopic view's card): what it
    is from Kulkarni 2009's abstract (not open access, marked so on the Sources page), the points from Krause 2024's
    Table 1, which reprints them. A table, not a calculator. The table sums to at most 90 (Krause's caption says 0 to
    100; the page gives the table's own sum).
  - Frazier's point: `access_landmarks()` in `pipeline/ventricles_build.py` adds `lm_inion` and `lm_frazier_r/l` to
    `ve-landmarks.json`; `ventricles_build.py landmarks` takes them again without a rebuild (run here; no mesh
    changed). The inion is the fitted model's external occipital protuberance on this CT's outer table at the
    midline: this skull's own protuberance stands out about 1 mm, 3 to 4 mm lower (probed, scripts in the session's
    scratch folder only). Frazier's point is 60 mm up the outer table and 35 mm from the midline; the build fails if
    it does not land on the parietal bone (Kara 2026: through the parietal bone above the lambdoid suture). The
    catheter view marks both on the catheter's side; no catheter is drawn from Frazier's point.
  - **Keen's point is not placed, and not described**: it is defined from the pinna, and this CT's field ends at
    the scalp above the ear (seen on axial and coronal slices through the ear). The user said to skip it.
  - With all labels on, the ventricles section now names its skull landmarks on screen (it named none before).
    The access view's picture baseline gains two markers, drawn through the skull like the others.
  - The third ventricle's roof and other walls (Azab 2014, da Silva 2024, both already cited) and the temporal
    horn's walls (Kucukyuruk 2012); whom Chen 2025's percentages come from, above them on the result card.
  Merged with its own pull request (PR 18) at the user's word (2026-11-16).
- D-010, what is known of lesions that have not bled (the user's choices: ARUBA with its final follow-up and the
  pooled natural history for AVMs; ISUIA and PHASES for aneurysms; not the Scottish cohort, not UCAS Japan), on
  `fix/d010-vascular-unruptured` (made on top of the ventricles branch): two tables in `src/vascular/grading.ts`,
  `ISUIA` (under a new heading "Unruptured aneurysms") and `ARUBA` (after the AVM grades), each with its notes; the
  supplementary grade now cites its own paper (Lawton 2010), whose series stands beside Helsinki's in the outcome
  table. Read in full: Lawton 2010 and Mohr 2014, as authors' manuscripts through NCBI's BioC service
  (`https://www.ncbi.nlm.nih.gov/research/bionlp/RESTful/pmcoa.cgi/BioC_json/PMCxxxx/unicode`: it serves manuscripts
  that Europe PMC's full-text XML refuses, and it rate-limits). Abstracts only, and marked so: Mohr 2020, Kim 2014
  (its manuscript is in PubMed Central but neither service gave it), Wiebers 2003, Greving 2014. ISUIA's rates are
  its abstract's; PubMed's copy has lost their decimal points, and two open papers that quote them (Golshani 2010,
  Chen 2018) give them as on the page. PHASES has no points table: the abstract does not give the points.
  Merged with its own pull request (PR 19) at the user's word (2026-11-16).
- The pedicle chord (17 November 2026; the user's choices: the chord in the axial plane only; the two papers'
  figures downloaded to see their landmarks), on `fix/spine-pedicle-chord`:
  - What was wrong: nothing in the tracing (the line stays in bone, its ends lie on the cortex, the scale is right),
    but the chord ran along the fitted axis in three dimensions, which in the lumbar spine tilts 3 to 17° towards
    the superior articular process. The two studies beside it measure on one axial image (Arockiaraj 2025 and Soh
    2021, each paper's Figure 1: from the dorsal cortex along the pedicle's axis to the front of the body).
  - `pedicle()` in `pipeline/spine_screw.py` now gives `chord` in the vertebra's own axial plane (parallel to the
    upper endplate, through the isthmus centre, at the measured transverse angle, the one run of bone on that line:
    no gap bridged), `chordBand` (the shortest and longest chord of the same line up to 2 mm lower and higher) and
    `axisChord` (the old length along the axis: the thoracic anatomic start's path, no longer on the card). The
    screw data was rebuilt in full; no `screw_*.bin.gz` changed, only `spine-screw.json`.
  - On this CT the lumbar chord is now 2 to 11 mm above the published mean (it was 12 to 19), the thoracic one from
    2 mm below to 11 mm above. What remains is one person against two populations' means, and the height of the
    line: behind a lumbar pedicle the dorsal cortex is steep (about 1 mm of chord per mm of height at L1 to L3,
    where the published mean is reached 4 to 7 mm or more below the pedicle's centre: from the analysis done for
    this, not in the shipped data). Neither paper says at which height of the pedicle its image lay. The card gives each level's band and `STATEMENTS.publishedChord` says all this.
  - The figure packages are in `pipeline/data/raw/papers/figures/<PMCID>/` (git-ignored), from Europe PMC's API
    (`.../rest/<PMCID>/supplementaryFiles?includeInlineImage=true`); Europe PMC's website showed a bot check for the
    same pictures, which was not passed.
  Merged with its own pull request (PR 20) at the user's word (2026-11-17).
- AP-08, structures the surgical views' texts name and their openings reach but the views did not draw (17 November
  2026; the user's choices, made on the audit's reachable shares for the default model), on
  `fix/ap08-approach-structures`. Front end only: names added to the views' `context` lists in
  `src/skullbase/approaches.ts` (a name there is all a view needs; v1 through `V1_NAMES` and `V1_ABSENT`).
  - Pterional, lateral supraorbital and orbitozygomatic (`BEYOND`): optic chiasm, pituitary stalk, both communicating
    arteries, basilar artery (one mesh: the whole trunk is drawn for its tip).
  - Orbitozygomatic only: posterior cerebral artery (P1 to P2), superior cerebellar artery, trochlear nerve. Not in the
    other two, where 5% and 2% of P1 are reachable.
  - Pterional: the olfactory nerve (the supraorbital view had it). Retrosigmoid: hypoglossal nerve, superior petrosal
    sinus, trochlear nerve. Kawase: oculomotor and trochlear nerves. Far lateral: anterior spinal artery (from the
    audit's table for that view, not AP-08's summary).
  - The three anterolateral summaries say these are drawn deeper in and to turn the view to find them: most do not
    show from the opening camera.
  - v1 (Z-Anatomy) gets the same where it has the structure: no pituitary stalk; the posterior cerebral artery whole.
    **Told to the user:** on v1 the audit found little of some of these reachable (basilar tip 3%, 1% and 15% through
    the pterional, orbitozygomatic and supraorbital openings; superior cerebellar artery 12% through the
    orbitozygomatic; trochlear nerve 2% through the retrosigmoid); they are drawn there all the same, as on v3
    (the user: fine as it is).
  - The anterior spinal artery is cut where the medulla is cut (the user's word, once the far lateral view drew it:
    it ran on into empty space, 5.5 and 9.0 mm past the cut on v3, 2.0 mm on v1; the models have no spinal cord).
    `pipeline/vessel_end.py` finds the medulla's cut end as a plane and cuts the tube there, with a cap; v3 through
    `skullbase_v3_clearance.py` (in the full run, and alone as `skullbase_v3_clearance.py ends`), v1 through the new
    `skullbase_v1_ends.py`. Each was run alone, the one file compressed (`compress.mjs <kind> <file>`) and the
    section's `finalize` run (v3 816 of 816 checks, v1 648 of 648): only the two artery files, their manifest entries
    (size, centroid, card text) and the modification records changed. Run again, both change nothing.
  Merged with its own pull request (PR 21) at the user's word (2026-11-17).
- The subtemporal view (17 November 2026; the roadmap's last surgical view; the user's choices: Nakov's 5 × 5 cm
  flap over the zygomatic root, the temporal lobe's lift as a slider, both models), on `feat/subtemporal-view`:
  - The cut: `subtemporal()` in `pipeline/skullbase_v3_approach.py`. The zygomatic arch's root is found on the skull
    from the side (`zygomatic_root`: y = 2.0 mm on v3, 1.0 on v1); the flap is 50 × 50 mm centred on it, its base at
    the tegmen's level, kept to bone that lies on the cranial cavity and to the temporal, sphenoid and parietal
    bones (9.9 ml on v3, 11.0 ml on v1, where the thin bone beside the flap goes with it, a rim of the frontal bone
    among it).
  - The slider: `temporal_lobe_shape()` in `pipeline/skullbase_v3.py` writes `br_temporal_lobe__subtemporal`, a copy
    of the lobe for this view only (`forView`, `replaces`) with one morph target, `subtemporal` (15 mm, span 16,
    fall 18, none within 8 mm of the midline: the Kawase view's values). **No brain step was rerun**: v1's brain step
    does not give the same cortex twice on the desktop, and a target on a view-only copy leaves every other file as
    it was. The lift's numbers go into the approach's `measured` (both models' `*-approaches.json`), which the
    slider's note reads.
  - How it was built, on each model: `skullbase_v3_approach.py only subtemporal` (v1: with `SB_PROFILE=v1`), then
    `skullbase_v3.py approaches` (v1: `skullbase_v1.py approaches`), `compress.mjs <kind> <the six new files>`,
    `finalize` (v3 839 of 839 checks, v1 664 of 664). The approaches step puts the approach items at the end of the
    manifest and, on v1, writes six pterional and orbitozygomatic bone entries' centroids from `approach.json`,
    whose meshes are newer than the shipped files: the manifests were put back in their committed order with the
    new items after the Kawase view's, and those six entries kept as committed. The manifests' diffs are additions
    only; no shipped file other than the twelve new ones changed.
  - Front end: the view's entry and five references in `src/skullbase/approaches.ts` (full texts read, but
    Choque-Velasquez 2018c: a video article's abstract, marked so), `V1_TEXT.subtemporal` (Z-Anatomy's tentorium
    added, its insula left out as in the Kawase view, no vein of Labbé), `MORPH_PARAMS.subtemporal = 'st'`, the
    slider's label and note in `MORPH_UI`, a camera preset `subtemporalLow` (from the side, a little behind and
    below, along the floor: from above the floor hides the incisura, from lower the arch and the mastoid stand in
    the way; chosen by eye on both models).
  - Tests: the view is covered in `tests/unit/skullbase.test.ts` and `tests/e2e/audit-fixes.spec.ts`, not in
    `smoke.spec.ts` (the user's uncommitted work touches that file).
  Merged with its own pull request (PR 22) at the user's word (2026-11-17; `main` = `4d58cf8`). One of its two
  browser runs failed on a test that depends on timing ("a link that opens with a selection shows the card from its
  top"); the failed job was run again and passed. That test is steadied on `fix/reveal-card-settles` (PR 23, merged
  18 Nov).
- D-008, the brainstem (17 and 18 November 2026; the user's choices: the four tracts from Yeh's HCP-YA atlas, drawn
  "tract like" as the others are; the trigeminal nuclei said to be not modelled, with sourced text; the nuclei shared
  between nerves), on `fix/d008-brainstem` (off `09e12d2`); merged as PR 25 (below).
  - Tracts: the medial longitudinal fasciculus, the central tegmental tract, the spinothalamic tract and the lateral
    lemniscus (`bs_t_mlf`, `bs_t_ctt`, `bs_t_stt`, `bs_t_ll`), each the HCP-YA (HCP842) atlas's own streamlines,
    drawn like the white-matter section's tracts (`type: 'tract'`, line GLBs). First built as the surfaces of the
    atlas's volumes (commit `cb7e236`); the user then asked for streamlines, and allowed the download.
    HCP-1065, the white-matter section's atlas, has none of the four, and neither has Z-Anatomy.
  - The data, both CC BY-SA 4.0 with the HCP data use terms, both pinned in `fetch_sources.py` (**copy or fetch them
    on the MacBook before building**):
    - the streamline files, eight `*.trk.gz` (298 KB) in `pipeline/data/raw/hcp842/tracks/`, from the atlas author's
      shared OneDrive folder at the University of Pittsburgh, which the atlas's page links
      (brain.labsolver.org/hcp_trk_atlas.html). The folder serves a visitor's session: `fetch_hcpya_tracks` opens
      the share link first (it sets a cookie), then asks for each file by its path. Zenodo has no streamline files.
    - the volumes of the same tracts, eight NIfTI files in `pipeline/data/raw/hcp842/` (Zenodo
      10.5281/zenodo.3627772): now only what the streamline files are checked against.
  - **The streamline files' coordinates.** nibabel reads a TrackVis file's points from the corner of the first
    voxel; these files (DSI Studio's) give them from its centre. `hcp_streamlines` moves every point by half a voxel
    ((−0.5, −0.5, +0.5) mm). So read, 99.9 % or more of each bundle's points in the atlas's grid lie in the atlas's
    own volume of the tract (`inOwnVolumeShare`, held to 0.99 by `validate` and the schema); as nibabel reads them,
    67 to 95 % (`cornerReadShare`). `build.py`'s `read_trk_gz` read the HCP-1065 files of the white-matter section
    the same uncorrected way: **checked on 18 November and found to be so; fixed on `fix/wm-half-voxel`** (see
    "White-matter tracts moved by half a voxel" at the top of this file).
  - Streamlines drawn (left / right; all the atlas has but those shorter than 10 mm, which are single points or a
    millimetre long): MLF 10 / 9, CTT 15 / 21, STT 195 / 199, LL 54 / 43 (its left file holds 76). Resampled to 1 mm.
  - The atlas is in ICBM-152 space as FSL's FA template has it, not on ICBM 2009b; its grid ends at z = −50.5 mm
    (about where this model's pons meets its medulla) and the streamlines end there, the spinothalamic tract's at
    −52.8 mm. They are drawn where the atlas has them, **without a shift**. `tract_fit` in `brainstem_build.py`
    measures each side on the streamlines' points and writes `fit.tracts` to the manifest; the cards, the Sources
    page and the README print those figures. Inside the fitted brainstem, of the length at its levels (left /
    right): MLF 98 % / 96 %, CTT 92 % / 95 %, STT 91 % / 85 %, LL 76 % / 59 %; fluid on the T2 template: 0 % / 10 %,
    2 % / 0 %, 2 % / 13 %, 22 % / 47 %. **The right lateral lemniscus fits worst** (told to the user).
    - Shifts were tried twice, scratch only (on the volumes, then on the streamlines, ±3 mm): no sideways shift
      helps both sides (each side wants to move towards the midline), and the fluid share only falls steadily as
      the tracts are moved forwards and down into the bulk, to the search's edge, (−0.5, +3, −3) mm. That is not a
      registration, so none is applied.
    - An offset between the two atlases' spaces was then looked for in tracts both have (the user's choice, 18
      November; scratch only): HCP842's medial lemniscus and reticulospinal tract (`ML_L/R.trk.gz`,
      `RST_L/R.trk.gz` from the same folder, 214 KB, downloaded with the user's leave, kept in the scratchpad, not
      in the raw data) against HCP-1065's, both read with the half voxel; per 2 mm level from z = −49 to −9 mm, the
      median x and y of each bundle, HCP-1065 minus HCP842. **They do not agree, so nothing is shifted.** Medians
      over the levels: lemniscus left (−3.1, −1.5) and right (+1.4, −1.7) mm, reticulospinal tract left (+2.2, −3.0)
      and right (−4.0, −3.1) mm. Sideways the two sides differ in sign and the two tracts from each other (HCP-1065's
      lemniscus lies up to 5 mm further from the midline in the lower pons, its reticulospinal tract up to 6 mm
      nearer it): the bundles are drawn differently in the two atlases. Front to back all four medians put HCP-1065
      1.5 to 3 mm behind HCP842, but by level the difference runs from +1.7 to −5.8 mm, HCP-1065's lemniscus is 4 to
      6 mm deep there against HCP842's 2 mm, and moving the four tracts back by 1.5 to 3 mm raises their mean fluid
      share on the T2 template from 12 % to 29 to 41 % (forwards by 2 mm: 7 %).
  - How it was built: `brainstem_build.py tracts` (a step of its own: the four tracts and the shared nuclei's lists
    into the manifest as built, nothing else), `compress.mjs brainstem bs_t_mlf.glb bs_t_ctt.glb bs_t_stt.glb
    bs_t_ll.glb`, `brainstem_build.py finalize` (322 of 322 checks). Against `main`, the manifest's diff is
    additions only. **Do not run the full `brainstem_build.py` on the desktop for this**: it rewrites seven
    arousal-network files and four of their centroids with small differences. The three steps repeat: run again,
    the four files come out byte for byte the same. (The session's permission check refused the build script twice
    on 17 November; the user ran the steps themself, and later runs went through.)
  - Views: the four are in "Tracts and deep nuclei" with the HCP-1065 tracts. The fasciculus is also in the floor
    view's set, but under a solid surface none of the section's own tracts is drawn (`bsPlan`): the parts of the
    atlas's fasciculus outside the fitted floor showed on it. The floor view's card lists what lies under the
    surface; choosing one (a nucleus too) draws the surface as a shell (`liesInside`; the user: "See through is
    great"), and an entry zone chosen there puts the solid surface back.
  - A chosen tract fades the other tracts to a quarter of their opacity, whatever the viewer's "Fade the rest"
    setting, in every section that draws tracts: the brainstem, DBS and white-matter sections (the user's requests
    of 18 November, on seeing the lateral lemniscus among the others; asked for one section after the other). It is
    the viewer's own rule (`Viewer.restyle`: the selection is a structure of type `tract`), not a switch of the
    plans. Meshes are left as they are unless the setting is on. For the DBS section a few lines of the legend test
    in `tests/e2e/smoke.spec.ts` changed (near line 240; the user's uncommitted work in the main checkout adds a
    test near line 639 of that file, in another place).
  - Cards: a tract card has sourced text, published measurements (Li 2021 for the fasciculus) and the measured fit;
    the trigeminal nerve's card has `NUCLEI_NOT_MODELLED`; the nucleus ambiguus (IX, X, XI) and the nucleus of the
    solitary tract (VII, IX, X) carry `cranialNerves` in the manifest and a sourced sentence per nerve
    (`SHARED_NUCLEI`), and each of those nerves' cards lists them. Ten new references in
    `src/brainstem/references.ts`, each read in full text (Yeh 2018 as its author manuscript, through NCBI's BioC
    service: Europe PMC's full text gave an error).
  - Colours: `bsMlf`, `bsCtt`, `bsStt`, `bsLl`. `bsStt` is a dark maroon (`#422428` light, `#95505A` dark; the user
    likes it), chosen to hold against the white-matter colours both as they are on `main` and as PR 24 makes them
    (`wmMCP` blue, `wmRST` lavender): 10 or more (CIEDE2000) from every tract in the view, in normal vision and
    under the three simulated deficiencies. The violet first chosen was 4 to 5 from PR 24's `wmMCP`. Three pairs
    stay under 10, all the lateral lemniscus's red in the light theme: 8.5 and 8.3 from `wmICP` and `wmDRTT`
    (protanopia), 8.2 from `wmCBT` (deuteranopia). PR 24 was merged on 18 Nov and `main` merged into this branch:
    of the two `brainstem: tracts` rows in `scripts/check-palette.ts` this branch's longer one is kept.
  - Tests: `tests/unit/brainstem.test.ts` and one test in `tests/e2e/audit-fixes.spec.ts`. On the MacBook, retake
    `brainstem-tracts-desktop-darwin.png` (the view has four new tracts and legend rows); the floor view's picture
    does not change.
  - Not done, by the user's choice: the arterial territories (text only was offered).
- D-008 was merged with its own pull request (PR 25) at the user's word (2026-11-18; `main` = `8ca4552`).
- B-007, where the white-matter tracts end on the cortex (18 and 19 November 2026; the user's choices: the tract
  cards show the measured ends only, replacing the published Brodmann table; patches of cortex in 3D; the cortex
  section's label cards list the tracts that end there), on `feat/b007-tract-ends` (off `8ca4552`). **Local
  commit only: not pushed, no pull request.**
  - Pipeline: `pipeline/wm_ends.py` (its docstring states the rule), then `compress.mjs wm-ends`, then
    `wm_ends.py finalize` (591 checks). It reads every streamline of each HCP-1065 bundle with `build.py`'s
    `read_trk_gz` and the cortex section's built surface (`pipeline/data/build/cortex/ctx_*.glb`), and writes
    `src/data/generated/wm-ends.json` and 32 patches in `public/assets/wm-ends/` (0.6 MB; none for the fornix and
    the three cerebellar peduncles). Run again it writes the same files. **Rerun it** after a cortex rebuild, or
    when `build.py`'s `read_trk_gz` changes. It was run again after PR 26 (the half voxel) was merged into this
    branch, with the outside limit raised from 1.0 to 1.5 mm (below): against the first figures, an end's share at
    the cortex changed by up to 14 points (the left cingulum's front end, 85 % to 99 %), an area's share by up to 17
    (the left uncinate's front end on the H-shaped orbital sulci, 42 % to 59 %), and six ends' first area changed.
  - The rule: a bundle's streamlines turned the same way round (its main direction; a midline bundle left to
    right), so it has two named ends; an end is at the cortex within 5 mm of the surface, not more than
    1.5 mm outside it (keeps the cerebellar peduncles' ends, which lie just outside the occipital and temporal base,
    out; at 1.0 mm, first used, ends on gyral crowns just outside the surface were lost)
    and not on the medial wall; areas with 5 % or more of an end's cortical ends are listed. The patch: the counts
    spread over the surface, the densest part holding 80 % of a hemisphere's cortical ends.
  - Front end: `src/data/ends.ts` (shared: `WM_ENDS`, `areaName`, `END_PATCHES`, `endsOn`); the tract card's
    "Where its streamlines end (measured)" with the areas linked to the cortex section and three sourced caveats
    (`ENDS_CAVEATS`: Schilling 2018 and Maier-Hein 2017, both read in full text; Yeh 2022); the patch drawn with a
    chosen tract (a parcel of the plan, its colour the tract's); the cortex label card's "Tracts whose streamlines
    end here (measured)". A tracts link with a tract but no group opens a group that holds it; a cortex link with a
    label but no view opens a view that shows it.
  - `src/data/generated/wm-connectome.json` (the published table) was still written by `build.py` then; removed
    with roadmap item 5 below.
  - `tests/e2e/smoke.spec.ts`: two lines of the tract-card test changed (near line 455); the
    user's uncommitted work in the main checkout adds a test near line 639 of that file.
  - Licence of the patches, as written (the user to confirm): GPL-3.0, non-commercial, like the cortex surface they
    are cut from; where they lie comes from the HCP-1065 atlas (CC BY-SA 4.0, HCP terms).
  - On the MacBook: no picture baseline shows a selected tract, so none should change.
- B-007 was merged with its own pull request (PR 27) at the user's word (2026-11-18).
- Roadmap features (19 November 2026; the user: "Let's do the first seven, start with first"): figure export, a
  citation panel, isolate and per-structure opacity, MRI slices in the cortex section, removing the unused
  `wm-connectome.json`, seeding `skullbase_v1_brain.py`, the mesh checks in the unit tests. On
  `feat/figure-export` (off `1772aed`), one commit each. Merged as PR 28 at the user's word (2026-11-19, `d85092d`).
  - 1, figure export: "Save image" in every section's toolbar opens a dialog (`src/ui/figure.ts`; the user's
    choices: a box to choose what to show, the size each time, the licences in full by default or short). The view
    is drawn again at the chosen scale (`Viewer.capture`, `maxCaptureScale`; the selection outline scaled with it,
    tract lines keep their thickness relative to the view), then the labels, their leaders and the compass are drawn
    from where they are on screen, the legend beside it and the caption under it. `Viewer.drawnCredits` lists the
    source and licence of every structure drawn; over MRI slices the McGill notice is added. The dialog floats over
    the page (inside the stage it was cut by the stage's edge and drawn under the compass). Tests: two in
    `audit-fixes.spec.ts` (the dialog, a PNG's size, every section including the endoscopic view and slices),
    `tests/unit/figure.test.ts`. The toolbar has one more button: **the macOS picture baselines of the stages
    (`*-desktop-darwin.png`) all change** and need retaking on the MacBook.
  - 2, citation panel (the user's choices: at the foot of the panel; an option in Save image; a Copy all button):
    `src/ui/citations.ts`. `citationPanel(panel)` in every atlas page keeps a folded "Sources for this view (n)" as
    the last child of the panel's visible tab: a MutationObserver on the panel redraws it after the page redraws its
    cards (a timeout, not a frame), from the tab's `a.src` links (`refLinksFrom` gives each the full citation as its
    title). `citedInView()` serves Save image's new "References cited in the cards" option (off by default).
    Tests: one browser test (count, sort, Copy all through the clipboard, a change of tract, the Layers tab, the DBS
    section, the Save image option), a unit test of the caption's reference lines.
  - 3, isolate and per-structure opacity (the user's choices: a bar on the 3D view; "Show only this" hides all but
    the structure; the opacity in the link): `src/ui/structurebar.ts`, installed by every page after its viewer.
    `ViewState.opacity` (a structure's own 0..1), applied in `Viewer.restyle` after the selection's own look (a
    selected structure can be made see-through), to markers too; `encodeOpacity` / `decodeOpacity` in
    `src/viewer/scene.ts`, called beside the hidden list in all eight state modules (`sop`). `Viewer.shownIds`
    (meshes, lines and markers drawn), `nameOf`, `onApply` (the bar follows each applied state). The pages clear
    the opacities where they clear the hidden list (a change of view). Tests: a unit test of the link (three
    sections), a browser test (slider, reload, Show only this and back, Fade the rest, a view change, the tracts).
  - 4, MRI slices in the cortex section (the user's choices: hidden over the inflated surface; all off by default):
    a Slices tab (`buildSlicesPane`, as in the white-matter section); the cortex catalogue gets the DBS section's
    volumes (`src/cortex/scene.ts`); the cortex links keep `ax`/`co`/`sa`/`seq`; `Viewer.updateClip` draws no slice
    plane while `inflate` > 0 (only the cortex section sets it); the cortex Credits page has the templates' notice.
    Test: one browser test (a plane on, the link, the inflated surface, back).
  - 5, the unused tract-to-region table removed: `wm-connectome.json` deleted; `build.py` no longer reads the
    spreadsheet (`read_connectome` gone, `build_wm` returns nothing), `fetch_sources.py` no longer fetches it and
    its hash is out of `sources.lock.json`; `WmTract.connectome`, `HCP1065_CONNECTOME` and `CONNECTOME_MIN` gone
    from `config.py` (the tracts otherwise declared as before, checked field by field). The dataset note
    (config.py and the four manifest copies, ATTRIBUTION.md, by hand: no rebuild), NOTICE, README and comments no
    longer name the table. No shipped asset changes.
  - 6, seeded sampling in the v1 scripts: trimesh 5 samples a surface with its own generator (`seed=None` is a
    fresh one), so `skullbase_v1_brain.py`'s `np.random.seed(0)` did nothing (checked: two samples after the same
    global seed differ; after `seed=0` they are equal). Both of its `m.sample` calls now pass `seed=0` and the global
    seed is gone; the same for `skullbase_v1_cavernous.py` (two calls) and `skullbase_v1_skull.py` (one). Code only,
    no rebuild: the shipped files came from unseeded runs, so the next run of these steps may differ from them by a
    voxel here and there, once, and is then the same every run. Left alone: `skullbase_v1_endonasal.py` (line 79,
    and one more call the user's uncommitted rework in the main checkout adds): seed them there, `seed=0`.
  - 7, the audit's geometry checks on the shipped files (audit/07-roadmap.md, "Geometry checks in CI"):
    `tests/unit/mesh-checks.test.ts`, its measurements in `tests/unit/meshcheck.ts` (each reader takes the folder
    that holds `assets/`, so the checks can be run on older files). Every GLB of all twelve folders: triangles or
    lines only, finite positions, indices in range, unit normals, at most 1 % collapsed triangles; every node named L
    or R, and for its side (two halves: L left of R, and each on its own side of x = 0 except in the spine, whose CT
    midline is up to 12 mm off it; one node: L on the left, R on the right or the midline); every node inside its
    frame's box (MNI, Z-Anatomy's fossa frame, the CT's fossa frame, the spine CT), each section reaching at least
    about 85 % of today's extent. The brainstem: T2 across its surface (fluid out, tissue in) and its width at the
    four levels against the manifest. Skull base v3: the nerves in the open (III, IV, V, V1, V2, VI, VIII, chiasm,
    tract) at most 5 % of their surface in the joined bone, the others 25 %, the four in bony canals exempt; v1: a
    tube with over 20 % of its surface in bone has an in-bone note. Checked on the files the audit found wrong (from
    git): the seven lesion parts before `deb4780` (7 failures), the brainstem before `0974d74` (T2 median −15
    against 47 now; medulla 1.58 × the template), v3 before `de3b6b5` (V2 60 %, VI 27 % in bone; now 1.4 % and
    0.1 %). Already elsewhere: inside out (`winding.test.ts`), vertebrae in each other and roots in bone
    (`spine.test.ts`), v1 XII and vessels in bone (`skullbase.test.ts`). Not added: skull base v2's fitted nerves
    against its CT (the audit's MC-10, a stated limit). 16 tests, 4 s.
  - Found: in the ventricles' endoscopic view, at a narrow stage, the open legend box covers the toolbar's left end
    (Measure, Copy link and Save image under it). Not fixed here.
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
- Browser tests on the desktop: `CI=1 npx playwright test` (199 tests). Without `CI=1` the untracked Linux picture
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
  - v1 chain (updated 2026-11-24): `skullbase_build.py`, `skullbase_v1_stalk.py`, `skullbase_v1_xii.py`, `skullbase_v1_nerves.py`,
    `skullbase_v1_skull.py`, `skullbase_v1_ear.py`, `skullbase_v1.py ear`,
    `SB_PROFILE=v1 skullbase_v3_approach.py only pterional lso interhemispheric suboccipital retrosigmoid
    orbitozygomatic far_lateral kawase subtemporal`, `skullbase_v1.py approaches`, `skullbase_v1_brain.py`,
    `skullbase_v1_pfossa.py`, `skullbase_v1.py brain`, `skullbase_v1_cavernous.py`, `skullbase_v1.py cavernous`,
    `skullbase_v1_endonasal.py`, `skullbase_v1_vessels.py` (before the tumours: their pushed copies of the AICA start
    from it as moved), `skullbase_v1_ends.py` (the anterior spinal artery cut where the medulla is cut),
    `SB_PROFILE=v1 skullbase_v3_tumours.py`, `skullbase_v1_inbone.py` (last: it measures the tubes as
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
  not a slider. **The plain subtemporal approach is done too** (17 November 2026, see "The subtemporal view" above):
  its own flap, and its lift as a slider. Neither the dura nor the tentorium is modelled on the default model, so the
  tentorial cut is not shown.
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
  5. `skullbase_v3_endonasal.py` (it ends by running `skullbase_v3_clearance.py` and `skullbase_v3_junctions.py`;
     the clearance also cuts the anterior spinal artery where the medulla is cut, and `skullbase_v3_clearance.py ends`
     makes only that cut on a built model)
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
  - `npx vitest run` (469 tests on `feat/b007-tract-ends`)
  - `npm run build`
  - `npx playwright test` (199 tests, about 7 minutes, preview on port 4173; `CI=1` on the desktop, see above)
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
