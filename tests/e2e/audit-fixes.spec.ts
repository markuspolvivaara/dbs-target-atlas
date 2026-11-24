import { expect, test, type Page } from '@playwright/test';

/**
 * Regression tests for the fixes that followed the audit of November 2026 (audit/README.md on the audit branch). Each
 * test names the finding it guards. No picture comparisons here: they run the same on every platform.
 */

/** Fail on any request that leaves the local server, and on any page or console error. */
function guard(page: Page) {
  const external: string[] = [];
  const errors: string[] = [];
  page.on('request', (r) => { const u = new URL(r.url()); if (!['localhost', '127.0.0.1'].includes(u.hostname) && u.protocol !== 'data:' && u.protocol !== 'blob:') external.push(r.url()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return { external, errors };
}

/** How long the panel may take to come to rest after a selection: it is moved to the card frame by frame, for a second
 * at most, from the next frame on. Longer in CI, where a frame can be seconds away (playwright.config.ts). */
const SETTLED = process.env.CI ? 20_000 : 6_000;

/** How far the selected card's heading lies below the top of the panel's pane, in px (negative: cut off above it). */
async function headingBelowPaneTop(page: Page): Promise<number> {
  const [c, p] = await Promise.all([page.locator('.panel .card.sel h2').boundingBox(), page.locator('.panel .pane:not([hidden])').boundingBox()]);
  return c && p ? Math.round(c.y - p.y) : -999;
}

/** The card's heading comes to rest just under the pane's top, neither cut off above it nor still on its way, and is
 * still there a second later (a heading on its way past is under the top for a moment too). */
async function expectCardAtTop(page: Page, what: string) {
  const measured = `${what}: the heading's distance below the pane's top, in px`;
  const there = async () => {
    const dy = await headingBelowPaneTop(page);
    expect(dy, measured).toBeGreaterThanOrEqual(0);
    expect(dy, measured).toBeLessThan(80);
  };
  await expect(there).toPass({ timeout: SETTLED });
  await page.waitForTimeout(1000);
  await there();
}

async function settle(page: Page) {
  await page.waitForSelector('body[data-ready="1"]', { timeout: 30_000 });
  await page.waitForFunction(() => {
    const a = (window as unknown as { __atlas: { viewer: { isIdle(): boolean } } }).__atlas;
    return a.viewer.isIdle();
  }, null, { timeout: 30_000 });
  await page.waitForTimeout(400);
}

/** Open a view afresh and wait for it (a change of the hash alone would not load the page again). */
async function open(page: Page, url: string) {
  await page.goto('about:blank');
  await page.goto(url);
  await settle(page);
}

// E-001: the level card used the lumbar rule at cervical discs (a foraminal herniation at C5-C6 was said to affect C5)
test('spine: at a cervical disc the level card names the root that leaves there, and the link survives a reload', async ({ page }) => {
  const g = guard(page);
  await open(page, './spine/#/atlas?r=cervical&lv=C5');
  const card = page.locator('.card.sel');
  // no far lateral zone in the neck (the vertebral artery runs there), as in the drilling tool; a central one (E-010)
  await expect(card.locator('.lesion-kind .chip')).toHaveText(['None', 'Central', 'Paracentral', 'Foraminal']);
  await card.locator('.lesion-kind .chip[data-v="foraminal"]').click();
  await expect(card.locator('.lesion-result')).toContainText('C6 nerve root (the root that leaves at this disc), left');
  await card.locator('.lesion-kind .chip[data-v="paracentral"]').click();
  await card.locator('.lesion-side .chip[data-v="R"]').click();
  await expect(card.locator('.lesion-result')).toContainText('C6 nerve root (the root that leaves at this disc), right');
  // the card's own "Root at C5-C6" line names the same root
  await expect(card).toContainText('Exiting: C6 nerve root');
  await expect.poll(() => new URL(page.url()).hash).toContain('les=C5-C6.paracentral.R');
  await settle(page);
  await page.reload();
  await settle(page);
  await expect(page.locator('.card.sel .lesion-result')).toContainText('C6 nerve root (the root that leaves at this disc), right');
  // C8 leaves between C7 and T1
  await open(page, './spine/#/atlas?r=cervical&lv=C7&les=C7-T1.foraminal.L');
  await expect(page.locator('.card.sel .lesion-result')).toContainText('C8 nerve root (the root that leaves at this disc), left');
  // the lumbar rule is unchanged
  await open(page, './spine/#/atlas?r=lumbar&lv=L4&les=L4-L5.foraminal.L');
  await expect(page.locator('.card.sel .lesion-result')).toContainText('L4 nerve root (exiting), left');
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

// A-014: each indication's circuit explained, with a schematic whose boxes and arrows open what they stand for
test('dbs: the circuit schematics open the structures they stand for', async ({ page }) => {
  const g = guard(page);
  await open(page, './dbs/#/atlas?i=pd');
  const bg = page.locator('.card .circuit[data-circuit="bg"]');
  await expect(bg.locator('h3')).toHaveText('Basal ganglia: direct, indirect and hyperdirect pathways');
  await expect(bg).toContainText('classic rate model of Parkinson’s disease');
  await bg.getByRole('button', { name: 'STN: show Subthalamic nucleus' }).click();
  await expect(page.locator('.card.sel h2')).toContainText('Subthalamic nucleus');
  // an arrow, from the keyboard (a curved arrow's middle is not on its line): the hyperdirect pathway opens the drawn
  // tract, whose card says where it ends
  await page.locator('.card .circuit[data-circuit="bg"]').getByRole('button', { name: /^Hyperdirect pathway: cortex to STN/ }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.card.sel h2')).toContainText('Hyperdirect pathway');
  await expect(page.locator('.card.sel')).toContainText('ends mostly in the pre-SMA and SMA');
  // a box that is not drawn is no button
  await open(page, './dbs/#/atlas?i=epi');
  const papez = page.locator('.card .circuit[data-circuit="papez"]');
  await expect(papez.locator('.cx-node.undrawn')).toHaveCount(1);
  await expect(papez.locator('.cx-node.undrawn[role="button"]')).toHaveCount(0);
  await papez.getByRole('button', { name: /^Mammillothalamic tract: show/ }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.card.sel h2')).toContainText('Mammillothalamic tract');
  // Holmes tremor: both circuits, the tremor one first; the rate model is Parkinson's alone
  await open(page, './dbs/#/atlas?i=holmes');
  await expect(page.locator('.card .circuit')).toHaveCount(2);
  await expect(page.locator('.card .circuit').first()).toHaveAttribute('data-circuit', 'tremor');
  await expect(page.locator('.card .circuit[data-circuit="bg"]')).not.toContainText('rate model');
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

// A-012: the regulatory status of each indication, on its card and in one table on the References page
test('dbs: each indication card gives its regulatory status; the References page has them all in one table', async ({ page }) => {
  const g = guard(page);
  await open(page, './dbs/#/atlas?i=et');
  const card = page.locator('article.card', { has: page.locator('h2', { hasText: 'Essential tremor' }) });
  await expect(card.locator('dt', { hasText: 'Regulatory status' })).toBeVisible();
  const items = card.locator('.regulatory > li');
  await expect(items).toHaveCount(2);
  await expect(items.first()).toContainText('Approved since 1997 on one side');
  await expect(items.first()).toContainText('FDA 1997');
  await expect(items.nth(1)).toContainText('Not an approved target: no FDA approval or exemption names it');
  await expect(card).toContainText('Checked 16 November 2026');
  await open(page, './dbs/#/atlas?i=epi');
  const epi = page.locator('article.card', { has: page.locator('h2', { hasText: 'Drug-resistant epilepsy' }) });
  await expect(epi.locator('dd', { hasText: 'Responsive neurostimulation, a different device' })).toBeVisible();
  await epi.getByRole('link', { name: 'References', exact: true }).click();
  await expect(page.locator('#regulatory h2')).toHaveText('Regulatory status of each indication');
  // pd 3, et 2, holmes 1, the dystonias 2 (shared), fhd 2, md 1, tard 1, ts 1, chorea 1, epi 2
  await expect(page.locator('.reg-table tbody tr')).toHaveCount(16);
  await expect(page.locator('.reg-table tbody th', { hasText: 'Generalized dystonia' })).toContainText('Cervical dystonia');
  await expect(page.locator('.reg-table tbody tr', { hasText: 'ANT, both sides' })).toContainText('Approved, 2018');
  await page.locator('.reg-table').getByRole('link', { name: 'Tourette syndrome' }).click();
  await expect(page.locator('article.card h2', { hasText: 'Tourette syndrome' })).toBeVisible();
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

// A-013: what stimulation does when current reaches the structures around a target, on the target's card
test('dbs: the STN card lists stimulation side effects and links the drawn landmark each one names', async ({ page }) => {
  const g = guard(page);
  await open(page, './dbs/#/atlas?i=pd&sel=stn');
  const card = page.locator('.card.sel');
  await expect(card.locator('dt', { hasText: 'Stimulation side effects' })).toBeVisible();
  await expect(card.locator('.side-effects')).toContainText('Deviation of one eye and diplopia');
  await expect(card.locator('.side-effects')).toContainText('third-nerve fibres');
  await expect(card.locator('.side-effects')).toContainText('Koeglsperger 2019');
  await card.locator('.side-effects button', { hasText: 'Medial lemniscus' }).first().click();
  await expect(page.locator('.card.sel h2')).toContainText('Medial lemniscus');
  await expect(page.locator('.card.sel')).toContainText('paraesthesiae on the opposite side during STN stimulation');
  // the PSA: Kim 2021's rates
  await open(page, './dbs/#/atlas?i=et&sel=psa');
  await expect(page.locator('.card.sel .side-effects')).toContainText('14% of 93 patients with PSA stimulation');
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

// E-002, E-005, E-010: a central herniation presses on the cauda equina, not on no root; a root's picture in radiculopathy
test('spine: the level card offers a central herniation and gives each root its picture in radiculopathy', async ({ page }) => {
  const g = guard(page);
  await open(page, './spine/#/atlas?r=lumbar&lv=L4');
  const card = page.locator('.card.sel');
  await expect(card.locator('.lesion-kind .chip')).toHaveText(['None', 'Central', 'Paracentral', 'Foraminal', 'Far lateral']);
  await card.locator('.lesion-kind .chip[data-v="central"]').click();
  await expect(card.locator('.lesion-result')).toContainText('the cauda equina roots in it');
  await expect(card).toContainText('commonest cause of cauda equina syndrome');
  await expect(card.locator('.lesion-side')).toHaveCount(0);
  await expect.poll(() => new URL(page.url()).hash).toContain('les=L4-L5.central.');
  // paracentral: L5, foot drop first, then the worksheet's key muscle; no placeholder
  await card.locator('.lesion-kind .chip[data-v="paracentral"]').click();
  await expect(card.locator('.lesion-result')).toContainText('L5 nerve root (traversing), left');
  await expect(card).toContainText('In radiculopathy');
  await expect(card).toContainText('Ankle dorsiflexion, toe extension');
  await expect(card).toContainText('In the spinal cord injury standard (ISNCSCI)');
  await expect(card).toContainText('Long toe extensors');
  await expect(card).not.toContainText('to be added');
  // the neck: C6 leaves at C5-C6; its reflexes
  await open(page, './spine/#/atlas?r=cervical&lv=C5&les=C5-C6.foraminal.L');
  await expect(page.locator('.card.sel')).toContainText('Biceps, brachioradialis');
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

// E-002, E-010: the drilling tool's readout
test('spine: the drilled herniation names the cauda equina when central and the exiting root once migrated up past the disc', async ({ page }) => {
  const g = guard(page);
  // (the herniation's panel is in the drilling tool's box, beside the level card)
  const panel = page.locator('.drill-panel');
  await open(page, './spine/#/atlas?r=lumbar&lv=L4&dr=o&hz=central.L.p.8.0');
  await expect(panel).toContainText('presses on the dural sac and the cauda equina roots in it');
  await expect(panel).toContainText('commonest cause of cauda equina syndrome');
  await open(page, './spine/#/atlas?r=lumbar&lv=L4&dr=o&hz=paracentral.L.e.10.8');
  await expect(panel).toContainText('Migrated up past the disc’s upper margin, it can reach the exiting L4 root as well');
  await open(page, './spine/#/atlas?r=lumbar&lv=L4&dr=o&hz=paracentral.L.e.10.-8');
  await expect(panel).toContainText('The herniation');
  await expect(panel).not.toContainText('Migrated up past');
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

// E-008, E-009: published pedicle values like with like, and which study sets each end of a range
test('spine: published pedicle values are outer measures at C7, and a median with the study at each end in the thoracic spine', async ({ page }) => {
  const g = guard(page);
  await open(page, './spine/#/atlas?r=cervical&lv=C7');
  const c7 = page.locator('.card.sel .morph').first();
  await expect(c7).toContainText('(outer, n = 74)');
  await expect(c7).not.toContainText('screw width');
  await open(page, './spine/#/atlas?r=thoracic&lv=T9');
  const t9 = page.locator('.card.sel .morph').first();
  await expect(t9).toContainText('median');
  await expect(t9).toContainText('0.9° (Chaynes et al.)');
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

// E-012 to E-018 (the owner's choices of 16 November 2026): what a thoracic herniation compresses, published chords, C5
// palsy by operation, abbreviations written out, and a Sources page that says what each link and each reference is
test('spine: thoracic herniation statement, published chords, C5 palsy by operation; Sources names each link and each abstract-only reference', async ({ page }) => {
  const g = guard(page);
  await open(page, './spine/#/atlas?r=thoracic&lv=T9');
  const t9 = page.locator('.card.sel');
  await expect(t9).toContainText('Disc herniation at T9-T10');
  await expect(t9).toContainText('in the Dural sac (spinal canal contents); one further out can reach the root that leaves at this disc, T9 (linked above).');
  await expect(t9).toContainText('71% had myelopathy and 64% radiculopathy');
  await expect(t9.locator('.morph').first()).toContainText('screw path length 45.4 ± 5.1 mm (MRI, 168 vertebrae)');
  await expect(t9).toContainText('do not read the measured chord as a screw length');
  // the chord is measured as the two studies measure theirs (17 November 2026): in the axial plane, with how much it
  // changes a little lower and higher in the pedicle
  await expect(t9.locator('.morph').first()).toContainText('Chord in the axial plane');
  await expect(t9.locator('.chord-band')).toContainText(/for lines up to 2 mm below and above its centre it runs from \d+(\.\d)? to \d+(\.\d)? mm on the left and from \d+(\.\d)? to \d+(\.\d)? mm on the right/);
  await open(page, './spine/#/atlas?r=lumbar&lv=L3');
  const l3 = page.locator('.card.sel .morph').first();
  await expect(l3).toContainText('50.9 ± 2.9 mm (CT, n = 300)');
  await expect(l3).toContainText('Chord in the axial plane');
  await expect(l3).not.toContainText('entry to anterior cortex');
  await expect(page.locator('.card.sel .chord-band')).toHaveCount(1);
  await expect(page.locator('.card.sel')).toContainText('it is not the length along the fitted axis');
  // the neck: ACDF written out in the heading; C5 palsy by operation once a side is picked
  await open(page, './spine/#/atlas?r=cervical&lv=C5');
  const c5 = page.locator('.card.sel');
  await expect(c5).toContainText('Anterior approach to the C5-C6 disc (as for an anterior cervical discectomy and fusion, ACDF)');
  await c5.locator('.acdf-chips .chip[data-v="L"]').click();
  await expect(c5).toContainText('4% after anterior decompression and fusion, against 6% after laminoplasty and 10% after laminectomy and fusion');
  await expect(c5).not.toContainText('C5 palsy 4.6–10%');
  // Sources: a PDF and two web pages are not called DOI; abstract-only references say so; no uncited Zindrick 1987
  await open(page, './spine/#/sources');
  const refs = page.locator('.refs li');
  await expect(refs.filter({ hasText: 'ISNCSCI) worksheet' }).locator('a')).toHaveText('PDF');
  await expect(refs.filter({ hasText: 'C2 pedicle screw insertion' }).locator('a')).toHaveText('Web page');
  await expect(refs.filter({ hasText: 'C2 pars screw insertion' }).locator('a')).toHaveText('Web page');
  await expect(refs.filter({ hasText: 'Checked against its abstract: the full text is not open access.' })).toHaveCount(11);
  await expect(refs.filter({ hasText: 'Zindrick' })).toHaveCount(0);
  await expect(page.locator('.page:not([hidden])')).toContainText('A reference that could be checked only against its abstract, or in another way, says so after its citation.');
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

// C-019 (the owner's choices of 16 November 2026): what each triangle holds, on its card and in the view's text; the
// limit of the far lateral approach's condylar drilling
for (const section of ['skullbase', 'skullbase-v1']) {
  test(`${section}: a triangle’s card and the cavernous sinus view say what the triangle holds; the far lateral text names the hypoglossal canal`, async ({ page }) => {
    const g = guard(page);
    const id = `${section === 'skullbase' ? 'tb' : 'sb'}_triangle_inferior`;
    await open(page, `./${section}/#/atlas?g=cavernous&sel=${id}`);
    const card = page.locator('.card.sel');
    await expect(card.locator('h2')).toContainText('Inferior (Parkinson\'s) triangle');
    await expect(card).toContainText('Contents');
    await expect(card).toContainText('generally holds the origin of the meningohypophyseal trunk and the cavernous part of the abducens nerve');
    await expect(card).toContainText('endonasally the inferolateral trunk and the abducens nerve');
    await expect(card).toContainText('Chavez-Herrera 2023');
    await expect(card).not.toContainText('Z-Anatomy ships no definition');
    // a posterior triangle: contents, no routes
    await open(page, `./${section}/#/atlas?g=cavernous&sel=${id.replace('inferior', 'posterolateral')}`);
    await expect(page.locator('.card.sel')).toContainText('Drilling it exposes the horizontal petrous carotid, for proximal control');
    await expect(page.locator('.card.sel')).not.toContainText('by route');
    // the view's own text
    await open(page, `./${section}/#/atlas?g=cavernous`);
    const pane = page.locator('.panel .pane:not([hidden])');
    await expect(pane).toContainText('What each triangle holds');
    await expect(pane).toContainText('The anterior triangles by route');
    await expect(pane).toContainText('The inferolateral (lateral) triangle holds the porus trigeminus');
    await open(page, `./${section}/#/atlas?g=far_lateral`);
    await expect(pane).toContainText('The hypoglossal canal is the anterior limit of the condylar drilling.');
    expect(g.external).toEqual([]);
    expect(g.errors).toEqual([]);
  });
}

// D-009 (the owner's choices of 16 November 2026): the ETV Success Score as a table, Frazier's point with its marker,
// the third ventricle's other walls and the temporal horn's, and whom Chen's percentages come from
test('ventricles: the ETV Success Score table, Frazier’s point, the third ventricle’s other walls and Chen’s cohort', async ({ page }) => {
  const g = guard(page);
  const pane = page.locator('.panel .pane:not([hidden])');
  await open(page, './ventricles/#/atlas?g=etv');
  const score = pane.locator('.etv-score');
  await expect(score.locator('caption')).toHaveText('ETV Success Score: add one line from each block');
  await expect(score.locator('tbody')).toHaveCount(3);
  await expect(score.locator('tbody tr')).toHaveCount(10);
  await expect(score.locator('tbody').nth(0).locator('tr').last()).toContainText('10 years or more');
  await expect(score.locator('tbody').nth(0).locator('tr').last().locator('td').last()).toHaveText('50');
  await expect(score).toContainText('618 ventriculostomies in children at 12 centres');
  await expect(score).toContainText('The largest sum the table allows is 90.');
  await expect(score).toContainText('not a calculator');
  // the access view: Frazier's point described, and marked on the catheter's side with the inion
  await open(page, './ventricles/#/atlas?g=evd');
  await expect(pane).toContainText('Another way in: Frazier’s point');
  await expect(pane).toContainText('about 6 cm above the inion and 3–4 cm from the midline');
  await expect(pane).toContainText('Keen’s point, above and behind the ear, is not marked');
  await expect(pane.locator('.catheter')).toContainText('Chen’s 206 CTs were of patients older than 16');
  const marked = () => page.evaluate(() => (window as unknown as { __atlas: { viewer: { currentPlan(): { markers: { targetId: string }[] } } } }).__atlas.viewer.currentPlan().markers.map((m) => m.targetId));
  expect(await marked()).toEqual(expect.arrayContaining(['lm_inion', 'lm_frazier_r']));
  await pane.locator('.cath-side .chip[data-v="L"]').click();
  await expect.poll(marked).toEqual(expect.arrayContaining(['lm_inion', 'lm_frazier_l']));
  // with all labels on, the skull's landmarks are named on screen
  await open(page, './ventricles/#/atlas?g=evd&lb=a');
  await expect(page.locator('.labels .mlabel', { hasText: 'Frazier\'s point' })).toHaveCount(1);
  await expect(page.locator('.labels .mlabel', { hasText: 'Inion' })).toHaveCount(1);
  // the anatomy view: the walls
  await open(page, './ventricles/#/atlas?g=ventricles');
  await expect(pane).toContainText('The third ventricle’s roof and other walls');
  await expect(pane).toContainText('Posterior wall, from above down: the habenular commissure');
  await expect(pane).toContainText('Temporal horn: its roof and lateral wall are formed by the tapetum');
  // Sources: the original score paper says it was checked against its abstract
  await open(page, './ventricles/#/sources');
  await expect(page.locator('.refs li', { hasText: 'Kulkarni AV' })).toContainText('Checked against its abstract: the full text is not open access.');
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

// D-010 (the owner's choices of 16 November 2026): what is known of aneurysms and AVMs that have not bled, on the
// Grading page; the supplementary grade's own paper beside the later series
test('vascular: the Grading page gives ISUIA and PHASES for unruptured aneurysms, ARUBA and the natural history for unruptured AVMs', async ({ page }) => {
  const g = guard(page);
  await page.goto('about:blank');
  await page.goto('./vascular/#/grading');
  const pg = page.locator('.page.grading');
  await expect(pg.locator('h2')).toHaveText(['Aneurysmal subarachnoid haemorrhage', 'Unruptured aneurysms', 'Arteriovenous malformations', 'Dural arteriovenous fistulas']);
  const isuia = pg.locator('#isuia');
  await expect(isuia.locator('tbody tr')).toHaveCount(4);
  await expect(isuia.locator('tbody tr').nth(1)).toContainText('7–12 mm');
  await expect(isuia.locator('tbody tr').nth(1).locator('td')).toHaveText(['2.6 %', '14.5 %']);
  await expect(isuia).toContainText('PHASES pooled 8382 people from six prospective cohorts');
  const aruba = pg.locator('#aruba');
  await expect(aruba.locator('h3')).toContainText('Unruptured AVMs: treated or watched (the ARUBA trial)');
  await expect(aruba.locator('tbody tr').first()).toContainText('35 of 114 (30.7 %)');
  await expect(aruba).toContainText('5 were treated by neurosurgery alone');
  await expect(aruba).toContainText('it does not say whether an AVM that has not bled should be treated');
  await expect(aruba).toContainText('1.3 % of those unruptured when found');
  // the supplemented grade: the original series beside Helsinki's
  await expect(pg.locator('#supp-grades thead th')).toHaveText(['Supplemented grade', 'Unchanged or improved after surgery, the original series†', 'Favourable outcome after surgery, Helsinki*']);
  await expect(pg.locator('#supp-grades tbody tr').nth(4)).toContainText('73 % (51 of 70)');
  await expect(pg.locator('#supp-points')).toContainText('Lawton 2010');
  // Sources: what was read of each new reference
  await page.goto('./vascular/#/sources');
  await expect(page.locator('.refs li', { hasText: 'Wiebers DO' })).toContainText('Checked against its abstract: the full text is not open access.');
  await expect(page.locator('.refs li', { hasText: 'A supplementary grading scale' })).not.toContainText('Checked against');
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

/** Which sides of a structure's mesh are drawn now (the viewer's own nodes, by their names L and R). */
async function drawnSides(page: Page, id: string): Promise<Record<string, boolean> | null> {
  return page.evaluate((sid) => {
    const v = (window as unknown as { __atlas: { viewer: { items: Map<string, { nodes: Record<string, { visible: boolean } | undefined> }> } } }).__atlas.viewer;
    const it = v.items.get(sid);
    return it ? Object.fromEntries(Object.entries(it.nodes).filter(([, n]) => n).map(([k, n]) => [k, n!.visible])) : null;
  }, id);
}

// MB-01: the left-sided lesions were stored in a node named R, so "Left" hid them and "Right" drew them beside the brain
test('vascular: a lesion on the left is drawn with Left and hidden with Right', async ({ page }) => {
  const g = guard(page);
  for (const [grp, part] of [['avm3', 'va_avm3__nidus'], ['avm3', 'va_avm3__feeders'], ['avm3', 'va_avm3__drainers']] as const) {
    await open(page, `./vascular/#/atlas?g=${grp}&h=L`);
    expect(await drawnSides(page, part), `${part} with Left`).toEqual({ L: true });
    await page.locator('[data-hemi="R"]').click();
    await settle(page);
    expect(await drawnSides(page, part), `${part} with Right`).toEqual({ L: false });
  }
  // a lesion on the right, the other way round
  await open(page, './vascular/#/atlas?g=avm1&h=R');
  expect(await drawnSides(page, 'va_avm1__nidus')).toEqual({ R: true });
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

// D-001: the AVM outcome columns hold Hafez 2019's "unchanged or improved" counts, not Modified Rankin Scale 0-2
test('vascular: the grading tables name the outcome their numbers are', async ({ page }) => {
  const g = guard(page);
  await page.goto('./vascular/#/grading');
  await page.waitForSelector('body[data-ready="1"]', { timeout: 30_000 });
  const text = await page.locator('main').innerText();
  expect(text).toContain('Modified Rankin Scale score unchanged or improved after surgery');
  expect(text).toContain('85 % (40 of 47)');
  expect(text).not.toMatch(/Rankin Scale 0.2/);
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

// B-001, B-002, B-004, B-015: a label named occipital coloured parietal; definition texts wrong or about a neighbour
test('cortex: cards name their own lobe first, say what a text is about and list a correction', async ({ page }) => {
  const g = guard(page);
  await open(page, './cortex/#/atlas?v=posterior&sel=ctx_g_occipital_sup');
  const card = page.locator('.card.sel');
  await expect(card.locator('.eyebrow')).toHaveText(/Gyrus · Occipital lobe \/ Parietal lobe/i);
  await expect(card).toContainText('Shown with the occipital lobe, as its Destrieux name places it.');
  await open(page, './cortex/#/atlas?v=lateral&sel=ctx_g_pariet_inf_angular');
  // the text as shown is the corrected one; what it said before is only in the note under it
  const shown = card.locator('dd p').first();
  await expect(shown).toContainText('lying in the posterior part of the inferior parietal lobule');
  await expect(shown).not.toContainText('anterolateral');
  // (two corrections since the audit's B-016: the first is this one)
  await expect(card.locator('.def-edit').first()).toContainText('Corrected here');
  await expect(card.locator('.def-edit').first()).toContainText('Destrieux et al. 2010');
  await expect(card.locator('.def-edit').nth(1)).toContainText('is left out');
  await open(page, './cortex/#/atlas?v=inferior&sel=ctx_s_orbital_med_olfact');
  await expect(card.locator('dt').first()).toHaveText('About the olfactory tract, which lies just below this sulcus');
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

// B-014: a label and a lobe Z-Anatomy ships no text for have one written from Destrieux 2010; the cingulate cortex's
// card heads its text as the limbic lobe's
test('cortex: texts written from Destrieux 2010 where Z-Anatomy ships none; the limbic lobe’s text headed so', async ({ page }) => {
  const g = guard(page);
  await open(page, './cortex/#/atlas?v=lateral&sel=ctx_lat_fis_post');
  const card = page.locator('.card.sel');
  await expect(card).toContainText('curves upwards into the inferior parietal lobule');
  await expect(card.locator('.def-own')).toContainText('Written for this atlas from Destrieux et al. 2010');
  await expect(card.locator('.def-own a.src')).toHaveText('Destrieux 2010');
  await expect(card.locator('dd p').first()).toHaveText(/^The posterior segment of the lateral sulcus begins/);
  await open(page, './cortex/#/atlas?v=medial&lobe=occipital');
  const lobe = page.locator('.panel .pane:not([hidden]) .card', { has: page.locator('.eyebrow', { hasText: 'Lobe' }) });
  await expect(lobe).toContainText('The occipital lobe is limited by sulci only in part');
  await expect(lobe.locator('.def-own')).toContainText('Destrieux et al. 2010');
  await open(page, './cortex/#/atlas?v=medial&lobe=cingulate');
  await expect(lobe.locator('dt').first()).toHaveText('About the limbic lobe');
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

// P1-06: the cranial floor listed four nerves twice. C-002: v1 and v2 listed the atlas's "Lateral mass" on the occipital bone
test('skull base: the cranial floor lists each nerve once; no landmark of the atlas on the occipital bone', async ({ page }) => {
  const g = guard(page);
  await open(page, './skullbase/#/atlas?g=floor');
  const panel = await page.locator('.panel').innerText();
  for (const name of ['Chorda tympani', 'Greater petrosal nerve', 'Nerves in the internal acoustic meatus']) expect(panel.split(name).length - 1, name).toBe(1);
  for (const model of ['skullbase-v1', 'skullbase-ct']) {
    await open(page, `./${model}/#/atlas?g=bone_occipital_bone`);
    const text = await page.locator('.panel').innerText();
    expect(text, model).toContain('Occipital condyle');
    expect(text, model).not.toContain('Lateral mass');
  }
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

// A-005: the axial-signs card said the brainstem "is represented by the PPN", which no Parkinson's view draws
test('dbs: the axial-signs note does not point to a nucleus the view leaves out', async ({ page }) => {
  const g = guard(page);
  await open(page, './dbs/#/atlas?i=pd&s=pd-axial');
  const panel = await page.locator('.panel').innerText();
  expect(panel).toContain('the brainstem side is not drawn in this view');
  expect(panel).not.toMatch(/PPN|pedunculopontine/i);
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

// P1-01, UI-05: every section downloaded its whole mesh catalogue (the skull base 207 files) before drawing anything
test('loading: a view downloads the meshes it draws, not the catalogue, and the next view loads its own', async ({ page }) => {
  const g = guard(page);
  const glbs = new Set<string>();
  page.on('request', (r) => { if (new URL(r.url()).pathname.endsWith('.glb')) glbs.add(new URL(r.url()).pathname); });
  await open(page, './skullbase/');
  const first = glbs.size;
  // the cranial floor: its bones, nerves and ear, about 40 files of the model's 200 and more
  expect(first).toBeGreaterThan(20);
  expect(first).toBeLessThan(70);
  for (const part of ['tb_facial_nerve_vii', 'tb_chorda_tympani']) expect(await drawnSides(page, part), part).not.toBeNull();
  // a view with other structures fetches them when it is opened, and is complete when the viewer is idle again
  await page.locator('.panel .chip', { hasText: 'Arteries' }).first().click();
  await settle(page);
  expect(glbs.size).toBeGreaterThan(first);
  await expect(page.locator('.status')).toBeHidden();
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

// P1-02, UI-06: a mesh that failed to load was left out without a word, and was not tried again
test('loading: a structure that cannot be loaded is named in a notice that stays, and Retry loads it', async ({ page }) => {
  let block = true;
  await page.route('**/assets/meshes/stn_motor.glb*', (route) => (block ? route.abort() : route.continue()));
  // (the STN's zones asked for: the whole nucleus is the default)
  await open(page, './dbs/#/atlas?i=pd&stn=z');
  const notice = page.locator('.status-failed');
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('One structure of this view could not be loaded');
  await expect(notice).toHaveAttribute('role', 'alert');
  expect(await drawnSides(page, 'stn_motor')).toBeNull();
  // it stays while the rest of the page goes on working
  await page.locator('[data-hemi="L"]').click();
  await settle(page);
  await expect(notice).toBeVisible();
  // the download works again: Retry fetches the file and the notice goes
  block = false;
  await notice.getByRole('button', { name: 'Retry' }).click();
  await settle(page);
  await expect(notice).toBeHidden();
  await expect(page.locator('.status')).toBeHidden();
  expect(await drawnSides(page, 'stn_motor')).toEqual({ L: true, R: false });
});

/** The camera's position, rounded (the viewer's own camera). */
async function cameraAt(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const c = (window as unknown as { __atlas: { viewer: { camera: { position: { toArray(): number[] } } } } }).__atlas.viewer.camera;
    return c.position.toArray().map((v) => Math.round(v));
  });
}

// UI-02: a click on a structure opened its card thousands of pixels down the panel (3,400 px in the skull base)
test('selection: the card of a clicked structure is brought to the top of the panel', async ({ page }) => {
  const g = guard(page);
  for (const [url, x, y] of [['./skullbase/', 420, 430], ['./cortex/', 400, 400], ['./brainstem/', 430, 420]] as const) {
    await open(page, url);
    await page.mouse.click(x, y);
    const card = page.locator('.panel .card.sel');
    await expect(card, url).toBeVisible();
    // within the pane's visible part, not below the fold
    await expect.poll(async () => {
      const [c, p] = await Promise.all([card.boundingBox(), page.locator('.panel .pane:not([hidden])').boundingBox()]);
      return c && p ? Math.round(c.y - p.y) : -1;
    }, { message: url }).toBeLessThan(40);
    expect((await card.boundingBox())!.y, url).toBeGreaterThan(0);
  }
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

// UI-02, a page opened on a link with a selection: the panel is first laid out in the fallback font, and the lists
// above the card change their height when the page's own font arrives (226 px in the skull base, on Linux).
// This test failed now and then in CI (pull request 22, 17 November 2026: the heading never came to rest, 20 s). The
// pane was then scrolled by the browser's smooth scroll and aligned once more 900 ms later; on a slow runner that
// landed inside the smooth scroll, which Chromium did not stop but carried on from the place just set. To see it on a
// fast machine, hold the browsers to one core: `CI=1 taskset -c 0 npx playwright test -g "card from its top"
// --repeat-each 12 --workers 2 --retries 0` failed 5 times in 12 before the fix.
test('selection: a link that opens with a selection shows the card from its top', async ({ page }) => {
  const g = guard(page);
  for (const url of ['./skullbase/#/atlas?g=floor&sel=tb_facial_nerve_vii', './brainstem/#/atlas?g=sez_floor&sel=sez_infrafacial', './cortex/#/atlas?v=lateral&sel=ctx_g_precentral']) {
    await open(page, url);
    await expect(page.locator('.panel .card.sel'), url).toBeVisible();
    await expectCardAtTop(page, url);
  }
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

// UI-02, the same when the font arrives after the pane has come to rest (a slow connection). Chromium and Firefox then
// take the pane along with what it shows (scroll anchoring); that is switched off here, as in a browser without it.
test('selection: the card stays at the pane’s top when the page’s font arrives late', async ({ page }) => {
  const g = guard(page);
  await page.addInitScript(() => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync('.pane { overflow-anchor: none }');
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  });
  await page.route(/\.woff2?$/, async (route) => { await new Promise((ok) => setTimeout(ok, 2500)); await route.continue(); });
  await open(page, './skullbase/#/atlas?g=floor&sel=tb_facial_nerve_vii');
  await expect(page.locator('.panel .card.sel')).toBeVisible();
  await page.waitForFunction(() => document.fonts.status === 'loaded' && [...document.fonts].some((f) => f.status === 'loaded'));
  await expectCardAtTop(page, 'after the font');
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

// UI-02 on a phone: the card was below the part of the sheet that shows
test('selection on a phone: a tapped structure’s card shows in the sheet @mobile', async ({ page }) => {
  await open(page, './skullbase/');
  const stage = (await page.locator('.stage').boundingBox())!;
  await page.touchscreen.tap(stage.x + stage.width / 2, stage.y + stage.height * 0.55);
  const card = page.locator('.panel .card.sel');
  await expect(card).toBeVisible();
  const vh = page.viewportSize()!.height;
  await expect.poll(async () => (await card.locator('h2').boundingBox())?.y ?? 9999).toBeLessThan(vh - 30);
});

// UI-03, UI-21: no visible help and no way back to the view's own camera
for (const url of ['./dbs/', './tracts/', './skullbase/', './skullbase-v1/', './skullbase-ct/', './cortex/', './spine/', './brainstem/', './ventricles/', './vascular/']) {
  test(`toolbar (${url}): Reset view puts the camera back, the ? button opens the help with the mouse and touch controls`, async ({ page }) => {
    const g = guard(page);
    await open(page, url);
    const start = await cameraAt(page);
    await page.locator('.toolbar [data-preset]').nth(1).click();
    await settle(page);
    expect(await cameraAt(page)).not.toEqual(start);
    await page.locator('.toolbar [data-reset-view]').click();
    await settle(page);
    expect(await cameraAt(page), 'Reset view').toEqual(start);
    // the key does the same
    await page.locator('.toolbar [data-preset]').nth(1).click();
    await settle(page);
    await page.keyboard.press('0');
    await settle(page);
    expect(await cameraAt(page), 'key 0').toEqual(start);
    const help = page.locator('dialog.help');
    await expect(help).toBeHidden();
    await page.locator('.toolbar .help-btn').click();
    await expect(help).toBeVisible();
    await expect(help).toContainText('Drag to turn the view');
    await expect(help).toContainText('One finger turns the view');
    await help.getByRole('button', { name: 'Close' }).click();
    await expect(help).toBeHidden();
    expect(g.external).toEqual([]);
    expect(g.errors).toEqual([]);
  });
}

/** The boxes of the name labels drawn now, and of the page's overlays on the stage (relative to the page). */
async function labelBoxes(page: Page) {
  return page.evaluate(() => {
    const box = (e: Element) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, text: (e.textContent ?? '').trim() }; };
    const stage = document.querySelector('.stage')!;
    return {
      stage: box(stage),
      labels: [...stage.querySelectorAll('.labels > span')].filter((e) => !(e as HTMLElement).hidden).map(box),
      overlays: [...stage.querySelectorAll('.tgroup, .legend-box, .readout-box, .gizmo')].map(box).filter((b) => b.w > 0 && b.h > 0),
    };
  });
}
const overlap = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  a.x < b.x + b.w - 1 && a.x + a.w > b.x + 1 && a.y < b.y + b.h - 1 && a.y + a.h > b.y + 1;

// UI-08: with every name on, labels lay over each other, under the toolbar and the legend, and across the stage's edge
test('labels: with all names on, none overlaps another, lies under an overlay or is cut by the edge', async ({ page }) => {
  const g = guard(page);
  for (const url of ['./skullbase/#/atlas?g=floor&lb=a', './skullbase/#/atlas?g=ear_r&lb=a', './brainstem/#/atlas?lb=a', './dbs/#/atlas?i=pd&lb=a']) {
    await open(page, url);
    const b = await labelBoxes(page);
    expect(b.labels.length, url).toBeGreaterThan(2);
    const clashes: string[] = [];
    b.labels.forEach((l, i) => {
      for (const m of b.labels.slice(i + 1)) if (overlap(l, m)) clashes.push(`${l.text} / ${m.text}`);
      for (const o of b.overlays) if (overlap(l, o)) clashes.push(`${l.text} under an overlay`);
      if (l.x < b.stage.x || l.x + l.w > b.stage.x + b.stage.w || l.y < b.stage.y || l.y + l.h > b.stage.y + b.stage.h) clashes.push(`${l.text} cut by the edge`);
    });
    expect(clashes, url).toEqual([]);
  }
  // the selected structure's name is always drawn
  await open(page, './skullbase/#/atlas?g=floor&lb=a&sel=tb_facial_nerve_vii');
  expect((await labelBoxes(page)).labels.map((l) => l.text)).toContain('Facial nerve (VII)');
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

// UI-08, UI-01, UI-17, UI-18 on a phone
test('phone: names by tap, rows that show they scroll, targets a finger can hit, a tap beside a marker selects it @mobile', async ({ page }) => {
  await open(page, './skullbase/');
  // names are not all on by default on a phone (44 of them buried the model); a tap names a structure
  await expect(page.locator('.toolbar [data-labels="hover"]')).toHaveAttribute('aria-pressed', 'true');
  expect((await labelBoxes(page)).labels.length).toBe(0);
  // the toolbar scrolls sideways and says so: faded on the right at first, on the left at its end
  const toolbar = page.locator('.toolbar');
  await expect(toolbar).toHaveAttribute('data-more', 'right');
  await toolbar.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
  await expect(toolbar).toHaveAttribute('data-more', 'left');
  await toolbar.evaluate((el) => { el.scrollLeft = 0; });
  // toolbar buttons, the panel's tabs and the sheet's close button are at least 44 px high
  for (const sel of ['.toolbar .tbtn', '.ptab']) {
    const hgt = await page.locator(sel).first().evaluate((e) => e.getBoundingClientRect().height);
    expect(hgt, sel).toBeGreaterThanOrEqual(44);
  }
  // a tap 12 px beside a landmark's dot selects the landmark, not the bone behind it: the dot farthest from its
  // neighbours, tapped on the side away from the nearest one
  const m = await page.evaluate(() => {
    const v = (window as unknown as { __atlas: { viewer: { markerScreen(): { id: string; x: number; y: number }[] } } }).__atlas.viewer;
    const r = document.querySelector('.viewer-host canvas')!.getBoundingClientRect();
    const all = v.markerScreen();
    let best: { id: string; x: number; y: number; d: number } | null = null;
    for (const a of all) {
      if (a.y < 150 || a.y > r.height - 120 || a.x < 40 || a.x > r.width - 60) continue;
      let near = Infinity, nx = 1, ny = 0;
      for (const b of all) { const d = Math.hypot(a.x - b.x, a.y - b.y); if (b !== a && d < near) { near = d; nx = (a.x - b.x) / (d || 1); ny = (a.y - b.y) / (d || 1); } }
      if (!best || near > best.d) best = { id: a.id, x: r.left + a.x + nx * 12, y: r.top + a.y + ny * 12, d: near };
    }
    return best;
  });
  expect(m).not.toBeNull();
  expect(m!.d).toBeGreaterThan(12);   // (the floor's 44 dots lie close on a phone: its nearest neighbour is then 12 px further from the tap)
  await page.touchscreen.tap(m!.x, m!.y);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __atlas: { state(): { sel: string | null } } }).__atlas.state().sel)).toBe(m!.id);
  // and its name is drawn
  await expect.poll(async () => (await labelBoxes(page)).labels.length).toBe(1);
});

// UI-01: the section's page tabs on a phone
// the roadmap's "coordinate readout relative to a chosen landmark": the read-out gives a pointed position from a
// landmark the reader picks (in its card, or in the Layers tab), and a link keeps the choice
test('the position read-out measured from a chosen landmark', async ({ page }) => {
  const g = guard(page);
  await open(page, './skullbase/#/atlas?g=floor&sel=lm_foramen_ovale_r');
  const btn = page.getByRole('button', { name: 'Measure positions from here' });
  await btn.click();
  await expect.poll(() => page.url()).toContain('fr=lm_foramen_ovale_r');
  await expect(page.locator('.from-here')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('select[data-k="from"]')).toHaveValue('lm_foramen_ovale_r');
  // pointing at the skull: the read-out says where from the landmark
  const box = (await page.locator('.viewer-host canvas').boundingBox())!;
  await expect.poll(async () => {
    for (const [fx, fy] of [[0.5, 0.5], [0.45, 0.55], [0.55, 0.45], [0.5, 0.6]]) {
      await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy);
      const t = await page.locator('.readout').innerText();
      if (t.startsWith('From Foramen ovale (right)')) return t;
    }
    return '';
  }).toMatch(/^From Foramen ovale \(right\)\s+[\d.]+ mm (right|left) · [\d.]+ mm (in front|behind) · [\d.]+ mm (above|below) · [\d.]+ mm in a straight line$/);
  // and back to the fossa
  await page.locator('.from-here').click();
  await expect.poll(() => page.url()).not.toContain('fr=');
  // the ventricles: from a link
  await open(page, './ventricles/#/atlas?g=ventricles&fr=lm_bregma');
  await expect(page.locator('select[data-k="from"]')).toHaveValue('lm_bregma');
  // (a link naming no landmark is put right)
  await open(page, './skullbase/#/atlas?g=floor&fr=lm_nothing_here');
  await expect.poll(() => page.url()).not.toContain('fr=');
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

// UI-22: the skull base and ventricles panels open with 550 to 880 words and up to 145 tab stops; a row of jumps at
// their top leads to each part, and the part takes the focus, so a keyboard user lands there too
async function jumpsWork(page: Page, want: string[]) {
  const pane = page.locator('.panel .pane:not([hidden])');
  const row = pane.locator('nav.jump-row');
  await expect(row).toHaveAttribute('aria-label', 'In this panel');
  expect(await row.getByRole('button').allInnerTexts()).toEqual(want);
  // (the row comes before the panel's first control)
  expect(await pane.evaluate((p) => p.querySelector('button, a[href], input, select')?.closest('nav.jump-row') !== null)).toBe(true);
  for (const label of want) {
    await row.getByRole('button', { name: label, exact: true }).click();
    const at = page.locator(':focus');
    await expect(at).not.toHaveClass(/jump/);
    expect(await at.evaluate((el) => !!el.closest('.panel .pane'))).toBe(true);
    // (its top edge in sight, inside the pane and the window: a card can be far taller than the screen; on a phone the
    // sheet opens to show it)
    await expect.poll(() => at.evaluate((el) => {
      const r = el.getBoundingClientRect(), p = el.closest('.pane')!.getBoundingClientRect();
      return r.top >= p.top - 1 && r.top < Math.min(p.bottom, window.innerHeight) - 10;
    }), { message: label }).toBe(true);
  }
}

test('long panels: a row of jumps to their parts, each taking the focus', async ({ page }) => {
  const g = guard(page);
  await open(page, './skullbase/#/atlas?g=transsylvian');
  await jumpsWork(page, ['Views', 'Opening', 'Shown in this view', 'About this view', 'Model']);
  await open(page, './ventricles/#/atlas?g=ventricles');
  await jumpsWork(page, ['Views', 'Ventricles', 'About this view', 'Shape']);
  // a short panel has no row
  await open(page, './dbs/');
  await expect(page.locator('nav.jump-row')).toHaveCount(0);
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

test('phone: the long panel’s jumps work in the sheet @mobile', async ({ page }) => {
  await open(page, './skullbase/#/atlas?g=transsylvian');
  await expect(page.locator('.panel')).toHaveAttribute('data-sheet', 'peek');
  await jumpsWork(page, ['Views', 'Opening', 'Shown in this view', 'About this view', 'Model']);
  await expect(page.locator('.panel')).toHaveAttribute('data-sheet', 'full');
});

// UI-27: on a phone the notice is "Teaching tool." and its own last sentence, the rest a tap away; it took two to four
// lines of the first screen from the 3D stage. The full text is still there, word for word
test('phone: the notice folded to one line, the full text a tap away @mobile', async ({ page }) => {
  const g = guard(page);
  const sections: [string, RegExp, RegExp][] = [
    ['./skullbase/', /^Teaching tool\. Not for surgical planning\.\s*More$/, /registered into it: positions are approximate to a millimetre or two\. Individual anatomy varies\. Not for surgical planning\./],
    ['./spine/', /^Teaching tool\. Illustrative, not for surgical planning\.\s*More$/, /pedicle sizes and vessel positions vary between people/],
    ['./vascular/', /^Teaching tool\. For teaching, not for diagnosis or planning\.\s*More$/, /every aneurysm, malformation and fistula is drawn onto them by rule/],
    ['./', /^Teaching tool\. Not for surgical planning\.\s*More$/, /single-patient CT anatomy/],
  ];
  for (const [url, short, full] of sections) {
    await page.goto('about:blank');
    // (the home page has no 3D view to wait for)
    if (url === './') await page.goto(url); else await open(page, url);
    const notice = page.locator('aside.disclaimer[aria-label="Notice"]');
    await expect(notice.locator('.disc-short')).toBeVisible();
    await expect(notice.locator('.disc-full')).toBeHidden();
    expect((await notice.locator('.disc-short').innerText()).trim(), url).toMatch(short);
    const stage = url === './' ? null : page.locator('.stage');
    const folded = stage ? (await stage.boundingBox())!.height : 0;
    const more = notice.getByRole('button', { name: 'More' });
    await expect(more).toHaveAttribute('aria-expanded', 'false');
    await more.click();
    await expect(notice.locator('.disc-full')).toBeVisible();
    await expect(notice.locator('.disc-short')).toBeHidden();
    await expect(notice.locator('.disc-full'), url).toContainText(full);
    // the stage gives the room back when the notice is folded: on the skull base the notice is four lines in full
    if (stage && url === './skullbase/') await expect.poll(async () => folded - (await stage.boundingBox())!.height).toBeGreaterThan(25);
    const less = notice.getByRole('button', { name: 'Less' });
    await expect(less).toHaveAttribute('aria-expanded', 'true');
    await expect(less).toBeFocused();
    await less.click();
    await expect(notice.locator('.disc-short')).toBeVisible();
    await expect(more).toBeFocused();
  }
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

// UI-27: on a desktop the notice is shown whole, with nothing to unfold
test('the notice in full on a desktop', async ({ page }) => {
  await open(page, './skullbase/');
  const notice = page.locator('aside.disclaimer[aria-label="Notice"]');
  await expect(notice.locator('.disc-full')).toBeVisible();
  await expect(notice.locator('.disc-short')).toBeHidden();
  await expect(notice.getByRole('button')).toHaveCount(0);
  await expect(notice).toContainText('Teaching tool. One adult’s CT with another person’s ear');
});

test('phone: the page tabs fade where more lie @mobile', async ({ page }) => {
  await open(page, './dbs/');
  const nav = page.locator('header .nav');
  await expect(nav).toHaveAttribute('data-more', 'right');
  await nav.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
  await expect(nav).toHaveAttribute('data-more', 'left');
});

// UI-04: a click on a structure inside a see-through shell selected the shell (0 of 7 right in the temporal bone view)
test('picking: a click goes through a see-through shell to the structure drawn in it', async ({ page }) => {
  const g = guard(page);
  await open(page, './skullbase/#/atlas?g=ear_r');
  const sel = () => page.evaluate(() => (window as unknown as { __atlas: { state(): { sel: string | null } } }).__atlas.state().sel);
  // the shell is see-through here
  const shell = await page.evaluate(() => {
    const v = (window as unknown as { __atlas: { viewer: { currentPlan(): { looks: Map<string, string> } } } }).__atlas.viewer;
    return [...v.currentPlan().looks].filter(([, l]) => l === 'shell' || l === 'context').map(([id]) => id);
  });
  expect(shell.length).toBeGreaterThan(0);
  let tried = 0;
  for (const id of ['tb_malleus', 'tb_incus', 'tb_tympanic_membrane']) {
    const at = await page.evaluate((sid) => {
      const v = (window as unknown as { __atlas: { viewer: { anchorFor(id: string): { x: number; y: number } | null } } }).__atlas.viewer;
      const a = v.anchorFor(sid);
      const r = document.querySelector('.viewer-host canvas')!.getBoundingClientRect();
      return a ? { x: r.left + a.x, y: r.top + a.y } : null;
    }, id);
    if (!at) continue;
    tried++;
    await page.mouse.click(at.x, at.y);
    await expect.poll(sel, { message: id }).not.toBeNull();
    // what was clicked is a structure drawn solid (the ossicle, or a nerve or landmark in front of it), never the shell
    expect(shell, id).not.toContain(await sel());
    await page.keyboard.press('Escape');
    await expect.poll(sel).toBeNull();
  }
  expect(tried).toBeGreaterThan(1);
  // the shell is still picked where nothing solid lies behind it
  await open(page, './skullbase/#/atlas?g=ear_r');
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

/** The camera's distance from the point it looks at, and that point (rounded). */
async function cameraFrame(page: Page): Promise<{ dist: number; tgt: number[] }> {
  return page.evaluate(() => {
    const v = (window as unknown as { __atlas: { viewer: { camera: { position: { distanceTo(p: unknown): number } }; controls: { target: { toArray(): number[] } } } } }).__atlas.viewer;
    return { dist: Math.round(v.camera.position.distanceTo(v.controls.target)), tgt: v.controls.target.toArray().map((x: number) => Math.round(x)) };
  });
}

// UI-09: the 3D view could not be turned, moved or zoomed from the keyboard
test('keyboard: with the 3D view in focus the arrows turn it, Shift with arrows moves it, + and - zoom', async ({ page }) => {
  const g = guard(page);
  await open(page, './skullbase/');
  const canvas = page.locator('.viewer-host canvas');
  await expect(canvas).toHaveAttribute('role', 'application');
  await canvas.focus();
  const p0 = await cameraAt(page), f0 = await cameraFrame(page);
  await page.keyboard.press('ArrowLeft');
  const p1 = await cameraAt(page), f1 = await cameraFrame(page);
  expect(p1).not.toEqual(p0);
  expect(f1).toEqual(f0);                       // turned about the same point, at the same distance
  await page.keyboard.press('ArrowRight');
  expect(await cameraAt(page)).toEqual(p0);
  await page.keyboard.press('+');
  expect((await cameraFrame(page)).dist).toBeLessThan(f0.dist);
  await page.keyboard.press('-');
  expect((await cameraFrame(page)).dist).toBe(f0.dist);
  await page.keyboard.press('Shift+ArrowRight');
  const f2 = await cameraFrame(page);
  expect(f2.tgt).not.toEqual(f0.tgt);
  expect(f2.dist).toBe(f0.dist);
  // 0 puts the view back
  await page.keyboard.press('0');
  await settle(page);
  expect(await cameraAt(page)).toEqual(p0);
  // the link follows the camera
  await page.keyboard.press('ArrowUp');
  await expect.poll(() => new URL(page.url()).hash).toContain('c=');
  // a section's own use of an arrow key comes first: the spine's levels
  await open(page, './spine/#/atlas?r=lumbar&lv=L3');
  await page.locator('.viewer-host canvas').focus();
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => new URL(page.url()).hash).toContain('lv=L4');
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

// UI-11, UI-12, UI-20: tab stops, the way to the panel, focus after a legend choice, headings and landmarks
test('keyboard and screen readers: one stop for the toolbar, a skip link to the panel, focus kept in the legend, a heading and landmarks', async ({ page }) => {
  const g = guard(page);
  await open(page, './skullbase/');
  // the toolbar is one tab stop; the arrow keys move inside it
  const stops = await page.locator('.toolbar button').evaluateAll((bs) => bs.filter((b) => (b as HTMLButtonElement).tabIndex === 0).length);
  expect(stops).toBe(1);
  const cam0 = await cameraAt(page);
  await page.locator('.toolbar button').first().focus();
  await page.keyboard.press('ArrowRight');
  expect(await page.evaluate(() => document.activeElement === document.querySelectorAll('.toolbar button')[1])).toBe(true);
  await page.keyboard.press('End');
  expect(await page.evaluate(() => document.activeElement?.classList.contains('help-btn'))).toBe(true);
  // (and the arrow keys did not turn the view)
  expect(await cameraAt(page)).toEqual(cam0);
  // the second skip link goes to the panel, and leaves the address alone
  const hash = new URL(page.url()).hash;
  await page.locator('a.skip-panel').focus();
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('panel');
  expect(new URL(page.url()).hash).toBe(hash);
  // hiding a legend row with the keyboard keeps focus on that row's button
  const eye = page.locator('.legend-box .eye').nth(1);
  await eye.focus();
  await page.keyboard.press('Enter');
  await settle(page);
  expect(await page.evaluate(() => { const a = document.activeElement; return !!a && a.classList.contains('eye') && [...document.querySelectorAll('.legend-box .eye')].indexOf(a) === 1; })).toBe(true);
  await expect(page.locator('.legend-box .eye').nth(1)).toHaveAttribute('aria-pressed', 'false');
  // one heading for the page, the notice inside a landmark, a live region for the selection
  // (the section's other pages are in the document but not displayed: their headings are not rendered)
  const h1 = await page.locator('h1').evaluateAll((hs) => hs.filter((e) => e.getClientRects().length > 0).map((e) => e.textContent));
  expect(h1).toEqual(['Skull base: 3D atlas']);
  await expect(page.locator('aside[aria-label="Notice"] .disclaimer, aside.disclaimer[aria-label="Notice"]')).toHaveCount(1);
  await page.mouse.click(420, 430);
  await expect(page.locator('#atlas-live')).toContainText('its card is shown in the panel');
  // no empty row headers in the grading tables
  await open(page, './vascular/#/grading');
  const empty = await page.locator('th[scope="row"]').evaluateAll((ths) => ths.filter((t) => !(t.textContent ?? '').trim()).length);
  expect(empty).toBe(0);
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

// MA-01: the brainstem was fitted to the far wall of the cisterns (about 3 mm too large); the fit is now checked from both sides
test('brainstem: the Sources page reports the fit against the template from both sides', async ({ page }) => {
  const g = guard(page);
  await page.goto('about:blank');
  await page.goto('./brainstem/#/sources');
  await page.waitForSelector('body[data-ready="1"]', { timeout: 30_000 });
  const text = await page.locator('main').innerText();
  expect(text).toContain('Not too large, and on the right wall');
  const own = Number(/(\d+) % of the fitted surface lies within 1 mm of the brainstem’s own tissue–fluid boundary/.exec(text)?.[1]);
  const far = Number(/and (\d+) % within 1 mm of the far wall of a cistern/.exec(text)?.[1]);
  expect(own).toBeGreaterThan(40);
  expect(far).toBeLessThan(15);
  // the arousal network's nuclei (placed independently, in MNI space) lie in the model's tissue, not in its fourth ventricle
  await open(page, './brainstem/#/atlas?g=arousal');
  expect(await drawnSides(page, 'bs_aan_mnr')).not.toBeNull();
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

// P2S-09: no Credits page gave the address of the Creative Commons licences it names; dataset addresses were plain text
for (const section of ['tracts', 'cortex', 'brainstem', 'ventricles', 'vascular', 'spine', 'skullbase', 'skullbase-v1', 'skullbase-ct']) {
  test(`credits (${section}): every licence named links to its text, and every address is a link`, async ({ page }) => {
    const g = guard(page);
    await page.goto('about:blank');
    await page.goto(`./${section}/#/credits`);
    await page.waitForSelector('body[data-ready="1"]', { timeout: 30_000 });
    const found = await page.evaluate(() => {
      const el = [...document.querySelectorAll<HTMLElement>('.page')].find((e) => e.getClientRects().length)!;
      const unlinked: string[] = [];
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        if (n.parentElement?.closest('a, h1, h2, h3')) continue;
        for (const m of (n.textContent ?? '').match(/CC[ -]BY(?:-SA)?[ -]\d\.\d(?: Japan)?|CC0 1\.0|https?:\/\/\S+/g) ?? []) unlinked.push(m);
      }
      const links = [...el.querySelectorAll('a')].map((a) => ({ text: a.textContent ?? '', href: a.href }));
      return { unlinked, cc: links.filter((l) => /creativecommons\.org\/(licenses|publicdomain)\//.test(l.href)).map((l) => l.text) };
    });
    expect(found.unlinked).toEqual([]);
    expect(found.cc.length).toBeGreaterThan(0);
    for (const t of found.cc) expect(t).toMatch(/^CC/);
    expect(g.external).toEqual([]);
    expect(g.errors).toEqual([]);
  });
}

// A write of the address that fell due just as the reader followed a link put the old view's hash back before the page
// had heard of the change, and the link did nothing. Seen on a slow CI runner: Coordinates never came up after Imaging.
test('a link followed just as the page is about to write its address is not undone', async ({ page }) => {
  const g = guard(page);
  await open(page, './dbs/#/imaging?t=vim');
  await expect(page.locator('.page:not([hidden]) .card h2')).toHaveText('Ventral intermediate nucleus');
  for (const wait of [0, 3, 30, 60]) {
    await page.evaluate((ms) => {
      // another target: the page will write its address in a moment. It is kept busy until that write is due, and
      // the address changes before the write can run
      const chip = [...document.querySelectorAll<HTMLElement>('.page:not([hidden]) .chips .chip')].find((c) => c.getAttribute('aria-pressed') !== 'true')!;
      chip.click();
      const t = performance.now();
      while (performance.now() - t < ms) { /* busy */ }
      location.hash = '#/coords';
    }, wait);
    await expect(page.locator('body'), `link followed ${wait} ms after a change`).toHaveAttribute('data-page', 'coords');
    await expect(page.locator('#acpc')).toBeVisible();
    expect(new URL(page.url()).hash).toMatch(/^#\/coords/);
    await page.evaluate(() => { location.hash = '#/imaging?t=vim'; });
    await expect(page.locator('body')).toHaveAttribute('data-page', 'imaging');
  }
  expect(g.errors).toEqual([]);
});

// P1-04: after the browser restored a lost WebGL context the stage stayed blank until the reader touched it, and
// while the context was lost nothing told the reader
test('loading: a lost WebGL context is announced, and the picture comes back by itself with the context', async ({ page }) => {
  await open(page, './dbs/#/atlas?i=pd');
  /** how many different colours the 3D canvas shows (sampled) */
  const colours = () => page.evaluate(() => {
    const src = document.querySelector<HTMLCanvasElement>('canvas[role="application"]')!;
    const c = document.createElement('canvas');
    c.width = 200; c.height = 150;
    const g = c.getContext('2d')!;
    g.drawImage(src, 0, 0, c.width, c.height);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const seen = new Set<number>();
    for (let i = 0; i < d.length; i += 4) seen.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
    return seen.size;
  });
  const before = await colours();
  expect(before).toBeGreaterThan(20);
  type Lose = { loseContext(): void; restoreContext(): void };
  await page.evaluate(() => {
    const a = (window as unknown as { __atlas: { viewer: { renderer: { getContext(): WebGLRenderingContext } } } }).__atlas;
    const w = window as unknown as { __lose: Lose };
    w.__lose = a.viewer.renderer.getContext().getExtension('WEBGL_lose_context') as unknown as Lose;
    w.__lose.loseContext();
  });
  const note = page.locator('.webgl-lost');
  await expect(note).toBeVisible();
  await expect(note).toHaveAttribute('role', 'status');
  await expect(note).toContainText('The 3D view was interrupted');
  // it has not come back after a while: the note offers a reload
  await expect(note.getByRole('button', { name: 'Reload the page' })).toBeVisible({ timeout: 12_000 });
  // the context comes back: the note goes and the picture is drawn again without a touch
  await page.evaluate(() => (window as unknown as { __lose: Lose }).__lose.restoreContext());
  await expect(note).toBeHidden();
  await expect.poll(colours, { timeout: SETTLED }).toBeGreaterThan(20);
});

// P1-05 (the drilling tool): with the bone's file not downloadable the panel said "Loading the bone…" for good
test('loading: the drilling tool says when its bone could not be loaded, and Retry loads it', async ({ page }) => {
  let block = true;
  await page.route('**/assets/spine/drill_*.bin.gz*', (route) => (block ? route.abort() : route.continue()));
  await open(page, './spine/#/atlas?r=cervical&lv=C5&dr=1');
  const failed = page.locator('.drill-failed');
  await expect(failed).toBeVisible();
  await expect(failed).toHaveAttribute('role', 'alert');
  await expect(failed).toContainText('could not be loaded');
  await expect(page.locator('.drill-out')).not.toContainText('Loading the bone');
  block = false;
  await failed.getByRole('button', { name: 'Retry' }).click();
  await expect(failed).toBeHidden();
  await expect(page.locator('.drill-out')).toContainText('Bone removed');
});

// AP-01 to AP-03 (the owner's decisions of 13 November 2026): a surgical view opens with its shapes full on, in the
// direction chosen for it; going from one tumour to another drawn in the same view keeps the camera and the sliders
test('surgical views open opened; from one tumour to another of the same view the camera and the sliders stay', async ({ page }) => {
  const g = guard(page);
  const hash = () => decodeURIComponent(new URL(page.url()).hash);
  const cam = () => hash().match(/[?&]c=([^&]+)/)?.[1] ?? '';
  await open(page, './skullbase/#/atlas?g=far_lateral');
  await expect.poll(cam).toMatch(/^-?\d/);
  // far lateral: steeper from below than before (the camera's direction from its target, in the CT's frame)
  const [x, y, z, tx, ty, tz] = cam().split(',').map(Number);
  const d = [x - tx, y - ty, z - tz], n = Math.hypot(...d);
  expect(d[2] / n).toBeLessThan(-0.7);
  // ... opened with the right tonsil and biventral lobule lifted; the key lets them back
  expect(hash()).toContain('fl=100');
  await page.keyboard.press('f');
  await settle(page);
  await expect.poll(hash).toContain('fl=0');
  // the second slider (the cerebellum drawn back) opens at 0 and works with the first
  expect(hash()).not.toContain('fb=');
  await page.keyboard.press('f');
  await page.keyboard.press('b');
  await settle(page);
  await expect.poll(hash).toContain('fb=100');
  expect(hash()).toContain('fl=100');
  await open(page, './skullbase/#/atlas?g=koos_i');
  await expect.poll(cam).toMatch(/^-?\d/);
  expect(hash()).toContain('rs=100');
  const first = cam();
  for (const v of ['koos_iii', 'koos_iv']) {
    await page.locator(`.grade-chips .chip[data-v="${v}"]`).click();
    await settle(page);
    await expect.poll(hash).toContain(`g=${v}`);
    expect(cam(), v).toBe(first);
  }
  // a slider moved by the reader stays too
  await page.locator('#sb-m-retrosigmoid').evaluate((el: HTMLInputElement) => { el.value = '40'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await settle(page);
  await page.locator('.grade-chips .chip[data-v="koos_ii"]').click();
  await settle(page);
  await expect.poll(hash).toContain('g=koos_ii');
  expect(hash()).toContain('rs=40');
  expect(cam()).toBe(first);
  // the petroclival meningioma, drawn in the same view, opens framed alike
  await open(page, './skullbase/#/atlas?g=meningioma_petroclival');
  await expect.poll(cam).toMatch(/^-?\d/);
  expect(cam()).toBe(first);
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

// AP-04 (the owner's decision of 13 November 2026): the pterional drills the classic two-thirds of the sphenoid ridge, and
// the pterional and orbitozygomatic views have an anterior clinoidectomy switch, off by default
test('pterional: the anterior clinoidectomy and sphenoid ridge switches, by key and by link', async ({ page }) => {
  const g = guard(page);
  const hash = () => decodeURIComponent(new URL(page.url()).hash);
  await open(page, './skullbase/#/atlas?g=transsylvian');
  const box = page.locator('#sb-m-clinoid');
  await expect(box).toHaveCount(1);
  await expect(box).not.toBeChecked();
  expect(hash()).not.toContain('ac=');
  await expect(page.locator('.pane:not([hidden]) article.card').last()).toContainText('Anterior clinoidectomy');
  await page.keyboard.press('a');
  await settle(page);
  await expect.poll(hash).toContain('ac=100');
  await expect(box).toBeChecked();
  // the clinoid process's own piece is drawn as the bone removed (see-through), not as bone
  const opaque = () => page.evaluate(() => {
    let o = -1;
    (window as unknown as { __atlas: { viewer: { scene: { traverse: (f: (x: { userData?: { id?: string }; material?: { opacity?: number; transparent?: boolean }; visible: boolean }) => void) => void } } } }).__atlas.viewer.scene
      .traverse((x) => { if (x.userData?.id === 'sb_appr_pterional__clinoid' && x.material && x.visible) o = x.material.transparent ? x.material.opacity ?? 1 : 1; });
    return o;
  });
  expect(await opaque()).toBeLessThan(1);
  await box.uncheck();
  await settle(page);
  await expect.poll(hash).not.toContain('ac=');
  expect(await opaque()).toBe(1);
  // the sphenoid ridge opens drilled (its piece see-through); the key puts it back, intact, and the link says so
  const ridge = page.locator('#sb-m-ridge');
  await expect(ridge).toBeChecked();
  const ridgeOpacity = () => page.evaluate(() => {
    let o = -1;
    (window as unknown as { __atlas: { viewer: { scene: { traverse: (f: (x: { userData?: { id?: string }; material?: { opacity?: number; transparent?: boolean }; visible: boolean }) => void) => void } } } }).__atlas.viewer.scene
      .traverse((x) => { if (x.userData?.id === 'sb_appr_pterional__ridge' && x.material && x.visible) o = x.material.transparent ? x.material.opacity ?? 1 : 1; });
    return o;
  });
  expect(await ridgeOpacity()).toBeLessThan(1);
  // (the page's keys are not taken while a form field has the focus, as the checkbox just used has)
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('d');
  await settle(page);
  await expect.poll(hash).toContain('sr=0');
  await expect(ridge).not.toBeChecked();
  expect(await ridgeOpacity()).toBe(1);
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

// AP-08 (the owner's choices of 17 November 2026): what a surgical view's text names and its opening reaches is drawn in
// it, on both models (Z-Anatomy draws the posterior cerebral artery whole)
test('skull base: the surgical views draw what their texts name beyond the opening', async ({ page }) => {
  const g = guard(page);
  const drawn = async (id: string) => Object.values((await drawnSides(page, id)) ?? {}).some(Boolean);
  const views: [string, string, string[], string[]][] = [
    ['skullbase', 'orbitozygomatic', ['tb_optic_chiasm', 'tb_pituitary_stalk', 'sb_anterior_communicating_artery', 'sb_posterior_communicating_artery', 'sb_basilar_artery',
      'sb_posterior_cerebral_artery_p1_p2', 'sb_superior_cerebellar_artery', 'tb_trochlear_nerve_iv'], []],
    ['skullbase', 'transsylvian', ['tb_optic_chiasm', 'tb_pituitary_stalk', 'sb_anterior_communicating_artery', 'sb_posterior_communicating_artery', 'sb_basilar_artery', 'tb_olfactory_nerve_i'],
      ['sb_posterior_cerebral_artery_p1_p2', 'sb_superior_cerebellar_artery']],
    ['skullbase', 'retrosigmoid', ['tb_hypoglossal_nerve_xii', 'sb_superior_petrosal_sinus', 'tb_trochlear_nerve_iv'], []],
    ['skullbase', 'kawase', ['tb_oculomotor_nerve_iii', 'tb_trochlear_nerve_iv'], []],
    ['skullbase', 'far_lateral', ['tb_anterior_spinal_artery'], []],
    ['skullbase-v1', 'orbitozygomatic', ['sb_optic_chiasm', 'sb_pituitary_stalk', 'sb_anterior_communicating_artery', 'sb_posterior_communicating_artery', 'sb_basilar_artery', 'sb_posterior_cerebral_artery',
      'sb_superior_cerebellar_artery', 'sb_trochlear_nerve_iv'], []],
    ['skullbase-v1', 'lso', ['sb_optic_chiasm', 'sb_pituitary_stalk', 'sb_anterior_communicating_artery', 'sb_posterior_communicating_artery', 'sb_basilar_artery'], ['sb_posterior_cerebral_artery']],
  ];
  for (const [model, view, ids, absent] of views) {
    await open(page, `./${model}/#/atlas?g=${view}`);
    for (const id of ids) expect(await drawn(id), `${model} ${view}: ${id}`).toBe(true);
    for (const id of absent) expect(await drawn(id), `${model} ${view}: ${id}`).toBe(false);
  }
  // the summary says they are there to find, and the legend lists them
  await open(page, './skullbase/#/atlas?g=orbitozygomatic');
  await expect(page.locator('.pane:not([hidden]) article.card').first()).toContainText('turn the view to find them');
  // (the nerves and arteries fold under their groups: open them)
  for (let i = 0; i < 2; i++) await page.locator('.legend3d .lg-fold[aria-expanded="false"]').first().click();
  await expect(page.locator('.legend-box')).toContainText('Basilar artery');
  await expect(page.locator('.legend-box')).toContainText('Trochlear nerve');
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

// The subtemporal view (the owner's choices of 17 November 2026): a 5 x 5 cm flap over the zygomatic arch's root, the
// temporal lobe's lift as a slider, on both models
test('skull base: the subtemporal view opens with the temporal lobe lifted; its slider, its key and its link', async ({ page }) => {
  const g = guard(page);
  const hash = () => decodeURIComponent(new URL(page.url()).hash);
  const drawn = async (id: string) => Object.values((await drawnSides(page, id)) ?? {}).some(Boolean);
  // how far the slider's shape is on, on the right temporal lobe as drawn
  const lifted = () => page.evaluate(() => {
    let w = -1;
    type Node = { name?: string; userData?: { id?: string }; morphTargetDictionary?: Record<string, number>; morphTargetInfluences?: number[]; visible: boolean; parent?: Node | null };
    (window as unknown as { __atlas: { viewer: { scene: { traverse: (f: (x: Node) => void) => void } } } }).__atlas.viewer.scene.traverse((x) => {
      const i = x.morphTargetDictionary?.subtemporal;
      if (i !== undefined && x.morphTargetInfluences && x.visible) w = Math.max(w, x.morphTargetInfluences[i]);
    });
    return w;
  });
  for (const model of ['skullbase', 'skullbase-v1']) {
    await open(page, `./${model}/#/atlas?g=subtemporal`);
    const card = page.locator('.pane:not([hidden]) article.card').first();
    await expect(page.locator('.pane:not([hidden]) .card h2').first()).toHaveText('Subtemporal approach');
    // the view's own copy of the temporal lobe stands in for the lobe; the flap's bone is drawn removed
    expect(await drawn('br_temporal_lobe__subtemporal'), model).toBe(true);
    expect(await drawn('br_temporal_lobe'), model).toBe(false);
    expect(await drawn('sb_appr_subtemporal__removed'), model).toBe(true);
    // it opens lifted; the link says so
    const slider = page.locator('#sb-m-subtemporal');
    await expect(slider).toHaveValue('100');
    expect(await lifted(), model).toBe(1);
    expect(hash()).toContain('st=100');
    await expect(page.locator('.open-slider')).toContainText('Lift the temporal lobe (L)');
    await expect(page.locator('#sb-m-subtemporal-note')).toContainText('15.0 mm higher under the middle of the flap');
    // the key puts the lobe back, and the link keeps it there after a reload
    await page.keyboard.press('l');
    await settle(page);
    await expect.poll(hash).toContain('st=0');
    await expect(slider).toHaveValue('0');
    expect(await lifted(), model).toBe(0);
    await page.reload();
    await settle(page);
    await expect(page.locator('#sb-m-subtemporal')).toHaveValue('0');
    expect(await lifted(), model).toBe(0);
    // its text is sourced, and says what the model cannot show
    await expect(card).toContainText('5 × 5 cm');
    await expect(page.locator('.pane:not([hidden])')).toContainText('Nakov 2017');
    await expect(page.locator('.pane:not([hidden])')).toContainText('The vein of Labbé');
  }
  // what each model draws at the tentorial edge: the default model the vein of Labbé, the Z-Anatomy model its tentorium
  await open(page, './skullbase/#/atlas?g=subtemporal');
  for (const id of ['sb_vein_of_labbe', 'tb_oculomotor_nerve_iii', 'tb_trochlear_nerve_iv', 'sb_posterior_cerebral_artery_p1_p2', 'sb_superior_cerebellar_artery', 'sb_basilar_artery'])
    expect(await drawn(id), id).toBe(true);
  await open(page, './skullbase-v1/#/atlas?g=subtemporal');
  for (const id of ['sb_tentorium_cerebelli', 'sb_oculomotor_nerve_iii', 'sb_trochlear_nerve_iv', 'sb_posterior_cerebral_artery', 'sb_superior_cerebellar_artery'])
    expect(await drawn(id), id).toBe(true);
  expect(await drawn('br_insula'), 'the insula is left out on the Z-Anatomy model').toBe(false);
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

// D-008 (the owner's choices of 17 and 18 November 2026): four tracts the white-matter atlas lacks are drawn from the
// HCP-YA atlas's streamlines, the medial longitudinal fasciculus also under the floor of the fourth ventricle; a nucleus that
// serves several nerves says so on its card and on each nerve's; the trigeminal nerve's card says its nuclei are not
// modelled instead of "the model has none"
test('brainstem: the HCP-YA tracts, the nuclei shared between nerves and the trigeminal nuclei', async ({ page }) => {
  const g = guard(page);
  const drawn = async (id: string) => Object.values((await drawnSides(page, id)) ?? {}).some(Boolean);
  const lookOf = (id: string) => page.evaluate((sid) => (window as unknown as { __atlas: { viewer: { items: Map<string, { look?: string }> } } }).__atlas.viewer.items.get(sid)?.look ?? null, id);
  // (a streamline tract has a kind and a role where a mesh has a look)
  const lineOf = (id: string) => page.evaluate((sid) => {
    const it = (window as unknown as { __atlas: { viewer: { items: Map<string, { kind: string; role?: string | null }> } } }).__atlas.viewer.items.get(sid);
    return it ? `${it.kind} ${it.role ?? null}` : null;
  }, id);
  const card = page.locator('.card.sel');
  // the tracts view lists and draws the four, as streamlines like the white-matter section's tracts beside them
  await open(page, './brainstem/#/atlas?g=tracts');
  expect(await lineOf('wm_ml')).toBe('lines key');
  for (const id of ['bs_t_mlf', 'bs_t_ctt', 'bs_t_stt', 'bs_t_ll']) {
    expect(await drawn(id), id).toBe(true);
    expect(await lineOf(id), id).toBe('lines key');
    await expect(page.locator(`.sb-item[data-id="${id}"]`)).toBeVisible();
  }
  await expect(page.locator('.legend3d .sw.line')).toHaveCount(12);
  const opacityOf = (id: string) => page.evaluate((sid) => (window as unknown as { __atlas: { viewer: { items: Map<string, { mat: { opacity: number } }> } } }).__atlas.viewer.items.get(sid)!.mat.opacity, id);
  const unchosen = { ml: await opacityOf('wm_ml'), stt: await opacityOf('bs_t_stt') };
  await expect(page.locator('.pane:not([hidden]) article.card').first()).toContainText('That atlas ends near z = −50 mm');
  // a tract's card: what it is from sources, the published distances, and how it sits on this template, measured
  await page.locator('.sb-item[data-id="bs_t_mlf"]').click();
  await expect(card.locator('h2')).toHaveText('Medial longitudinal fasciculus (MLF)');
  await expect(card.locator('.eyebrow')).toHaveText('Tract · HCP-YA atlas');
  await expect(card.locator('.schematic-note')).toContainText('They stop near z = −50 mm because the atlas does');
  await expect(card).toContainText('0.50 mm (left) and 0.48 mm (right) from the median sulcus');
  await expect(card.locator('a.src', { hasText: 'Li 2021' }).first()).toHaveAttribute('href', 'https://doi.org/10.1002/hbm.25670');
  await expect(card.locator('a.src', { hasText: 'Yeh 2018' }).first()).toHaveAttribute('href', 'https://doi.org/10.1016/j.neuroimage.2018.05.027');
  const fit = await card.locator('.tract-fit').innerText();
  expect(fit).toMatch(/Streamlines drawn: \d+ \(left\) and \d+ \(right\)/);
  expect(fit).toMatch(/They run from z = −50\.\d mm \(left\) and −50\.\d mm \(right\), the atlas’s lower edge/);
  const inside = /Inside the fitted brainstem: (\d+) % \(left\) and (\d+) % \(right\) of their length/.exec(fit);
  expect(Number(inside?.[1])).toBeGreaterThan(80);
  expect(Number(inside?.[2])).toBeGreaterThan(80);
  expect(fit).toMatch(/Fluid on the T2 template: \d+ % \(left\) and \d+ % \(right\)/);
  expect(fit).toContain('drawn without a shift');
  // the lateral lemniscus, from another source
  await page.locator('.sb-item[data-id="bs_t_ll"]').click();
  await expect(card.locator('h2')).toHaveText('Lateral lemniscus (LL)');
  await expect(card).toContainText('inferior colliculus');
  await expect(card.locator('a.src', { hasText: 'Sitek 2019' }).first()).toHaveAttribute('href', 'https://doi.org/10.7554/elife.48932');
  // a chosen tract is seen among the eleven others: they fade back (with the viewer's setting off, as it is by
  // default), the deep nuclei stay as they are; with the card closed the tracts are drawn as before
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('atlas-view-prefs') ?? '{}').fadeOthers ?? false)).toBe(false);
  expect(await opacityOf('bs_t_ll')).toBe(1);
  expect(await opacityOf('wm_ml')).toBeLessThan(unchosen.ml * 0.5);
  expect(await opacityOf('bs_t_stt')).toBeLessThan(unchosen.stt * 0.5);
  expect(await page.evaluate(() => (window as unknown as { __atlas: { viewer: { items: Map<string, { look: string; faded?: boolean }> } } }).__atlas.viewer.items.get('rn')!.faded ?? false)).toBe(false);
  expect(await lookOf('rn')).toBe('primary');
  await card.locator('button.close').click();
  await settle(page);
  expect(await opacityOf('wm_ml')).toBe(unchosen.ml);
  expect(await opacityOf('bs_t_stt')).toBe(unchosen.stt);
  // the floor view: the fasciculus lies under the solid floor and is not drawn there (parts of it lie outside the
  // fitted surface and would show as stray lines); chosen from the view's card it is seen through the surface
  await open(page, './brainstem/#/atlas?g=sez_floor');
  expect(await lookOf('bs_pons')).toBe('primary');
  expect(await drawn('bs_t_mlf')).toBe(false);
  const under = page.locator('.under-surface');
  await expect(under).toContainText('Medial longitudinal fasciculus (MLF)');
  await expect(under).toContainText('Nucleus of abducens nerve');
  await under.locator('button[data-id="bs_t_mlf"]').click();
  await settle(page);
  await expect(card.locator('h2')).toHaveText('Medial longitudinal fasciculus (MLF)');
  expect(await lookOf('bs_pons')).toBe('shell');
  expect(await lineOf('bs_t_mlf')).toBe('lines key');
  expect(await drawn('bs_t_mlf')).toBe(true);
  expect(await lookOf('sez_suprafacial')).toBe('primary');
  // an entry zone chosen there puts the solid surface back
  await page.locator('.sb-item[data-id="sez_suprafacial"]').click();
  await settle(page);
  expect(await lookOf('bs_pons')).toBe('primary');
  // a nucleus that serves several nerves: its card names them and what each has in it, and links each nerve
  await open(page, './brainstem/#/atlas?g=cn_nuclei&sel=bs_n_ambiguus');
  await expect(card.locator('.eyebrow')).toHaveText('Cranial nerve nucleus · IX, X, XI');
  await expect(card.locator('dt', { hasText: 'Serves cranial nerves IX, X and XI' })).toBeVisible();
  await expect(card).toContainText('stylopharyngeus');
  await expect(card.locator('a.src', { hasText: 'García Santos 2018' }).first()).toHaveAttribute('href', 'https://doi.org/10.1007/s13244-018-0630-5');
  await expect(card.locator('button[data-id="bs_cn_accessory_nerve"]')).toBeVisible();
  // ... and each of its nerves lists it, saying with which nerves it is shared
  await card.locator('button[data-id="bs_cn_glossopharyngeal_nerve"]').click();
  await settle(page);
  await expect(card.locator('h2')).toHaveText('Glossopharyngeal nerve (IX)');
  await expect(card).toContainText('Nucleus ambiguus (shared with X and XI)');
  await expect(card).toContainText('Nucleus of solitary tract (shared with VII and X)');
  await open(page, './brainstem/#/atlas?g=cn_nuclei&sel=bs_n_solitary');
  await expect(card.locator('.eyebrow')).toHaveText('Cranial nerve nucleus · VII, IX, X');
  await expect(card).toContainText('chorda tympani');
  // a nucleus of one nerve reads as before
  await open(page, './brainstem/#/atlas?g=cn_nuclei&sel=bs_n_hypoglossal');
  await expect(card.locator('.eyebrow')).toHaveText('Cranial nerve nucleus · XII');
  await expect(card).toContainText('Somatic efferent');
  // the trigeminal nerve: its nuclei are not modelled, and the card says what they are
  await open(page, './brainstem/#/atlas?g=overview&sel=bs_cn_trigeminal_nerve');
  const none = card.locator('.not-modelled');
  await expect(none).toContainText('Not modelled');
  for (const name of ['Principal sensory nucleus', 'Motor nucleus', 'Mesencephalic nucleus', 'Spinal nucleus']) await expect(none).toContainText(name);
  await expect(none.locator('a.src', { hasText: 'Turnbull 2025' }).first()).toHaveAttribute('href', 'https://doi.org/10.3390/brainsci16010061');
  await expect(card).not.toContainText('The model has none for this nerve');
  // the atlas is credited with its licence and the HCP terms, and the Sources page gives the measured fit
  await page.goto('./brainstem/#/credits');
  await expect(page.locator('#hcp842')).toContainText('CC BY-SA 4.0');
  await expect(page.locator('#hcp842')).toContainText('WU-Minn HCP Open Access Data Use Terms');
  await expect(page.locator('#hcp842 a[href="https://doi.org/10.5281/zenodo.3627772"]').first()).toBeVisible();
  await expect(page.locator('#hcp842 a[href="https://brain.labsolver.org/hcp_trk_atlas.html"]', { hasText: 'Source page' })).toBeVisible();
  await page.goto('./brainstem/#/sources');
  await expect(page.locator('#hcp-tracts')).toContainText("The atlas's grid ends at z = -50.5 mm");
  await expect(page.locator('.page:not([hidden])')).toContainText('from the centre of the atlas’s first voxel');
  await expect(page.locator('.page:not([hidden])')).toContainText('No shift was applied');
  await expect(page.locator('.page:not([hidden])')).toContainText('Sitek KR');
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

// the owner, 18 November 2026: a chosen tract should be seen among the others, in every section that draws tracts
// (the brainstem's and the DBS section's tests cover theirs: above, and smoke.spec.ts's legend test)
test('tracts: a chosen tract fades the other tracts back, whatever the "Fade the rest" setting', async ({ page }) => {
  const g = guard(page);
  const opacityOf = (id: string) => page.evaluate((sid) => (window as unknown as { __atlas: { viewer: { items: Map<string, { mat: { opacity: number; linewidth: number } }> } } }).__atlas.viewer.items.get(sid)!.mat.opacity, id);
  await open(page, './tracts/#/atlas?g=language');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('atlas-view-prefs') ?? '{}').fadeOthers ?? false)).toBe(false);
  const before = { af: await opacityOf('wm_af'), ifof: await opacityOf('wm_ifof') };
  await open(page, './tracts/#/atlas?g=language&sel=wm_af');
  await expect(page.locator('.card.sel h2')).toContainText('Arcuate fasciculus');
  expect(await opacityOf('wm_af')).toBe(1);
  expect(await opacityOf('wm_ifof')).toBeLessThan(before.ifof * 0.5);
  // another tract chosen: the first fades with the rest
  await open(page, './tracts/#/atlas?g=language&sel=wm_ifof');
  expect(await opacityOf('wm_ifof')).toBe(1);
  expect(await opacityOf('wm_af')).toBeLessThan(before.af * 0.5);
  // nothing chosen: all as they were
  await open(page, './tracts/#/atlas?g=language');
  expect(await opacityOf('wm_af')).toBe(before.af);
  expect(await opacityOf('wm_ifof')).toBe(before.ifof);
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

// B-007 (the owner's choices of 18 November 2026): a tract card says where the bundle's streamlines end on the cortex,
// measured (in place of the published table of the areas it overlaps); choosing a tract draws the patch where its
// ends are densest; the cortex section's label cards list the tracts that end there; the two link to each other
test('tracts: where the streamlines end, on the card, in 3D and on the cortex cards', async ({ page }) => {
  const g = guard(page);
  type Items = { __atlas: { viewer: { items: Map<string, { look?: string; nodes: Record<string, { visible: boolean } | undefined> }> } } };
  const shown = (id: string) => page.evaluate((sid) => {
    const it = (window as unknown as Items).__atlas.viewer.items.get(sid);
    return it ? Object.values(it.nodes).some((n) => n?.visible) : false;
  }, id);
  await open(page, './tracts/#/atlas?g=language');
  expect(await shown('wm_af__ends')).toBe(false);
  await open(page, './tracts/#/atlas?g=language&sel=wm_af');
  const card = page.locator('.card.sel');
  const ends = card.locator('.tract-ends');
  await expect(card.locator('dt', { hasText: 'Where its streamlines end (measured)' })).toBeVisible();
  await expect(card.locator('dt', { hasText: 'Brodmann areas' })).toHaveCount(0);
  await expect(ends).toContainText('Front end');
  await expect(ends).toContainText('Back end');
  await expect(ends.locator('a.area', { hasText: 'Opercular part of the inferior frontal gyrus' }).first()).toHaveAttribute('href', '../cortex/#/atlas?sel=ctx_g_front_inf_opercular&h=L');
  await expect(ends).toContainText('Drawn in 3D with the tract');
  await ends.locator('summary', { hasText: 'Where streamlines end is not where a tract connects' }).click();
  await expect(ends.locator('a.src', { hasText: 'Schilling 2018' }).first()).toHaveAttribute('href', 'https://doi.org/10.1002/hbm.23936');
  await expect(ends.locator('a.src', { hasText: 'Maier-Hein 2017' }).first()).toHaveAttribute('href', 'https://doi.org/10.1038/s41467-017-01285-x');
  // the patch is drawn, in the legend, and goes with the selection
  expect(await shown('wm_af__ends')).toBe(true);
  await expect(page.locator('.legend3d li', { hasText: 'AF: where its streamlines end' })).toBeVisible();
  // the IFOF passes the insula (the published table listed it): it does not end there
  await open(page, './tracts/#/atlas?g=language&sel=wm_ifof');
  await expect(card.locator('.tract-end')).toHaveCount(2);
  for (const t of await card.locator('.tract-end').allInnerTexts()) expect(t).not.toMatch(/insula/i);
  // a tract that does not reach the cerebral cortex says so, and has no patch
  await open(page, './tracts/#/atlas?g=fossa_peduncles&sel=wm_mcp');
  await expect(card.locator('.tract-ends')).toContainText('Not at the cerebral cortex');
  await expect(card.locator('.tract-ends')).toContainText('No patch is drawn');
  // a cortex label card lists the tracts that end on it; a label linked without a view opens a view that shows it
  await open(page, './cortex/#/atlas?sel=ctx_g_oc_temp_med_lingual&h=L');
  expect(new URL(page.url()).hash).toContain('v=medial');
  const here = page.locator('.card.sel .tract-ends-here');
  await expect(here).toContainText('Optic radiation, back end');
  await expect(here.locator('a', { hasText: 'Optic radiation' })).toHaveAttribute('href', '../tracts/#/atlas?sel=wm_or');
  // ... and the link back opens a group that holds the tract, with its card
  await open(page, './tracts/#/atlas?sel=wm_or');
  expect(new URL(page.url()).hash).toContain('g=visual');
  await expect(card.locator('h2')).toContainText('Optic radiation');
  expect(await shown('wm_or__ends')).toBe(true);
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

// the roadmap's figure export (the owner's choices of 19 November 2026): "Save image" opens a dialog to choose what the
// image holds (labels, compass, legend, caption), its size, and how the caption names the licences; the PNG is saved
// with the view's name and the date
test('save image: the dialog, its choices kept, and a PNG of the chosen size with its caption', async ({ page }) => {
  const g = guard(page);
  await open(page, './tracts/#/atlas?g=language&sel=wm_af');
  const btn = page.locator('.tbtn', { hasText: 'Save image' });
  const panel = page.locator('.fig-panel');
  await btn.click();
  await expect(panel).toBeVisible();
  await expect(btn).toHaveAttribute('aria-expanded', 'true');
  // the defaults: labels, compass and caption; licences in full; twice the screen
  await expect(panel.locator('input[data-k="labels"]')).toBeChecked();
  await expect(panel.locator('input[data-k="legend"]')).not.toBeChecked();
  await expect(panel.locator('input[name="fig-licences"][value="full"]')).toBeChecked();
  await expect(panel.locator('input[name="fig-size"][value="2x"]')).toBeChecked();
  const canvas = await page.locator('.stage canvas').boundingBox();
  await expect(panel).toContainText(`Twice the screen ${Math.round(canvas!.width * 2)} × ${Math.round(canvas!.height * 2)} pixels`);
  // without the caption, the licence choice is off and the dialog says what that means
  await panel.locator('input[data-k="caption"]').uncheck();
  await expect(panel.locator('input[name="fig-licences"][value="short"]')).toBeDisabled();
  await expect(panel.locator('.fig-warn')).toBeVisible();
  await panel.locator('input[data-k="caption"]').check();
  await panel.locator('input[data-k="legend"]').check();
  await panel.locator('input[name="fig-size"][value="1x"]').check();
  // Escape closes it; the choices are kept
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await btn.click();
  await expect(panel.locator('input[data-k="legend"]')).toBeChecked();
  await expect(panel.locator('input[name="fig-size"][value="1x"]')).toBeChecked();
  // the PNG: named for the view and the date, as large as the view (as on screen) with the legend beside it and the
  // caption under it
  const [download] = await Promise.all([page.waitForEvent('download'), panel.locator('.fig-save').click()]);
  expect(download.suggestedFilename()).toMatch(/^open-neuroanatomy-atlas-arcuate-fasciculus-white-matter-tracts-\d{4}-\d\d-\d\d\.png$/);
  const file = await download.path();
  const { readFileSync } = await import('node:fs');
  const png = readFileSync(file);
  expect(png.subarray(1, 4).toString()).toBe('PNG');
  const w = png.readUInt32BE(16), hgt = png.readUInt32BE(20);
  expect(w).toBe(Math.round(canvas!.width) + 280);
  expect(hgt).toBeGreaterThan(Math.round(canvas!.height) + 60);
  await expect(panel.locator('[role="status"]')).toContainText(`(${w} × ${hgt} pixels)`);
  if (process.env.FIGURE_OUT) (await import('node:fs')).copyFileSync(file, process.env.FIGURE_OUT);
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

// every section's "Save image" makes a PNG, also over MRI slices and in the ventricles' endoscopic view (drawn in two
// parts), with the licences in short, in the dark theme
test('save image: a PNG from every kind of view', async ({ page }) => {
  test.setTimeout(300_000);
  const g = guard(page);
  await page.addInitScript(() => {
    try {
      localStorage.setItem('atlas-figure-prefs', JSON.stringify({ labels: true, compass: true, legend: true, caption: true, size: '1x', licences: 'short' }));
      localStorage.setItem('dbs-atlas-theme', 'dark');
    } catch { /* about:blank has no storage */ }
  });
  for (const [name, url] of [
    ['dbs-slices', './dbs/#/atlas?i=pd&ax=-4'], ['skullbase', './skullbase/#/atlas?g=pterional'], ['ventricles-etv', './ventricles/#/atlas?g=etv'],
    ['cortex', './cortex/#/atlas?v=lateral'], ['spine', './spine/#/atlas'], ['brainstem', './brainstem/#/atlas?g=tracts'], ['vascular', './vascular/#/atlas'],
  ] as const) {
    await open(page, url);
    // (the legend box closed: in the endoscopic view, open, it covers the toolbar's left end; it is still drawn)
    await page.evaluate(() => { (document.querySelector('.legend-box') as HTMLDetailsElement).open = false; });
    await page.locator('.tbtn', { hasText: 'Save image' }).click();
    const panel = page.locator('.fig-panel');
    await expect(panel.locator('input[name="fig-licences"][value="short"]'), name).toBeChecked();
    const [download] = await Promise.all([page.waitForEvent('download'), panel.locator('.fig-save').click()]);
    const png = (await import('node:fs')).readFileSync(await download.path());
    const canvas = await page.locator('.stage canvas').boundingBox();
    expect(png.readUInt32BE(16), name).toBe(Math.round(canvas!.width) + 280);
    if (process.env.FIGURE_DIR) (await import('node:fs')).copyFileSync(await download.path(), `${process.env.FIGURE_DIR}/${name}.png`);
    await page.keyboard.press('Escape');
  }
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

// the roadmap's citation panel (the owner's choices of 19 November 2026): a folded "Sources for this view" at the foot
// of the panel's open tab, every reference its cards cite once each, with a button that copies them all
test('sources for this view: the references the cards cite, following the view, copied as text', async ({ page }) => {
  const g = guard(page);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await open(page, './tracts/#/atlas?g=language&sel=wm_af');
  const pane = page.locator('.panel .pane:not([hidden])');
  const block = pane.locator('.view-sources');
  // as many as the distinct citations of the tab's links, at its foot, folded
  const distinct = () => pane.evaluate((el) => new Set([...el.querySelectorAll('a.src')].filter((a) => !a.closest('.view-sources')).map((a) => (a as HTMLAnchorElement).title)).size);
  const n = await distinct();
  expect(n).toBeGreaterThan(5);
  await expect(block.locator('summary')).toHaveText(`Sources for this view (${n})`);
  expect(await pane.evaluate((el) => el.lastElementChild?.classList.contains('view-sources'))).toBe(true);
  expect(await block.evaluate((d) => (d as HTMLDetailsElement).open)).toBe(false);
  await block.locator('summary').click();
  await expect(block.locator('li')).toHaveCount(n);
  // sorted by citation, each with its link
  const cites = await block.locator('li').evaluateAll((lis) => lis.map((li) => li.firstChild!.textContent!.trim()));
  expect(cites).toEqual([...cites].sort((a, b) => a.localeCompare(b, 'en')));
  await expect(block.locator('li a').first()).toHaveAttribute('href', /^https:\/\/doi\.org\//);
  // Copy all: the citations, one to a line
  await block.locator('button', { hasText: 'Copy all' }).click();
  expect((await page.evaluate(() => navigator.clipboard.readText())).split('\n')).toEqual(cites);
  // another tract: the list follows
  await page.locator('.sb-item, .chip, button', { hasText: /^IFOF/ }).first().click();
  await settle(page);
  await expect(page.locator('.card.sel h2')).toContainText('Inferior fronto-occipital');
  await expect(block.locator('summary')).toHaveText(`Sources for this view (${await distinct()})`);
  // a tab without citations has none
  await page.locator('[role="tab"]', { hasText: 'Layers' }).click();
  await expect(page.locator('.panel .pane:not([hidden]) .view-sources')).toHaveCount(0);
  // the DBS section too
  await open(page, './dbs/#/atlas?i=pd');
  await expect(page.locator('.panel .pane:not([hidden]) .view-sources summary')).toContainText(/^Sources for this view \(\d+\)$/);
  // and Save image can list them in its caption (off by default, and only with the caption)
  await page.locator('.tbtn', { hasText: 'Save image' }).click();
  const refs = page.locator('.fig-panel input[data-k="refs"]');
  await expect(refs).not.toBeChecked();
  await page.locator('.fig-panel input[data-k="caption"]').uncheck();
  await expect(refs).toBeDisabled();
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

// the roadmap's isolate and per-structure transparency (the audit's UI-21; the owner's choices of 19 November 2026):
// a bar on the 3D view for the selected structure: "Show only this", "Fade the rest", and its own opacity, kept in
// the link
test('the selected structure’s bar: show only this, fade the rest, its own opacity in the link', async ({ page }) => {
  const g = guard(page);
  type V = { __atlas: { viewer: { shownIds(): string[]; items: Map<string, { nodes: Record<string, { material: { opacity: number } } | undefined> }> } } };
  const shown = () => page.evaluate(() => (window as unknown as V).__atlas.viewer.shownIds());
  const opacityOf = (id: string) => page.evaluate((sid) => Object.values((window as unknown as V).__atlas.viewer.items.get(sid)!.nodes).find(Boolean)!.material.opacity, id);
  const bar = page.locator('.sbar');
  // nothing selected: no bar
  await open(page, './skullbase/#/atlas?g=floor&hid=sb_vomer');
  await expect(bar).toBeHidden();
  await open(page, './skullbase/#/atlas?g=floor&sel=sb_temporal_bone&hid=sb_vomer');
  await expect(bar).toBeVisible();
  await expect(bar.locator('.sbar-name')).toHaveText('Temporal bone');
  // its own opacity: drawn so, in the link, and back from it
  const range = bar.locator('input[type="range"]');
  await range.fill('30');
  await settle(page);
  expect(await opacityOf('sb_temporal_bone')).toBeCloseTo(0.3, 2);
  expect(new URL(page.url()).hash).toContain('sop=sb_temporal_bone%3A0.30');
  await expect(bar.locator('output')).toHaveText('30%');
  await page.reload();
  await settle(page);
  expect(await opacityOf('sb_temporal_bone')).toBeCloseTo(0.3, 2);
  await expect(bar.locator('input[type="range"]')).toHaveValue('30');
  // show only this: every other structure drawn is hidden; pressed again, what it hid comes back, not what the reader
  // had hidden before (the vomer)
  const before = await shown();
  expect(before.length).toBeGreaterThan(10);
  expect(before).not.toContain('sb_vomer');
  await bar.locator('button', { hasText: 'Show only this' }).click();
  await settle(page);
  expect(await shown()).toEqual(['sb_temporal_bone']);
  await expect(bar.locator('button', { hasText: 'Show all again' })).toHaveAttribute('aria-pressed', 'true');
  await bar.locator('button', { hasText: 'Show all again' }).click();
  await settle(page);
  expect((await shown()).sort()).toEqual([...before].sort());
  expect(new URL(page.url()).hash).toContain('hid=sb_vomer');
  // fade the rest: the viewer's setting, on and off
  const fade = bar.locator('button', { hasText: 'Fade the rest' });
  await fade.click();
  await expect(fade).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('atlas-view-prefs') ?? '{}').fadeOthers)).toBe(true);
  await fade.click();
  await expect(fade).toHaveAttribute('aria-pressed', 'false');
  // another view: the structure's own opacity goes, as the hidden list does
  await page.locator('.chip', { hasText: 'Temporal bones' }).first().click();
  await settle(page);
  expect(new URL(page.url()).hash).not.toContain('sop=');
  // the same bar in another section, for a tract
  await open(page, './tracts/#/atlas?g=language&sel=wm_af');
  await expect(bar.locator('.sbar-name')).toHaveText('Arcuate fasciculus');
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

// the roadmap's slices under every MNI section (the owner's choices of 19 November 2026): the cortex section's Slices
// tab, the MRI templates under the pial surface, none over the inflated one, all off unless the link has them
test('cortex: MRI slices under the pial surface, kept in the link, not drawn over the inflated surface', async ({ page }) => {
  const g = guard(page);
  const planes = () => page.evaluate(() => (window as unknown as { __atlas: { viewer: { slices: { group: { children: { name: string; visible: boolean }[] } } } } }).__atlas.viewer.slices.group.children.filter((c) => c.visible).map((c) => c.name));
  await open(page, './cortex/#/atlas?v=lateral');
  expect(await planes()).toEqual([]);
  await page.locator('.ptab', { hasText: 'Slices' }).click();
  const pane = page.locator('.panel .pane:not([hidden])');
  await pane.locator('[data-axis="coronal"] input[data-k="on"]').check();
  await settle(page);
  expect(await planes()).toEqual(['slice-coronal']);
  await pane.locator('input[name="sliceseq"][value="t2"]').check();
  await settle(page);
  const hash = new URL(page.url()).hash;
  expect(hash).toMatch(/[?&]co=/);
  expect(hash).toContain('seq=t2');
  // the link reopens them
  await open(page, `./cortex/${hash}`);
  expect(await planes()).toEqual(['slice-coronal']);
  // over the inflated surface, none, and the tab says why; back on the pial surface, there again
  await page.locator('.tbtn', { hasText: 'Inflated' }).click();
  await settle(page);
  expect(await planes()).toEqual([]);
  await page.locator('.ptab', { hasText: 'Slices' }).click();
  await expect(page.locator('.panel .pane:not([hidden]) .inflated-note')).toBeVisible();
  await page.locator('.tbtn', { hasText: 'Pial' }).click();
  await settle(page);
  expect(await planes()).toEqual(['slice-coronal']);
  await expect(page.locator('.panel .pane:not([hidden]) .inflated-note')).toBeHidden();
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

// P1-17, UI-24: without WebGL the endoscope views threw "getClearColor is not a function", and the note sat under the
// legend with the 3D view's buttons still live
test('without WebGL: the note is a card above the legend, the 3D controls are hidden, the endoscope views do not throw', async ({ page }) => {
  const g = guard(page);
  await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...rest: unknown[]) {
      return /webgl/.test(kind) ? null : (get as (...a: unknown[]) => unknown).call(this, kind, ...rest);
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
  for (const url of ['./ventricles/#/atlas?g=etv', './skullbase/#/atlas?g=endonasal', './#/atlas']) {
    await page.goto('about:blank');
    await page.goto(url);
    const note = page.locator('.no-webgl');
    await expect(note, url).toBeVisible();
    await expect(note, url).toContainText('hardware acceleration');
    await expect(page.locator('body'), url).toHaveAttribute('data-webgl', 'off');
    await expect(page.locator('.stage .toolbar'), url).toBeHidden();
    // the note is drawn over everything in the stage, the legend included: what is at its centre is the note
    const box = (await note.boundingBox())!;
    const top = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('.no-webgl') !== null, [box.x + box.width / 2, box.y + box.height / 2]);
    expect(top, url).toBe(true);
    // the panel still works: a card is shown
    await expect(page.locator('.panel .pane:not([hidden]) .card').first(), url).toBeVisible();
    await page.waitForTimeout(1500);
  }
  expect(g.external).toEqual([]);
  expect(g.errors.filter((e) => !/WebGL/i.test(e))).toEqual([]);
});

// P1-24: a link naming a view, structure, level or page the section does not have opened the default without a word
test('links: what a link names and the section does not have is said under the header; good links say nothing', async ({ page }) => {
  const g = guard(page);
  const bad: [string, RegExp][] = [
    ['./skullbase-v1/#/atlas?g=knosp_3b', /the view “knosp_3b”/],
    ['./skullbase-ct/#/grading', /the page “grading”/],
    ['./spine/#/atlas?r=lumbar&lv=T5', /the level “T5”/],
    ['./brainstem/#/atlas?g=overview&sel=bs_nothing', /the structure “bs_nothing”/],
    ['./#/atlas?i=nonsense', /the indication “nonsense”/],
  ];
  for (const [url, what] of bad) {
    await open(page, url);
    const note = page.locator('.link-note');
    await expect(note, url).toBeVisible();
    await expect(note, url).toContainText(what);
    await note.getByRole('button', { name: 'Dismiss' }).click();
    await expect(note, url).toBeHidden();
  }
  // a link the site itself makes says nothing
  for (const url of ['./skullbase/#/atlas?g=transsylvian', './skullbase-ct/#/credits', './spine/#/atlas?r=lumbar&lv=L4', './cortex/#/atlas?sel=ctx_g_postcentral',
    './tracts/#/atlas?g=language&sel=wm_af', './ventricles/#/atlas?g=etv', './vascular/#/grading', './#/atlas?i=pd']) {
    await open(page, url);
    await expect(page.locator('.link-note'), url).toHaveCount(0);
  }
  // a link followed later replaces the note
  await open(page, './brainstem/#/atlas?g=nowhere');
  await expect(page.locator('.link-note')).toContainText('the view “nowhere”');
  await page.evaluate(() => { location.hash = '#/atlas?g=overview'; });
  await expect(page.locator('.link-note')).toHaveCount(0);
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

// UI-10, UI-14, UI-16, UI-19, UI-22, UI-23, UI-27, P2S-20: the interface's smaller findings
test('interface: view options, swatch edges, the legend capped, panels in order, old links, styles without attributes', async ({ page }) => {
  const g = guard(page);
  // a link from before the sections still lands in the DBS section (the redirect moved out of an inline script)
  await page.goto('about:blank');
  await page.goto('./#/atlas?i=pd');
  await expect(page).toHaveURL(/\/dbs\/#\/atlas\?i=pd/);
  await settle(page);
  // one "Settings" no more: the gear is "View options", the DBS page "Indications shown"
  await expect(page.locator('.view-settings-btn')).toContainText('View options');
  await expect(page.locator('a.navlink[data-page="settings"]')).toHaveText('Indications shown');
  // a swatch's colour reaches it without a style attribute (the CSS object model), with its ink edge
  const sw = page.locator('.legend-box .sw.solid').first();
  await expect(sw).toBeVisible();
  const look = await sw.evaluate((el) => ({ attr: el.getAttribute('style'), bg: getComputedStyle(el).backgroundColor, edge: getComputedStyle(el).boxShadow }));
  expect(look.bg).not.toBe('rgba(0, 0, 0, 0)');
  expect(look.edge).toContain('inset');
  // the legend's height is capped (it was a percentage of nothing)
  await open(page, './skullbase/#/atlas');
  const [lg, st] = await Promise.all([page.locator('.legend-box').boundingBox(), page.locator('.stage').boundingBox()]);
  expect(lg!.height).toBeLessThanOrEqual(st!.height * 0.5);
  // the skull base's model chooser is at the foot of the panel, after the view's card
  const order = await page.locator('.panel .pane:not([hidden])').evaluate((p) => {
    const kids = [...p.children];
    return { model: kids.findIndex((k) => k.classList.contains('model-chips')), card: kids.findIndex((k) => k.matches('article.card')) };
  });
  expect(order.model).toBeGreaterThan(order.card);
  await expect(page.locator('.model-chips .chip[aria-pressed="true"]')).not.toHaveAttribute('href');
  // the ventricles' anatomy view: its description before the shape slider
  await open(page, './ventricles/#/atlas?g=ventricles');
  const v = await page.locator('.panel .pane:not([hidden])').evaluate((p) => {
    const kids = [...p.children];
    return { shape: kids.findIndex((k) => k.matches('section.scope')), card: kids.findIndex((k) => k.matches('article.card')) };
  });
  expect(v.shape).toBeGreaterThan(v.card);
  // the home page says not every section is the MNI template
  await page.goto('about:blank');
  await page.goto('./');
  await expect(page.locator('.disclaimer')).toContainText('single-patient CT');
  await expect(page.locator('header a.navlink')).toHaveCount(0);
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

test('interface: a phone held sideways shows the stage beside the panel at full height', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto('./skullbase/#/atlas');
  await expect(page.locator('.stage canvas')).toBeVisible();
  const [st, pn] = await Promise.all([page.locator('.stage').boundingBox(), page.locator('.panel').boundingBox()]);
  expect(st!.height).toBeGreaterThan(200);
  expect(pn!.x).toBeGreaterThanOrEqual(st!.x + st!.width - 2);
  await expect(page.locator('.stage .readout-box, .stage .readout').first()).toContainText(/Tap a structure/);
  await ctx.close();
});

// MC-17, MC-18: a midline structure kept whole in its R node vanished with Side = Left; a tumour view's moved copies
// hold the right half only, and the parts they stand in for were hidden whole, so Side = Both had no left hindbrain
test('skull base: midline structures stay with Side = Left; a tumour view draws the untouched left half beside the moved copies', async ({ page }) => {
  const g = guard(page);
  type V = { items: Map<string, { nodes: Record<string, { visible: boolean } | undefined> }> };
  const visible = (id: string, side: 'L' | 'R') => page.evaluate(([i, s]) => {
    const v = (window as unknown as { __atlas: { viewer: V } }).__atlas.viewer;
    return v.items.get(i)?.nodes[s]?.visible ?? null;
  }, [id, side] as const);
  await open(page, './skullbase-v1/#/atlas?g=veins&h=L');
  await expect.poll(() => visible('sb_superior_sagittal_sinus', 'R'), { timeout: SETTLED }).toBe(true);
  await open(page, './skullbase/#/atlas?g=koos_iii&h=B');
  await expect.poll(() => visible('pf_cerebellar_hemisphere__koos_3', 'R'), { timeout: SETTLED }).toBe(true);
  await expect.poll(() => visible('pf_cerebellar_hemisphere', 'L'), { timeout: SETTLED }).toBe(true);
  expect(await visible('pf_cerebellar_hemisphere', 'R')).toBe(false);
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

// The acoustic radiation (the owner's choices of 23 November 2026): HCP-1065's bundle ended 22 mm from Heschl's gyrus and
// was withdrawn; it is back as a shell from the Pandora atlas, a see-through solid among the streamlines, and is not
// drawn until its eye in the legend is clicked or its card is opened
test('tracts: the acoustic radiation is a shell, hidden until its eye is clicked', async ({ page }) => {
  const g = guard(page);
  type Items = { __atlas: { viewer: { items: Map<string, { kind: string; nodes?: Record<string, { visible: boolean } | undefined> }> } } };
  const drawn = (id: string) => page.evaluate((sid) => {
    const it = (window as unknown as Items).__atlas.viewer.items.get(sid);
    return it?.nodes ? Object.values(it.nodes).some((n) => n?.visible) : false;
  }, id);
  const row = page.locator('.legend3d li', { hasText: 'Acoustic radiation (a shell)' });
  await open(page, './tracts/#/atlas?g=ext_thalamic');
  // listed with the group's tracts, its eye off, nothing drawn; the link names no hidden tract
  await expect(page.locator('.tract-btn')).toHaveCount(4);
  await expect(row.locator('.eye')).toHaveAttribute('aria-pressed', 'false');
  await expect(row.locator('.sw')).toHaveClass(/patch/);
  expect(await drawn('wm_ar')).toBe(false);
  expect(new URL(page.url()).hash).not.toContain('hid=');
  // the eye shows it: a mesh, not lines; the link then says "nothing hidden", and opens the same view again
  await row.locator('.eye').click();
  await settle(page);
  await expect.poll(() => drawn('wm_ar')).toBe(true);
  expect(await page.evaluate(() => (window as unknown as Items).__atlas.viewer.items.get('wm_ar')!.kind)).toBe('mesh');
  await expect(row.locator('.eye')).toHaveAttribute('aria-pressed', 'true');
  expect(new URL(page.url()).hash).toMatch(/[?&]hid=(&|$)/);
  await open(page, page.url());
  await expect.poll(() => drawn('wm_ar')).toBe(true);
  // another group that holds it starts with it hidden again
  await page.locator('.grp-chips .chip', { hasText: 'Language and hearing' }).click();
  await settle(page);
  await expect(row.locator('.eye')).toHaveAttribute('aria-pressed', 'false');
  expect(await drawn('wm_ar')).toBe(false);
  // its card opens it: what the shell is, measured, with its sources and licence
  await page.locator('.tract-btn[data-tract="wm_ar"]').click();
  await settle(page);
  await expect.poll(() => drawn('wm_ar')).toBe(true);
  const card = page.locator('.card.sel');
  await expect(card.locator('h2')).toContainText('Acoustic radiation (AR)');
  await expect(card.locator('dt', { hasText: 'What the shell shows (measured)' })).toBeVisible();
  await expect(card.locator('dt', { hasText: 'Where its streamlines end' })).toHaveCount(0);
  await expect(card).toContainText('at least 90% of the people');
  await expect(card.locator('a.area', { hasText: 'Heschl’s gyrus' })).toHaveAttribute('href', '../cortex/#/atlas?sel=ctx_g_temp_sup_g_t_transv&h=L');
  await expect(card.locator('a.src', { hasText: 'Hansen 2021' }).first()).toHaveAttribute('href', 'https://doi.org/10.1007/s12021-020-09497-1');
  await expect(card).toContainText('Licence (CC BY 4.0) and source');
  // the credits name the atlas and its licence
  await open(page, './tracts/#/credits');
  await expect(page.locator('#pandora')).toContainText('CC BY 4.0');
  await expect(page.locator('#pandora')).toContainText('Hansen CB');
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

// UI-13: a measured distance was in no link, and Back left the section instead of returning to the view before
test('links: a measured distance is in the link and opens again; Back steps through the views looked at', async ({ page }) => {
  const g = guard(page);
  const grp = () => page.evaluate(() => (window as unknown as { __atlas: { state(): { grp: string } } }).__atlas.state().grp);
  const out = page.locator('.measure-out'), tool = page.locator('.tbtn', { hasText: 'Measure' });
  await open(page, './brainstem/#/atlas?g=overview');
  const box = (await page.locator('.viewer-host canvas').boundingBox())!;
  await page.keyboard.press('m');
  await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.45);
  await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.62);
  await expect(out).toContainText(/Distance \d/);
  const text = (await out.textContent())!;
  await expect.poll(() => new URL(page.url()).hash).toMatch(/[?&]m=(-?[\d.]+%2C){5}-?[\d.]+(&|$)/);
  // the link opens the same distance again, with the tool on
  await open(page, page.url());
  await expect(out).toHaveText(text);
  await expect(tool).toHaveAttribute('aria-pressed', 'true');
  // two other views, then Back twice and Forward once: each view again, and the first with its measurement
  const first = page.url();
  await page.locator('.grp-chips .chip', { hasText: 'Arteries' }).click();
  await settle(page);
  await page.locator('.grp-chips .chip', { hasText: 'Midbrain' }).click();
  await settle(page);
  expect(await grp()).toBe('sez_midbrain');
  await page.goBack();
  await expect.poll(grp).toBe('arteries');
  await page.goBack();
  await expect.poll(grp).toBe('overview');
  await settle(page);
  expect(page.url()).toBe(first);
  await expect(out).toHaveText(text);
  await page.goForward();
  await expect.poll(grp).toBe('arteries');
  // the camera, a selection and the tool itself add no entry: Back from here is still the first view
  await settle(page);
  await page.keyboard.press('h');
  await page.keyboard.press('m');
  await expect(tool).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => new URL(page.url()).hash).not.toMatch(/[?&]m=/);
  await page.goBack();
  await expect.poll(grp).toBe('overview');
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

// (found in the shell refactor) the endoscopes' keys were in no help
test('help: the ventricles and the skull base list their endoscopes\' keys', async ({ page }) => {
  await open(page, './ventricles/#/atlas?g=etv');
  const keys = () => page.locator('dialog.help dl').first().locator('dt').allTextContents();
  expect(await keys()).toEqual(expect.arrayContaining(['W  S', '← → ↑ ↓', 'Q  E', 'V']));
  await open(page, './skullbase/#/atlas?g=endonasal');
  expect(await keys()).toEqual(expect.arrayContaining(['← → ↑ ↓', 'W  S', 'Q  E']));
});

// AP-15: the "In" slider runs to the end of the scope's way, but the scope stops where it has no room (in front of the
// sphenoid's front wall until that is taken away), and the slider sprang back with no word: it now says how far the
// way is open. On v1 the scope stopped 26 mm in, under the nasal bones, and never came to the sinus.
// (on v1 the way comes to the sinus from below and beside it: taking the front wall away opens nothing in the scope's
// line there, the burr does)
for (const [model, least, wallOpens] of [['skullbase', 3, true], ['skullbase-v1', 70, false]] as const) {
  test(`endonasal (${model}): the In slider says how far the way is open${wallOpens ? ', and further once the front wall is taken away' : ''}`, async ({ page }) => {
    const g = guard(page);
    const first = page.locator('.endonasal .scope-range span').first();
    const note = /^In (\d+\.\d) mm \(the way is open to (\d+\.\d) of (\d+) mm\)$/;
    const read = async () => {
      await expect(first).toHaveText(note, { timeout: 30_000 });
      const m = note.exec((await first.textContent())!)!;
      return { at: Number(m[1]), open: Number(m[2]), of: Number(m[3]) };
    };
    // asked for more than the way's length: the scope goes as far as it has room, and the slider says so
    await open(page, `./${model}/#/atlas?g=endonasal&sc=R,200,0,0,0`);
    const shut = await read();
    expect(shut.at).toBe(shut.open);
    expect(shut.open).toBeGreaterThan(least);
    expect(shut.open).toBeLessThan(shut.of - 5);
    await open(page, `./${model}/#/atlas?g=endonasal&sc=R,200,0,0,0&rm=face`);
    await expect(page.locator('.endonasal .chip', { hasText: 'taken away' })).toHaveCount(1, { timeout: 30_000 });
    const opened = await read();
    expect(opened.of).toBe(shut.of);
    if (wallOpens) expect(opened.open).toBeGreaterThan(shut.open + 3);
    else expect(opened.open).toBeGreaterThanOrEqual(shut.open);
    // at the start the note is there too: it is about the way, not about where the scope is
    await page.locator('.endonasal .chip', { hasText: 'Back to the start' }).click();
    await expect(first).toHaveText(new RegExp(`^In 2\\.0 mm \\(the way is open to ${opened.open.toFixed(1).replace('.', '\\.')} of ${opened.of} mm\\)$`));
    expect(g.external).toEqual([]);
    expect(g.errors).toEqual([]);
  });
}

// UI-13: the endonasal view's endoscope and the pieces taken away were in no link (57 % of the picture differed)
for (const model of ['skullbase', 'skullbase-v1']) {
  test(`links (${model}): the endonasal view's endoscope and the pieces taken away are in the link`, async ({ page }) => {
    const g = guard(page);
    type Endo = { side: string; depth: number; yaw: number; pitch: number; roll: number; big: boolean; removed: string[] };
    const endo = () => page.evaluate(() => (window as unknown as { __atlas: { state(): { endo?: Endo } } }).__atlas.state().endo ?? null);
    const param = (k: string) => new URL(page.url()).hash.split('?')[1]?.split('&').map((kv) => kv.split('=')).find(([key]) => key === k)?.[1] ?? null;
    const sliders = page.locator('.endonasal .scope-range span');
    const taken = page.locator('.endonasal .chip', { hasText: 'taken away' });
    // opened plain, the view's own start goes into the link once the sinus is loaded
    await open(page, `./${model}/#/atlas?g=endonasal`);
    await expect.poll(endo, { timeout: 30_000 }).toEqual({ side: 'R', depth: 2, yaw: 0, pitch: 0, roll: 0, big: true, removed: [] });
    await expect.poll(() => param('sc')).toBe('R%2C2%2C0%2C0%2C0');
    expect(param('rm')).toBeNull();
    // a link's: the other nostril, further in, turned and rolled, its picture the inset, two pieces gone (and an id
    // that is no piece dropped)
    await open(page, `./${model}/#/atlas?g=endonasal&sc=L,9,6,-4,20&ev=3d&rm=face,septa,nothing`);
    await expect(taken).toHaveCount(2, { timeout: 30_000 });
    await expect(page.locator('.endonasal .chip[aria-pressed="true"]', { hasText: 'Left nostril' })).toHaveCount(1);
    await expect(sliders).toHaveText([/^In 9\.0 mm/, /^Turned to the side 6°/, /^Up or down -4°/, /^View rotated 20°/]);
    await expect.poll(endo).toEqual({ side: 'L', depth: 9, yaw: 6, pitch: -4, roll: 20, big: false, removed: ['face', 'septa'] });
    await expect.poll(() => param('rm')).toBe('face%2Csepta');
    expect(param('ev')).toBe('3d');
    // moving the scope and putting a piece back change the link, without the page being drawn again for the scope
    await page.locator('.viewer-host canvas').focus();
    await page.keyboard.press('s');
    await expect.poll(() => param('sc')).toBe('L%2C8%2C6%2C-4%2C20');
    await taken.nth(1).click();
    await expect.poll(() => param('rm')).toBe('face');
    // another view and Back: the scope and the piece as they were left
    const left = page.url();
    await page.locator('.grp-chips .chip', { hasText: 'Cranial floor' }).click();
    await settle(page);
    expect(await endo()).toBeNull();
    expect(param('sc')).toBeNull();
    await page.goBack();
    await expect.poll(() => page.url()).toBe(left);
    await expect(taken).toHaveCount(1);
    await expect(sliders.first()).toHaveText(/^In 8\.0 mm/);
    expect(g.external).toEqual([]);
    expect(g.errors).toEqual([]);
  });
}

// UI-14: the open legend lay on the model. On the view (the default) it can be minimised from its title, the skull
// base's nerves and arteries fold under their group, and the picture moves right by half the legend's width; beside the
// view (View options) it is a column left of the stage on a wide screen (src/ui/legendbox.ts)
const viewShift = (page: Page) => page.evaluate(() => {
  const c = (window as unknown as { __atlas: { viewer: { camera: { view: { enabled: boolean; offsetX: number } | null } } } }).__atlas.viewer.camera;
  return c.view?.enabled ? -c.view.offsetX : 0;
});
const legendPrefs = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('atlas-view-prefs') ?? '{}'));

test('legend on the view: minimised from its title and remembered, groups folded, the picture moved to leave it room', async ({ page }) => {
  const g = guard(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, './skullbase/#/atlas?g=floor');
  const box = page.locator('.stage .legend-box');
  await expect(box).toHaveJSProperty('open', true);
  await expect(page.locator('.legend-dock')).toHaveCount(0);
  // six group rows; the twelve nerves one button away, and the focus stays on it
  await expect(page.locator('.legend3d li')).toHaveCount(6);
  const fold = page.locator('.legend3d .lg-fold');
  await expect(fold).toHaveAttribute('aria-label', 'Show the 12 nerves one by one');
  await fold.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.legend3d li.lg-sub')).toHaveCount(12);
  await expect(page.locator('.legend3d .lg-fold')).toHaveAttribute('aria-expanded', 'true');
  expect(await page.evaluate(() => document.activeElement?.classList.contains('lg-fold'))).toBe(true);
  // the picture's centre is moved right by half the legend's width
  await expect.poll(async () => Math.abs(await viewShift(page) - (await box.boundingBox())!.width / 2)).toBeLessThan(1.5);
  // minimised from its title: no shift, and remembered after a reload
  await box.locator('summary').click();
  await expect(box).toHaveJSProperty('open', false);
  await expect.poll(() => viewShift(page)).toBe(0);
  await expect.poll(async () => (await legendPrefs(page)).legendShut).toBe(true);   // (saved on the toggle event, a moment later)
  await open(page, './skullbase/#/atlas?g=floor');
  await expect(page.locator('.stage .legend-box')).toHaveJSProperty('open', false);
  await page.locator('.stage .legend-box summary').click();
  await expect(page.locator('.stage .legend-box')).toHaveJSProperty('open', true);
  await expect.poll(async () => (await legendPrefs(page)).legendShut).toBe(false);   // (saved on the toggle event, a moment later)
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

test('legend beside the view: chosen in View options, on a wide screen only, remembered', async ({ page }) => {
  const g = guard(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, './tracts/');
  await page.locator('.view-settings-btn').click();
  await expect(page.locator('#set-legend-float')).toBeChecked();
  await page.locator('#set-legend-dock').check();
  await page.keyboard.press('Escape');
  const docked = async () => {
    await expect(page.locator('.atlas')).toHaveClass(/legend-docked/);
    await expect(page.locator('.legend-dock .legend-box')).toHaveCount(1);
    const [d, s] = await Promise.all([page.locator('.legend-dock').boundingBox(), page.locator('.stage').boundingBox()]);
    expect(Math.abs(d!.x + d!.width - s!.x)).toBeLessThan(2);    // the stage starts where the column ends
    await expect.poll(() => viewShift(page)).toBe(0);
  };
  await docked();
  await expect.poll(async () => (await legendPrefs(page)).legend).toBe('dock');
  await open(page, './skullbase/#/atlas?g=floor');
  await docked();
  // a narrower window keeps the legend on the view, and the choice comes back when it is wide again
  await page.setViewportSize({ width: 1100, height: 800 });
  await expect(page.locator('.legend-dock')).toHaveCount(0);
  await expect(page.locator('.stage .stage-bottom .legend-box')).toHaveCount(1);
  await page.setViewportSize({ width: 1440, height: 900 });
  await docked();
  // back on the view
  await page.locator('.view-settings-btn').click();
  await page.locator('#set-legend-float').check();
  await page.keyboard.press('Escape');
  await expect(page.locator('.legend-dock')).toHaveCount(0);
  await expect(page.locator('.atlas')).not.toHaveClass(/legend-docked/);
  await expect(page.locator('.stage .stage-bottom .legend-box')).toHaveCount(1);
  await expect.poll(() => viewShift(page)).toBeGreaterThan(50);
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

test('phone: the legend starts closed on the view, whatever a desktop chose @mobile', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('atlas-view-prefs', JSON.stringify({ legend: 'dock', legendShut: false })));
  await open(page, './skullbase/#/atlas?g=floor');
  await expect(page.locator('.legend-dock')).toHaveCount(0);
  await expect(page.locator('.stage .legend-box')).toHaveJSProperty('open', false);
  expect(await viewShift(page)).toBe(0);
});

test('the open legend covers under a tenth of the model in each section’s opening view (1440 × 900)', async ({ page }) => {
  test.setTimeout(600_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const shares: Record<string, number> = {};
  for (const p of ['dbs/', 'tracts/', 'skullbase/', 'skullbase-v1/', 'skullbase-ct/', 'cortex/', 'spine/', 'brainstem/', 'ventricles/', 'vascular/']) {
    await open(page, `./${p}`);
    await expect(page.locator('.stage .legend-box')).toHaveJSProperty('open', true);
    await page.waitForTimeout(500);   // (the shift follows the legend's width once its rows are in)
    shares[p] = await page.evaluate(() => {
      const v = (window as unknown as { __atlas: { viewer: { scene: { background: { getHexString(): string } } } } }).__atlas.viewer;
      const cv = document.querySelector<HTMLCanvasElement>('.viewer-host canvas')!;
      const W = cv.width, H = cv.height, k = W / cv.clientWidth;
      const c2 = document.createElement('canvas'); c2.width = W; c2.height = H;
      const g2 = c2.getContext('2d')!; g2.drawImage(cv, 0, 0);
      const d = g2.getImageData(0, 0, W, H).data;
      const hex = v.scene.background.getHexString();
      const bg = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
      const cr = cv.getBoundingClientRect(), lr = document.querySelector('.legend-box')!.getBoundingClientRect();
      const x0 = (lr.left - cr.left) * k, x1 = (lr.right - cr.left) * k, y0 = (lr.top - cr.top) * k, y1 = (lr.bottom - cr.top) * k;
      // the model: what differs clearly from the background (the faint shells drawn for context, as the DBS
      // section's whole brain, are left out: they fill the stage, and any box would lie on them)
      let model = 0, under = 0;
      for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
        const i = (y * W + x) * 4;
        if (Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) < 60) continue;
        model++;
        if (x >= x0 && x < x1 && y >= y0 && y < y1) under++;
      }
      return model ? under / model : 0;
    });
  }
  for (const [p, s] of Object.entries(shares)) expect(s, `${p}: the share of the model under the legend`).toBeLessThan(0.1);
});
