import * as THREE from 'three';
import { SB } from '../skullbase';
import { ENDO_BURR_MM, ENDO_SCOPE_ROOM_MM, ENDO_STANDOFF_MM, ENDO_STEP_MM, ENDO_STOP_MM, ENDO_STOPS, ENDONASAL, ScopePath, SinusVolume, type EndoLayer, type EndoPiece, type EndoSide, type EndoStop } from '../skullbase/endonasal';
import { SB_GROUP } from '../skullbase/groups';
import type { SkullState } from '../skullbase/state';
import type { EndoMesh } from '../viewer/endoscope';
import type { EndoscopeConfig, PointerTool, Viewer } from '../viewer/Viewer';
import { h } from './h';
import { resolvedTheme, storedTheme } from './theme';
import { chips, clear, fmtMm } from './widgets';

type V3 = [number, number, number];
/** how far the scope can be turned from the way ahead (deg), and where it starts (mm along its way) */
const AIM_MAX_DEG = 30;
const START_MM = 2;
const BURR_RATE = { min: 1, max: 10, start: 3 };     // mm a second (a drawing choice)
const WARN_MM = 1.5, TOUCH_MM = 0.25;
const UNDO = 8;
/** turning the scope by dragging in its view (degrees a pixel), and moving it by the wheel (mm a wheel pixel: a notch of
 * 100 is 1 mm) */
const LOOK_DEG_PER_PX = 0.15;
const WHEEL_MM_PER_PX = 0.01;
/** how far the pointer moves before a press is a drag (px) */
const DRAG_PX = 4;
const STOP_NAME: Record<EndoStop, string> = {
  vessel: 'Carotid and other vessels', nerve: 'Optic nerve, chiasm and nerves III–VI (fitted, routed)', sellar: 'Hypophysis (modelled) and intercavernous sinuses (fitted)', brain: 'Brain (fitted)',
};
/** x-ray vision: what can be seen through everything in front of it, by group (the structures' names), each in a
 * colour of its own that stands out against the mucosa (a rendering choice) */
type XrayId = 'carotid' | 'optic' | 'hypophysis' | 'cavernous' | 'nerves' | 'basilar';
const XRAY: [XrayId, string, string[], string][] = [
  ['carotid', 'Carotid arteries', ['Internal carotid artery', 'Internal carotid artery (petrous and lacerum parts)', 'Ophthalmic artery'], '#e8392f'],
  ['optic', 'Optic nerves and chiasm', ['Optic nerve (II)', 'Optic chiasm'], '#f5d742'],
  ['hypophysis', 'Hypophysis', ['Adenohypophysis (anterior lobe)', 'Neurohypophysis (posterior lobe)', 'Pituitary stalk'], '#f28c28'],
  ['cavernous', 'Cavernous sinuses', ['Cavernous sinus', 'Anterior intercavernous sinus', 'Posterior intercavernous sinus'], '#3d7be6'],
  ['nerves', 'Nerves III–VI', ['Oculomotor nerve (III)', 'Trochlear nerve (IV)', 'Abducens nerve (VI)', 'Trigeminal nerve (V)', 'Trigeminal ganglion'], '#b5e655'],
  ['basilar', 'Basilar artery', ['Basilar artery'], '#ff7a6b'],
];
const STOP_AT: Record<EndoStop, string> = { vessel: 'a vessel (the carotid)', nerve: 'a nerve', sellar: 'the hypophysis or an intercavernous sinus', brain: 'the brain' };
const one = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

interface Scope { side: EndoSide; depth: number; yaw: number; pitch: number; roll: number; big: boolean }

/**
 * The endoscopic endonasal view's panel: a 0° endoscope through one nostril (from as far forward as the scan reaches),
 * aimed at the sella and turned from there; its view, big or as an inset; and a burr that takes away bone and lining in
 * front of it, stopping at the carotids' wall, the nerves, the hypophysis and the brain.
 */
export class EndonasalPanel implements PointerTool {
  readonly el = h('div', { class: 'endonasal drill' });
  private readonly out = h('div', { class: 'drill-out', 'aria-live': 'polite' });
  private active = false;
  private vol: SinusVolume | null = null;
  private loading: Promise<SinusVolume> | null = null;
  private group = new THREE.Group();
  /** the bone as cut (the 3D view), and the lining (what is not air: the endoscope's walls, not drawn in the 3D view) */
  private layers: Record<EndoLayer, THREE.Group> = { bone: new THREE.Group(), solid: new THREE.Group() };
  private chunks = new Map<string, THREE.Mesh>();
  private boneMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0 });
  private liningMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0 });
  private burr: THREE.Group;
  /** the scope in the 3D view: its shaft back from the tip, out of the nose (a schematic 4-mm one) */
  private shaft: THREE.Mesh;
  private scope: Scope = { side: 'R', depth: START_MM, yaw: 0, pitch: 0, roll: 0, big: true };
  private readonly paths: Record<EndoSide, ScopePath> = { L: new ScopePath('L'), R: new ScopePath('R') };
  /** the scope was pushed further than the tissue ahead lets it go */
  private blocked = false;
  /** drilling (the burr) rather than taking pieces away */
  private drilling = false;
  /** the piece pointed at (tinted in the scope's view) */
  private hovered: EndoPiece | null = null;
  /** a press in the scope's view: where it started (a drag turns the scope, a click takes the piece away) */
  private look: { x: number; y: number; button: number; moved: boolean } | null = null;
  private wheelAcc = 0;
  /** the x-ray vision groups switched on */
  private xray = new Set<XrayId>();
  private rate = BURR_RATE.start;
  private ray: THREE.Ray | null = null;
  private pressing = false;
  private last = 0;
  private centre: THREE.Vector3 | null = null;
  private stopped: EndoStop | null = null;
  private undo: ReturnType<SinusVolume['snapshot']>[] = [];
  private colour = {
    bone: new THREE.Color('#e6dccb'), lining: new THREE.Color('#c97a70'), liningBone: new THREE.Color('#e3c2b2'),
    cancellous: new THREE.Color('#d99a86'), cortex: new THREE.Color('#efe7d4'), pointed: new THREE.Color('#8cc4ee'),
    // the hypophysis as it looks once the dura is open: the anterior lobe orange-yellow, the posterior lobe and the stalk
    // greyish (rendering choices)
    adeno: new THREE.Color('#e0a060'), neuro: new THREE.Color('#d2c8bc'), stalk: new THREE.Color('#d8bfa8'),
    // the dura over the sella once the floor is off: grey-blue, unlike the mucosa and the bone round it
    dura: new THREE.Color('#9fa3ad'),
    // an artery's wall where the burr has laid it bare (a rendering choice)
    artery: new THREE.Color('#c04a44'),
  };

  constructor(private viewer: Viewer) {
    this.burr = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: 0xc9ccd1, roughness: 0.3, metalness: 0.7 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(ENDO_BURR_MM / 2, 28, 18), steel);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 30, 16), steel);
    shaft.position.y = 15 + ENDO_BURR_MM / 2 - 0.5;
    this.burr.add(head, shaft);
    this.burr.visible = false;
    // (unit length, along +y from the tip: scaled to the depth and turned to the scope's axis)
    this.shaft = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 1, 20).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.35, metalness: 0.6 }));
    this.shaft.raycast = () => {};
    this.group.add(this.layers.bone, this.layers.solid, this.burr, this.shaft);
    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  // ---------------------------------------------------------------- entering and leaving the view
  render(s: SkullState): void {
    const on = !!SB_GROUP.get(s.grp)?.endonasal;
    if (on && !this.active) void this.enter();
    else if (!on && this.active) this.leave();
  }

  private async enter(): Promise<void> {
    this.active = true;
    this.build();
    this.applyScope();
    this.loading ??= SinusVolume.load();
    this.out.replaceChildren(h('p', { class: 'aside' }, 'Loading the sinus…'));
    const vol = await this.loading;
    if (!this.active) return;
    this.vol = vol;
    this.viewer.toolGroup.add(this.group);
    this.viewer.setPointerTool(this);
    this.remeshAll();
    this.applyScope();
    this.build();   // (the steps can be taken now)
  }

  private leave(): void {
    this.active = false;
    this.setDrilling(false);
    this.hovered = null;
    this.viewer.setPointerTool(null);
    this.viewer.setEndoscope(null);
    this.viewer.toolGroup.remove(this.group);
    for (const m of this.chunks.values()) { m.removeFromParent(); m.geometry.dispose(); }
    this.chunks.clear();
    clear(this.el);
  }

  // ---------------------------------------------------------------- the scope
  /** The scope's tip, the way it looks and which way is up on screen (frame mm): `depth` mm along its way (the
   * corridor through the nose, then straight on to the sella), looking the way ahead turned by yaw (about the vertical)
   * and pitch, rolled. */
  private pose(): { tip: THREE.Vector3; dir: THREE.Vector3; up: THREE.Vector3 } {
    const sc = this.scope;
    const { tip, dir } = this.paths[sc.side].pose(sc.depth, sc.yaw, sc.pitch);
    const vert = new THREE.Vector3(0, 0, 1);
    const up = vert.clone().addScaledVector(dir, -vert.dot(dir)).normalize().applyAxisAngle(dir, THREE.MathUtils.degToRad(sc.roll));
    return { tip, dir, up };
  }

  private config(): EndoscopeConfig {
    const p = this.pose(), g = SB_GROUP.get('endonasal')!;
    const behind = new Set(g.structures);
    const xyz = (v: THREE.Vector3) => [v.x, v.y, v.z] as V3;
    const theme = resolvedTheme(storedTheme());
    return {
      tip: xyz(p.tip), dir: xyz(p.dir), up: xyz(p.up), big: this.scope.big, floor: null,
      // (the abducens nerve inside the cavernous sinus, once its medial wall is opened: seen in the space, not behind a wall)
      role: (id) => (!behind.has(id) ? null : SB.get(id)?.name === 'Abducens nerve (VI)' && [...(this.vol?.removed ?? [])].some((r) => r.startsWith('cs_')) ? 'inside' : 'behind'),
      xray: (id) => { const n = SB.get(id)?.name; return (n && XRAY.find(([k, , names]) => this.xray.has(k) && names.includes(n))?.[3]) || null; },
      // in air, by the CT (the scope only goes where it has room)
      inside: () => !!this.vol?.inAir(this.pose().tip),
      colour: (id) => { const c = SB.get(id)?.colour; return c ? (theme === 'dark' ? c.dark : c.light) : '#888888'; },
      extra: () => [
        { id: 'endonasal_lining', name: 'Lining of the nasal cavity and sinus (this CT)', mesh: this.endoMesh('solid', 'wall') },
        // the bone as drawn in the 3D view: not drawn in the endoscope's (the lining stands for it there)
        { id: 'endonasal_bone', name: 'Bone (this CT)', mesh: { ...this.endoMesh('bone', 'behind'), visible: false } },
      ],
    };
  }

  private endoMesh(layer: EndoLayer, role: EndoMesh['role']): EndoMesh {
    return { nodes: [...this.layers[layer].children] as THREE.Mesh[], colour: new THREE.Color(), role, visible: true, look: 'tissue' };
  }

  private applyScope(): void {
    if (!this.active) return;
    const p = this.pose();
    this.shaft.position.copy(p.tip);
    this.shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p.dir.clone().negate());
    this.shaft.scale.set(1, this.scope.depth + 30, 1);
    this.viewer.setEndoscope(this.config());
    this.renderScope();
    this.scopeMoved();
  }

  /** The readout again (the viewer reports when the tip goes in or out of the air). */
  scopeMoved(): void {
    if (this.active && this.vol && !this.pressing) this.readout(this.drilling && this.centre ? this.vol.clearance(this.centre) : null);
  }

  private setScope(fn: (s: Scope) => void): void {
    fn(this.scope);
    const s = this.scope;
    // along its way, no further than the tissue ahead lets it (the burr opens the way)
    const path = this.paths[s.side];
    const want = Math.max(0, Math.min(path.length, Math.round(s.depth * 4) / 4));
    const reach = this.vol ? path.reach(this.vol, s.yaw, s.pitch) : path.length;
    this.blocked = want > reach;
    s.depth = Math.min(want, reach);
    s.yaw = Math.max(-AIM_MAX_DEG, Math.min(AIM_MAX_DEG, s.yaw));
    s.pitch = Math.max(-AIM_MAX_DEG, Math.min(AIM_MAX_DEG, s.pitch));
    s.roll = ((s.roll + 540) % 360) - 180;
    this.applyScope();
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.active || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
      if (!(t instanceof HTMLInputElement && t.type === 'range')) return;
    }
    const k = e.key.toLowerCase();
    const moves: Record<string, (s: Scope) => void> = {
      arrowleft: (s) => { s.yaw += 2; }, arrowright: (s) => { s.yaw -= 2; }, arrowup: (s) => { s.pitch += 2; }, arrowdown: (s) => { s.pitch -= 2; },
      w: (s) => { s.depth += 1; }, s: (s) => { s.depth -= 1; }, q: (s) => { s.roll -= 10; }, e: (s) => { s.roll += 10; },
    };
    if (k === 'z' && (e.ctrlKey || e.metaKey)) return;
    const f = moves[k];
    if (!f) return;
    e.preventDefault();
    this.setScope(f);
  }

  // ---------------------------------------------------------------- the panel
  private sliders: Partial<Record<keyof Scope, { input: HTMLInputElement; out: HTMLElement }>> = {};

  private build(): void {
    clear(this.el);
    const sc = this.scope;
    const rateOut = h('output', {}, `${this.rate} mm/s`);
    const slider = (key: 'depth' | 'yaw' | 'pitch' | 'roll', label: string, lo: number, hi: number, step: number, unit: string) => {
      const out = h('output', {}, '');
      const input = h('input', { type: 'range', min: lo, max: hi, step, value: sc[key], 'aria-label': label,
        oninput: (e: Event) => this.setScope((s) => { s[key] = parseFloat((e.target as HTMLInputElement).value); }) }) as HTMLInputElement;
      this.sliders[key] = { input, out };
      out.dataset.unit = unit;
      return h('label', { class: 'range scope-range' }, h('span', {}, `${label} `, out), input);
    };
    this.el.append(
      h('p', {}, 'A 0° endoscope through one nostril, from as far forward as this CT reaches: in along the nasal cavity to the opening of the sphenoid sinus, then on towards the sella as the way is opened. In its view, what lies behind the thin walls shows through (the carotids, the optic nerves).'),
      h('p', { class: 'aside' }, 'In the scope’s view: drag to turn it, the wheel to move it in and out. Keys: the arrows turn it, W and S move it, Q and E rotate the view.'),
      chips<EndoSide>([['R', 'Right nostril'], ['L', 'Left nostril']], sc.side, (v) => { this.setScope((s) => { s.side = v; s.depth = START_MM; }); this.build(); }, { label: 'Nostril' }),
      slider('depth', 'In', 0, Math.floor(this.paths[sc.side].length), 0.25, ' mm'),
      slider('yaw', 'Turned to the side', -AIM_MAX_DEG, AIM_MAX_DEG, 1, '°'),
      slider('pitch', 'Up or down', -AIM_MAX_DEG, AIM_MAX_DEG, 1, '°'),
      slider('roll', 'View rotated', -180, 180, 5, '°'),
      h('div', { class: 'chips' },
        h('button', { type: 'button', class: 'chip', 'aria-pressed': String(sc.big), onclick: () => { this.setScope((s) => { s.big = !s.big; }); this.build(); } }, sc.big ? 'Endoscope view: big' : 'Endoscope view: inset'),
        h('button', { type: 'button', class: 'chip', onclick: () => { this.setScope((s) => { s.depth = START_MM; s.yaw = 0; s.pitch = 0; s.roll = 0; }); } }, 'Back to the start')),
      h('h4', {}, 'X-ray vision'),
      chips<XrayId>(XRAY.map(([k, label]) => [k, label]), [...this.xray], (v) => {
        if (this.xray.has(v)) this.xray.delete(v); else this.xray.add(v);
        this.applyScope();
        this.build();
      }, { label: 'X-ray vision' }),
      h('p', { class: 'aside' }, 'Shows these in the scope’s view through whatever lies in front of them (see-through, in their colours), as navigation would place them; without it they show only through thin walls.'),
      h('h4', {}, 'Opening the way'),
      h('ol', { class: 'plain endo-steps' }, ...ENDONASAL.pieces.map((pc) => {
        const gone = !!this.vol?.removed.has(pc.id);
        return h('li', {}, h('button', {
          type: 'button', class: 'chip', 'aria-pressed': String(gone), disabled: !this.vol,
          title: gone ? 'Put it back' : 'Take it away',
          onclick: () => this.togglePiece(pc.id),
          onmouseenter: () => { if (!gone) this.setHovered(pc); }, onmouseleave: () => this.setHovered(null),
        }, `${pc.label}. ${pc.name}`, gone ? ' — taken away' : ''));
      })),
      h('p', { class: 'aside' }, 'Click a piece in the scope’s view (it is tinted blue when pointed at), or its step here, to take it away: in the order of the operation or as you like. A step taken away is put back by clicking it again. Each piece stops short of the carotids and the nerves; opening the dura over the sella shows the hypophysis.'),
      h('div', { class: 'chips' },
        h('button', { type: 'button', class: 'chip', onclick: () => this.resetBone() }, 'Put everything back')),
      // the burr, once the sinus is open (its septa taken away): for what the steps do not take
      ...(this.drillOffered() ? [
        h('h4', {}, 'Drilling'),
        chips<'remove' | 'drill'>([['remove', 'Step by step'], ['drill', 'Drill']], this.drilling ? 'drill' : 'remove',
          (v) => { this.setDrilling(v === 'drill'); this.build(); }, { label: 'What the pointer does' }),
        ...(this.drilling ? [
          h('label', { class: 'range scope-range' }, h('span', {}, 'Drill speed ', rateOut),
            h('input', { type: 'range', min: BURR_RATE.min, max: BURR_RATE.max, step: 1, value: this.rate, 'aria-label': 'Drill speed',
              oninput: (e: Event) => { this.rate = parseFloat((e.target as HTMLInputElement).value); rateOut.textContent = `${this.rate} mm/s`; } })),
          h('div', { class: 'chips' }, h('button', { type: 'button', class: 'chip', disabled: !this.undo.length, onclick: () => this.undoStroke() }, 'Undo the last drilling')),
          h('p', { class: 'aside' }, `Point at what the scope sees (or at the 3D view) and hold the left button to drill in along that line, with a round ${ENDO_BURR_MM}-mm burr; it takes bone and lining away down to the carotids’ wall (never into them), and stops short of the nerves, the hypophysis and the brain (it goes through the cavernous sinus’s venous space). In the scope’s view the right button turns the scope.`),
        ] : [h('p', { class: 'aside' }, 'The sinus is open: the burr can take away what the steps do not, down to the carotids’ wall (an exercise in anatomy).')]),
      ] : []),
      this.out,
      this.measured());
    this.renderScope();
    this.readout(this.centre && this.vol ? this.vol.clearance(this.centre) : null);
  }

  private renderScope(): void {
    for (const [k, v] of Object.entries(this.sliders) as [keyof Scope, { input: HTMLInputElement; out: HTMLElement }][]) {
      const val = this.scope[k] as number;
      if (document.activeElement !== v.input) v.input.value = String(val);
      v.out.textContent = `${k === 'depth' ? fmtMm(val) : Math.round(val)}${v.out.dataset.unit}`;
    }
  }

  /** What is measured on this CT: the sinus, the carotids' distance through the sella. */
  private measured(): Node {
    const s = ENDONASAL.sinus, icd = ENDONASAL.intercarotid;
    const narrow = icd.length ? icd.reduce((a, b) => (b.mm < a.mm ? b : a)) : null;
    return h('div', { class: 'aside' },
      h('h4', {}, 'Measured on this CT'),
      h('ul', { class: 'plain' },
        s.volumeMl !== undefined ? h('li', {}, `Sphenoid sinus: ${fmtMm(s.volumeMl)} ml of air${s.backMm !== undefined && s.backMm < 0 ? `, reaching ${fmtMm(-s.backMm)} mm behind the front of the sella (under the sella: the sellar type)` : ''}${s.opensToNose === false ? '; its opening into the nose is narrower than 1.5 mm on this CT (closed for the scope)' : ''}.`) : '',
        h('li', {}, `The hypophysis as modelled in this fossa: ${fmtMm(ENDONASAL.hypophysis.gland.widthMm)} mm across, ${fmtMm(ENDONASAL.hypophysis.gland.lengthMm)} mm front to back, ${fmtMm(ENDONASAL.hypophysis.gland.heightMm)} mm high (${Math.round(ENDONASAL.hypophysis.gland.mm3)} mm³), the posterior lobe ${Math.round(ENDONASAL.hypophysis.neuroMm3)} mm³ of it.`),
        narrow ? h('li', {}, `The carotids are ${fmtMm(narrow.mm)} mm apart at their nearest through the sella (${fmtMm(narrow.z)} mm above the fossa), ${icd.map((x) => fmtMm(x.mm)).join(', ')} mm at heights ${icd[0].z} to ${icd[icd.length - 1].z} mm.`) : ''),
      h('h4', {}, 'How it is drawn'),
      h('ul', { class: 'plain' },
        h('li', {}, `The lining is this CT’s boundary between air and tissue (${Math.round(ENDONASAL.params.airHu)} HU, smoothed as the bone is): mucosa over bone where the CT shows it, the bone where it does not; holes in the thinnest walls, where the CT’s values dip under that level across less than a millimetre, are closed.`),
        h('li', {}, `The scan reaches only the back of the nasal cavity, so the scope starts there, not at the nostril. Its way through the nose is the path along the nasal cavity (TotalSegmentator’s, of this CT) with the most room, to the sinus’s opening; the CT’s passages are narrower than a scope, so the turbinates and the mucosa are pushed aside to ${fmtMm(ENDONASAL.corridorMm)} mm across along it (a drawing choice), the sinus’s front wall left for the burr. From near its end the scope goes straight on the way it looks, where it has a clear core ${fmtMm(2 * ENDO_SCOPE_ROOM_MM)} mm across (forgiving, so that one pass of the burr opens the way), and stops ${fmtMm(ENDO_STANDOFF_MM)} mm short of the tissue ahead.`),
        h('li', {}, 'The hypophysis is modelled in this CT’s fossa: what is not bone there, a millimetre inside the bone (the dura, both its layers, which a CT does not tell from the gland: a drawing choice), under the diaphragma sellae taken as the plane from the tuberculum to the top of the dorsum, its upper surface a little concave, no more than about 6 mm from the midline and clear of the carotids. Its posterior lobe (an ellipsoid at its back) and its stalk (a tube up and back to behind the chiasm) are drawn by rule; its colours where the dura is opened are rendering choices.'),
        h('li', {}, `The pieces taken away step by step are regions drawn by rule on this CT (distances to its air spaces, the hypophysis and the midline): the walls between air spaces go whole, the sellar floor, planum and clivus only their bone and the mucosa on it, the dura over the sella the layer between the opened floor and the gland; each keeps ${fmtMm(ENDONASAL.params.pieceClearMm.vessel ?? 0.8)} mm off the carotids and ${fmtMm(ENDONASAL.params.pieceClearMm.nerve ?? 0.6)} mm off the nerves. Where they end is a drawing choice, not a measured extent of the operation.`),
        h('li', {}, `The burr is a round one ${ENDO_BURR_MM} mm across that takes away whatever it reaches. It goes right down onto the wall of the arteries TopBrain labels on this CT, never into them (an exercise in anatomy: in surgery the bone over the carotid is thinned and lifted off with care, not drilled down onto it), where the wall laid bare is drawn red; and it stops ${fmtMm(ENDO_STOP_MM)} mm from the optic nerves (TotalSegmentator’s) and chiasm (fitted), nerves III–VI (routed through this CT), the hypophysis modelled in its fossa, and the fitted intercavernous sinuses and brain, these only where the CT shows soft tissue.`),
        h('li', {}, 'The view is drawn as the ventricles’ endoscope is: a wide field through a lens with barrel distortion, a light at the tip on wet walls, what lies close behind a thin wall showing through it; rendering choices, not measurements.')));
  }

  private readout(c: Record<EndoStop, number> | null): void {
    clear(this.out);
    if (!this.vol) return;
    const row = (k: EndoStop, mm: number) => {
      const cls = mm < TOUCH_MM ? 'risk' : mm < WARN_MM ? 'caution' : 'safe';
      return h('li', { class: `clear-${cls}` }, `${STOP_NAME[k]}: `, h('strong', {}, mm < TOUCH_MM ? 'touching' : mm > 20 ? 'more than 20 mm' : `${one(mm)} mm`));
    };
    const inside = this.vol.inAir(this.pose().tip);
    const path = this.paths[this.scope.side];
    const sinus = path.inSinus(this.scope.depth);
    // what is ahead of the scope: a piece still in place, the hypophysis, or other tissue
    const pose = this.pose();
    const at = this.vol.surface(new THREE.Ray(pose.tip, pose.dir), 6);
    const pc = at ? this.vol.pieceAt(at, pose.dir) : null;
    const gland = at ? this.vol.glandAt(at.clone().applyMatrix4(this.vol.toIjk), pose.dir.clone().negate()) : 0;
    const ahead = pc ? `the ${pc.name.toLowerCase()} is ahead: take it away to go on`
      : gland ? `the hypophysis is ahead (its ${gland === 1 ? 'anterior lobe' : gland === 2 ? 'posterior lobe' : 'stalk'})`
        : sinus ? 'the sinus’s wall is ahead (what is left is not taken away here)' : 'the nasal cavity’s wall is ahead';
    this.out.append(
      h('p', {}, inside ? `The scope’s tip is in air (${sinus ? 'the sphenoid sinus' : 'the nasal cavity'}).` : 'The scope’s tip is against or in tissue: draw it back.'),
      this.blocked ? h('p', { class: 'drill-stop' }, `The scope goes no further: ${ahead}.`) : '',
      this.stopped ? h('p', { class: 'drill-stop' }, `The burr rests against ${STOP_AT[this.stopped]}: it does not go past it.`) : '',
      this.drilling && c ? h('ul', { class: 'plain drill-clear' }, ...ENDO_STOPS.map((k) => row(k, c[k]))) : '',
      !this.drilling && this.hovered ? h('p', {}, 'Pointing at: ', h('strong', {}, this.hovered.name), ' (click to take it away).') : '',
      h('p', {}, `Taken away: ${Math.round(this.vol.removedMm3.bone)} mm³ of bone, ${Math.round(this.vol.removedMm3.soft)} mm³ of lining and soft tissue.`));
  }

  // ---------------------------------------------------------------- the meshes
  private paint = (layer: EndoLayer) => (_p: THREE.Vector3, n: THREE.Vector3, q: THREE.Vector3): [number, number, number] => {
    // (the lining's normals point into the tissue: at() takes them pointing out)
    const out_ = layer === 'solid' ? n.clone().negate() : n;
    const a = this.vol!.at(q, out_), c = this.colour;
    let out: THREE.Color;
    const gl = layer === 'solid' ? this.vol!.glandAt(q, out_) : 0;
    const dura = ENDONASAL.pieces.find((x) => x.id === 'dura');
    if (gl) out = gl === 1 ? c.adeno : gl === 2 ? c.neuro : c.stalk;
    else if (layer === 'solid' && (a.cut || a.opened) && this.vol!.vesselMm(q) < 0.4) out = c.artery;
    else if (layer === 'solid' && dura && !this.vol!.removed.has('dura') && this.vol!.pieceOf(q, out_) === dura.label) out = c.dura;
    else if (a.cut) out = c.cancellous.clone().lerp(c.cortex, THREE.MathUtils.clamp((a.hu - 250) / 550, 0, 1));
    else if (layer === 'bone') out = c.bone;
    // the lining: pink mucosa, paler where bone lies close under it
    else out = c.lining.clone().lerp(c.liningBone, THREE.MathUtils.clamp((a.hu - 100) / 500, 0, 1));
    if (layer === 'solid' && this.hovered && this.vol!.pieceOf(q, out_) === this.hovered.label) out = out.clone().lerp(c.pointed, 0.45);
    return [out.r, out.g, out.b];
  };

  private remeshAll(): void {
    const [cx, cy, cz] = this.vol!.chunks;
    for (const layer of ['bone', 'solid'] as EndoLayer[]) for (let i = 0; i < cx; i++) for (let j = 0; j < cy; j++) for (let k = 0; k < cz; k++) this.remesh(layer, i, j, k);
    this.viewer.invalidate();
  }

  private remesh(layer: EndoLayer, i: number, j: number, k: number): void {
    const key = `${layer}:${i}:${j}:${k}`;
    const old = this.chunks.get(key);
    const g = this.vol!.mesh(layer, i, j, k, this.paint(layer));
    if (old) { old.geometry.dispose(); if (!g) { old.removeFromParent(); this.chunks.delete(key); return; } old.geometry = g; return; }
    if (!g) return;
    const m = new THREE.Mesh(g, layer === 'bone' ? this.boneMat : this.liningMat);
    m.raycast = () => {};
    // the lining: drawn only by the endoscope (which shows its meshes while it draws; a hidden group would hide them)
    m.visible = layer === 'bone';
    this.chunks.set(key, m);
    this.layers[layer].add(m);
  }

  // ---------------------------------------------------------------- the burr (PointerTool)
  private setDrilling(on: boolean): void {
    this.drilling = on && !!this.vol;
    this.setHovered(null);
    this.burr.visible = false;
    this.stopped = null;
    this.viewer.invalidate();
  }

  private place(ray: THREE.Ray, into = 0): { c: THREE.Vector3; cut: boolean } | null {
    const hit = this.vol?.hit(ray, 70);
    this.stopped = hit?.stop ?? null;
    if (!hit) return null;
    return { c: hit.point.clone().addScaledVector(ray.direction, (hit.stop ? 0 : into) - ENDO_BURR_MM / 2), cut: !hit.stop };
  }

  private show(c: THREE.Vector3 | null, dir: THREE.Vector3 | null): void {
    this.centre = c;
    this.burr.visible = !!c;
    if (c && dir) {
      this.burr.position.copy(c);
      this.burr.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().negate());
    }
    this.readout(c ? this.vol!.clearance(c) : null);
    this.viewer.invalidate();
  }

  // the pointer (the viewer's PointerTool): in the scope's view a drag turns the scope and the wheel moves it in and out;
  // a click takes away the piece pointed at, or, drilling, the left button held drills (the right one turns the scope)
  wants(e: PointerEvent, inEndoscope: boolean): boolean {
    return inEndoscope || (this.drilling && e.button <= 0);
  }

  wheel(deltaY: number): void {
    this.wheelAcc -= deltaY * WHEEL_MM_PER_PX;
    if (Math.abs(this.wheelAcc) < 0.25) return;
    const step = Math.trunc(this.wheelAcc * 4) / 4;
    this.wheelAcc -= step;
    this.setScope((s) => { s.depth += step; });
  }

  hover(ray: THREE.Ray | null): void {
    this.ray = ray;
    if (this.drilling) {
      if (!this.pressing) this.show(ray ? this.place(ray)?.c ?? null : null, ray?.direction ?? null);
      return;
    }
    this.setHovered(ray ? this.pieceUnder(ray) : null);
  }

  down(ray: THREE.Ray, e?: PointerEvent): void {
    if (!this.vol) return;
    this.ray = ray;
    const button = e?.button ?? 0;
    if (this.drilling && button === 0) { this.startBurr(); return; }
    this.look = { x: e?.clientX ?? 0, y: e?.clientY ?? 0, button, moved: false };
  }

  drag(ray: THREE.Ray, e?: PointerEvent): void {
    this.ray = ray;
    const l = this.look;
    if (!l || !e) return;
    const dx = e.clientX - l.x, dy = e.clientY - l.y;
    if (!l.moved && Math.hypot(dx, dy) < DRAG_PX) return;
    l.moved = true;
    l.x = e.clientX; l.y = e.clientY;
    this.turnBy(dx, dy);
  }

  up(): void {
    const l = this.look;
    this.look = null;
    if (l) {
      if (!l.moved && l.button === 0 && !this.drilling && this.ray) {
        const pc = this.pieceUnder(this.ray);
        if (pc) this.takeAway(pc.id);
      }
      return;
    }
    this.pressing = false;
    if (this.ray) this.hover(this.ray);
    this.viewer.setEndoscope(this.config());   // (the walls changed: the scope's view and exposure follow)
    this.build();   // (its undo can be taken now)
  }

  /** Turn the scope as the pointer moved (px): to the right, it looks to the right of its view, as the view is rolled. */
  private turnBy(dx: number, dy: number): void {
    const p = this.pose(), vert = new THREE.Vector3(0, 0, 1);
    const right = new THREE.Vector3().crossVectors(p.dir, p.up).normalize();
    const k = THREE.MathUtils.degToRad(LOOK_DEG_PER_PX);
    const delta = right.multiplyScalar(dx * k).addScaledVector(p.up, -dy * k);
    // the change of the way it looks for a degree of yaw (about the vertical) and of pitch (about the horizontal across)
    const dYaw = new THREE.Vector3().crossVectors(vert, p.dir);
    const side = new THREE.Vector3().crossVectors(p.dir, vert).normalize();
    const dPitch = new THREE.Vector3().crossVectors(side, p.dir);
    const deg = THREE.MathUtils.radToDeg;
    this.setScope((s) => {
      if (dYaw.lengthSq() > 1e-6) s.yaw += deg(delta.dot(dYaw) / dYaw.lengthSq());
      s.pitch += deg(delta.dot(dPitch) / Math.max(dPitch.lengthSq(), 1e-6));
    });
  }

  /** The piece still in place where a ray meets the lining. */
  private pieceUnder(ray: THREE.Ray): EndoPiece | null {
    const hit = this.vol?.surface(ray, 70);
    return hit ? this.vol!.pieceAt(hit, ray.direction.clone().normalize()) : null;
  }

  /** Point at a piece: tinted in the scope's view, named in the readout. */
  private setHovered(pc: EndoPiece | null): void {
    if (pc?.id === this.hovered?.id) return;
    const was = this.hovered;
    this.hovered = pc;
    if (this.vol) {
      const keys = new Set<string>();
      for (const id of [was?.id, pc?.id]) if (id) for (const [i, j, k] of this.vol.pieceChunks(id)) keys.add(`${i}:${j}:${k}`);
      for (const key of keys) { const [i, j, k] = key.split(':').map(Number); this.remesh('solid', i, j, k); }
      this.viewer.invalidate();
    }
    this.readout(null);
  }

  /** The burr is offered once the sinus is open (its septa taken away). */
  private drillOffered(): boolean {
    return !!this.vol?.removed.has('septa');
  }

  /** Undo the last drilling (the pieces as they were then too). */
  private undoStroke(): void {
    const s = this.undo.pop();
    if (!s || !this.vol) return;
    this.vol.restore(s);
    this.remeshAll();
    this.setScope(() => undefined);   // (back out of what closed again)
    this.build();
  }

  /** Take a piece away, or put it back if it was: the meshes, the scope's view and the readout follow. */
  private togglePiece(id: string): void {
    if (this.vol?.removed.has(id)) this.putBack(id); else this.takeAway(id);
  }

  private putBack(id: string): void {
    const vol = this.vol;
    const box = vol?.putBack(id);
    if (!vol || !box) return;
    for (const [i, j, k] of vol.chunksOf(box[0], box[1])) { this.remesh('bone', i, j, k); this.remesh('solid', i, j, k); }
    if (!this.drillOffered()) this.setDrilling(false);
    this.setScope(() => undefined);   // (back out of what is there again)
    this.build();
  }

  /** Take a piece away (its bone and the mucosa on it): the meshes, the scope's view and the readout follow. */
  private takeAway(id: string): void {
    const vol = this.vol;
    if (!vol || vol.removed.has(id)) return;
    const was = this.hovered;
    this.hovered = null;
    const box = vol.removePiece(id);
    const chunks = new Map<string, [number, number, number]>();
    if (box) for (const c of vol.chunksOf(box[0], box[1])) chunks.set(c.join(':'), c);
    if (was) for (const c of vol.pieceChunks(was.id)) chunks.set(c.join(':'), c);
    for (const [i, j, k] of chunks.values()) { this.remesh('bone', i, j, k); this.remesh('solid', i, j, k); }
    this.viewer.setEndoscope(this.config());
    this.build();
  }

  private startBurr(): void {
    const vol = this.vol!;
    this.pressing = true;
    this.undo.push(vol.snapshot());
    if (this.undo.length > UNDO) this.undo.shift();
    this.last = performance.now();
    let due = 0;
    const tick = () => {
      if (!this.pressing || !this.drilling) return;
      const now = performance.now(), dt = Math.min((now - this.last) / 1000, 0.2);
      this.last = now;
      due += this.rate * dt;
      if (this.ray && due >= ENDO_STEP_MM) { this.drillAt(this.ray, due); due = 0; } else if (this.ray) this.show(this.place(this.ray)?.c ?? null, this.ray.direction);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /** One step: the burr pushed `mm` into what it touches along the ray, its sphere cut out of bone and lining. */
  drillAt(ray: THREE.Ray, mm: number): void {
    const vol = this.vol!;
    const p = this.place(ray, mm);
    if (!p) { this.show(null, null); return; }
    if (p.cut) {
      const box = vol.carve(p.c);
      if (box) for (const [i, j, k] of vol.chunksOf(box[0], box[1])) { this.remesh('bone', i, j, k); this.remesh('solid', i, j, k); }
    }
    this.show(p.c, ray.direction);
  }

  /** Put everything back as the CT has it. */
  private resetBone(): void {
    if (!this.vol) return;
    this.vol.reset();
    this.undo = [];
    this.setDrilling(false);
    this.remeshAll();
    this.setScope(() => undefined);   // (back out of what closed again)
    this.build();
  }
}
