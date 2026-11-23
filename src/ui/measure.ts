import * as THREE from 'three';
import type { V3 } from '../state';
import type { Viewer } from '../viewer/Viewer';
import type { ViewState } from '../viewer/scene';
import { h } from './h';
import { fmtMm } from './widgets';

/**
 * The toolbar's Measure tool, the same in every section: its button, its line of text under the 3D view, and the two
 * points picked. Each section's page held a copy; a measured distance was in none of their links (the site audit's
 * UI-13: "exactly what a teacher wants to send"). Here the finished measurement is part of the view's state
 * (`ViewState.measured`, `m=` in a link), so a link, Back and a reload show it again with the tool on.
 *
 * The points are kept to a hundredth of a millimetre, as the link writes them, so that the distance the receiver reads
 * is the one the sender read.
 */
export interface MeasureText {
  /** the button's tooltip (left out: "Measure distance between two points (M)") */
  title?: string;
  /** what the line says while no point is picked ("Click or tap two points on any structure.") */
  prompt: string;
  /** the line for a finished measurement: `mm` is the distance as printed, `a` and `b` the points as printed */
  distance(mm: string, a: string, b: string): string;
}

const r2 = (n: number): number => Math.round(n * 100) / 100;
const point = (p: THREE.Vector3): string => [p.x, p.y, p.z].map(fmtMm).join(', ');

export class MeasureTool {
  readonly out = h('div', { class: 'measure-out', 'aria-live': 'polite', hidden: true });
  readonly btn: HTMLButtonElement;
  private pts: THREE.Vector3[] = [];
  /** the view's state holds a measurement */
  private held = false;

  /** `viewer`: the page's, once it has one (the button is made before it). `store`: the finished measurement (or none)
   * into the view's state. */
  constructor(private readonly viewer: () => Pick<Viewer, 'setMeasuring' | 'setMeasure'>, private readonly text: MeasureText,
    private readonly store: (m: ViewState['measured']) => void) {
    this.btn = h('button', { type: 'button', class: 'tbtn', 'aria-pressed': 'false', title: text.title ?? 'Measure distance between two points (M)', onclick: () => this.toggle() }, 'Measure') as HTMLButtonElement;
  }

  get on(): boolean { return this.btn.getAttribute('aria-pressed') === 'true'; }
  /** a finished measurement is shown */
  get done(): boolean { return this.pts.length === 2; }

  /** The button or its key: the tool on or off, any measurement gone. */
  toggle(): void {
    this.set(!this.on);
    this.keep(undefined);
  }

  /** The viewer's report of the points picked so far (one or two). */
  picked(pts: THREE.Vector3[]): void {
    this.pts = pts.map((p) => new THREE.Vector3(r2(p.x), r2(p.y), r2(p.z)));
    this.show();
    this.keep(this.done ? [this.pts[0].toArray(), this.pts[1].toArray()] as [V3, V3] : undefined);
  }

  /** Into the view's state: a finished measurement, or none where it holds one (the page is drawn again for it). */
  private keep(m: ViewState['measured']): void {
    if (m || this.held) this.store(m);
    this.held = !!m;
  }

  /** The view's state as drawn (each render): a measurement it holds is shown, with the tool on; one shown that it no
   * longer holds (a link without it, Back) is taken away. A first point picked and waiting for its second is left. */
  sync(m: ViewState['measured']): void {
    this.held = !!m;
    if (m) {
      if (this.done && m.every((p, i) => p.every((v, k) => v === this.pts[i].getComponent(k)))) return;
      if (!this.on) this.set(true);
      this.pts = m.map((p) => new THREE.Vector3(...p));
      this.viewer().setMeasure(this.pts);
      this.show();
    } else if (this.done) {
      this.pts = [];
      this.viewer().setMeasure([]);
      this.out.textContent = this.text.prompt;
    }
  }

  private set(on: boolean): void {
    this.btn.setAttribute('aria-pressed', String(on));
    this.viewer().setMeasuring(on);
    this.pts = [];
    this.out.hidden = !on;
    this.out.textContent = on ? this.text.prompt : '';
  }

  private show(): void {
    const [a, b] = this.pts;
    this.out.hidden = false;
    this.out.textContent = b ? this.text.distance(fmtMm(a.distanceTo(b)), point(a), point(b)) : `Point A: ${point(a)}. Pick point B.`;
  }
}
