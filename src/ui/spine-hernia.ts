import * as THREE from 'three';
import { SP, SP_REFS } from '../spine';
import { CERVICAL_GEOM, HERNIA_STATEMENTS, LUMBAR_GEOM, STATEMENTS, type Statement } from '../spine/content';
import type { DrillPair, DrillVolume } from '../spine/drill';
import { HERNIA_DEFAULT_SIZE, HERNIA_MIGRATE, HERNIA_SIZE, HERNIA_ZONES, herniaRoot, herniaShape, meshSdf, pushOut, sectionArea, type HerniaShape, type HerniaSpec } from '../spine/herniation';
import type { DrillMode } from '../spine/state';
import { herniaDrawn } from '../spine/scene';
import type { SpineState } from '../spine/state';
import { loadStructure } from '../viewer/assets';
import type { Viewer } from '../viewer/Viewer';
import { h } from './h';
import { refLinksFrom } from './reflinks';
import { paletteFor, resolvedTheme, storedTheme } from './theme';
import { clear } from './widgets';

type Update = (fn: (s: SpineState) => void, opts?: { camera?: boolean }) => void;
/** how close (mm) the dural sac and the roots may lie to the herniation once pushed aside */
const CLEAR_MM = 0.8;
/** how far the push spreads over the mesh (rounds of averaging): the sac is dented, a root gives way as a whole */
const SPREAD = { sac: 8, root: 30 };
/** a root's cross-section moves as one: everything within this (mm; the drawn root is 3 mm thick, its ganglion more) */
const ROOT_RIGID_MM = 4;
/** a root pinned this far (mm) is drawn fully red */
const PINNED_FULL_MM = 1.5;
/** how far up (mm) a foraminal herniation may lean towards the exiting root */
const FORAMINAL_LIFT_MM = 12;
/** the herniation can be taken out through a corridor this wide (mm), straight back (or at an anterior discectomy,
 * forwards) from it, with no bone in it (lumbar: 5 mm; cervical: 3 mm, the space smaller; drawing choices) */
const CORRIDOR_MM = { lumbar: 5, cervical: 3 };
/** a medial retraction of the dural sac and the traversing root: up to this far (mm), most at the disc, fading over
 * RETRACT_FADE_MM up and down; the sac's wall on the other side stays (drawing choices) */
const RETRACT: [number, number, number] = [0, 10, 0.5];
const RETRACT_FADE_MM = 12;
/** the dural sac's cross-section: within this of the disc's centre (mm), in its plane */
const SECTION_REACH_MM = 40;

/** A copy of a structure's mesh in the frame (its node's transform applied), to be pushed aside. */
interface Copy { id: string; mesh: THREE.Mesh; orig: Float32Array; normals: Float32Array; root: boolean; side: 'L' | 'R' | null }

/**
 * A schematic disc herniation at a lumbar pair's disc, while drilling it: its zone (paracentral, foraminal, far
 * lateral), side, type and size; the dural sac and the two levels' roots drawn pushed aside (the viewer's are hidden),
 * a root pinned against bone flattened and red; the dural sac's cross-section at the disc; and, once it can be reached
 * from behind, taking it out.
 */
export class HerniaSection {
  readonly el = h('div', { class: 'hernia' });
  readonly group = new THREE.Group();
  private readonly out = h('div', { class: 'drill-out', 'aria-live': 'polite' });
  private key = '';
  private shape: HerniaShape | null = null;
  private herniaMesh: THREE.Mesh | null = null;
  private copies: Copy[] = [];
  private pair: DrillPair | null = null;
  private spec: HerniaSpec | null = null;
  private vol: DrillVolume | null = null;
  private removed = false;
  /** how far the dural sac and the traversing root are retracted medially (mm) */
  private retract = 0;
  /** the dural sac's triangles near the herniation (sharing its positions): what the corridor to it must miss */
  private sacNear: THREE.Mesh | null = null;
  private areaBefore = 0;
  private colours = { root: new THREE.Color(), risk: new THREE.Color() };

  /** the approach being drilled: an anterior discectomy reaches the herniation from the front */
  private mode: DrillMode | null = null;

  constructor(private update: Update, private viewer: Viewer) {}

  /** Drawn for a pair being drilled (or nothing: `pair` null). */
  render(s: SpineState, pair: DrillPair | null, vol: DrillVolume | null): void {
    const spec = pair ? s.hernia : null;
    this.vol = vol;
    if (s.drill !== this.mode) { this.mode = s.drill; this.panelKey = ''; }
    this.group.visible = s.layers.tracts?.on !== false;
    const key = pair && spec ? `${pair.id}|${JSON.stringify(spec)}` : '';
    const panelKey = `${pair?.id}|${JSON.stringify(spec)}|${this.removed}`;
    if (key !== this.key) {
      this.key = key;
      this.removed = false;
      this.retract = 0;
      this.pair = pair;
      this.spec = spec;
      void this.build(key);
    }
    if (panelKey !== this.panelKey) { this.panelKey = panelKey; this.controls(s, pair); }
  }
  private panelKey = '';

  /** After the bone changed (a stroke, an undo) or was loaded: the roots pushed again against the bone as it is now. */
  refresh(vol: DrillVolume | null = this.vol): void { this.vol = vol; this.deform(); }

  // ---------------------------------------------------------------- the controls
  private controls(s: SpineState, pair: DrillPair | null): void {
    clear(this.el);
    if (!pair) return;
    const spec = s.hernia, region = pair.region, sizes = HERNIA_DEFAULT_SIZE[region];
    const set = (fn: (x: HerniaSpec) => void) => this.update((st) => {
      const x: HerniaSpec = st.hernia ? { ...st.hernia } : { zone: 'paracentral', side: 'L', type: 'protrusion', sizeMm: sizes.paracentral ?? 5, migrateMm: 0 };
      fn(x);
      if (x.type === 'protrusion') x.migrateMm = 0;
      st.hernia = x;
    });
    const chip = (label: string, on: boolean, fn: () => void) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(on), onclick: fn }, label);
    const zones = h('div', { class: 'chips', role: 'group', 'aria-label': 'Herniation' },
      chip('None', !spec, () => this.update((st) => { st.hernia = null; })),
      ...HERNIA_ZONES[region].map(([z, name]) => chip(name, spec?.zone === z, () => set((x) => { x.zone = z; if (spec?.zone !== z) x.sizeMm = sizes[z] ?? 5; }))));
    const st = (x: Statement) => h('p', { class: 'aside' }, x.text, x.refIds.length ? ' ' : '', refLinksFrom(SP_REFS, x.refIds));
    const nodes: (Node | null)[] = [h('h4', {}, 'Disc herniation (schematic)'), zones];
    if (spec) {
      const range = (label: string, [lo, hi, step]: [number, number, number], value: number, unit: (v: number) => string, fn: (x: HerniaSpec, v: number) => void) => {
        const out = h('output', {}, unit(value));
        return h('label', { class: 'range scope-range' }, h('span', {}, `${label} `, out),
          h('input', { type: 'range', min: lo, max: hi, step, value, 'aria-label': label,
            oninput: (e: Event) => { const v = parseFloat((e.target as HTMLInputElement).value); out.textContent = unit(v); set((x) => fn(x, v)); } }));
      };
      nodes.push(
        spec.zone === 'central' ? null : h('div', { class: 'chips', role: 'group', 'aria-label': 'Side' },
          chip('Left', spec.side === 'L', () => set((x) => { x.side = 'L'; })), chip('Right', spec.side === 'R', () => set((x) => { x.side = 'R'; }))),
        h('div', { class: 'chips', role: 'group', 'aria-label': 'Type' },
          chip('Protrusion', spec.type === 'protrusion', () => set((x) => { x.type = 'protrusion'; })),
          chip('Extrusion', spec.type === 'extrusion', () => set((x) => { x.type = 'extrusion'; }))),
        range('Size', HERNIA_SIZE, spec.sizeMm, (v) => `${v} mm`, (x, v) => { x.sizeMm = v; }),
        spec.type === 'extrusion' ? range('Migrated', HERNIA_MIGRATE, spec.migrateMm, (v) => (v === 0 ? 'not' : `${Math.abs(v)} mm ${v > 0 ? 'up' : 'down'}`), (x, v) => { x.migrateMm = v; }) : null,
        region === 'lumbar' && spec.zone === 'paracentral' ? this.retractControl() : null,
        this.out);
    }
    if (region === 'lumbar') nodes.push(st(HERNIA_STATEMENTS.types), st(spec?.zone === 'paracentral' || !spec ? STATEMENTS.lesionParacentral : STATEMENTS.lesionLateral),
      ...(spec?.zone === 'paracentral' ? [st(HERNIA_STATEMENTS.retract)] : []),
      st(STATEMENTS.rootRule), st(HERNIA_STATEMENTS.area), st(HERNIA_STATEMENTS.drawn));
    else nodes.push(st(HERNIA_STATEMENTS.types), st(HERNIA_STATEMENTS.cervicalApproach), st(STATEMENTS.cervicalRootRule), st(STATEMENTS.cervicalRootDisc),
      st(HERNIA_STATEMENTS.drawn));
    this.el.append(...nodes.filter((x): x is Node => x !== null));
    this.readout();
  }

  /** The slider retracting the dural sac and the traversing root medially (not kept in the link: a step of the
   * operation, like taking the herniation out). */
  private retractControl(): Node {
    const [lo, hi, step] = RETRACT;
    const out = h('output', {}, `${this.retract} mm`);
    return h('label', { class: 'range scope-range' }, h('span', {}, 'Dural sac and root retracted medially ', out),
      h('input', { type: 'range', min: lo, max: hi, step, value: this.retract, 'aria-label': 'Retraction',
        oninput: (e: Event) => { this.retract = parseFloat((e.target as HTMLInputElement).value); out.textContent = `${this.retract} mm`; this.deform(); } }));
  }

  // ---------------------------------------------------------------- the geometry
  private clearMeshes(): void {
    for (const c of this.copies) { c.mesh.removeFromParent(); c.mesh.geometry.dispose(); }
    this.copies = [];
    if (this.herniaMesh) { this.herniaMesh.removeFromParent(); this.herniaMesh.geometry.dispose(); this.herniaMesh = null; }
    this.sacNear = null;
    this.shape = null;
  }

  private async build(key: string): Promise<void> {
    this.clearMeshes();
    const pair = this.pair, spec = this.spec;
    if (!pair || !spec) { this.viewer.invalidate(); return; }
    const geom = (pair.region === 'lumbar' ? LUMBAR_GEOM : CERVICAL_GEOM).find((g) => g.pair === pair.id);
    const disc = SP.get(pair.disc);
    if (!geom?.lesions || !disc) return;
    const pal = paletteFor(resolvedTheme(storedTheme()));
    this.colours = { root: new THREE.Color(pal.spRoot), risk: new THREE.Color(pal.spRisk) };
    const [discAsset, ...assets] = await Promise.all([disc.file, ...herniaDrawn(pair).map((id) => SP.get(id)?.file ?? '')].map((f) => (f ? loadStructure(f) : Promise.resolve(null))));
    if (this.key !== key) return;
    // where the herniation leaves the disc: the disc's surface along the line from its centre towards the zone's position
    // (a central one: towards the middle of the two paracentral positions, behind the disc's centre)
    const les = geom.lesions;
    const toward = spec.zone === 'central' ? new THREE.Vector3(...les.L.paracentral).add(new THREE.Vector3(...les.R.paracentral)).multiplyScalar(0.5)
      : new THREE.Vector3(...les[spec.side][spec.zone]);
    const centre = new THREE.Vector3(...geom.discCentre);
    const up = new THREE.Vector3(...pair.landmarks[0].axes[2]);
    const flat = toward.clone().sub(centre);
    flat.addScaledVector(up, -flat.dot(up));
    const discMeshes = discAsset?.kind === 'mesh' ? Object.values(discAsset.sides).filter((m): m is THREE.Mesh => !!m).map((m) => this.inFrame(m)) : [];
    const ray = new THREE.Raycaster(centre, flat.clone().normalize(), 0, 80);
    const hits = ray.intersectObjects(discMeshes, false);
    discMeshes.forEach((m) => m.geometry.dispose());
    const anchor = hits.length ? hits[hits.length - 1].point.clone() : centre.clone().addScaledVector(flat.clone().normalize(), Math.max(flat.length() - 2, 10));
    // a foraminal herniation points at the exiting root in the foramen's upper part (its point nearest the zone's
    // position), leaning up to it (at most FORAMINAL_LIFT_MM)
    let lift = 0, aim = toward;
    if (spec.zone === 'foraminal') {
      const ri = herniaDrawn(pair).indexOf(`sp_root_${(herniaRoot(pair.id, spec.zone, pair.region) ?? '').toLowerCase()}`);
      const ra = assets[ri];
      if (ra?.kind === 'mesh') {
        let best = Infinity, near: THREE.Vector3 | null = null;
        for (const m of Object.values(ra.sides)) {
          if (!m) continue;
          const f = this.inFrame(m), pos = f.geometry.getAttribute('position'), P = new THREE.Vector3();
          for (let v = 0; v < pos.count; v++) { P.fromBufferAttribute(pos, v); const d = P.distanceTo(toward); if (d < best) { best = d; near = P.clone(); } }
          f.geometry.dispose();
        }
        if (near) { lift = THREE.MathUtils.clamp(near.clone().sub(anchor).dot(up), 0, FORAMINAL_LIFT_MM); aim = near; }
      }
    }
    // it points outwards from the disc's centre (the zone's position can lie inside the disc's margin, as a central one's
    // does where the disc bulges back in the midline); a foraminal one at the root, if that lies outwards
    const outward = flat.clone().normalize();
    const aimFlat = aim.clone().addScaledVector(up, -aim.clone().sub(anchor).dot(up));
    const toRoot = aimFlat.clone().sub(anchor);
    const point = spec.zone === 'foraminal' && toRoot.length() > 1 && toRoot.dot(outward) > 0 ? aimFlat : anchor.clone().addScaledVector(outward, 10);
    this.shape = herniaShape(spec, anchor, point, up, geom.discHeightMm ?? 8, lift);
    const pal2 = new THREE.Color(pal.spDisc);
    this.herniaMesh = new THREE.Mesh(meshSdf(this.shape.sdf, this.shape.lo, this.shape.hi, 0.35),
      new THREE.MeshStandardMaterial({ color: pal2, roughness: 0.45, metalness: 0 }));
    this.herniaMesh.raycast = () => {};
    this.group.add(this.herniaMesh);
    // the dural sac (one mesh of its halves) and the roots, copied in the frame
    const ids = herniaDrawn(pair);
    assets.forEach((a, i) => {
      if (a?.kind !== 'mesh') return;
      const root = ids[i] !== 'sp_dural_sac';
      const sides = (Object.entries(a.sides) as ['L' | 'R', THREE.Mesh | undefined][]).filter((e): e is ['L' | 'R', THREE.Mesh] => !!e[1]);
      const parts = sides.map(([sd, m]) => ({ sd, m: this.inFrame(m) }));
      const meshes = root ? parts : [{ sd: null, m: this.merge(parts.map((x) => x.m)) }];
      for (const { sd, m } of meshes) {
        const colour = new THREE.Color(root ? pal.spRoot : pal.spCord);
        if (root) {
          const n = m.geometry.getAttribute('position').count, cols = new Float32Array(n * 3);
          for (let v = 0; v < n; v++) colour.toArray(cols, v * 3);
          m.geometry.setAttribute('color', new THREE.BufferAttribute(cols, 3));
        }
        m.material = new THREE.MeshStandardMaterial({ color: root ? 0xffffff : colour, vertexColors: root, roughness: 0.55, metalness: 0 });
        m.raycast = () => {};
        this.group.add(m);
        if (!m.geometry.getAttribute('normal')) m.geometry.computeVertexNormals();
        this.copies.push({ id: ids[i], mesh: m, orig: (m.geometry.getAttribute('position').array as Float32Array).slice(),
          normals: (m.geometry.getAttribute('normal').array as Float32Array).slice(), root, side: sd });
      }
    });
    // the sac's triangles near the herniation, for the corridor's test (sharing the sac's positions as they move)
    const sacCopy = this.copies.find((c) => !c.root);
    if (sacCopy) {
      const g = sacCopy.mesh.geometry, pos = g.getAttribute('position'), idx = g.getIndex()!.array, sub: number[] = [], P = new THREE.Vector3();
      for (let t = 0; t < idx.length; t += 3) if (P.fromBufferAttribute(pos, idx[t]).distanceTo(anchor) < 40) sub.push(idx[t], idx[t + 1], idx[t + 2]);
      const ng = new THREE.BufferGeometry();
      ng.setAttribute('position', pos);
      ng.setIndex(sub);
      this.sacNear = new THREE.Mesh(ng);
    }
    const sac = this.copies.find((c) => !c.root);
    this.areaBefore = sac ? sectionArea(sac.mesh.geometry.getAttribute('position') as THREE.BufferAttribute, sac.mesh.geometry.getIndex()!.array, centre, up, SECTION_REACH_MM) : 0;
    this.deform();
  }

  /** A loaded structure's mesh as a new mesh with its positions in the frame (its node's transform applied). */
  private inFrame(m: THREE.Mesh): THREE.Mesh {
    m.updateMatrix();
    const src = m.geometry.getAttribute('position'), n = src.count, out = new Float32Array(n * 3), P = new THREE.Vector3();
    for (let v = 0; v < n; v++) P.fromBufferAttribute(src, v).applyMatrix4(m.matrix).toArray(out, v * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(out, 3));
    const idx = m.geometry.getIndex();
    g.setIndex(idx ? Array.from(idx.array) : Array.from({ length: n }, (_, i) => i));
    g.computeVertexNormals();
    return new THREE.Mesh(g);
  }

  private merge(parts: THREE.Mesh[]): THREE.Mesh {
    const pos: number[] = [], ind: number[] = [];
    for (const p of parts) {
      const base = pos.length / 3;
      pos.push(...(p.geometry.getAttribute('position').array as Float32Array));
      for (const i of p.geometry.getIndex()!.array) ind.push(base + i);
      p.geometry.dispose();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(ind);
    return new THREE.Mesh(g);
  }

  /** Push the sac and the roots out of the herniation (from where they lie; the roots no further than the bone lets
   * them), the pinned parts of the roots red; or, taken out, put them back. */
  private pinnedMm = 0;
  private movedMm = 0;
  private areaNow = 0;
  private deform(): void {
    if (!this.shape || !this.pair) return;
    const blocked = this.vol ? this.vol.boneTest() : undefined;
    this.pinnedMm = 0; this.movedMm = 0;
    const rootName = herniaRoot(this.pair.id, this.spec!.zone, this.pair.region);
    const target = rootName ? `sp_root_${rootName.toLowerCase()}` : '';
    const traversing = `sp_root_${this.pair.id.split('-')[1].toLowerCase()}`;
    const geom0 = this.geom()!;
    const [lat, , up] = this.pair.landmarks[0].axes.map((a) => new THREE.Vector3(...a));
    const disc = new THREE.Vector3(...geom0.discCentre), sideSign = this.spec!.side === 'L' ? -1 : 1;
    const retract = this.pair.region === 'lumbar' && this.spec!.zone === 'paracentral' && !this.removed ? this.retract : 0;
    for (const c of this.copies) {
      const g = c.mesh.geometry, pos = g.getAttribute('position') as THREE.BufferAttribute;
      (pos.array as Float32Array).set(c.orig);
      // a medial retraction first: the sac's wall on the herniation's side and that side's traversing root, most at
      // the disc and fading up and down
      if (retract > 0 && (!c.root || (c.id === traversing && c.side === this.spec!.side))) {
        const P = new THREE.Vector3();
        for (let v = 0; v < pos.count; v++) {
          P.fromBufferAttribute(pos, v).sub(disc);
          const along = Math.exp(-((P.dot(up) / RETRACT_FADE_MM) ** 2));
          const across = c.root ? 1 : THREE.MathUtils.clamp((sideSign * P.dot(lat) + 2) / 10, 0, 1);
          const d = -sideSign * retract * along * across;
          if (Math.abs(d) > 1e-3) pos.setXYZ(v, pos.getX(v) + lat.x * d, pos.getY(v) + lat.y * d, pos.getZ(v) + lat.z * d);
        }
      }
      pos.needsUpdate = true;
      let pinned: Float32Array | null = null;
      if (!this.removed) {
        const r = pushOut(pos, g.getIndex()!.array, this.shape.sdf, this.shape.core, c.root
          ? { clear: CLEAR_MM, spread: SPREAD.root, reach: 10, blocked, rigid: ROOT_RIGID_MM }
          : { clear: CLEAR_MM, spread: SPREAD.sac, reach: 6, inward: c.normals });
        pinned = r.pinned;
        if (c.id === target && !(retract > 0 && c.id === traversing && c.side === this.spec!.side)) {
          this.pinnedMm = Math.max(this.pinnedMm, ...r.pinned); this.movedMm = Math.max(this.movedMm, ...r.moved);
        } else if (c.id === target) {   // (retracted: what the herniation does to the root where it lies, without the retraction)
          const plain = new THREE.BufferAttribute(c.orig.slice(), 3);
          const q = pushOut(plain, g.getIndex()!.array, this.shape.sdf, this.shape.core, { clear: CLEAR_MM, spread: SPREAD.root, reach: 10, blocked, rigid: ROOT_RIGID_MM });
          this.pinnedMm = Math.max(this.pinnedMm, ...q.pinned); this.movedMm = Math.max(this.movedMm, ...q.moved);
        }
      }
      if (c.root) {
        const col = g.getAttribute('color') as THREE.BufferAttribute, C = new THREE.Color();
        for (let v = 0; v < pos.count; v++) {
          C.copy(this.colours.root).lerp(this.colours.risk, pinned ? Math.min(pinned[v] / PINNED_FULL_MM, 1) : 0);
          col.setXYZ(v, C.r, C.g, C.b);
        }
        col.needsUpdate = true;
      }
      g.computeVertexNormals();
      g.computeBoundingSphere();
    }
    if (this.herniaMesh) this.herniaMesh.visible = !this.removed;
    this.sacNear?.geometry.computeBoundingSphere();
    const sac = this.copies.find((c) => !c.root);
    const geom = geom0;
    this.areaNow = sac ? sectionArea(sac.mesh.geometry.getAttribute('position') as THREE.BufferAttribute, sac.mesh.geometry.getIndex()!.array,
      new THREE.Vector3(...geom.discCentre), new THREE.Vector3(...this.pair.landmarks[0].axes[2]), SECTION_REACH_MM) : 0;
    this.readout();
    this.viewer.invalidate();
  }

  private geom() {
    return this.pair ? (this.pair.region === 'lumbar' ? LUMBAR_GEOM : CERVICAL_GEOM).find((g) => g.pair === this.pair!.id) : undefined;
  }

  /** Whether the herniation can be reached: some of it with a corridor free of bone straight back from it (at an
   * anterior discectomy, straight forwards, through the disc space), and free of what may not be moved through:
   * lumbar paracentral, the dural sac and the traversing root (until retracted); cervical from behind, the dural sac,
   * the cord in it. Else what is in the way. */
  private reachable(): 'open' | 'bone' | 'neural' {
    if (!this.herniaMesh || !this.vol || !this.pair || !this.spec) return 'bone';
    const region = this.pair.region, front = this.mode === 'acdf';
    const neural = front ? [] : region === 'lumbar'
      ? (this.spec.zone === 'paracentral'
        ? [this.sacNear, ...this.copies.filter((c) => c.id === `sp_root_${this.pair!.id.split('-')[1].toLowerCase()}` && c.side === this.spec!.side).map((c) => c.mesh)] : [])
      : [this.sacNear];
    const live = neural.filter((m): m is THREE.Mesh => !!m);
    const bone = this.vol.boneTest(), [lat, ant, up] = this.pair.landmarks[0].axes.map((a) => new THREE.Vector3(...a));
    // from behind: straight back; from the front: through the middle of the disc space, towards a point in front of the
    // disc's centre (along the two vertebrae's forward axes, averaged: the space is tilted against each)
    const w = CORRIDOR_MM[region] / 2;
    const fwd = ant.clone().add(new THREE.Vector3(...this.pair.landmarks[1].axes[1])).normalize();
    const aimFront = new THREE.Vector3(...this.geom()!.discCentre).addScaledVector(fwd, 20);
    const offs = [new THREE.Vector3(), lat.clone().multiplyScalar(w), lat.clone().multiplyScalar(-w), up.clone().multiplyScalar(w), up.clone().multiplyScalar(-w)];
    const pos = this.herniaMesh.geometry.getAttribute('position'), P = new THREE.Vector3();
    const ray = new THREE.Raycaster();
    let free = 0, boneFree = 0;
    for (let v = 0; v < pos.count; v += 7) {
      P.fromBufferAttribute(pos, v);
      const way = front ? aimFront.clone().sub(P).normalize() : ant.clone().negate();
      let open = true;
      for (const o of offs) for (let t = 1; t < 60 && open; t += 0.5) if (bone(P.clone().add(o).addScaledVector(way, t))) open = false;
      if (!open) continue;
      boneFree++;
      for (const o of offs) {
        if (!open) break;
        ray.set(P.clone().add(o), way);
        ray.far = 60;
        for (const m of live) if (this.hits(ray, m)) { open = false; break; }
      }
      if (open && ++free >= 3) return 'open';
    }
    return boneFree >= 3 ? 'neural' : 'bone';
  }

  /** Whether a ray meets a mesh's surface, either face (the copies' own raycast is switched off, so that the viewer's
   * picking passes them: their geometry is tested here). */
  private probe = new THREE.Mesh(undefined, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  private hits(ray: THREE.Raycaster, m: THREE.Mesh): boolean {
    this.probe.geometry = m.geometry;
    return ray.intersectObject(this.probe, false).length > 0;
  }

  private readout(): void {
    clear(this.out);
    if (!this.spec || !this.pair || !this.shape) return;
    const region = this.pair.region, zone = this.spec.zone;
    const root = herniaRoot(this.pair.id, zone, region);
    const kind = region === 'cervical' ? 'exiting at this disc' : zone === 'paracentral' ? 'traversing' : 'exiting';
    const one = (x: number) => (Math.round(x * 10) / 10).toFixed(1);
    const change = this.areaBefore ? Math.round((100 * (this.areaNow - this.areaBefore)) / this.areaBefore) : 0;
    const access = this.removed ? 'open' : this.reachable(), reach = !this.removed && access === 'open';
    const retracted = !this.removed && this.retract > 0 && region === 'lumbar' && zone === 'paracentral';
    const sacName = region === 'cervical' ? 'Dural sac (the cord and fluid: not told apart on this CT)' : 'Dural sac';
    const rootLine = !root ? `A central herniation presses on the dural sac${region === 'cervical' ? ' and the cord in it' : ''}, not on a root.`
      : this.pinnedMm > 0.2 ? h('span', { class: 'facet-over' }, `The herniation pins the ${root} root (${kind}) against bone: flattened by ${one(this.pinnedMm)} mm where it cannot give way.`)
        : this.movedMm > 0.2 ? `The herniation pushes the ${root} root (${kind}) aside by up to ${one(this.movedMm)} mm.` : `The herniation does not reach the ${root} root (${kind}).`;
    const why = access === 'neural'
      ? (region === 'lumbar' ? `The bone is out of the way, but the dural sac or the ${root} root lies over it: retract them medially.`
        : 'From behind, the dural sac and the cord lie over it, and the cord is not retracted: take it out from the front (an anterior discectomy), or, if it lies far enough out, through the foramen.')
      : `It can be taken out once some of it lies open ${this.mode === 'acdf' ? 'to the front, through the disc space (drill away the back lips of the vertebral bodies, or osteophytes, where they overhang it; distraction helps)' : 'to the back'}: a corridor ${CORRIDOR_MM[region]} mm wide with no bone in it${region === 'lumbar' && zone === 'paracentral' ? ', the dural sac and the traversing root retracted out of it' : region === 'cervical' && this.mode !== 'acdf' ? ', clear of the dural sac and the cord' : ''} (the ligamentum flavum${this.mode === 'acdf' ? ' and the posterior longitudinal ligament are' : ' is'} not drawn).`;
    this.out.append(
      h('p', {}, this.removed ? `Taken out: ${root ? `the ${root} root and ` : ''}the dural sac lie where they did.` : rootLine),
      retracted ? h('p', {}, `The dural sac and the ${root} root are retracted ${this.retract} mm medially.`) : '',
      h('p', {}, `${sacName} at the ${this.pair.id} disc: ${Math.round(this.areaBefore)} mm² as drawn, now ${Math.round(this.areaNow)} mm²${change ? ` (${change > 0 ? '+' : ''}${change}%)` : ''}${retracted ? ', narrowed by the retraction too' : ''}.`),
      this.removed ? h('div', { class: 'chips' }, h('button', { type: 'button', class: 'chip', onclick: () => { this.removed = false; this.deform(); this.panelKey = ''; } }, 'Put it back'))
        : h('div', { class: 'chips' }, h('button', { type: 'button', class: 'chip', disabled: !reach || undefined,
          title: reach ? 'Take the herniation out (as with a rongeur)' : 'Not yet reachable: see below',
          onclick: () => { this.removed = true; this.deform(); } }, 'Take the herniation out')),
      reach || this.removed ? '' : h('p', { class: 'aside' }, why));
  }

  dispose(): void { this.clearMeshes(); this.key = ''; this.panelKey = ''; clear(this.el); }
}
