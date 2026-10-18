import { expect, test, type Page } from '@playwright/test';
import { INDICATIONS } from '../../src/data/indications';
import { GROUPS } from '../../src/tracts/content';
import { readFileSync } from 'node:fs';

/** Fail on any request that leaves the local server (no external runtime requests allowed). */
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
  // render the final frame synchronously so the screenshot never catches a half-animated camera
  await page.evaluate(() => {
    const v = (window as unknown as { __atlas: { viewer: { snapshot(): string } } }).__atlas.viewer;
    v.snapshot();
  });
}

/** Distinct colours in a downsampled copy of the WebGL canvas: a blank or broken render has very few. */
async function canvasColours(page: Page): Promise<number> {
  return page.evaluate(() => {
    const src = document.querySelector('.viewer-host canvas') as HTMLCanvasElement;
    const c = document.createElement('canvas');
    c.width = 96; c.height = 64;
    const g = c.getContext('2d')!;
    g.drawImage(src, 0, 0, c.width, c.height);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const set = new Set<number>();
    for (let i = 0; i < d.length; i += 4) set.add(((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3));
    return set.size;
  });
}

for (const ind of INDICATIONS) {
  test(`indication ${ind.id}: renders and matches the visual baseline`, async ({ page }) => {
    const g = guard(page);
    await page.goto(`./dbs/#/atlas?i=${ind.id}`);
    await settle(page);
    await expect(page.locator('.card h2').first()).toHaveText(ind.name);
    expect(await canvasColours(page)).toBeGreaterThan(40);
    await expect(page.locator('.stage')).toHaveScreenshot(`atlas-${ind.id}.png`);
    expect(g.external).toEqual([]);
    expect(g.errors).toEqual([]);
  });
}

test('symptom view, slices, lead and stimulation sphere', async ({ page }) => {
  const g = guard(page);
  await page.goto('./dbs/#/atlas?i=pd&s=pd-tremor&co=-12c&ax=-6&lead=0.5,0,60,15&stim=1,2');
  await settle(page);
  await expect(page.locator('.card h2').first()).toHaveText('Tremor');
  await expect(page.locator('.card').first()).toContainText('derived stand-in');
  await page.locator('#ptab-lead').click();
  await expect(page.locator('.lead-info table tbody tr')).toHaveCount(8);
  await expect(page.locator('.warn').filter({ hasText: 'not a volume-of-tissue-activated model' })).toBeVisible();
  await expect(page.locator('.stage')).toHaveScreenshot('atlas-pd-tremor-tools.png');
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

test('measure, hover tooltip and dragging the lead along its axis', async ({ page }) => {
  await page.goto('./dbs/#/atlas?i=pd&c=coronal&ly=n1,t0,c0,g1,e1&lead=0.5,0,60,15');
  await settle(page);
  // screen position of the right lead's contact array (patient right appears on the viewer's left in the anterior view)
  const pt = await page.evaluate(() => {
    const v = (window as any).__atlas.viewer;
    const lead = v.leads.R.group.children[2];
    const p = lead.getWorldPosition(lead.position.clone()).project(v.camera);
    const r = v.renderer.domElement.getBoundingClientRect();
    return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
  });
  // hover shows a tooltip
  await page.mouse.move(pt.x, pt.y);
  await expect(page.locator('.tip')).toBeVisible();
  // drag along the lead: depth changes and is written to the URL
  await page.mouse.down();
  await page.mouse.move(pt.x, pt.y + 40, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => new URL(page.url()).hash).not.toContain('lead=0.5%2C0%2C60');
  // measurement between two picked points
  await page.keyboard.press('m');
  await page.mouse.click(pt.x - 60, pt.y + 30);
  await page.mouse.click(pt.x + 60, pt.y + 30);
  await expect(page.locator('.measure-out')).toContainText(/Distance \d/);
});

test('state survives a reload through the URL hash', async ({ page }) => {
  await page.goto('./dbs/#/atlas?i=ts&s=ts-tics&h=L&sel=cm');
  await settle(page);
  await page.reload();
  await settle(page);
  await expect(page.locator('.card.sel h2')).toContainText('Centromedian');
  await expect(page.locator('[data-hemi="L"]')).toHaveAttribute('aria-pressed', 'true');
  expect(new URL(page.url()).hash).toContain('s=ts-tics');
});

test('other pages render without external requests', async ({ page }) => {
  const g = guard(page);
  await page.goto('./dbs/#/imaging?t=vim');
  await expect(page.locator('.page:not([hidden]) .card h2')).toHaveText('Ventral intermediate nucleus');
  await page.goto('./dbs/#/coords');
  await expect(page.locator('.coord h3')).toHaveText(['STN', 'GPi', 'Vim']);
  await page.fill('#acpc', '10');
  await expect(page.locator('.err')).toBeVisible();
  await page.goto('./dbs/#/refs');
  await page.fill('#ref-q', 'Horn');
  await expect(page.locator('.count')).toContainText('references');
  await page.goto('./dbs/#/credits');
  await expect(page.locator('.page:not([hidden]) h1')).toHaveText('Credits and licences');
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

test('mobile layout: viewer above a bottom sheet @mobile', async ({ page }) => {
  const g = guard(page);
  await page.goto('./dbs/#/atlas?i=et');
  await settle(page);
  const stage = await page.locator('.stage').boundingBox();
  const panel = await page.locator('.panel').boundingBox();
  expect(stage!.height).toBeGreaterThan(250);
  expect(panel!.y).toBeGreaterThan(stage!.y + stage!.height - 40);
  await page.locator('.sheet-handle').click();
  await expect(page.locator('.panel')).toHaveAttribute('data-sheet', 'full');
  await expect(page).toHaveScreenshot('mobile-et.png');
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

test('settings: hidden indications are remembered, links to them still work', async ({ page }) => {
  const g = guard(page);
  // default: the less common indications start hidden
  await page.goto('./dbs/#/atlas?i=pd');
  await settle(page);
  const chips = page.locator('.ind-chips .chip');
  await expect(chips).toHaveCount(6);
  for (const name of ["Parkinson's", 'Essential tremor', 'Generalized dystonia', 'Cervical dystonia', 'Focal hand dystonia', 'Epilepsy'])
    await expect(chips.filter({ hasText: name })).toHaveCount(1);
  await page.goto('./dbs/#/settings');
  await expect(page.locator('.page:not([hidden]) [aria-live="polite"]').last()).toContainText('6 of 11 indications shown');
  // change: show Tourette, hide focal hand dystonia
  await page.locator('input[data-ind="ts"]').check();
  await page.locator('input[data-ind="fhd"]').uncheck();
  // remembered across a reload
  await page.reload();
  await expect(page.locator('input[data-ind="ts"]')).toBeChecked();
  await expect(page.locator('input[data-ind="fhd"]')).not.toBeChecked();
  await page.goto('./dbs/#/atlas?i=pd');
  await settle(page);
  await expect(chips).toHaveCount(6);
  await expect(chips.filter({ hasText: 'Tourette' })).toHaveCount(1);
  await expect(chips.filter({ hasText: 'Focal hand' })).toHaveCount(0);
  // a shared link to a hidden indication still opens it, marked as hidden
  await page.goto('./dbs/#/atlas?i=holmes');
  await settle(page);
  await expect(page.locator('.card h2').first()).toHaveText('Holmes tremor');
  await expect(chips.filter({ hasText: 'Holmes tremor (hidden)' })).toHaveCount(1);
  // hiding the indication currently shown switches the atlas to the first visible one
  await page.goto('./dbs/#/atlas?i=pd');
  await settle(page);
  await page.goto('./dbs/#/settings');
  await page.locator('input[data-ind="pd"]').uncheck();
  await page.goto('./dbs/#/atlas');
  await settle(page);
  await expect(page.locator('.ind-chips .chip[aria-pressed="true"]')).not.toHaveText("Parkinson's");
  // show all, then back to the default set
  await page.goto('./dbs/#/settings');
  await page.getByRole('button', { name: 'Show all' }).click();
  await expect(page.locator('input[data-ind]:checked')).toHaveCount(11);
  await page.getByRole('button', { name: 'Reset to default' }).click();
  await expect(page.locator('input[data-ind]:checked')).toHaveCount(6);
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

test('lead placement is remembered per target', async ({ page }) => {
  const g = guard(page);
  await page.goto('./dbs/#/atlas?i=pd&ly=n1,t0,c0,g1,e1');
  await settle(page);
  await page.locator('#ptab-lead').click();
  await page.locator('select[data-k="anchor"]').selectOption('c1');
  await page.locator('input[data-k="depth"]').fill('-1');
  await expect(page.locator('.lead-pref')).toContainText('Remembered for PD sweet spot');
  // another target gets its own (built-in) placement ...
  await page.locator('#ptab-overview').click();
  await page.locator('.ind-chips .chip', { hasText: 'Essential tremor' }).click();
  await page.locator('#ptab-lead').click();
  await expect(page.locator('select[data-k="anchor"]')).toHaveValue('centre');
  // ... and coming back restores PD's, also after a reload
  await page.locator('#ptab-overview').click();
  await page.locator('.ind-chips .chip', { hasText: "Parkinson's" }).click();
  await page.locator('#ptab-lead').click();
  await expect(page.locator('select[data-k="anchor"]')).toHaveValue('c1');
  await expect(page.locator('input[data-k="depth"]')).toHaveValue('-1');
  await page.goto('./dbs/#/atlas?i=pd&ly=n1,t0,c0,g1,e1');
  await settle(page);
  await page.locator('#ptab-lead').click();
  await expect(page.locator('select[data-k="anchor"]')).toHaveValue('c1');
  // a link that carries its own lead position wins over the remembered one
  await page.goto('./dbs/#/atlas?i=pd&lead=0.5,2,60,15,tip');
  await settle(page);
  await page.locator('#ptab-lead').click();
  await expect(page.locator('select[data-k="anchor"]')).toHaveValue('tip');
  await expect(page.locator('.lead-pref')).toContainText('From the link');
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

test('legend: show/hide and highlight structures', async ({ page }) => {
  const g = guard(page);
  await page.goto('./dbs/#/atlas?i=et');
  await settle(page);
  await page.evaluate(() => { (document.querySelector('.legend-box') as HTMLDetailsElement).open = true; });
  const row = (text: string) => page.locator('.legend3d li', { hasText: text }).first();
  const item = (id: string) => page.evaluate((i) => {
    const it = (window as any).__atlas.viewer.items.get(i);
    const n = it.nodes.L;
    return { visible: n.visible, opacity: it.kind === 'lines' ? it.mat.opacity : n.material.opacity ?? 1, width: it.kind === 'lines' ? it.mat.linewidth : null };
  }, id);
  // hide the corticospinal tract
  await row('Corticospinal').locator('.eye').click();
  await expect(row('Corticospinal')).toHaveClass(/off/);
  expect((await item('cst')).visible).toBe(false);
  expect(new URL(page.url()).hash).toContain('hid=cst');
  // highlight the DRTT: brighter and thicker, others fade back, card opens
  const before = await item('ndrtt');
  await row('Dentato-rubro').locator('.lg-item').click();
  await expect(row('Dentato-rubro')).toHaveClass(/on/);
  const drtt = await item('drtt');
  expect(drtt.opacity).toBe(1);
  expect(drtt.width).toBeGreaterThan(2);
  expect((await item('ndrtt')).opacity).toBeLessThan(before.opacity);
  await expect(page.locator('.card.sel h2')).toContainText('Dentato-rubro-thalamic');
  // clicking again clears the highlight; "Show all" brings the hidden tract back
  await row('Dentato-rubro').locator('.lg-item').click();
  await expect(row('Dentato-rubro')).not.toHaveClass(/on/);
  await page.getByRole('button', { name: /Show all/ }).click();
  expect((await item('cst')).visible).toBe(true);
  // hidden items reset when the view changes
  await row('Corticospinal').locator('.eye').click();
  await page.locator('.ind-chips .chip', { hasText: "Parkinson's" }).click();
  expect(new URL(page.url()).hash).not.toContain('hid=');
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

test('slices: cut away the structures on the patient\'s left or right half, slices stay whole', async ({ page }) => {
  const g = guard(page);
  await page.goto('./dbs/#/atlas?i=pd&c=coronal&co=-13&ax=-6');
  await settle(page);
  await page.locator('#ptab-slices').click();
  const state = () => page.evaluate(() => {
    const v = (window as any).__atlas.viewer;
    const p = v.clipPlanes.map((q: any) => [Math.round(q.normal.x) + 0, Math.round(q.constant) + 0]);
    const m = v.slices.material;
    return { planes: p, slicePlanes: m ? (m.clippingPlanes?.length ?? 0) : -1, stnMat: v.items.get('stn').mats.solid.clippingPlanes.length };
  });
  expect((await state()).planes).toEqual([]);
  // patient's right half removed: keep x <= 0 (world normal -x)
  await page.locator('input[name="cutside"][value="R"]').check();
  await expect.poll(async () => (await state()).planes).toEqual([[-1, 0]]);
  // structures are cut, the slice image is not
  expect(await state()).toMatchObject({ slicePlanes: 0, stnMat: 1 });
  expect(new URL(page.url()).hash).toContain('cut=R');
  await page.locator('input[name="cutside"][value="L"]').check();
  await expect.poll(async () => (await state()).planes).toEqual([[1, 0]]);
  // markers on the removed half are hidden too
  const markers = await page.evaluate(() => (window as any).__atlas.viewer.markerGroup.children.filter((m: any) => m.visible).map((m: any) => m.userData.side));
  expect(markers.length).toBeGreaterThan(0);
  expect(markers).not.toContain('L');
  await expect(page.locator('.stage')).toHaveScreenshot('atlas-pd-cut-left.png');
  await page.locator('input[name="cutside"][value="none"]').check();
  await expect.poll(async () => (await state()).planes).toEqual([]);
  expect(await state()).toMatchObject({ slicePlanes: 0 });
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

test('labels: all / hover / off, legend hover, fade while moving', async ({ page }) => {
  const g = guard(page);
  // re-render, then read the visible labels (labels are laid out on every render)
  const shown = () => page.evaluate(() => {
    const v = (window as any).__atlas.viewer; v.renderer.render(v.scene, v.camera);
    return [...document.querySelectorAll('.labels > span')].filter((e) => !(e as HTMLElement).hidden).map((e) => e.textContent);
  });
  const lines = () => page.evaluate(() => document.querySelectorAll('.leaders line').length);
  // default: hover mode, nothing drawn over the anatomy
  await page.goto('./dbs/#/atlas?i=pd');
  await settle(page);
  await expect.poll(shown).toEqual([]);
  await expect(page.locator('.toolbar [data-labels="hover"]')).toHaveAttribute('aria-pressed', 'true');
  // hovering a legend row labels that structure in 3D, with a leader line
  await page.evaluate(() => { (document.querySelector('.legend-box') as HTMLDetailsElement).open = true; });
  await page.locator('.legend3d li', { hasText: 'Red nucleus' }).hover();
  await expect.poll(shown).toEqual(['Red nucleus']);
  expect(await lines()).toBe(1);
  await page.mouse.move(5, 5);
  await expect.poll(shown).toEqual([]);
  // the selected structure keeps its label
  await page.locator('.legend3d li', { hasText: 'Substantia nigra' }).locator('.lg-item').click();
  await expect.poll(shown).toEqual(['Substantia nigra pars reticulata']);
  // all: every highlighted structure and primary marker, one leader line each
  await page.locator('.toolbar [data-labels="all"]').click();
  await expect.poll(async () => (await shown()).length).toBeGreaterThan(2);
  const all = await shown();
  expect(all).toEqual(expect.arrayContaining(['PD sweet spot', 'dorsolateral STN']));
  expect(await lines()).toBe(all.length);
  expect(new URL(page.url()).hash).toContain('lb=a');
  // fade while the camera moves
  await page.evaluate(() => (window as any).__atlas.viewer.controls.dispatchEvent({ type: 'start' }));
  await expect(page.locator('.stage')).toHaveClass(/moving/);
  await page.evaluate(() => (window as any).__atlas.viewer.controls.dispatchEvent({ type: 'end' }));
  await expect(page.locator('.stage')).not.toHaveClass(/moving/);
  // off: clean images, even with a selection
  await page.locator('.toolbar [data-labels="off"]').click();
  await expect.poll(shown).toEqual([]);
  expect(await lines()).toBe(0);
  expect(new URL(page.url()).hash).toContain('lb=0');
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

test('slices: switch between T1, T2 and PD', async ({ page }) => {
  const g = guard(page);
  await page.goto('./dbs/#/atlas?i=pd&co=-13');
  await settle(page);
  const cur = () => page.evaluate(() => (window as any).__atlas.viewer.slices.current);
  // mean grey value of the coronal slice texture near the lateral ventricles (CSF): dark on T1, bright on T2
  const csf = () => page.evaluate(() => {
    const t = (window as any).__atlas.viewer.slices.material.uniforms.uHi.value;
    const [nx, ny] = [t.image.width, t.image.height];
    const d = t.image.data as Uint8Array;
    // crop origin is at (-36, -48, -30) mm, 0.5 mm voxels: ventricle body near x = -4, y = 0, z = 12
    const i = Math.round((-4 + 36) / 0.5), j = Math.round((0 + 48) / 0.5), k = Math.round((12 + 30) / 0.5);
    let s = 0, n = 0;
    for (let dk = -2; dk <= 2; dk++) for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) { s += d[(k + dk) * nx * ny + (j + dj) * nx + (i + di)]; n++; }
    return s / n;
  });
  await expect.poll(cur).toBe('t1');
  const t1 = await csf();
  await page.locator('#ptab-slices').click();
  await page.locator('input[name="sliceseq"][value="t2"]').check();
  await expect.poll(cur).toBe('t2');
  const t2 = await csf();
  expect(t2).toBeGreaterThan(t1 + 40); // CSF bright on T2, dark on T1
  expect(new URL(page.url()).hash).toContain('seq=t2');
  await page.locator('input[name="sliceseq"][value="pd"]').check();
  await expect.poll(cur).toBe('pd');
  await page.locator('input[name="sliceseq"][value="t1"]').check();
  await expect.poll(cur).toBe('t1');
  // a link opens with its sequence
  await page.goto('./dbs/#/atlas?i=pd&co=-13&seq=pd');
  await settle(page);
  await expect.poll(cur).toBe('pd');
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

test('home page: sections, light load, and old links forward to the DBS section', async ({ page }) => {
  const g = guard(page);
  const scripts: string[] = [];
  page.on('request', (r) => { if (r.resourceType() === 'script') scripts.push(r.url()); });
  await page.goto('./');
  await expect(page.locator('h1')).toHaveText('Open Neuroanatomy Atlas');
  await expect(page.locator('.section-card[data-section="dbs"] a.btn')).toHaveAttribute('href', './dbs/');
  await expect(page.locator('.section-card[data-section="tracts"] a.btn')).toHaveAttribute('href', './tracts/');
  expect(scripts.some((u) => /three-/.test(u))).toBe(false); // no 3D engine on the home page
  // open the DBS section from the home page; the header leads back
  await page.locator('.section-card[data-section="dbs"] a.btn').click();
  await settle(page);
  await expect(page.locator('.section-chip')).toContainText('DBS targets');
  // the section menu switches to the white-matter section and back
  await page.locator('.section-chip').click();
  await expect(page.locator('.section-menu [aria-current="page"]')).toHaveText('DBS targets');
  await page.locator('.section-menu a', { hasText: 'White-matter tracts' }).click();
  await settle(page);
  await expect(page).toHaveTitle(/· White-matter tracts · Open Neuroanatomy Atlas$/);
  await page.locator('.section-chip').press('ArrowDown');
  await expect(page.locator('.section-menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.section-menu')).toBeHidden();
  await page.locator('.section-chip').click();
  await page.locator('.section-menu a', { hasText: 'DBS targets' }).click();
  await settle(page);
  await expect(page).toHaveTitle(/· DBS targets · Open Neuroanatomy Atlas$/);
  await page.locator('a.brand').click();
  await expect(page.locator('h1')).toHaveText('Open Neuroanatomy Atlas');
  // a link shared before the restructure still opens the same view
  await page.goto('./#/atlas?i=et&s=et-head');
  await page.waitForURL(/\/dbs\/#\/atlas\?i=et&s=et-head/);
  await settle(page);
  await expect(page.locator('.card h2').first()).toHaveText('Head tremor');
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

// ---------------------------------------------------------------- white-matter section
for (const g of GROUPS) {
  test(`tract group ${g.id}: renders and matches the visual baseline`, async ({ page }) => {
    const gd = guard(page);
    await page.goto(`./tracts/#/atlas?g=${g.id}`);
    await settle(page);
    await expect(page.locator('.pane:not([hidden]) .card h2').first()).toHaveText(g.name);
    await expect(page.locator('.tract-btn')).toHaveCount(g.tractIds.length);
    await expect(page.locator(`[data-hemi="${g.hemi}"]`)).toHaveAttribute('aria-pressed', 'true');
    expect(await canvasColours(page)).toBeGreaterThan(40);
    await expect(page.locator('.stage')).toHaveScreenshot(`tracts-${g.id}.png`);
    expect(gd.external).toEqual([]);
    expect(gd.errors).toEqual([]);
  });
}

test('tract card: sourced sections, measured connections, highlight and the URL', async ({ page }) => {
  const g = guard(page);
  await page.goto('./tracts/#/atlas?g=language');
  await settle(page);
  await page.locator('.tract-btn[data-tract="wm_ifof"]').click();
  const card = page.locator('.card.sel');
  await expect(card.locator('h2')).toHaveText('Inferior fronto-occipital fasciculus (IFOF)');
  for (const dt of ['Course', 'Connections', 'Cortical connections measured in the atlas', 'Function', 'Surgical relevance', 'Geometry']) await expect(card.locator('dt', { hasText: dt }).first()).toBeVisible();
  await expect(card.locator('.areas')).toContainText('Left: BA');
  // every list item carries at least one source link
  const items = card.locator('.evidence li');
  const n = await items.count();
  for (let i = 0; i < n; i++) expect(await items.nth(i).locator('a.src').count()).toBeGreaterThan(0);
  await expect(page).toHaveTitle(/^Inferior fronto-occipital fasciculus · White-matter tracts · Open Neuroanatomy Atlas$/);
  expect(new URL(page.url()).hash).toContain('sel=wm_ifof');
  // a selected tract outside the group is added to the view; the cortex it names is highlighted
  await page.goto('./tracts/#/atlas?g=visual&sel=wm_fat&h=L');
  await settle(page);
  await expect(page.locator('.legend3d')).toContainText('Supplementary motor area');
  // the keyboard steps through the group
  await page.locator('body').press(']');
  await expect.poll(() => new URL(page.url()).hash).toContain('sel=wm_or');
  // a reload keeps the view
  await page.goto('./tracts/#/atlas?g=slf&sel=wm_slf2&h=R&ax=12&seq=t2&lb=0');
  await settle(page);
  await page.reload();
  await settle(page);
  const st = await page.evaluate(() => (window as unknown as { __atlas: { state(): { grp: string; sel: string; hemi: string; sliceSeq: string; labels: string; clip: { axial: { on: boolean; mm: number } } } } }).__atlas.state());
  expect([st.grp, st.sel, st.hemi, st.sliceSeq, st.labels, st.clip.axial.on, st.clip.axial.mm]).toEqual(['slf', 'wm_slf2', 'R', 't2', 'off', true, 12]);
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

test('tracts section: references, credits and the way home', async ({ page }) => {
  const g = guard(page);
  await page.goto('./tracts/#/refs');
  await page.fill('#ref-q', 'Meyer');
  await expect(page.locator('.count')).toContainText('reference');
  await page.goto('./tracts/#/credits');
  await expect(page.locator('.page:not([hidden]) h1')).toHaveText('Credits and licences');
  await expect(page.locator('#hcp1065')).toContainText('CC BY-SA 4.0');
  await expect(page.locator('#hcp blockquote')).toContainText('Human Connectome Project');
  await page.locator('a.brand').click();
  await expect(page.locator('h1')).toHaveText('Open Neuroanatomy Atlas');
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

test('tracts on a phone: viewer above the bottom sheet @mobile', async ({ page }) => {
  const g = guard(page);
  await page.goto('./tracts/#/atlas?g=motor');
  await settle(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.locator('.ptab', { hasText: 'Tracts' }).click();
  await page.locator('.tract-btn[data-tract="wm_cst"]').click();
  await expect(page.locator('.card.sel h2')).toContainText('Corticospinal tract');
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

test('core and extended tracts stay separate; the switch moves between them', async ({ page }) => {
  const g = guard(page);
  await page.goto('./tracts/#/atlas?g=language');
  await settle(page);
  await expect(page.locator('.tier-btn[data-tier="core"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.tier-btn[data-tier="extended"]').click();
  await settle(page);
  expect(new URL(page.url()).hash).toContain('g=ext_language');
  await expect(page.locator('.tract-btn')).toHaveCount(4);
  // only extended groups are offered while the extended set is open
  await expect(page.locator('.grp-chips .chip', { hasText: 'Vision' })).toHaveCount(0);
  // "All" is offered first in the function row of each set
  await expect(page.locator('.grp-chips').first().locator('.chip').first()).toHaveText('All');
  await page.locator('.tier-btn[data-tier="core"]').click();
  await page.locator('.grp-chips').first().locator('.chip', { hasText: /^All$/ }).click();
  await expect(page.locator('.tract-btn[data-tract="wm_cc"]')).toBeVisible();
  await page.locator('.tier-btn[data-tier="extended"]').click();
  await page.locator('.tract-btn[data-tract="wm_mdlf"]').click();
  await expect(page.locator('.card.sel .eyebrow')).toHaveText('Association tract · Extended');
  await page.locator('.tier-btn[data-tier="core"]').click();
  expect(new URL(page.url()).hash).toContain('g=language');
  // the fornix is a core tract, with the pipeline's own alignment note
  await page.goto('./tracts/#/atlas?g=limbic&sel=wm_fx');
  await settle(page);
  await expect(page.locator('.card.sel dt', { hasText: 'Checked by this project’s pipeline' })).toBeVisible();
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

// ---------------------------------------------------------------- skull-base section
// group ids and names as src/skullbase/groups.ts builds them (Playwright cannot import the generated JSON it uses)
const SB_REGIONS = JSON.parse(readFileSync(new URL('../../src/data/generated/sb-regions.json', import.meta.url), 'utf8')) as { landmark: string }[];
const slug = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const SB_GROUPS = [
  { id: 'floor', name: 'Cranial floor' },
  ...SB_REGIONS.map((r) => ({ id: `near_${slug(r.landmark)}`, name: `Around the ${r.landmark.toLowerCase()}` })),
  { id: 'nerves', name: 'Cranial nerves' }, { id: 'arteries', name: 'Arteries' }, { id: 'veins', name: 'Veins and dural sinuses' },
  ...['Sphenoid bone', 'Temporal bone', 'Occipital bone', 'Frontal and ethmoid bones', 'Parietal bone'].map((n) => ({ id: `bone_${slug(n)}`, name: n })),
];
for (const g of SB_GROUPS) {
  test(`skull base ${g.id}: renders and matches the visual baseline`, async ({ page }) => {
    const gd = guard(page);
    await page.goto(`./skullbase/#/atlas?g=${g.id}`);
    await settle(page);
    await expect(page.locator('.pane:not([hidden]) .card h2').first()).toHaveText(g.name);
    expect(await canvasColours(page)).toBeGreaterThan(40);
    await expect(page.locator('.stage')).toHaveScreenshot(`skull-${g.id}.png`);
    expect(gd.external).toEqual([]);
    expect(gd.errors).toEqual([]);
  });
}

test('skull base: structure and landmark cards, cut-away and the URL', async ({ page }) => {
  const g = guard(page);
  await page.goto('./skullbase/#/atlas?g=near_hypophysial_fossa');
  await settle(page);
  await page.locator('.sb-item[data-id="sb_basilar_artery"]').click();
  const card = page.locator('.card.sel');
  await expect(card.locator('h2')).toHaveText('Basilar artery');
  await expect(card).toContainText('From Wikipedia (CC BY-SA 3.0)');
  await expect(card.locator('dt', { hasText: 'Near (measured in the model)' })).toBeVisible();
  await page.locator('.sb-item[data-id="lm_tuberculum_sellae"]').click();
  await expect(page.locator('.card.sel h2')).toHaveText('Tuberculum sellae');
  await expect(page.locator('.card.sel')).toContainText('Sphenoid bone');
  // the cut-away is part of the link and survives a reload
  await page.locator('.ptab', { hasText: 'Layers and cut' }).click();
  await page.locator('[data-k="cz-on"]').uncheck();
  await expect.poll(() => new URL(page.url()).hash).toContain('cz=off');
  await settle(page);
  await page.reload();
  await settle(page);
  const st = await page.evaluate(() => (window as unknown as { __atlas: { state(): { grp: string; sel: string; cutAbove: number | null } } }).__atlas.state());
  expect([st.grp, st.sel, st.cutAbove]).toEqual(['near_hypophysial_fossa', 'lm_tuberculum_sellae', null]);
  // sources and credits, without external requests
  await page.goto('./skullbase/#/credits');
  await expect(page.locator('#zanatomy')).toContainText('CC BY-SA');
  await page.goto('./skullbase/#/sources');
  await expect(page.locator('.page:not([hidden]) h1')).toHaveText('Sources');
  // the section menu lists every section
  await page.locator('.section-chip').click();
  await expect(page.locator('.section-menu a.section-item:not(.home)')).toHaveText(['DBS targets', 'White-matter tracts', 'Skull base', 'Cortical anatomy', 'Spine']);
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

// ---------------------------------------------------------------- cortex section
// view ids and names as src/cortex/views.ts defines them
const CTX_VIEWS = [['lateral', 'Lateral'], ['medial', 'Medial'], ['basal', 'Basal'], ['insular', 'Insular']] as const;
for (const [id, name] of CTX_VIEWS) {
  for (const inf of [0, 1]) {
    test(`cortex ${id} view (${inf ? 'inflated' : 'pial'}): renders and matches the visual baseline`, async ({ page }) => {
      const gd = guard(page);
      await page.goto(`./cortex/#/atlas?v=${id}${inf ? '&inf=1' : ''}`);
      await settle(page);
      await expect(page.locator('.pane:not([hidden]) .card h2').first()).toHaveText(`${name} view`);
      expect(await canvasColours(page)).toBeGreaterThan(40);
      await expect(page.locator('.stage')).toHaveScreenshot(`cortex-${id}-${inf ? 'inflated' : 'pial'}.png`);
      expect(gd.external).toEqual([]);
      expect(gd.errors).toEqual([]);
    });
  }
}

test('cortex: label cards, lobes, surface switch and the URL', async ({ page }) => {
  const g = guard(page);
  await page.goto('./cortex/#/atlas?v=lateral');
  await settle(page);
  await page.locator('.sb-item[data-id="ctx_g_precentral"]').click();
  const card = page.locator('.card.sel');
  await expect(card.locator('h2')).toHaveText('Precentral gyrus');
  await expect(card).toContainText('From Wikipedia (CC BY-SA 3.0)');
  await expect(card.locator('dt', { hasText: 'Borders (measured)' })).toBeVisible();
  await expect(card.locator('dt', { hasText: 'DBS section’s cortical areas (measured)' })).toBeVisible();
  // a border link opens the neighbour's card
  await card.getByRole('button', { name: 'Central sulcus', exact: true }).click();
  await expect(page.locator('.card.sel h2')).toHaveText('Central sulcus');
  // lobe filter narrows the list
  await page.locator('.lobe-chips .chip[data-v="insula"]').click();
  await expect(page.locator('.sb-list .sb-item')).toHaveCount(5);
  // inflated surface and atlas colours are part of the link and survive a reload
  await page.locator('[data-inflate="1"]').click();
  await page.locator('.ptab', { hasText: 'Display' }).click();
  await page.locator('input[name=ctxcol][value=atlas]').check();
  await expect.poll(() => new URL(page.url()).hash).toContain('inf=1');
  await settle(page);
  await page.reload();
  await settle(page);
  const st = await page.evaluate(() => (window as unknown as { __atlas: { state(): { lobe: string; inflate: number; colour: string } } }).__atlas.state());
  expect([st.lobe, st.inflate, st.colour]).toEqual(['insula', 1, 'atlas']);
  // the medial wall has its own card; sources and credits load without external requests
  await page.goto('./cortex/#/atlas?v=medial&sel=ctx_medial_wall');
  await settle(page);
  await expect(page.locator('.card.sel h2')).toHaveText('Medial wall');
  await page.goto('./cortex/#/credits');
  await expect(page.locator('#destrieux')).toContainText('FreeSurfer');
  await page.goto('./cortex/#/sources');
  await expect(page.locator('.page:not([hidden]) h1')).toHaveText('Sources');
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

// ---------------------------------------------------------------- spine section
for (const [name, hash] of [['lumbar', 'r=lumbar&c=posteriorOblique'], ['lumbar-l4', 'r=lumbar&lv=L4&c=lateral'], ['lumbar-lesion', 'r=lumbar&lv=L4&les=L4-L5.paracentral.L&c=posteriorOblique'], ['lumbar-screw', 'r=lumbar&lv=L4&scr=tt~L~15.8~0~45~6.5~0~0&c=lateral']] as const) {
  test(`spine ${name}: renders and matches the visual baseline`, async ({ page }) => {
    const gd = guard(page);
    await page.goto(`./spine/#/atlas?${hash}`);
    await settle(page);
    expect(await canvasColours(page)).toBeGreaterThan(40);
    await expect(page.locator('.stage')).toHaveScreenshot(`spine-${name}.png`);
    expect(gd.external).toEqual([]);
    expect(gd.errors).toEqual([]);
  });
}

test('spine: virtual screw — start position, breach grade, cut, and a link that survives a reload', async ({ page }) => {
  const g = guard(page);
  await page.goto('./spine/#/atlas?r=lumbar&lv=L4');
  await settle(page);
  const card = page.locator('.card.sel');
  // measured pedicles beside the published values
  await expect(card.locator('.morph')).toContainText('regional means');
  await card.locator('.screw-tech .chip[data-v="tt"]').click();
  await expect(card.locator('.screw-readout .grade')).toHaveText('A');
  await expect(card.locator('.screw-readout')).toContainText('No breach of the pedicle wall');
  // turned far medially the screw enters the canal
  await card.locator('#screw-medial').fill('40');
  await expect(card.locator('.screw-readout .grade')).toHaveText('E');
  await expect(card.locator('.screw-readout')).toContainText('Medial breach');
  await card.locator('.screw-cut').click();
  await expect.poll(() => new URL(page.url()).hash).toContain('x=s');
  await expect.poll(() => decodeURIComponent(new URL(page.url()).hash)).toContain('scr=tt~L~40~');
  await settle(page);
  await page.reload();
  await settle(page);
  await expect(page.locator('.card.sel .screw-readout .grade')).toHaveText('E');
  await expect(page.locator('#screw-medial')).toHaveValue('40');
  // S1 offers the tricortical screw only; changing level clears the screw
  await page.locator('.level-chips .chip[data-v="S1"]').click();
  await expect(page.locator('.screw-tech .chip')).toHaveText(['None', 'S1 tricortical']);
  await expect.poll(() => new URL(page.url()).hash).not.toContain('scr=');
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

test('spine: lesion-to-root tool picks the root, its function and a link that survives a reload', async ({ page }) => {
  const g = guard(page);
  await page.goto('./spine/#/atlas?r=lumbar&lv=L4');
  await settle(page);
  const card = page.locator('.card.sel');
  await card.locator('.lesion-kind .chip[data-v="paracentral"]').click();
  await expect(card.locator('.lesion-result')).toContainText('L5 nerve root (traversing), left');
  await expect(card).toContainText('Long toe extensors');
  await expect(card.locator('.body-chart .bc-dot.on')).toHaveCount(1);
  await card.locator('.lesion-kind .chip[data-v="foraminal"]').click();
  await card.locator('.lesion-side .chip[data-v="R"]').click();
  await expect(card.locator('.lesion-result')).toContainText('L4 nerve root (exiting), right');
  await expect(card).toContainText('Ankle dorsiflexors');
  await expect.poll(() => new URL(page.url()).hash).toContain('les=L4-L5.foraminal.R');
  await settle(page);
  await page.reload();
  await settle(page);
  await expect(page.locator('.card.sel .lesion-result')).toContainText('L4 nerve root (exiting), right');
  // changing level clears the lesion
  await page.locator('.level-chips .chip[data-v="L3"]').click();
  await expect(page.locator('.card.sel .lesion-result')).toHaveCount(0);
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});

test('spine: level card with measurements, schematic roots labelled, the URL', async ({ page }) => {
  const g = guard(page);
  await page.goto('./spine/#/atlas?r=lumbar');
  await settle(page);
  await page.locator('.level-chips .chip[data-v="L4"]').click();
  const card = page.locator('.card.sel');
  await expect(card.locator('h2')).toHaveText('L4');
  await expect(card.locator('dt', { hasText: 'Foramen L4-L5 (measured)' })).toBeVisible();
  await expect(card).toContainText('Hwang 2019');
  // every schematic element says so on its card
  await card.getByRole('button', { name: 'L4 nerve root', exact: true }).click();
  await expect(page.locator('.card.sel h2')).toHaveText('L4 nerve root');
  await expect(page.locator('.card.sel .schematic-note')).toBeVisible();
  await page.locator('.sb-item[data-id="sp_drg_l4"]').click();
  await expect(page.locator('.card.sel .schematic-note')).toBeVisible();
  // the selection and level survive a reload
  await expect.poll(() => new URL(page.url()).hash).toContain('lv=L4');
  await settle(page);
  await page.reload();
  await settle(page);
  const st = await page.evaluate(() => (window as unknown as { __atlas: { state(): { level: string; sel: string } } }).__atlas.state());
  expect([st.level, st.sel]).toEqual(['L4', 'sp_drg_l4']);
  await page.goto('./spine/#/credits');
  await expect(page.locator('#verse')).toContainText('CC BY-SA 4.0');
  await page.goto('./spine/#/sources');
  await expect(page.locator('.page:not([hidden]) h1')).toHaveText('Sources');
  expect(g.external).toEqual([]);
  expect(g.errors).toEqual([]);
});
