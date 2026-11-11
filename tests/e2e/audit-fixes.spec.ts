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
  // no far lateral zone in the neck (the vertebral artery runs there), as in the drilling tool
  await expect(card.locator('.lesion-kind .chip')).toHaveText(['None', 'Paracentral', 'Foraminal']);
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
  page.on('request', (r) => { if (r.url().endsWith('.glb')) glbs.add(new URL(r.url()).pathname); });
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
  await page.route('**/assets/meshes/stn_motor.glb', (route) => (block ? route.abort() : route.continue()));
  await open(page, './dbs/#/atlas?i=pd');
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
    }, { message: url, timeout: 6000 }).toBe(true);
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
