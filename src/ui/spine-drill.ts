import * as THREE from 'three';
import { SP, SP_REFS } from '../spine';
import { FORAMINOTOMY_STATEMENTS, type Statement } from '../spine/content';
import { BURR_MM, BURR_RATE_MM_S, BURR_STEP_MM, drillPairFor, DrillVolume, type Clearance, type DrillPair, type Vertebra } from '../spine/drill';
import type { SpineState } from '../spine/state';
import type { PointerTool, Viewer } from '../viewer/Viewer';
import { h } from './h';
import { refLinksFrom } from './reflinks';
import { paletteFor, resolvedTheme, storedTheme } from './theme';
import { clear } from './widgets';

type Update = (fn: (s: SpineState) => void, opts?: { camera?: boolean }) => void;
/** clearances (mm) under which the readout warns, and under which the burr touches */
const WARN_MM = 1.5, TOUCH_MM = 0.25;
/** strokes kept for undo (each a copy of the two bone fields) */
const UNDO = 8;
const one = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

/** The view straight from behind (the frame's posterior, -y) onto the middle of the two vertebrae. */
function backView(pair: DrillPair): SpineState['cam'] {
  const c = [pair.upper, pair.lower].map((id) => SP.get(id)?.centroid?.L ?? [0, 0, 0]);
  const t = [0, 1, 2].map((k) => (c[0][k] + c[1][k]) / 2) as [number, number, number];
  return { preset: null, pos: [t[0], t[1] - 140, t[2]], tgt: t };
}

/**
 * Drilling a pair of cervical vertebrae (a posterior foraminotomy): the bone the drill draws in place of the two
 * vertebrae, a round burr where the pointer is, held down to drill in along the line of sight, and its clearance to the
 * dural sac, the roots and the vertebral arteries. The drilled bone of each pair is kept while the page is open.
 */
export class DrillPanel implements PointerTool {
  readonly el = h('div', { class: 'drill' });
  private readonly out = h('div', { class: 'drill-out', 'aria-live': 'polite' });
  private vols = new Map<string, Promise<DrillVolume>>();
  private vol: DrillVolume | null = null;
  private pair: DrillPair | null = null;
  private active = false;
  private group = new THREE.Group();
  private chunks = new Map<string, THREE.Mesh>();
  private mats: [THREE.MeshStandardMaterial, THREE.MeshStandardMaterial];
  private burr: THREE.Group;
  private ray: THREE.Ray | null = null;
  private pressing = false;
  private last = 0;
  private centre: THREE.Vector3 | null = null;
  private undo: ReturnType<DrillVolume['snapshot']>[] = [];
  private colours!: Record<'bone' | 'cancellous' | 'cortex' | 'dura' | 'root' | 'artery', THREE.Color>;
  private key = '';

  constructor(private update: Update, private viewer: Viewer) {
    this.mats = [0, 1].map(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0 })) as [THREE.MeshStandardMaterial, THREE.MeshStandardMaterial];
    // the burr: a diamond burr's round head and its shaft back along the line of sight
    this.burr = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: 0xc9ccd1, roughness: 0.3, metalness: 0.7, transparent: true, opacity: 0.85 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(BURR_MM / 2, 28, 18), steel);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 30, 16), steel);
    shaft.position.y = 15 + BURR_MM / 2 - 0.5;
    this.burr.add(head, shaft);
    this.burr.visible = false;
    this.group.add(this.burr);
    window.addEventListener('keydown', (e) => {
      if (!this.active || !(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
      e.preventDefault();
      this.undoStroke();
    });
  }

  // ---------------------------------------------------------------- the panel
  render(s: SpineState): void {
    const pair = s.region === 'cervical' ? drillPairFor(s.level) ?? null : null;
    const want = !!pair && s.drill;
    const key = `${pair?.id}|${want}`;
    if (key !== this.key) {
      this.key = key;
      this.build(pair, want);
      if (want && pair) void this.start(pair); else this.stop();
    }
  }

  private build(pair: DrillPair | null, on: boolean): void {
    clear(this.el);
    if (!pair) return;
    const up = SP.get(pair.upper)?.level ?? '', lo = SP.get(pair.lower)?.level ?? '';
    const root = SP.get(pair.root)?.name ?? pair.root;
    const st = (x: Statement) => h('p', { class: 'aside' }, x.text, x.refIds.length ? ' ' : '', refLinksFrom(SP_REFS, x.refIds));
    this.el.append(...([
      h('p', {}, `Drill the ${up}–${lo} foramen from behind, where the ${root.toLowerCase()} exits: the two vertebrae at once, with a round ${BURR_MM}-mm burr.`),
      h('div', { class: 'chips' },
        h('button', { type: 'button', class: 'chip', 'aria-pressed': String(on), onclick: () => this.update((x) => {
          x.drill = !on;
          if (!on) { x.layers.vessels = { on: true, opacity: x.layers.vessels?.opacity ?? 1 }; x.cam = backView(pair); x.screw = null; x.cut = 'none'; }
        }, { camera: !on }) }, on ? 'Stop drilling' : 'Start drilling'),
        on ? h('button', { type: 'button', class: 'chip', onclick: () => this.undoStroke() }, 'Undo') : null,
        on ? h('button', { type: 'button', class: 'chip', onclick: () => this.resetPair() }, 'Start the bone over') : null),
      on ? h('p', { class: 'aside' }, 'Point at the bone and hold the button to drill in along your line of sight; move to widen. The right button turns the view (with Shift: moves it), the wheel zooms; Ctrl+Z undoes a stroke.') : null,
      this.out,
      st(FORAMINOTOMY_STATEMENTS.vpoint), st(FORAMINOTOMY_STATEMENTS.facet), st(FORAMINOTOMY_STATEMENTS.drawn)] as (Node | null)[]).filter((x): x is Node => x !== null));
    this.readout(null);
  }

  /** The burr's clearances and the bone removed. */
  private readout(c: Clearance | null): void {
    clear(this.out);
    if (!this.active || !this.vol || !this.pair) return;
    const name = (id: string) => SP.get(id)?.name ?? id;
    const row = (label: string, mm: number, schematic: boolean) => {
      const cls = mm < TOUCH_MM ? 'risk' : mm < WARN_MM ? 'caution' : 'safe';
      return h('li', { class: `clear-${cls}` }, `${label}${schematic ? ' (schematic)' : ''}: `,
        h('strong', {}, mm < TOUCH_MM ? 'touching' : mm > 20 ? 'more than 20 mm' : `${one(mm)} mm`));
    };
    this.out.append(
      c ? h('ul', { class: 'plain drill-clear' },
        row('Dural sac', c.dura, false), row(name(this.pair.root), c.root, true), row('Vertebral artery', c.artery, true))
        : h('p', { class: 'aside' }, 'Point at the bone to see how near the burr is to the dural sac, the root and the vertebral artery.'),
      h('p', {}, `Bone removed: ${SP.get(this.pair.upper)?.level} ${Math.round(this.vol.removedMm3[0])} mm³, ${SP.get(this.pair.lower)?.level} ${Math.round(this.vol.removedMm3[1])} mm³.`));
  }

  // ---------------------------------------------------------------- the bone
  private async start(pair: DrillPair): Promise<void> {
    let p = this.vols.get(pair.id);
    if (!p) {
      p = DrillVolume.load(pair);
      p.catch(() => this.vols.delete(pair.id));
      this.vols.set(pair.id, p);
    }
    this.out.replaceChildren(h('p', { class: 'aside' }, 'Loading the bone…'));
    const vol = await p;
    if (this.key !== `${pair.id}|true`) return;   // left meanwhile
    this.vol = vol;
    this.pair = pair;
    this.active = true;
    this.undo = [];
    const pal = paletteFor(resolvedTheme(storedTheme()));
    const col = (hex: string) => new THREE.Color(hex);
    this.colours = { bone: col(pal.spBone), cancellous: col('#d99a86'), cortex: col('#efe7d4'), dura: col(pal.spCord), root: col(pal.spRoot), artery: col(pal.spArtery) };
    this.viewer.toolGroup.add(this.group);
    this.remeshAll();
    this.viewer.setPointerTool(this);
    this.readout(null);
    this.viewer.invalidate();
  }

  private stop(): void {
    if (!this.active && !this.group.parent) return;
    this.active = false;
    this.pressing = false;
    this.viewer.setPointerTool(null);
    for (const m of this.chunks.values()) { this.group.remove(m); m.geometry.dispose(); }
    this.chunks.clear();
    this.burr.visible = false;
    this.viewer.toolGroup.remove(this.group);
    this.vol = null;
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

  private remeshAll(): void {
    const [cx, cy, cz] = this.vol!.chunks;
    for (let i = 0; i < cx; i++) for (let j = 0; j < cy; j++) for (let k = 0; k < cz; k++) for (const v of [0, 1] as Vertebra[]) this.remesh(v, i, j, k);
  }

  private remesh(v: Vertebra, i: number, j: number, k: number): void {
    const key = `${v}:${i}:${j}:${k}`;
    const old = this.chunks.get(key);
    const g = this.vol!.mesh(v, i, j, k, this.colour);
    if (old) { old.geometry.dispose(); if (!g) { this.group.remove(old); this.chunks.delete(key); return; } old.geometry = g; return; }
    if (!g) return;
    const m = new THREE.Mesh(g, this.mats[v]);
    m.raycast = () => {};
    this.chunks.set(key, m);
    this.group.add(m);
  }

  private undoStroke(): void {
    const s = this.undo.pop();
    if (!s || !this.vol) return;
    this.vol.restore(s);
    this.remeshAll();
    this.readout(this.centre ? this.vol.clearance(this.centre) : null);
    this.viewer.invalidate();
  }

  private resetPair(): void {
    if (!this.vol) return;
    this.undo.push(this.vol.snapshot());
    if (this.undo.length > UNDO) this.undo.shift();
    this.vol.reset();
    this.remeshAll();
    this.readout(null);
    this.viewer.invalidate();
  }

  // ---------------------------------------------------------------- the burr (PointerTool)
  /** Where the burr sits for a ray: touching the first bone it meets, or null. */
  private place(ray: THREE.Ray, into = 0): THREE.Vector3 | null {
    const hit = this.vol?.hit(ray);
    if (!hit) return null;
    return hit.point.clone().addScaledVector(ray.direction, into - BURR_MM / 2);
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
    this.show(ray ? this.place(ray) : null, ray?.direction ?? null);
  }

  down(ray: THREE.Ray): void {
    if (!this.active || !this.vol) return;
    this.ray = ray;
    this.pressing = true;
    this.undo.push(this.vol.snapshot());
    if (this.undo.length > UNDO) this.undo.shift();
    this.last = performance.now();
    let due = 0;
    const tick = () => {
      if (!this.pressing || !this.active) return;
      const now = performance.now(), dt = Math.min((now - this.last) / 1000, 0.2);
      this.last = now;
      // the time held is banked, and cut in steps of BURR_STEP_MM; the burr follows the pointer meanwhile
      due += BURR_RATE_MM_S * dt;
      if (this.ray && due >= BURR_STEP_MM) { this.drillAt(this.ray, due); due = 0; }
      else if (this.ray) this.show(this.place(this.ray), this.ray.direction);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  drag(ray: THREE.Ray): void { this.ray = ray; }

  up(): void {
    this.pressing = false;
    if (this.ray) this.hover(this.ray);
  }

  /** One step of drilling: the burr pushed `mm` into the bone it touches along the ray, its sphere cut out. */
  private drillAt(ray: THREE.Ray, mm: number): void {
    const vol = this.vol!;
    const c = this.place(ray, mm);
    if (!c) { this.show(null, null); return; }
    const box = vol.carve(c);
    if (box) for (const [i, j, k] of vol.chunksOf(box[0], box[1])) for (const v of [0, 1] as Vertebra[]) this.remesh(v, i, j, k);
    this.show(c, ray.direction);
  }
}
