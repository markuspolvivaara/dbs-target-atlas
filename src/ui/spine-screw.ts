import * as THREE from 'three';
import { SP, SP_REFS } from '../spine';
import { STATEMENTS, TECHNIQUES, type Statement } from '../spine/content';
import {
  direction, evaluate, loadField, movedEntry, SCREW_LEVELS, screwCut, screwDefaults, screwKey, type BreachDir, type ScrewField, type ScrewResult,
  type TechniqueId, type V3,
} from '../spine/screw';
import { SCREW_RANGE, type ScrewState, type SpineState } from '../spine/state';
import { h } from './h';
import { refLinksFrom } from './reflinks';
import { chips, clear } from './widgets';

type Update = (fn: (s: SpineState) => void, opts?: { camera?: boolean }) => void;
type Key = keyof typeof SCREW_RANGE;
/** Breach grade -> colour of the drawn screw (and the grade badge). */
const GRADE_TOKEN: Record<ScrewResult['grade'], string> = { A: 'spSafe', B: 'spCaution', C: 'spRisk', D: 'spRisk', E: 'spRisk' };
const SLIDERS: [Key, string][] = [
  ['medial', 'Transverse angle'], ['cranial', 'Sagittal angle'], ['length', 'Length'], ['diameter', 'Diameter'],
  ['du', 'Entry, medial / lateral'], ['dw', 'Entry, cranial / caudal'],
];
const one = (n: number) => (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, '');

function format(k: Key, v: number, midline = false): string {
  // a midline screw (always the 'left' one): a positive angle or shift turns it to the patient's right
  if (midline && k === 'medial') return !v ? 'midline' : `${one(Math.abs(v))}° to the ${v > 0 ? 'right' : 'left'}`;
  if (midline && k === 'du') return v ? `${one(Math.abs(v))} mm ${v > 0 ? 'right' : 'left'}` : 'start';
  switch (k) {
    case 'medial': return !v ? 'straight ahead' : v > 0 ? `${one(v)}° medial` : `${one(-v)}° lateral`;
    case 'cranial': return !v ? 'parallel to the endplate' : v > 0 ? `${one(v)}° cranial` : `${one(-v)}° caudal`;
    case 'du': return v ? `${one(Math.abs(v))} mm ${v > 0 ? 'medial' : 'lateral'}` : 'start';
    case 'dw': return v ? `${one(Math.abs(v))} mm ${v > 0 ? 'cranial' : 'caudal'}` : 'start';
    default: return `${one(v)} mm`;
  }
}

/** The screw as drawn (implant grey: the grade's colour would be mistaken for a root), with a magenta mark where each
 * breach is deepest. */
function screwObject(entry: V3, d: V3, length: number, r: number, where: V3[]): THREE.Object3D[] {
  const g = new THREE.Group();
  // both sides: cut open along its axis, the screw's inside faces the viewer
  const mat = () => new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.25, side: THREE.DoubleSide });
  const tip = Math.min(r * 1.6, length / 3);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r, r, length - tip, 32), mat());
  shaft.position.y = (length - tip) / 2;
  const cone = new THREE.Mesh(new THREE.ConeGeometry(r, tip, 32), mat());
  cone.position.y = length - tip / 2;
  const head = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.7, r * 1.7, 8, 32), mat());
  head.position.y = -4;
  for (const m of [shaft, cone, head]) { m.userData.token = 'electrode'; g.add(m); }
  g.position.set(...entry);
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...d));
  const marks = where.map((p) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(Math.max(1.2, r * 0.45), 20, 14), new THREE.MeshBasicMaterial({ depthTest: false }));
    m.position.set(...p);
    m.renderOrder = 6;
    m.userData.token = 'spRisk';
    return m;
  });
  return [g, ...marks];
}

/**
 * The virtual-screw tool in a level's card: technique and side, the screw's angles, size and entry, and what it
 * breaches and comes near. The controls are built when the level, technique or side change and otherwise only
 * updated, so a slider keeps working while it is dragged.
 */
export class ScrewPanel {
  readonly el = h('div', { class: 'screw' });
  private key = '';
  private drawn = '';
  private level: string | null = null;
  private inputs = new Map<Key, { input: HTMLInputElement; out: HTMLOutputElement }>();
  private readout = h('div', { class: 'screw-readout', 'aria-live': 'polite' });
  private field: ScrewField | null = null;
  private loading: string | null = null;
  private last: SpineState | null = null;

  constructor(private update: Update, private setOverlay: (objs: THREE.Object3D[]) => void, private name: (id: string) => string) {}

  render(s: SpineState): void {
    this.last = s;
    const level = s.level && SCREW_LEVELS[s.level] ? s.level : null;
    const key = `${level}|${s.screw?.tech}|${s.screw?.side}|${s.cut}`;
    if (key !== this.key) { this.key = key; this.level = level; this.build(s); }
    this.refresh(s);
  }

  private stmt(st: Statement): HTMLElement {
    return h('p', { class: 'aside' }, st.text, st.refIds.length ? ' ' : '', refLinksFrom(SP_REFS, st.refIds));
  }

  private build(s: SpineState): void {
    clear(this.el);
    this.inputs.clear();
    const level = this.level;
    if (!level) return;
    const techs = Object.values(TECHNIQUES).filter((t) => t.levels.includes(level) && (!t.hidden || t.id === s.screw?.tech));
    this.el.append(chips<TechniqueId | 'none'>([['none', 'None'], ...techs.map((t): [TechniqueId, string] => [t.id, t.name])], s.screw?.tech ?? 'none',
      (v) => this.update((st) => {
        st.screw = v === 'none' ? null : screwDefaults(level, v, TECHNIQUES[v as TechniqueId]?.midline ? 'L' : st.screw?.side ?? 'L');
        if (v === 'none' && st.cut === 'screw') st.cut = 'none';
      }), { label: 'Screw technique', cls: 'screw-tech' }));
    const c = s.screw;
    if (!c) {
      this.el.append(h('p', { class: 'aside' }, 'Pick a technique to place a screw at its published start position on this CT, then move it.'));
      return;
    }
    const t = TECHNIQUES[c.tech];
    this.el.append(
      t.midline ? '' : chips<'L' | 'R'>([['L', 'Left'], ['R', 'Right']], c.side, (v) => this.update((st) => { st.screw = screwDefaults(level, c.tech, v); }), { label: 'Screw side', cls: 'screw-side' }),
      h('div', { class: 'screw-sliders' }, ...SLIDERS.map(([k, label]): [Key, string] => [k, t.midline && k === 'du' ? 'Entry, left / right' : label]).flatMap(([k, label]) => {
        const [lo, hi, step] = SCREW_RANGE[k];
        const id = `screw-${k}`;
        const input = h('input', {
          type: 'range', id, min: lo, max: hi, step, value: c[k],
          oninput: (e: Event) => { const v = Number((e.target as HTMLInputElement).value); this.update((st) => { if (st.screw) st.screw[k] = v; }); },
        }) as HTMLInputElement;
        const out = h('output', { for: id }, format(k, c[k], t.midline)) as HTMLOutputElement;
        this.inputs.set(k, { input, out });
        return [h('label', { for: id }, label), input, out];
      })),
      h('div', { class: 'chips' },
        h('button', { type: 'button', class: 'chip', onclick: () => this.update((st) => { st.screw = screwDefaults(level, c.tech, c.side); }) }, 'Back to the start position'),
        h('button', {
          type: 'button', class: 'chip screw-cut', 'aria-pressed': String(s.cut === 'screw'),
          onclick: () => this.update((st) => {
            st.cut = st.cut === 'screw' ? 'none' : 'screw';
            if (st.cut === 'screw' && st.screw) {
              const { point, camera } = screwCut(level, st.screw);
              st.cam = { preset: null, pos: camera, tgt: point };
            }
          }, { camera: s.cut !== 'screw' }),
        }, 'Cut along the screw')),
      this.readout,
      h('p', { class: 'aside schematic-note' }, 'Illustrative: one subject’s CT, not a plan for a patient.'),
      this.stmt(t.start), this.stmt(t.size), t.note ? this.stmt(t.note) : '',
      SCREW_LEVELS[level].pedicle ? this.stmt(STATEMENTS.fill) : '',
      t.id === 'od' ? '' : this.stmt(!t.within ? STATEMENTS.grades : level === 'C1' || level === 'C2' ? STATEMENTS.hrva : STATEMENTS.lateralMassRisk),
      this.stmt(STATEMENTS.screwMethod),
    );
  }

  private refresh(s: SpineState): void {
    const c = s.screw;
    const level = this.level;
    if (!c || !level) { this.draw(''); return; }
    for (const [k, { input, out }] of this.inputs) {
      if (Number(input.value) !== c[k]) input.value = String(c[k]);
      out.textContent = format(k, c[k], TECHNIQUES[c.tech].midline);
    }
    const key = screwKey(level, c.tech);
    if (!this.field || this.field.level !== key) {
      if (this.loading !== key) {
        this.loading = key;
        this.readout.textContent = 'Loading the bone of this level…';
        loadField(key).then((f) => { this.field = f; this.loading = null; if (this.last) this.refresh(this.last); })
          .catch(() => { this.loading = null; this.readout.textContent = 'Could not load the bone of this level.'; });
      }
      return;
    }
    const lv = SCREW_LEVELS[key];
    const d = direction(lv, c.side, c.medial, c.cranial, c.tech);
    const entry = movedEntry(this.field, lv, c.side, lv.start[c.tech]![c.side].entry, d, c.du, c.dw);
    const r = evaluate(this.field, lv, c.side, entry, d, c.length, c.diameter / 2, 3, c.tech);
    this.showResult(c, r, lv.pedicle?.[c.side].width);
    this.draw(JSON.stringify([level, c]), () => screwObject(entry, d, c.length, c.diameter / 2, Object.values(r.where)));
  }

  private draw(key: string, objs?: () => THREE.Object3D[]): void {
    if (key === this.drawn) return;
    this.drawn = key;
    this.setOverlay(objs ? objs() : []);
  }

  private showResult(c: ScrewState, r: ScrewResult, pedicleWidth?: number): void {
    const wall = (['medial', 'lateral', 'superior', 'inferior'] as BreachDir[]).filter((k) => r.breach[k]).sort((a, b) => r.breach[b]! - r.breach[a]!);
    const t = TECHNIQUES[c.tech];
    const word = (k: BreachDir) => t.breachWords?.[k as 'medial'] ?? (k === 'superior' ? 'cranial' : k === 'inferior' ? 'caudal' : k);
    const ant = r.breach.anterior;
    const near = r.nearest.map((n) => {
      const sch = SP.get(n.id)?.schematic ? ' (schematic)' : '';
      return `${this.name(n.id)}${sch} ${n.mm <= 0 ? 'touched or crossed' : `${one(n.mm)} mm`}`;
    });
    clear(this.readout);
    this.readout.append(
      h('p', { class: 'screw-grade' },
        // the Gertzbein-Robbins grade is for pedicle screws; other screws' breaches are given by direction only
        t.within ? '' : [h('span', { class: 'grade', style: `--g: var(--c-${GRADE_TOKEN[r.grade]})`, title: 'Gertzbein–Robbins grade' }, r.grade), ' '],
        wall.length ? `${word(wall[0]).replace(/^./, (x) => x.toUpperCase())} breach ${one(r.breach[wall[0]]!)} mm` : t.within ? `Within the ${t.within}` : 'No breach of the pedicle wall',
        wall.length > 1 ? `; also ${wall.slice(1).map((k) => `${word(k)} ${one(r.breach[k]!)} mm`).join(', ')}` : ''),
      ant ? h('p', {}, t.within ? `Through the far cortex by ${one(ant)} mm${t.bicortical ? ' (bicortical)' : ''}.`
        : `Through the anterior cortex by ${one(ant)} mm${c.tech === 's1' ? ' (meant, for a tricortical screw)' : ''}.`) : '',
      h('p', {}, r.inside ? `Wholly inside the bone from ${one(r.seated)} mm after the entry.` : 'Never wholly inside the bone.'),
      pedicleWidth ? h('p', {}, `Diameter ${Math.round((100 * c.diameter) / pedicleWidth)}% of the pedicle’s measured width (${one(pedicleWidth)} mm).`) : '',
      near.length ? h('p', {}, 'Nearest: ', near.join(' · '), '.') : '',
    );
  }
}
