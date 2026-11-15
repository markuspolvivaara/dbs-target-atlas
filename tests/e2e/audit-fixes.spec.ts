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

/** How long the panel may take to come to rest after a selection: the card is aligned on the next frame and once more
 * 900 ms later. Longer in CI, where a frame can be seconds away (playwright.config.ts). */
const SETTLED = process.env.CI ? 20_000 : 6_000;

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
  await expect(card.locator('.def-edit')).toContainText('Corrected here');
  await expect(card.locator('.def-edit')).toContainText('Destrieux et al. 2010');
  await open(page, './cortex/#/atlas?v=inferior&sel=ctx_s_orbital_med_olfact');
  await expect(card.locator('dt').first()).toHaveText('About the olfactory tract, which lies just below this sulcus');
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

// UI-02, a page opened on a link with a selection: the panel is still filling in when the card is first aligned
test('selection: a link that opens with a selection shows the card from its top', async ({ page }) => {
  const g = guard(page);
  for (const url of ['./skullbase/#/atlas?g=floor&sel=tb_facial_nerve_vii', './brainstem/#/atlas?g=sez_floor&sel=sez_infrafacial', './cortex/#/atlas?v=lateral&sel=ctx_g_precentral']) {
    await open(page, url);
    const card = page.locator('.panel .card.sel');
    await expect(card, url).toBeVisible();
    // (the panel scrolls to the card, then once more when it has settled: wait for the heading to come to rest just
    // under the pane's top, neither cut off above it nor still on its way)
    await expect.poll(async () => {
      const [c, p] = await Promise.all([card.locator('h2').boundingBox(), page.locator('.panel .pane:not([hidden])').boundingBox()]);
      const dy = c && p ? Math.round(c.y - p.y) : -999;
      return dy >= 0 && dy < 80;
    }, { message: url, timeout: SETTLED }).toBe(true);
  }
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
