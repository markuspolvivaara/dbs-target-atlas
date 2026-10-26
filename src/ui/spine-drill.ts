import * as THREE from 'three';
import { SP, SP_REFS } from '../spine';
import { ACDF_DRILL_STATEMENTS, FORAMINOTOMY_STATEMENTS, LAMINECTOMY_STATEMENTS, LAMINOPLASTY_STATEMENTS, OVER_THE_TOP_STATEMENTS, SPLIT_STATEMENTS, type Statement } from '../spine/content';
import { BURR_MM_BY_REGION, HINGE_MAX_MM, BURR_RATE_MM_S, BURR_RATE_RANGE, BURR_STEP_MM, drillPairFor, DrillVolume, type Clearance, type DrillPair, type DrillSnapshot, type Osteotomy, type Structure } from '../spine/drill';
import { DRILL_MODES, type DrillMode, type SpineState } from '../spine/state';
import type { PointerTool, Viewer } from '../viewer/Viewer';
import { h } from './h';
import { refLinksFrom } from './reflinks';
import { paletteFor, resolvedTheme, storedTheme } from './theme';
import { clear } from './widgets';

type Update = (fn: (s: SpineState) => void, opts?: { camera?: boolean }) => void;
/** clearances (mm) under which the readout warns, and under which the burr touches */
const WARN_MM = 1.5, TOUCH_MM = 0.25;
/** strokes kept for undo (each a copy of the bone fields) */
const UNDO = 8;
/** an over-the-top decompression's view: from behind, turned this far towards the approach side (deg; a drawing choice) */
const OVER_THE_TOP_TURN_DEG = 15;
const one = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

/** each approach's name, and its name in the box's summary */
export const DRILL_TEXT: Record<DrillMode, { label: string; summary: string }> = {
  foraminotomy: { label: 'Posterior foraminotomy', summary: 'posterior foraminotomy' },
  acdf: { label: 'Anterior discectomy (ACDF)', summary: 'anterior discectomy' },
  lamEnBloc: { label: 'Laminectomy en bloc', summary: 'laminectomy en bloc' },
  lamPiecemeal: { label: 'Laminectomy piece by piece', summary: 'laminectomy piece by piece' },
  laminoplasty: { label: 'Open-door laminoplasty', summary: 'open-door laminoplasty' },
  overTheTop: { label: 'Over-the-top decompression', summary: 'over-the-top decompression' },
  spSplit: { label: 'Spinous process split', summary: 'spinous process-splitting decompression' },
};
/** the approaches on the selected vertebra alone */
const isLam = (m: DrillMode | null) => m === 'lamEnBloc' || m === 'lamPiecemeal' || m === 'laminoplasty';
/** the approaches where bone cut loose becomes a piece of its own */
const PIECES = new Set<DrillMode>(['lamEnBloc', 'lamPiecemeal', 'laminoplasty', 'overTheTop', 'spSplit']);
/** each slider's name */
const SPREAD_LABEL: Partial<Record<DrillMode, string>> = { acdf: 'Distraction', spSplit: 'Halves drawn apart', laminoplasty: 'Door opened' };
/** where a laminoplasty's door is first opened to when it is freed (deg): somewhere to start, the slider then sets it */
const DOOR_START_DEG = 30;

/** The middle of the two vertebrae, and the spine's direction there (from the lower to the upper). */
function pairAxis(pair: DrillPair): { centre: THREE.Vector3; up: THREE.Vector3 } {
  const [a, b] = [pair.upper, pair.lower].map((id) => new THREE.Vector3(...(SP.get(id)?.centroid?.L ?? [0, 0, 0])));
  return { centre: a.clone().add(b).multiplyScalar(0.5), up: a.clone().sub(b).normalize() };
}

/** The view along the endplates (square to the spine's direction there): from straight in front onto the middle of the
 * two vertebrae (a discectomy) or from behind (a laminectomy: onto the upper vertebra alone; an over-the-top
 * decompression: turned towards its approach side). */
function drillView(pair: DrillPair, mode: DrillMode, side: 'L' | 'R'): SpineState['cam'] {
  const { centre, up } = pairAxis(pair);
  const t = isLam(mode) ? new THREE.Vector3(...pair.landmarks[0].body) : centre;
  const fwd = new THREE.Vector3(0, 1, 0).addScaledVector(up, -up.y).normalize();
  const dir = fwd.clone().multiplyScalar(mode === 'acdf' ? 1 : -1);
  if (mode === 'overTheTop') {
    const right = new THREE.Vector3().crossVectors(fwd, up).normalize();   // the frame's +x (the patient's right)
    dir.addScaledVector(right, (side === 'R' ? 1 : -1) * Math.tan(THREE.MathUtils.degToRad(OVER_THE_TOP_TURN_DEG))).normalize();
  }
  const eye = t.clone().addScaledVector(dir, pair.region === 'lumbar' ? 230 : 140);
  return { preset: null, pos: [eye.x, eye.y, eye.z], tgt: [t.x, t.y, t.z] };
}

/**
 * Drilling a pair of vertebrae: the bone the drill draws in place of them (at a laminectomy, of the upper alone), a
 * round burr where the pointer is, held down to drill in along the line of sight, and its clearance to the dural sac,
 * the roots and the vertebral arteries. Bone cut loose from its vertebra can be lifted off, or (the halves of a split
 * spinous process) drawn apart. The drilled bone of each pair is kept while the page is open.
 */
export class DrillPanel implements PointerTool {
  readonly el = h('div', { class: 'drill' });
  private readonly out = h('div', { class: 'drill-out', 'aria-live': 'polite' });
  private readonly actions = h('div', { class: 'drill-actions' });
  private vols = new Map<string, Promise<DrillVolume>>();
  private vol: DrillVolume | null = null;
  private pair: DrillPair | null = null;
  private mode: DrillMode | null = null;
  private active = false;
  private group = new THREE.Group();
  /** each layer's surface (a vertebra, or a piece cut loose), moved where the layer is drawn */
  private lgroups: THREE.Group[] = [];
  private spreadOut = h('output', {}, '0 mm');
  private spreadIn: HTMLInputElement | null = null;
  private chunks = new Map<string, THREE.Mesh>();
  private mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0 });
  private burr: THREE.Group;
  private burrHead: THREE.Mesh;
  private burrShaft: THREE.Mesh;
  /** how fast the burr goes in (mm a second), per region, as the slider last set it */
  private rate: Record<'cervical' | 'lumbar', number> = { ...BURR_RATE_MM_S };
  private ray: THREE.Ray | null = null;
  private pressing = false;
  private last = 0;
  private centre: THREE.Vector3 | null = null;
  private undo: DrillSnapshot[] = [];
  private colours!: Record<'bone' | 'cancellous' | 'cortex' | 'dura' | 'root' | 'artery', THREE.Color>;
  private key = '';
  private side: 'L' | 'R' = 'L';

  constructor(private update: Update, private viewer: Viewer) {
    // the burr: a diamond burr's round head and its shaft back along the line of sight
    this.burr = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: 0xc9ccd1, roughness: 0.3, metalness: 0.7, transparent: true, opacity: 0.85 });
    // (a unit head, sized to the region's burr when drilling starts)
    this.burrHead = new THREE.Mesh(new THREE.SphereGeometry(0.5, 28, 18), steel);
    this.burrShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 30, 16), steel);
    this.sizeBurr(BURR_MM_BY_REGION.cervical);
    this.burr.add(this.burrHead, this.burrShaft);
    this.burr.visible = false;
    this.group.add(this.burr);
    window.addEventListener('keydown', (e) => {
      if (!this.active || !(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
      e.preventDefault();
      this.undoStroke();
    });
  }

  private sizeBurr(mm: number): void {
    this.burrHead.scale.setScalar(mm);
    this.burrShaft.position.y = 15 + mm / 2 - 0.5;
  }

  // ---------------------------------------------------------------- the panel
  render(s: SpineState): void {
    const p = drillPairFor(s.level);
    const pair = p && p.region === s.region ? p : null;
    const mode = pair ? s.drill : null;
    const key = `${pair?.id}|${mode}`;
    if (key !== this.key || s.drillSide !== this.side) {
      const restart = key !== this.key;
      this.key = key;
      this.mode = mode;
      this.side = s.drillSide;
      this.build(pair, mode, s);
      if (restart) { if (mode && pair) void this.start(pair, mode); else this.stop(); }
    }
    this.spread(pair, mode && DRILL_MODES[mode].spread ? s.distract : 0);
  }

  /** At a discectomy, the two vertebrae drawn `mm` apart along the spine (each moved half of it); at a spinous process
   * split, its halves drawn `mm` apart to the sides; at a laminoplasty, the door opened `mm` degrees. */
  private mm = 0;
  private spread(pair: DrillPair | null, mm: number): void {
    this.mm = mm;
    if (this.spreadIn && document.activeElement !== this.spreadIn) this.spreadIn.value = String(mm);
    this.spreadOut.textContent = this.mode && DRILL_MODES[this.mode].unit === '°' ? `${Math.round(mm)}°` : `${one(mm)} mm`;
    if (!pair || !this.vol) return;
    const vol = this.vol;
    const up = pairAxis(pair).up;
    const d = this.mode === 'acdf' ? mm : 0;
    vol.offsets[0].copy(up).multiplyScalar(d / 2);
    vol.offsets[1].copy(up).multiplyScalar(-d / 2);
    vol.layers.forEach((L, l) => {
      L.offset.set(0, 0, 0);
      if (this.mode === 'spSplit' && L.piece && L.centre) {
        const at = vol.spinousAt(L.vertebra, L.centre);
        if (at.front < 0 && Math.abs(at.across) > 1) L.offset.copy(new THREE.Vector3(...pair.landmarks[L.vertebra].axes[0])).multiplyScalar(Math.sign(at.across) * mm / 2);
      }
      L.angle = this.mode === 'laminoplasty' && L.hinge ? THREE.MathUtils.degToRad(mm) : 0;
      const g = this.lgroups[l];
      if (g) { g.matrix.copy(vol.place(l)); g.matrixWorldNeedsUpdate = true; }
    });
    this.viewer.invalidate();
  }

  /** the approach chosen before drilling starts, per region */
  private pending: Record<'cervical' | 'lumbar', DrillMode> = { cervical: 'foraminotomy', lumbar: 'overTheTop' };

  private build(pair: DrillPair | null, mode: DrillMode | null, s: SpineState): void {
    clear(this.el);
    this.spreadIn = null;
    if (!pair) return;
    const up = SP.get(pair.upper)?.level ?? '', lo = SP.get(pair.lower)?.level ?? '';
    const root = SP.get(pair.root)?.name ?? pair.root;
    const BURR_MM = BURR_MM_BY_REGION[pair.region];
    const st = (x: Statement) => h('p', { class: 'aside' }, x.text, x.refIds.length ? ' ' : '', refLinksFrom(SP_REFS, x.refIds));
    // starting, or changing the approach: its view, the vertebral artery shown, no screw or cut
    const go = (m: DrillMode | null, side = s.drillSide) => this.update((x) => {
      x.drill = m;
      x.distract = 0;
      x.drillSide = side;
      if (m) { x.layers.vessels = { on: true, opacity: x.layers.vessels?.opacity ?? 1 }; x.cam = drillView(pair, m, side); x.screw = null; x.cut = 'none'; }
    }, { camera: !!m });
    const pick = mode ?? this.pending[pair.region];
    const chip = (m: DrillMode) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(pick === m),
      onclick: () => { if (mode) go(m); else { this.pending[pair.region] = m; this.build(pair, null, s); } } }, DRILL_TEXT[m].label);
    const modes = (Object.keys(DRILL_MODES) as DrillMode[]).filter((m) => DRILL_MODES[m].region === pair.region);
    const spread = DRILL_MODES[pick].spread;
    if (spread) {
      this.spreadIn = h('input', { type: 'range', min: 0, max: spread[0], step: spread[1], value: s.distract, 'aria-label': SPREAD_LABEL[pick],
        oninput: (e: Event) => this.update((x) => { x.distract = parseFloat((e.target as HTMLInputElement).value); }) }) as HTMLInputElement;
    }
    const region = pair.region, rateOut = h('output', {}, `${this.rate[region]} mm/s`);
    const rateIn = h('input', { type: 'range', min: BURR_RATE_RANGE[0], max: BURR_RATE_RANGE[1], step: BURR_RATE_RANGE[2], value: this.rate[region], 'aria-label': 'Drill speed',
      oninput: (e: Event) => { this.rate[region] = parseFloat((e.target as HTMLInputElement).value); rateOut.textContent = `${this.rate[region]} mm/s`; } });
    const sideChip = (sd: 'L' | 'R') => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(s.drillSide === sd),
      onclick: () => (mode ? go(mode, sd) : this.update((x) => { x.drillSide = sd; })) },
      pick === 'laminoplasty' ? (sd === 'L' ? 'Open on the left' : 'Open on the right') : sd === 'L' ? 'From the left' : 'From the right');
    const what: Record<DrillMode, string> = {
      foraminotomy: `Drill the ${up}–${lo} foramen from behind, where the ${root.toLowerCase()} exits: the two vertebrae at once, with a round ${BURR_MM}-mm burr.`,
      acdf: `Drill the ${up}–${lo} disc space from the front, the disc taken out: the two vertebrae at once, with a round ${BURR_MM}-mm burr.`,
      lamEnBloc: `Take off the lamina of ${up} in one piece: drill a trough through each side, where the lamina meets the lateral mass, then lift it off with its spinous process. ${up} alone, with a round ${BURR_MM}-mm burr.`,
      lamPiecemeal: `Take off the spinous process of ${up}, then drill its laminae away. ${up} alone, with a round ${BURR_MM}-mm burr.`,
      laminoplasty: `Open the lamina of ${up} like a door: drill a trough through both cortices on the open side (${s.drillSide === 'L' ? 'left' : 'right'}), and one through the outer cortex only on the other, where the inner cortex is left as the hinge; then open it. ${up} alone, with a round ${BURR_MM}-mm burr.`,
      overTheTop: `Decompress ${up}–${lo} from one side: a laminotomy on the approach side, then over the top, under the base of the spinous process, to the other side’s lamina and lateral recess. The two vertebrae, with a round ${BURR_MM}-mm burr.`,
      spSplit: `Split the spinous process of ${up} in the midline and detach its base, draw the halves apart, then decompress ${up}–${lo} between them. The two vertebrae, with a round ${BURR_MM}-mm burr.`,
    };
    const statements: Record<DrillMode, Statement[]> = {
      foraminotomy: [FORAMINOTOMY_STATEMENTS.vpoint, FORAMINOTOMY_STATEMENTS.facet, FORAMINOTOMY_STATEMENTS.drawn],
      acdf: [ACDF_DRILL_STATEMENTS.distraction, ACDF_DRILL_STATEMENTS.lateral, ACDF_DRILL_STATEMENTS.drawn],
      lamEnBloc: [LAMINECTOMY_STATEMENTS.enBloc, LAMINECTOMY_STATEMENTS.piecemeal, LAMINECTOMY_STATEMENTS.drawn],
      lamPiecemeal: [LAMINECTOMY_STATEMENTS.piecemeal, LAMINECTOMY_STATEMENTS.enBloc, LAMINECTOMY_STATEMENTS.drawn],
      laminoplasty: [LAMINOPLASTY_STATEMENTS.technique, LAMINOPLASTY_STATEMENTS.angle, LAMINOPLASTY_STATEMENTS.drawn],
      overTheTop: [OVER_THE_TOP_STATEMENTS.technique, OVER_THE_TOP_STATEMENTS.drawn],
      spSplit: [SPLIT_STATEMENTS.technique, SPLIT_STATEMENTS.drawn],
    };
    this.el.append(...([
      h('div', { class: 'chips', role: 'group', 'aria-label': 'Approach' }, ...modes.map(chip)),
      h('p', {}, what[pick]),
      DRILL_MODES[pick].sided ? h('div', { class: 'chips', role: 'group', 'aria-label': pick === 'laminoplasty' ? 'Open side' : 'Approach side' }, sideChip('L'), sideChip('R')) : null,
      h('div', { class: 'chips' },
        h('button', { type: 'button', class: 'chip', 'aria-pressed': String(!!mode), onclick: () => go(mode ? null : pick) }, mode ? 'Stop drilling' : 'Start drilling'),
        mode ? h('button', { type: 'button', class: 'chip', onclick: () => this.undoStroke() }, 'Undo') : null,
        mode ? h('button', { type: 'button', class: 'chip', onclick: () => this.resetPair() }, 'Start the bone over') : null),
      mode ? this.actions : null,
      mode ? h('label', { class: 'range scope-range' }, h('span', {}, 'Drill speed ', rateOut), rateIn) : null,
      mode && this.spreadIn ? h('label', { class: 'range scope-range' }, h('span', {}, `${SPREAD_LABEL[pick]} `, this.spreadOut), this.spreadIn) : null,
      mode ? h('p', { class: 'aside' }, 'Point at the bone and hold the button to drill in along your line of sight; move to widen. The right button turns the view (with Shift: moves it), the wheel zooms; Ctrl+Z undoes a stroke.') : null,
      this.out,
      ...statements[pick].map(st)] as (Node | null)[]).filter((x): x is Node => x !== null));
    this.refreshActions();
    this.readout(null);
  }

  /** The buttons for what can be done besides drilling: lifting loose bone off, the rongeur's and osteotome's cuts. */
  private refreshActions(): void {
    clear(this.actions);
    const vol = this.vol, mode = this.mode;
    if (!this.active || !vol || !mode || !PIECES.has(mode)) return;
    const pieces = vol.pieces();
    const halves = mode === 'spSplit' ? pieces.filter((l) => { const L = vol.layers[l], a = vol.spinousAt(L.vertebra, L.centre!); return L.vertebra === 0 && a.front < 0; }) : [];
    const door = pieces.find((l) => vol.layers[l].hinge);
    const loose = pieces.filter((l) => !halves.includes(l) && l !== door);
    const mm3 = (ls: number[]) => Math.round(ls.reduce((a, l) => a + vol.layers[l].mm3, 0));
    const btn = (label: string, fn: () => void, enabled = true) => h('button', { type: 'button', class: 'chip', disabled: !enabled || undefined, onclick: fn }, label);
    const lvl = SP.get(this.pair!.upper)?.level ?? '';
    const rows: (Node | string)[] = [];
    if (mode === 'lamEnBloc') {
      const at = loose.length ? null : vol.attachment(0);
      const where = !at ? '' : at.L && at.R ? 'on both sides' : at.L ? 'on the left' : at.R ? 'on the right' : 'deep in the troughs or at their ends';
      rows.push(h('p', {}, loose.length ? `The lamina is free: ${mm3(loose)} mm³ of bone, with the spinous process.`
        : at ? `The lamina of ${lvl} is still joined ${where}: drill the troughs through.` : `The lamina of ${lvl} is off.`));
      if (loose.length || at) rows.push(h('div', { class: 'chips' }, btn('Lift the lamina off', () => this.lift(loose), loose.length > 0)));
    } else {
      const chips: Node[] = [];
      if (mode === 'lamPiecemeal') chips.push(btn('Take off the spinous process', () => this.osteotomy(['spinous']), vol.spinousLeft(0)));
      if (mode === 'laminoplasty') {
        const openSide = this.side === 'L' ? 'left' : 'right', hingeSide = this.side === 'L' ? 'right' : 'left';
        if (door !== undefined) {
          const hg = vol.layers[door].hinge!;
          rows.push(h('p', {}, `The door is free, hinged on the ${hg.axis.dot(new THREE.Vector3(...this.pair!.landmarks[0].axes[2])) > 0 ? 'right' : 'left'}: open it further or close it with the slider.`));
        } else {
          const at = vol.attachment(0);
          const openJoined = at ? (this.side === 'L' ? at.L : at.R) : false, hingeJoined = at ? (this.side === 'L' ? at.R : at.L) : false;
          rows.push(h('p', {}, !at ? `There is no lamina of ${lvl} left to open.`
            : `Open side (${openSide}): ${openJoined ? 'still joined' : 'through'}. Hinge side (${hingeSide}): ${hingeJoined ? `joined, the hinge (the door opens once at most ${HINGE_MAX_MM} mm of bone is left under its trough)` : 'through as well'}.`),
          ...(this.doorWhy ? [h('p', { class: 'drill-stop' }, this.doorWhy)] : []));
          chips.push(btn('Open the door', () => this.openDoor(), !!at && !openJoined && hingeJoined));
        }
      }
      if (mode === 'spSplit') chips.push(btn('Split it in the midline', () => this.osteotomy(['split'])), btn('Detach its base', () => this.osteotomy(['base'])));
      if (loose.length) chips.push(btn(`Take out the loose bone (${mm3(loose)} mm³)`, () => this.lift(loose)));
      if (mode === 'spSplit') rows.push(h('p', {}, halves.length >= 2 ? `The spinous process of ${lvl} is split and detached: ${halves.length} pieces, drawn apart with the slider.`
        : halves.length === 1 ? `The spinous process of ${lvl} is detached at its base but not yet split.` : `The spinous process of ${lvl} is still whole and joined to its laminae.`));
      if (chips.length) rows.push(h('div', { class: 'chips' }, ...chips));
    }
    this.actions.append(...rows);
  }

  /** The burr's clearances and the bone removed. */
  private readout(c: Clearance | null): void {
    clear(this.out);
    if (!this.active || !this.vol || !this.pair) return;
    const pair = this.pair, vol = this.vol;
    const name = (id: string) => SP.get(id)?.name ?? id;
    const row = (label: string, mm: number, schematic: boolean) => {
      const cls = mm < TOUCH_MM ? 'risk' : mm < WARN_MM ? 'caution' : 'safe';
      return h('li', { class: `clear-${cls}` }, `${label}${schematic ? ' (schematic)' : ''}: `,
        h('strong', {}, mm < TOUCH_MM ? 'touching' : mm > 20 ? 'more than 20 mm' : `${one(mm)} mm`));
    };
    const against = { dura: 'the dural sac', root: `the ${(SP.get(pair.root)?.name ?? 'root').toLowerCase()} or another root (schematic)`, artery: 'the vertebral artery (schematic)' };
    const removed = [pair.upper, pair.lower].map((id, v) => (vol.active[v] ? `${SP.get(id)?.level} ${Math.round(vol.removedMm3[v])} mm³` : null)).filter(Boolean);
    this.out.append(
      this.stopped ? h('p', { class: 'drill-stop' }, `The burr rests against ${against[this.stopped]}: it does not drill past it to the bone behind.`) : '',
      c ? h('ul', { class: 'plain drill-clear' },
        row('Dural sac', c.dura, false), row(name(pair.root), c.root, true), pair.artery ? row('Vertebral artery', c.artery, true) : '')
        : h('p', { class: 'aside' }, `Point at the bone to see how near the burr is to the dural sac${pair.artery ? ', the roots and the vertebral artery' : ' and the roots'}.`),
      h('p', {}, `Bone removed: ${removed.join(', ')}.`));
  }

  // ---------------------------------------------------------------- the bone
  private async start(pair: DrillPair, mode: DrillMode): Promise<void> {
    const key = this.key;
    let p = this.vols.get(pair.id);
    if (!p) {
      p = DrillVolume.load(pair);
      p.catch(() => this.vols.delete(pair.id));
      this.vols.set(pair.id, p);
    }
    this.out.replaceChildren(h('p', { class: 'aside' }, 'Loading the bone…'));
    const vol = await p;
    if (this.key !== key) return;   // left meanwhile
    this.clearMeshes();
    this.vol = vol;
    this.pair = pair;
    vol.active[1] = !isLam(mode);
    this.sizeBurr(vol.burrMm);
    this.active = true;
    this.undo = [];
    const pal = paletteFor(resolvedTheme(storedTheme()));
    const col = (hex: string) => new THREE.Color(hex);
    this.colours = { bone: col(pal.spBone), cancellous: col('#d99a86'), cortex: col('#efe7d4'), dura: col(pal.spCord), root: col(pal.spRoot), artery: col(pal.spArtery) };
    this.viewer.toolGroup.add(this.group);
    if (PIECES.has(mode)) vol.settle();
    this.rebuild();
    this.viewer.setPointerTool(this);
    this.readout(null);
  }

  private stop(): void {
    if (!this.active && !this.group.parent) return;
    this.active = false;
    this.pressing = false;
    this.viewer.setPointerTool(null);
    this.clearMeshes();
    this.burr.visible = false;
    this.viewer.toolGroup.remove(this.group);
    this.vol = null;
    this.viewer.invalidate();
  }

  private clearMeshes(): void {
    for (const m of this.chunks.values()) { m.removeFromParent(); m.geometry.dispose(); }
    this.chunks.clear();
    for (const g of this.lgroups) g.removeFromParent();
    this.lgroups = [];
  }

  /** Every layer's surface drawn afresh (after a piece is cut loose or lifted off, an undo, a new start). */
  private rebuild(): void {
    const vol = this.vol!;
    this.clearMeshes();
    this.lgroups = vol.layers.map(() => { const g = new THREE.Group(); g.matrixAutoUpdate = false; return g; });
    this.group.add(...this.lgroups);
    const [cx, cy, cz] = vol.chunks;
    vol.layers.forEach((_, l) => {
      if (!vol.live(l)) return;
      for (let i = 0; i < cx; i++) for (let j = 0; j < cy; j++) for (let k = 0; k < cz; k++) this.remesh(l, i, j, k);
    });
    this.spread(this.pair, this.mm);
    this.refreshActions();
    this.viewer.invalidate();
  }

  /** A vertex's colour: bone; where cut, the CT's density (cancellous pink to cortical ivory), and the colour of what
   * lies close under it. */
  private colour = (_p: THREE.Vector3, n: THREE.Vector3, q: THREE.Vector3): [number, number, number] => {
    const c = this.colours, a = this.vol!.at(q, n);
    if (!a.cut) return [c.bone.r, c.bone.g, c.bone.b];
    const out = c.cancellous.clone().lerp(c.cortex, THREE.MathUtils.clamp((a.hu - 250) / 550, 0, 1));
    let best = 0, tint = c.dura;
    for (const [d, t] of [[a.dura, c.dura], [a.root, c.root], [a.artery, c.artery]] as const) {
      const w = 0.75 * Math.exp(-Math.max(d - 0.3, 0) / 0.7);
      if (w > best) { best = w; tint = t; }
    }
    out.lerp(tint, best);
    return [out.r, out.g, out.b];
  };

  private remesh(l: number, i: number, j: number, k: number): void {
    const key = `${l}:${i}:${j}:${k}`;
    const old = this.chunks.get(key);
    const g = this.vol!.mesh(l, i, j, k, this.colour);
    if (old) { old.geometry.dispose(); if (!g) { old.removeFromParent(); this.chunks.delete(key); return; } old.geometry = g; return; }
    if (!g) return;
    const m = new THREE.Mesh(g, this.mat);
    m.raycast = () => {};
    this.chunks.set(key, m);
    this.lgroups[l].add(m);
  }

  private remember(): void {
    this.undo.push(this.vol!.snapshot());
    if (this.undo.length > UNDO) this.undo.shift();
  }

  private undoStroke(): void {
    const s = this.undo.pop();
    if (!s || !this.vol) return;
    this.vol.restore(s);
    this.rebuild();
    this.readout(this.centre ? this.vol.clearance(this.centre) : null);
  }

  private resetPair(): void {
    if (!this.vol) return;
    this.remember();
    this.vol.reset();
    if (this.mode && PIECES.has(this.mode)) this.vol.settle();
    this.rebuild();
    this.readout(null);
  }

  /** why the door did not open, the last time it was tried */
  private doorWhy = '';

  /** A laminoplasty's door freed and opened (if its troughs allow it). */
  private openDoor(): void {
    if (!this.vol) return;
    this.remember();
    const r = this.vol.openDoor(0, this.side);
    if (!r.ok) { this.undo.pop(); this.doorWhy = r.why; this.refreshActions(); return; }
    this.doorWhy = '';
    this.rebuild();
    if (!this.mm) this.update((x) => { x.distract = DOOR_START_DEG; });
    this.readout(null);
  }

  /** Loose pieces lifted off. */
  private lift(ls: number[]): void {
    if (!this.vol || !ls.length) return;
    this.remember();
    for (const l of ls) this.vol.lift(l);
    this.rebuild();
    this.readout(null);
  }

  /** The rongeur's or the osteotome's cuts at the upper vertebra's spinous process. */
  private osteotomy(kinds: Osteotomy[]): void {
    if (!this.vol) return;
    this.remember();
    for (const k of kinds) this.vol.osteotomy(0, k);
    this.vol.settle();
    this.rebuild();
    this.readout(null);
  }

  // ---------------------------------------------------------------- the burr (PointerTool)
  /** what stopped the burr last (the dural sac, a root, a vertebral artery), or null */
  private stopped: Structure | null = null;

  /** Where the burr sits for a ray: touching the first bone it meets (`into` it, drilling), or resting against the
   * dural sac, a root or a vertebral artery if that comes first (and then not going in); null if it meets neither. */
  private place(ray: THREE.Ray, into = 0): { c: THREE.Vector3; cut: boolean } | null {
    const hit = this.vol?.hit(ray);
    this.stopped = hit?.stop ?? null;
    if (!hit) return null;
    return { c: hit.point.clone().addScaledVector(ray.direction, (hit.stop ? 0 : into) - this.vol!.burrMm / 2), cut: !hit.stop };
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

  hover(ray: THREE.Ray | null): void {
    this.ray = ray;
    if (!this.active || this.pressing) return;
    this.show(ray ? this.place(ray)?.c ?? null : null, ray?.direction ?? null);
  }

  down(ray: THREE.Ray): void {
    if (!this.active || !this.vol) return;
    this.ray = ray;
    this.pressing = true;
    this.remember();
    this.last = performance.now();
    let due = 0;
    const tick = () => {
      if (!this.pressing || !this.active) return;
      const now = performance.now(), dt = Math.min((now - this.last) / 1000, 0.2);
      this.last = now;
      // the time held is banked, and cut in steps of BURR_STEP_MM; the burr follows the pointer meanwhile
      due += this.rate[this.pair?.region ?? 'cervical'] * dt;
      if (this.ray && due >= BURR_STEP_MM) { this.drillAt(this.ray, due); due = 0; }
      else if (this.ray) this.show(this.place(this.ray)?.c ?? null, this.ray.direction);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  drag(ray: THREE.Ray): void { this.ray = ray; }

  up(): void {
    const was = this.pressing;
    this.pressing = false;
    if (was) this.doorWhy = '';
    // bone the stroke cut loose becomes a piece of its own
    if (was && this.vol && this.mode && PIECES.has(this.mode)) { if (this.vol.settle()) { this.rebuild(); this.readout(null); } else this.refreshActions(); }
    if (this.ray) this.hover(this.ray);
  }

  /** One step of drilling: the burr pushed `mm` into the bone it touches along the ray, its sphere cut out. */
  private drillAt(ray: THREE.Ray, mm: number): void {
    const vol = this.vol!;
    const p = this.place(ray, mm);
    if (!p) { this.show(null, null); return; }
    if (p.cut) vol.carve(p.c).forEach((box, l) => { if (box) for (const [i, j, k] of vol.chunksOf(box[0], box[1])) this.remesh(l, i, j, k); });
    this.show(p.c, ray.direction);
  }
}
