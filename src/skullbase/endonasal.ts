import * as THREE from 'three';
import { z } from 'zod';
import data from '../data/generated/sbv3-endonasal.json';
import { gunzip } from '../spine/screw';
import { assetUrl } from '../viewer/assets';
import { meshChunk, CHUNK_VOX, type Colour, type FieldGrid } from '../viewer/surfacenets';

/**
 * Skull base v3's endoscopic endonasal (transsphenoidal) view: the CT around the sphenoid as fields a burr cuts
 * (pipeline/skullbase_v3_endonasal.py writes them): the bone as the model draws it, and what is not air, whose surface
 * is the lining the endoscope sees (the nasal mucosa, the walls of the sphenoid sinus); the CT to colour them; and the
 * distance to what the burr stops at: the vessels (the carotids), the nerves (the optic nerves and chiasm, III to VI),
 * the sellar contents (the pituitary, the cavernous sinuses) and the brain. Anatomy, not a simulation of the tissue:
 * what the burr reaches is simply taken away.
 */
const V3 = z.tuple([z.number(), z.number(), z.number()]);
export const ENDONASAL = z.object({
  params: z.object({ fieldIso: z.number(), airHu: z.number(), pieceStepMm: z.number(), pieceClearMm: z.record(z.number()), densityMinHu: z.number(), densityStepHu: z.number(), distStepMm: z.number(), fields: z.array(z.string()) }),
  file: z.string(), bytes: z.number(), dims: V3, affine: z.array(z.array(z.number()).length(4)).length(4),
  box: z.array(z.tuple([z.number(), z.number()])),
  /** the scope's entry in each nostril, as far forward as the scan reaches */
  entry: z.object({ L: V3, R: V3 }),
  /** the scope's way through each side of the nose, 1 mm apart, from the entry to the last air before the sphenoid sinus
   * (at its opening), the turbinates pushed aside to `corridorMm` across */
  corridor: z.object({ L: z.object({ points: z.array(V3).min(2), lengthMm: z.number(), openedMm: z.number(), recess: V3 }), R: z.object({ points: z.array(V3).min(2), lengthMm: z.number(), openedMm: z.number(), recess: V3 }) }),
  corridorMm: z.number(),
  sinus: z.object({ centre: V3, volumeMl: z.number(), lo: V3, hi: V3, backMm: z.number(), opensToNose: z.boolean() }).partial(),
  /** the carotids' least distance, at heights through the sella (mm above the fossa) */
  intercarotid: z.array(z.object({ z: z.number(), mm: z.number() })),
  /** what can be taken away step by step, in the order of the operation: its label in the piece field, how much it holds
   * (mm3, of it bone) and where it lies */
  pieces: z.array(z.object({ id: z.string(), name: z.string(), label: z.number().int().min(1), mm3: z.number(), boneMm3: z.number(), centre: V3.nullable() })),
  /** the hypophysis modelled in this CT's fossa: the diaphragma's points, the gland's size, its parts' volumes */
  hypophysis: z.object({
    diaphragma: z.object({ tuberculum: V3, dorsum: V3 }),
    gland: z.object({ widthMm: z.number(), lengthMm: z.number(), heightMm: z.number(), mm3: z.number() }),
    adenoMm3: z.number(), neuroMm3: z.number(), stalkMm3: z.number(),
  }),
}).parse(data);
export type EndoPiece = (typeof ENDONASAL)['pieces'][number];

/** the burr: a round diamond one, 3 mm (a drawing choice) */
export const ENDO_BURR_MM = 3;
/** the burr cuts in steps of at least this (mm), and stops this close to what it must not enter (mm) */
export const ENDO_STEP_MM = 0.2;
export const ENDO_STOP_MM = 0.3;
/** ...but it goes right down onto the arteries' wall (touching it, never into the lumen): drilling the bone off the
 * carotid as an exercise in anatomy */
export const ENDO_STOP_MM_AT: Record<'vessel' | 'nerve' | 'sellar' | 'brain', number> = { vessel: 0, nerve: ENDO_STOP_MM, sellar: ENDO_STOP_MM, brain: ENDO_STOP_MM };
const CUT_GRADIENT = 60;
/** a piece is taken this far past its edge (within its own voxels): where two pieces taken away meet, no film is left
 * between them */
const PIECE_OVERCUT_MM = 0.3;
export type EndoStop = 'vessel' | 'nerve' | 'sellar' | 'brain';
export const ENDO_STOPS: EndoStop[] = ['vessel', 'nerve', 'sellar', 'brain'];
export type EndoLayer = 'bone' | 'solid';
export type EndoSide = 'L' | 'R';
/** where the scope is aimed in the end: just above the sellar floor, in the midline (frame mm; the floor lies about
 * 3 mm above the fitted fossa on this CT) */
export const ENDO_TARGET: [number, number, number] = [0, 1, 5];
/** the scope goes on where the way has a clear core this wide round its line (mm; the scope is about 4 mm across: a
 * forgiving drawing choice, so that one pass of the burr along the line opens the way) */
export const ENDO_SCOPE_ROOM_MM = 1.25;
/** and stops this far short of the tissue ahead (its lens off the wall) */
export const ENDO_STANDOFF_MM = 1.5;

/**
 * The scope's way in: along the corridor through the nose as far as it was opened (`pivotMm`), looking along it and,
 * towards its end, at the sella; from there straight on the way it looks (turned about that point, as about the
 * opening it goes through): drilling where it looks opens its way on. Depth along it in mm.
 */
export class ScopePath {
  private readonly pts: THREE.Vector3[];
  private readonly s: number[];
  /** where the scope stops following the corridor (mm along it) and how far it can go in all */
  readonly pivotMm: number;
  readonly length: number;
  private readonly pivot: THREE.Vector3;
  /** the way from there to the sella */
  private readonly onward: THREE.Vector3;

  constructor(readonly side: EndoSide) {
    const c = ENDONASAL.corridor[side];
    this.pts = c.points.map((p) => new THREE.Vector3(...p));
    this.s = [0];
    for (let i = 1; i < this.pts.length; i++) this.s.push(this.s[i - 1] + this.pts[i].distanceTo(this.pts[i - 1]));
    // (well inside the opened corridor, so that wherever the scope comes to rest beyond it, it looks the way it goes on)
    this.pivotMm = Math.max(0, Math.min(c.openedMm, this.s[this.s.length - 1]) - 2 * ENDO_STANDOFF_MM);
    this.pivot = this.along(this.pivotMm);
    const toSella = new THREE.Vector3(...ENDO_TARGET).sub(this.pivot);
    this.onward = toSella.clone().normalize();
    this.length = this.pivotMm + toSella.length();
  }

  /** a point on the corridor, d mm along it */
  private along(d: number): THREE.Vector3 {
    const t = THREE.MathUtils.clamp(d, 0, this.s[this.s.length - 1]);
    let i = 1;
    while (i < this.s.length - 1 && this.s[i] < t) i++;
    const f = (t - this.s[i - 1]) / Math.max(this.s[i] - this.s[i - 1], 1e-6);
    return this.pts[i - 1].clone().lerp(this.pts[i], THREE.MathUtils.clamp(f, 0, 1));
  }

  /** which way the scope looks at depth d before it is turned: along the corridor (6 mm ahead), turning to the sella
   * over the 6 mm before the pivot */
  private base(d: number): THREE.Vector3 {
    const t = Math.min(d, this.pivotMm);
    const ahead = this.along(Math.min(t + 6, this.pivotMm)).sub(this.along(t));
    if (ahead.lengthSq() < 1e-6) return this.onward.clone();
    const w = THREE.MathUtils.smoothstep(t, this.pivotMm - 6, this.pivotMm);
    return ahead.normalize().lerp(this.onward, w).normalize();
  }

  /** The scope's tip and the way it looks at depth d, turned by yaw (deg, about the vertical) and pitch (deg). */
  pose(d: number, yaw = 0, pitch = 0): { tip: THREE.Vector3; dir: THREE.Vector3 } {
    const vert = new THREE.Vector3(0, 0, 1), base = this.base(d);
    const side = new THREE.Vector3().crossVectors(base, vert).normalize();
    const dir = base.applyAxisAngle(vert, THREE.MathUtils.degToRad(yaw)).applyAxisAngle(side, THREE.MathUtils.degToRad(pitch)).normalize();
    const tip = d <= this.pivotMm ? this.along(d) : this.pivot.clone().addScaledVector(dir, d - this.pivotMm);
    return { tip, dir };
  }

  /** whether the tip at depth d is past the sinus's opening (the corridor's end), towards the sella, by more than 1 mm:
   * in the sphenoid sinus, or deeper */
  inSinus(d: number): boolean {
    const recess = new THREE.Vector3(...ENDONASAL.corridor[this.side].recess);
    const on = new THREE.Vector3(...ENDO_TARGET).sub(recess).normalize();
    return this.pose(d).tip.sub(recess).dot(on) > 1;
  }

  /** whether the scope has room at depth d: air along its line and ENDO_SCOPE_ROOM_MM round it (in the corridor, round
   * the corridor: there the tip follows it, however the scope is turned) */
  room(vol: { inAir(p: THREE.Vector3): boolean }, d: number, yaw = 0, pitch = 0): boolean {
    const turned = d > this.pivotMm;
    const { tip: c, dir: ax } = this.pose(d, turned ? yaw : 0, turned ? pitch : 0);
    if (!vol.inAir(c)) return false;
    const a = new THREE.Vector3(0, 0, 1).cross(ax);
    if (a.lengthSq() < 1e-6) a.set(1, 0, 0);
    a.normalize();
    const b = new THREE.Vector3().crossVectors(ax, a);
    for (let k = 0; k < 8; k++) {
      const t = (k / 8) * Math.PI * 2;
      if (!vol.inAir(c.clone().addScaledVector(a, Math.cos(t) * ENDO_SCOPE_ROOM_MM).addScaledVector(b, Math.sin(t) * ENDO_SCOPE_ROOM_MM))) return false;
    }
    return true;
  }

  /** how far the scope goes: ENDO_STANDOFF_MM short of where it meets tissue (from where it first has room along the
   * way; past the pivot, never back before it), in 0.25-mm steps */
  reach(vol: { inAir(p: THREE.Vector3): boolean }, yaw = 0, pitch = 0): number {
    let d = 0;
    while (d < this.length && !this.room(vol, d, yaw, pitch)) d += 0.25;
    const first = d;
    while (d + 0.25 <= this.length && this.room(vol, d + 0.25, yaw, pitch)) d += 0.25;
    if (d >= this.length) return d;
    const stop = Math.max(first, d - ENDO_STANDOFF_MM);
    return d >= this.pivotMm ? Math.max(stop, this.pivotMm) : stop;
  }
}

export class SinusVolume implements FieldGrid {
  readonly nx: number; readonly ny: number; readonly nz: number;
  readonly fields: Record<EndoLayer, Uint8Array>;
  private readonly orig: Record<EndoLayer, Uint8Array>;
  readonly density: Uint8Array;
  readonly stops: Record<EndoStop, Uint8Array>;
  /** where the burr has been: cut surfaces are coloured as cut */
  readonly cut: Uint8Array;
  readonly toRas: THREE.Matrix4; readonly toIjk: THREE.Matrix4; readonly normalM: THREE.Matrix3;
  readonly iso = ENDONASAL.params.fieldIso;
  private readonly voxMm3: number;
  /** what was taken away (mm3): bone, and soft tissue (the lining, the septum's cartilage...) */
  removedMm3 = { bone: 0, soft: 0 };
  /** the pieces (PIECES in the pipeline): each voxel's label and level (its condition, mm, in pieceStepMm steps about
   * 128: below 128 inside it), the voxels of each, and which have been taken away */
  readonly piece: Uint8Array;
  readonly pieceLevel: Uint8Array;
  private readonly pieceVox = new Map<number, Int32Array>();
  private readonly pieceBox = new Map<number, [THREE.Vector3, THREE.Vector3]>();
  removed = new Set<string>();
  /** what each piece taken away took (mm3), to give back when it is put back */
  private pieceTook = new Map<string, { bone: number; soft: number }>();
  /** the modelled hypophysis where the lining may show it: 1 anterior lobe, 2 posterior lobe, 3 stalk */
  readonly gland: Uint8Array;

  constructor(buf: ArrayBuffer) {
    [this.nx, this.ny, this.nz] = ENDONASAL.dims;
    const n = this.nx * this.ny * this.nz;
    const f = (name: string) => new Uint8Array(buf, ENDONASAL.params.fields.indexOf(name) * n, n);
    this.orig = { bone: f('bone').slice(), solid: f('solid').slice() };
    this.fields = { bone: this.orig.bone.slice(), solid: this.orig.solid.slice() };
    this.density = f('density');
    this.stops = { vessel: f('vessel'), nerve: f('nerve'), sellar: f('sellar'), brain: f('brain') };
    this.cut = new Uint8Array(n);
    this.piece = f('piece');
    this.gland = f('gland');
    this.pieceLevel = f('pieceLevel');
    const count = new Map<number, number>();
    for (let x = 0; x < n; x++) if (this.piece[x]) count.set(this.piece[x], (count.get(this.piece[x]) ?? 0) + 1);
    for (const [l, c] of count) {
      this.pieceVox.set(l, new Int32Array(c));
      this.pieceBox.set(l, [new THREE.Vector3(Infinity, Infinity, Infinity), new THREE.Vector3(-Infinity, -Infinity, -Infinity)]);
    }
    const fill = new Map<number, number>();
    const V = new THREE.Vector3();
    for (let x = 0; x < n; x++) {
      const l = this.piece[x];
      if (!l) continue;
      const at = fill.get(l) ?? 0;
      this.pieceVox.get(l)![at] = x;
      fill.set(l, at + 1);
      const [lo, hi] = this.pieceBox.get(l)!;
      V.set(Math.floor(x / (this.ny * this.nz)), Math.floor(x / this.nz) % this.ny, x % this.nz);
      lo.min(V); hi.max(V);
    }
    const a = ENDONASAL.affine;
    this.toRas = new THREE.Matrix4().set(a[0][0], a[0][1], a[0][2], a[0][3], a[1][0], a[1][1], a[1][2], a[1][3], a[2][0], a[2][1], a[2][2], a[2][3], 0, 0, 0, 1);
    this.toIjk = this.toRas.clone().invert();
    this.normalM = new THREE.Matrix3().setFromMatrix4(this.toIjk).transpose();
    this.voxMm3 = Math.abs(new THREE.Matrix3().setFromMatrix4(this.toRas).determinant());
  }

  static async load(): Promise<SinusVolume> {
    const r = await fetch(assetUrl(ENDONASAL.file));
    if (!r.ok) throw new Error(`${ENDONASAL.file}: ${r.status}`);
    return new SinusVolume(await gunzip(await r.arrayBuffer()));
  }

  private idx(i: number, j: number, k: number): number { return (i * this.ny + j) * this.nz + k; }

  /** A field's value at a point in voxel coordinates (trilinear). Outside the box: the bone and the CT empty, the solid
   * closed (nothing seen beyond it), the distances far. */
  sample(f: Uint8Array, x: number, y: number, z: number): number {
    if (x < 0 || y < 0 || z < 0 || x > this.nx - 1 || y > this.ny - 1 || z > this.nz - 1) {
      return f === this.fields.solid ? 255 : f === this.fields.bone || f === this.density ? 0 : 255;
    }
    const i = Math.min(Math.floor(x), this.nx - 2), j = Math.min(Math.floor(y), this.ny - 2), k = Math.min(Math.floor(z), this.nz - 2);
    const u = x - i, v = y - j, w = z - k;
    const at = (a: number, b: number, c: number) => f[this.idx(i + a, j + b, k + c)];
    const l = (p: number, q: number, t: number) => p + (q - p) * t;
    return l(l(l(at(0, 0, 0), at(0, 0, 1), w), l(at(0, 1, 0), at(0, 1, 1), w), v), l(l(at(1, 0, 0), at(1, 0, 1), w), l(at(1, 1, 0), at(1, 1, 1), w), v), u);
  }

  /** Whether a point (frame mm) is in air (the burr and the scope's tip may be there). */
  inAir(p: THREE.Vector3): boolean {
    const q = p.clone().applyMatrix4(this.toIjk);
    return this.sample(this.fields.solid, q.x, q.y, q.z) < this.iso;
  }

  /** Where the burr (a sphere `burrMm` across), pushed along a ray (frame mm) from its origin, first touches tissue
   * with its front (within 60 degrees of the way it goes: walls it slides along do not stop it, the rim of a hole
   * narrower than it does), or (`stop`) comes within ENDO_STOP_MM_AT of what it must not enter; `point` is its front on
   * the ray then. Null if neither within `far` mm. */
  hit(ray: THREE.Ray, far = 80, burrMm = ENDO_BURR_MM): { point: THREE.Vector3; t: number; stop?: EndoStop } | null {
    const r = burrMm / 2, dir = ray.direction.clone().normalize();
    const lim = Object.fromEntries(ENDO_STOPS.map((s) => [s, (r + ENDO_STOP_MM_AT[s]) / ENDONASAL.params.distStepMm])) as Record<EndoStop, number>;
    // the burr's front: its axis and rings 20, 40 and 60 degrees off it
    const a = new THREE.Vector3(0, 0, 1).cross(dir);
    if (a.lengthSq() < 1e-6) a.set(1, 0, 0);
    a.normalize();
    const b = new THREE.Vector3().crossVectors(dir, a);
    const front: THREE.Vector3[] = [dir.clone().multiplyScalar(r)];
    for (const deg of [20, 40, 60]) for (let k = 0; k < 8; k++) {
      const th = THREE.MathUtils.degToRad(deg), ph = (k / 8) * Math.PI * 2;
      front.push(dir.clone().multiplyScalar(Math.cos(th) * r).addScaledVector(a, Math.sin(th) * Math.cos(ph) * r).addScaledVector(b, Math.sin(th) * Math.sin(ph) * r));
    }
    const offs = front.map((v) => ray.origin.clone().add(v).applyMatrix4(this.toIjk).sub(ray.origin.clone().applyMatrix4(this.toIjk)));
    const o = ray.origin.clone().applyMatrix4(this.toIjk);
    const step = ray.origin.clone().add(dir).applyMatrix4(this.toIjk).sub(o);   // voxels a mm along the ray
    const touches = (t: number) => {
      const cx = o.x + step.x * t, cy = o.y + step.y * t, cz = o.z + step.z * t;
      return offs.some((v) => this.sample(this.fields.solid, cx + v.x, cy + v.y, cz + v.z) >= this.iso);
    };
    const at = (t: number) => ray.origin.clone().addScaledVector(dir, t + r);
    for (let t = 0; t <= far; t += 0.1) {
      const cx = o.x + step.x * t, cy = o.y + step.y * t, cz = o.z + step.z * t;
      for (const s of ENDO_STOPS) if (this.sample(this.stops[s], cx, cy, cz) <= lim[s]) return { point: at(t), t: t + r, stop: s };
      if (touches(t)) {
        // (a burr that starts touching, the tip against the wall, works where it is)
        let lo = Math.max(0, t - 0.1), hi = t;
        for (let k = 0; k < 6 && t > 0; k++) { const m = (lo + hi) / 2; if (touches(m)) hi = m; else lo = m; }
        return { point: at(hi), t: hi + r };
      }
    }
    return null;
  }


  /** The burr's clearance (mm, from its surface) to each structure it must not enter, its centre here. */
  clearance(c: THREE.Vector3, burrMm = ENDO_BURR_MM): Record<EndoStop, number> {
    const q = c.clone().applyMatrix4(this.toIjk), s = ENDONASAL.params.distStepMm;
    const out = {} as Record<EndoStop, number>;
    for (const k of ENDO_STOPS) out[k] = this.sample(this.stops[k], q.x, q.y, q.z) * s - burrMm / 2;
    return out;
  }

  /** Cut the burr's sphere out of the bone and the tissue, centred here (frame mm). Returns the voxel box it changed. */
  carve(c: THREE.Vector3, burrMm = ENDO_BURR_MM): [THREE.Vector3, THREE.Vector3] | null {
    const r = burrMm / 2, reach = r + 255 / CUT_GRADIENT;
    const corners = [-1, 1].flatMap((sx) => [-1, 1].flatMap((sy) => [-1, 1].map((sz) => c.clone().add(new THREE.Vector3(sx, sy, sz).multiplyScalar(reach)).applyMatrix4(this.toIjk))));
    const lo = new THREE.Vector3(Infinity, Infinity, Infinity), hi = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    for (const p of corners) { lo.min(p); hi.max(p); }
    const i0 = Math.max(0, Math.floor(lo.x)), j0 = Math.max(0, Math.floor(lo.y)), k0 = Math.max(0, Math.floor(lo.z));
    const i1 = Math.min(this.nx - 1, Math.ceil(hi.x)), j1 = Math.min(this.ny - 1, Math.ceil(hi.y)), k1 = Math.min(this.nz - 1, Math.ceil(hi.z));
    if (i0 > i1 || j0 > j1 || k0 > k1) return null;
    const P = new THREE.Vector3(), B = this.fields.bone, S = this.fields.solid;
    let changed = false;
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) {
      const dist = P.set(i, j, k).applyMatrix4(this.toRas).distanceTo(c);
      const s = this.iso + (dist - r) * CUT_GRADIENT;
      if (s >= 255) continue;
      const x = this.idx(i, j, k);
      // (an artery's lumen is never opened: the burr's stop is judged from the distance at its centre, a voxel or so
      // coarser than this)
      const nw = Math.max(this.stops.vessel[x] === 0 && S[x] >= this.iso ? this.iso : 0, Math.round(s));
      if (nw < S[x]) {
        if (S[x] >= this.iso && nw < this.iso) { if (B[x] >= this.iso) this.removedMm3.bone += this.voxMm3; else this.removedMm3.soft += this.voxMm3; }
        S[x] = nw; changed = true;
        if (dist < r + 1) this.cut[x] = 1;
      }
      if (nw < B[x]) { B[x] = nw; changed = true; }
    }
    return changed ? [new THREE.Vector3(i0, j0, k0), new THREE.Vector3(i1, j1, k1)] : null;
  }

  snapshot(): { bone: Uint8Array; solid: Uint8Array; cut: Uint8Array; removed: { bone: number; soft: number }; pieces: string[] } {
    return { bone: this.fields.bone.slice(), solid: this.fields.solid.slice(), cut: this.cut.slice(), removed: { ...this.removedMm3 }, pieces: [...this.removed] };
  }

  restore(s: ReturnType<SinusVolume['snapshot']>): void {
    this.fields.bone.set(s.bone); this.fields.solid.set(s.solid); this.cut.set(s.cut); this.removedMm3 = { ...s.removed }; this.removed = new Set(s.pieces);
    for (const id of this.pieceTook.keys()) if (!this.removed.has(id)) this.pieceTook.delete(id);
  }

  reset(): void {
    this.fields.bone.set(this.orig.bone); this.fields.solid.set(this.orig.solid); this.cut.fill(0); this.removedMm3 = { bone: 0, soft: 0 }; this.removed.clear();
    this.pieceTook.clear();
  }

  /** a piece's condition at a voxel (mm; below 0 inside it), if the voxel is labelled with it */
  private level(x: number): number { return (this.pieceLevel[x] - 128) * ENDONASAL.params.pieceStepMm; }

  /** Take a piece away: the fields lowered to its condition (its cut surfaces smooth where it meets what stays).
   * Returns the voxels' box (for the meshes to follow), null if nothing changed. */
  removePiece(id: string): [THREE.Vector3, THREE.Vector3] | null {
    const pc = ENDONASAL.pieces.find((p) => p.id === id);
    const vox = pc && this.pieceVox.get(pc.label);
    if (!pc || !vox || this.removed.has(id)) return null;
    const B = this.fields.bone, S = this.fields.solid;
    const took = { bone: 0, soft: 0 };
    for (let v = 0; v < vox.length; v++) {
      // (but not into the dura over the gland, but by the dura itself)
      const x = vox[v], c = this.level(x) - (id === 'dura' || !this.gland[x] ? PIECE_OVERCUT_MM : 0);
      const nw = Math.max(0, Math.min(255, Math.round(this.iso + c * CUT_GRADIENT)));
      if (nw < S[x]) {
        if (S[x] >= this.iso && nw < this.iso) { if (B[x] >= this.iso) took.bone += this.voxMm3; else took.soft += this.voxMm3; }
        S[x] = nw;
      }
      if (nw < B[x]) B[x] = nw;
      // the bone's cut faces coloured as cut
      if (c > -1 && this.orig.bone[x] >= 64) this.cut[x] = 1;
    }
    this.removed.add(id);
    this.pieceTook.set(id, took);
    this.removedMm3.bone += took.bone; this.removedMm3.soft += took.soft;
    const [lo, hi] = this.pieceBox.get(pc.label)!;
    return [lo.clone(), hi.clone()];
  }

  /** Put a piece taken away back as it was (its voxels are its own: no other piece lowered them). Returns its box. */
  putBack(id: string): [THREE.Vector3, THREE.Vector3] | null {
    const pc = ENDONASAL.pieces.find((p) => p.id === id);
    const vox = pc && this.pieceVox.get(pc.label);
    if (!pc || !vox || !this.removed.has(id)) return null;
    for (let v = 0; v < vox.length; v++) {
      const x = vox[v];
      this.fields.solid[x] = this.orig.solid[x]; this.fields.bone[x] = this.orig.bone[x]; this.cut[x] = 0;
    }
    const took = this.pieceTook.get(id);
    if (took) { this.removedMm3.bone = Math.max(0, this.removedMm3.bone - took.bone); this.removedMm3.soft = Math.max(0, this.removedMm3.soft - took.soft); }
    this.pieceTook.delete(id);
    this.removed.delete(id);
    const [lo, hi] = this.pieceBox.get(pc.label)!;
    return [lo.clone(), hi.clone()];
  }

  /** The part of the hypophysis a lining's vertex lies on (voxel coordinates, its normal out of the tissue): 1 the
   * anterior lobe, 2 the posterior lobe, 3 the stalk, 0 none (the dura over it, and anything else, is not the gland). */
  glandAt(q: THREE.Vector3, n: THREE.Vector3): number {
    const inn = n.clone().applyMatrix3(new THREE.Matrix3().setFromMatrix4(this.toIjk)).multiplyScalar(-0.5);
    const i = Math.round(q.x + inn.x), j = Math.round(q.y + inn.y), k = Math.round(q.z + inn.z);
    if (i < 0 || j < 0 || k < 0 || i >= this.nx || j >= this.ny || k >= this.nz) return 0;
    const x = this.idx(i, j, k);
    if (!this.gland[x]) return 0;
    // (not while the dura over it is in place: that is what is seen there then)
    const dura = ENDONASAL.pieces.find((p) => p.id === 'dura');
    if (dura && this.piece[x] === dura.label && this.level(x) < 0 && !this.removed.has('dura')) return 0;
    return this.gland[x];
  }

  /** Where a ray (frame mm) first meets the lining (what the scope sees there), null if within `far` mm it does not. */
  surface(ray: THREE.Ray, far = 80): THREE.Vector3 | null {
    const dir = ray.direction.clone().normalize();
    const o = ray.origin.clone().applyMatrix4(this.toIjk);
    const step = ray.origin.clone().add(dir).applyMatrix4(this.toIjk).sub(o);
    const solid = (t: number) => this.sample(this.fields.solid, o.x + step.x * t, o.y + step.y * t, o.z + step.z * t);
    for (let t = 0; t <= far; t += 0.1) {
      if (solid(t) < this.iso) continue;
      let lo = Math.max(0, t - 0.1), hi = t;
      for (let k = 0; k < 6; k++) { const m = (lo + hi) / 2; if (solid(m) >= this.iso) hi = m; else lo = m; }
      return ray.origin.clone().addScaledVector(dir, hi);
    }
    return null;
  }

  /** The piece still in place at a point on the lining (frame mm), looking in along `dir`; null if none. */
  pieceAt(p: THREE.Vector3, dir: THREE.Vector3): EndoPiece | null {
    for (const t of [0.3, 0.8, 1.4]) {
      const q = p.clone().addScaledVector(dir, t).applyMatrix4(this.toIjk);
      const i = Math.round(q.x), j = Math.round(q.y), k = Math.round(q.z);
      if (i < 0 || j < 0 || k < 0 || i >= this.nx || j >= this.ny || k >= this.nz) continue;
      const x = this.idx(i, j, k), l = this.piece[x];
      if (!l || this.level(x) > 0.8) continue;
      const pc = ENDONASAL.pieces.find((q2) => q2.label === l);
      if (pc && !this.removed.has(pc.id)) return pc;
    }
    return null;
  }

  /** The label of the piece a lining's vertex lies on (voxel coordinates, its normal out of the tissue), 0 if none:
   * to tint the piece pointed at. */
  pieceOf(q: THREE.Vector3, n: THREE.Vector3): number {
    const inn = n.clone().applyMatrix3(new THREE.Matrix3().setFromMatrix4(this.toIjk)).multiplyScalar(-1);
    const i = Math.round(q.x + inn.x), j = Math.round(q.y + inn.y), k = Math.round(q.z + inn.z);
    if (i < 0 || j < 0 || k < 0 || i >= this.nx || j >= this.ny || k >= this.nz) return 0;
    const x = this.idx(i, j, k);
    return this.piece[x] && this.level(x) < 0.8 ? this.piece[x] : 0;
  }

  /** How far a point (voxel coordinates) lies from the arteries (mm). */
  vesselMm(q: THREE.Vector3): number {
    return this.sample(this.stops.vessel, q.x, q.y, q.z) * ENDONASAL.params.distStepMm;
  }

  /** the chunks a piece's voxels lie in */
  pieceChunks(id: string): [number, number, number][] {
    const pc = ENDONASAL.pieces.find((p) => p.id === id);
    const box = pc && this.pieceBox.get(pc.label);
    return box ? this.chunksOf(box[0], box[1]) : [];
  }

  get chunks(): [number, number, number] {
    return [Math.ceil((this.nx - 1) / CHUNK_VOX), Math.ceil((this.ny - 1) / CHUNK_VOX), Math.ceil((this.nz - 1) / CHUNK_VOX)];
  }

  /** The chunks a voxel box touches (with a cell round it). */
  chunksOf(lo: THREE.Vector3, hi: THREE.Vector3): [number, number, number][] {
    const [cx, cy, cz] = this.chunks, out: [number, number, number][] = [];
    const a = (x: number, n: number) => Math.max(0, Math.min(n - 1, Math.floor(x / CHUNK_VOX)));
    for (let i = a(lo.x - 2, cx); i <= a(hi.x + 1, cx); i++) for (let j = a(lo.y - 2, cy); j <= a(hi.y + 1, cy); j++)
      for (let k = a(lo.z - 2, cz); k <= a(hi.z + 1, cz); k++) out.push([i, j, k]);
    return out;
  }

  mesh(layer: EndoLayer, ci: number, cj: number, ck: number, colour: Colour): THREE.BufferGeometry | null {
    // (the lining faced into the tissue, away from the air: the endoscope draws a cavity's walls so)
    return meshChunk(this, this.fields[layer], this.iso, ci, cj, ck, colour, layer === 'solid');
  }

  /** At a point (voxel coordinates): whether the burr cut near it, and the CT (HU) a millimetre in from the surface. */
  at(q: THREE.Vector3, n: THREE.Vector3): { cut: boolean; hu: number } {
    const i = Math.round(q.x), j = Math.round(q.y), k = Math.round(q.z);
    let cut = false;
    for (let a = -1; a <= 1 && !cut; a++) for (let b = -1; b <= 1 && !cut; b++) for (let c = -1; c <= 1 && !cut; c++) {
      const x = i + a, y = j + b, w = k + c;
      if (x >= 0 && y >= 0 && w >= 0 && x < this.nx && y < this.ny && w < this.nz && this.cut[this.idx(x, y, w)]) cut = true;
    }
    const inn = n.clone().applyMatrix3(new THREE.Matrix3().setFromMatrix4(this.toIjk)).multiplyScalar(-2);
    const p = ENDONASAL.params;
    return { cut, hu: p.densityMinHu + this.sample(this.density, q.x + inn.x, q.y + inn.y, q.z + inn.z) * p.densityStepHu };
  }
}
