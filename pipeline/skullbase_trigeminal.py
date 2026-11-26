"""Trigeminal neuralgia: what the two surgical views measure on each skull base model, on the right side.

  pipeline/.venv/bin/python -u -I -W ignore pipeline/skullbase_trigeminal.py

Writes src/data/generated/sbv3-trigeminal.json (Skull base v3, the default model) and sb-trigeminal.json (v1, Z-Anatomy).
It writes no meshes and changes no other file. It reads the shipped meshes as the site draws them (public/assets, decoded
by pipeline/glb_dump.mjs into a temporary folder: they are meshopt-compressed), the generated manifests, landmarks and
craniotomies (src/data/generated), each model's bone field (pipeline/data/build/<model>/skull_bone.npz), on v3 the CT
(skullbase_canals.CTFrame) and the tentorium rebuilt from its cached anchors (skullbase_v3_tentorium.Tentorium; v3 draws
none; should its inputs have changed, that class rebuilds its cache, pipeline/data/build/skullbase-v3/tentorium.npz).
About 45 s on the desktop. Deterministic: fixed grids, seeded surface samples, no iteration over sets; two runs give the same bytes.

The owner's decisions (26 November 2026), which this follows:
 1. The microvascular decompression (MVD) view is on v3 only. On v1 the trigeminal root enters the front of the pons,
    and from the retrosigmoid side the pons hides it: v1's file has "mvd": null and only the percutaneous route.
 2. The needle is Haertel's "trigeminal axis" as Slettebo 2025 (PMC12043756) reports it (a line from the middle of the
    trigeminal impression through the middle of the foramen ovale to the cheek): the straight line from Meckel's cave
    through the foramen ovale. Its tip is at the cave target, its outer end NEEDLE_OUT_MM below the foramen along the
    line. Where the line through the foramen's centre meets bone (v3: the greater wing's lip 5-10 mm below the foramen;
    v3's bone field shows only about 40 % of the CT's opening), the line passes through the part of the opening from
    which the whole needle is clear of bone: the clear part's middle (Slettebo reached the cave through the medial part
    of the foramen in 17 of 22 sides). v1 has no ganglion and no Meckel's cave (Z-Anatomy's V1-V3 leave the nerve inside
    the pons): its tip is the point on the mandibular nerve's run (the trigeminal nerve mesh's run down to the foramen)
    as far from the foramen's centre as v3's cave lies from v3's, and its right foramen ovale is the mirror of its left
    landmark (v1 is mirror-symmetric).
 3. The MVD camera sits inside the posterior fossa along the tentorium-petrous corridor, aimed at the root entry zone:
    from the root entry zone along the line from the porus trigeminus to the superior petrosal sinus's lateral end (the
    petrous ridge), CAMERA_BACK_MM short of the first thing on that line (a drawn mesh with the retrosigmoid shape at 1,
    or the rebuilt tentorium).

What it measures:
  landmarks  v3: "Root entry zone of the trigeminal nerve", right and left: the centre of the nerve tube's end at the
             pons (skullbase_v3_roots.py cut each routed nerve where it enters the drawn brainstem; the root point of
             skullbase_pfossa.trigeminal_root, the fitted course's last point near the fitted pons, is where the routed
             nerve began before that cut and before the hindbrain was refitted, so the tube's own end is used).
             v1: "Foramen ovale", right: the left landmark mirrored (x -> -x).
  mvd        (v3) the root entry zone; the porus (the nerve's point nearest the superior petrosal sinus) and the
             cisternal length along the nerve to it; the camera; how much of the camera-facing surface of the root's
             first ROOT_MM the camera sees (surface samples, rays against every mesh the view draws, retrosigmoid shape
             1, the bone removed see-through); how far the root lies above the craniotomy's centre (the removed piece's
             surface centroid); the superior cerebellar arteries' and the AICA's nearest approach to the root's first
             ROOT_MM (shape 1); where the facial and vestibulocochlear nerves leave the brainstem.
  ovale      the foramen's narrowest section square to its canal: for each candidate axis near the mandibular nerve's
             direction, sections every 0.5 mm, the bone-free region round the axis that bone encloses on a 0.2 mm grid;
             the axis and section with the smallest such region. Its centre (the region's centroid), length (largest
             Feret diameter), width (smallest caliper width) and area. The bone is the model's bone field at the level
             its surface is drawn at (v3: the field smoothed by 0.6 voxels, at skullbase_ct.SURFACE_LEVEL, as
             skullbase_v3_skull.py draws it; v1: its softened field at that level). v3 also: the CT's opening by
             half-maximum HU profiles through the section's centre along its long and short axes (area as an ellipse).
  needle     tip, crossing (where the line passes the narrowest section), outer end; its angles in the model's frame (x
             right, y front, z up) for the needle pointing inward and up: from the vertical, toward the midline in a
             frontal projection, backward in a lateral projection; the bone it crosses (0 by construction, checked); the
             named structures within NEAR_MM of it and where along it (from the crossing, + outward); in a lateral
             projection at the articular eminence's height, how far in front of the bony external acoustic meatus the
             line passes and the eminence lies (both from the bone field); a camera on the line ALONG_MM out (the foramen
             as the needle sees it) and how much opening it sees through to the cranial cavity; an overview camera
             OVERVIEW_MM from the needle's middle, below it and lateral, on a fixed grid of directions (OVERVIEW_ELEV,
             OVERVIEW_AZIM) within OVERVIEW_OFF_DEG of square to the needle: the one that sees the most of the needle's
             middle (20-80 % of its length, 61 points) past bone, weighted by the cosine of its angle off square (the
             length seen, as projected).
             (A view square to this needle from lateral and below does not exist: square to a needle that rises
             medially, a lateral direction points up. Its top lies in the canal and the cranial cavity, hidden from
             outside whatever the camera; the site draws the needle see-through as well.)
"""
from __future__ import annotations

import heapq
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import nibabel as nib
import numpy as np
import trimesh
from scipy import ndimage
from scipy.spatial import ConvexHull, cKDTree

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent
GEN = REPO / "src" / "data" / "generated"
BUILD = ROOT / "data" / "build"
sys.path.insert(0, str(ROOT))

SURFACE_LEVEL = 0.4          # skullbase_ct.SURFACE_LEVEL: the bone surface at this level of the field
V3_SMOOTH_VOX = 0.6          # skullbase_v3_skull.py smooths its field by this before taking the surface
ROOT_MM = 10.0               # the root's first this many mm from its entry zone
CAMERA_BACK_MM = 3.0         # the MVD camera this far short of the first thing on its line
NEEDLE_OUT_MM = 40.0         # the needle's outer end this far below the crossing
NEAR_MM = 6.0                # structures listed within this of the needle
ALONG_MM = 90.0              # the camera along the needle, this far out from the crossing
OVERVIEW_MM = 160.0          # the overview camera, this far from the needle's middle ...
OVERVIEW_ELEV = range(-35, -9, 5)       # ... below the needle's middle (degrees below the frame's horizontal) ...
OVERVIEW_AZIM = range(-45, 46, 5)       # ... and lateral (degrees from +x, positive to the front) ...
OVERVIEW_OFF_DEG = 35.0                 # ... looking at the needle within this of square to it
SAMPLES = 20000              # surface samples of the nerve (seeded)
SEED = 3

RETRO_CONTEXT = ['Trigeminal nerve (V)', 'Trigeminal ganglion', 'Abducens nerve (VI)', 'Facial nerve (VII)', 'Vestibulocochlear nerve (VIII)',
                 'Nerves in the internal acoustic meatus (VII, VIII)', 'Glossopharyngeal nerve (IX)', 'Vagus nerve (X)', 'Accessory nerve (XI)',
                 'Anterior inferior cerebellar artery', 'Superior cerebellar artery', 'Superior cerebellar artery (fitted course)',
                 'Posterior inferior cerebellar artery', 'Posterior inferior cerebellar artery (fitted course)', 'Basilar artery', 'Vertebral artery',
                 'Sigmoid sinus', 'Transverse sinus', 'Hypoglossal nerve (XII)', 'Superior petrosal sinus', 'Trochlear nerve (IV)']  # approaches.ts, retrosigmoid
# (each a structure the percutaneous view draws on that model: v1's view leaves the walls of the cavernous sinus out)
NEAR_NAMES = {'v3': ['Internal carotid artery', 'Internal carotid artery (petrous and lacerum parts)', 'Internal carotid artery (cervical part)',
                     'Mandibular nerve (V3)', 'Maxillary nerve (V2)', 'Accessory branch of middle meningeal artery', 'Middle meningeal artery',
                     'Cavernous sinus', 'Walls of the cavernous sinus'],
              'zanatomy': ['Internal carotid artery', 'Mandibular nerve (V3)', 'Maxillary nerve (V2)', 'Trigeminal nerve (V)',
                           'Accessory branch of middle meningeal artery', 'Middle meningeal artery', 'Cavernous sinus']}
CFG = {
    'v3': dict(prefix='sbv3', build='skullbase-v3', nerve='tb_trigeminal_nerve_v', v3n='tb_mandibular_nerve_v3', sps='sb_superior_petrosal_sinus',
               vii='tb_facial_nerve_vii', viii='tb_vestibulocochlear_nerve_viii', tm='tb_tympanic_membrane', sphenoid='sb_sphenoid_bone'),
    'zanatomy': dict(prefix='sb', build='skullbase', nerve='sb_trigeminal_nerve_v', v3n='sb_trigeminal_nerve_v', tm='sb_tympanic_membrane',
                     sphenoid='sb_sphenoid_bone'),
}


def r2(x) -> float:
    return round(float(x), 2) + 0.0


def r1(x) -> float:
    return round(float(x), 1) + 0.0


def v2(v) -> list:
    return [r2(x) for x in v]


def unit(v) -> np.ndarray:
    v = np.asarray(v, float)
    return v / np.linalg.norm(v)


# ---------------------------------------------------------------------------------------------- the shipped meshes
class Model:
    """A model's manifest, landmarks and craniotomies, and its shipped meshes (decoded on demand by glb_dump.mjs)."""

    def __init__(self, key: str, tmp: Path):
        self.key, self.cfg, self.tmp = key, CFG[key], tmp / key
        p = self.cfg['prefix']
        self.structures = json.loads((GEN / f"{p}-manifest.json").read_text())['structures']
        self.by = {s['id']: s for s in self.structures}
        self.own = [s for s in self.structures if not s.get('pushedFrom')]
        self.landmarks = json.loads((GEN / f"{p}-landmarks.json").read_text())
        self.approaches = json.loads((GEN / f"{p}-approaches.json").read_text())
        self.records: dict[str, list] = {}

    def lm(self, name: str, side: str) -> np.ndarray:
        for l in self.landmarks:
            if l['name'] == name and l['side'] == side:
                return np.array(l['ras'], float)
        raise KeyError((self.key, name, side))

    def ids_named(self, *names: str) -> list[str]:
        return [s['id'] for s in self.own if s['name'] in names and not s.get('approach')]

    def need(self, ids) -> None:
        todo = []
        for i in ids:
            if i not in self.records and i not in todo:
                todo.append(i)
        if not todo:
            return
        out = self.tmp / str(len(self.records))
        files = [self.by[i]['file'].removeprefix('assets/') for i in todo]
        subprocess.run(['node', str(ROOT / 'glb_dump.mjs'), str(out), *files], check=True, cwd=REPO)
        for k, i in enumerate(todo):
            meta = json.loads((out / f"{k}.json").read_text())
            raw = (out / f"{k}.bin").read_bytes()
            recs = []
            for r in meta['nodes']:
                P = np.frombuffer(raw, np.float32, r['n'] * 3, r['pos']).reshape(-1, 3).astype(float)
                I = np.frombuffer(raw, np.uint32, r['ni'], r['idx']).astype(np.int64)
                T = {t['name']: np.frombuffer(raw, np.float32, r['n'] * 3, t['off']).reshape(-1, 3).astype(float) for t in r['targets']}
                recs.append({'name': r['name'], 'mode': r['mode'], 'P': P, 'I': I, 'targets': T})
            self.records[i] = recs

    def has_target(self, sid: str, target: str) -> bool:
        self.need([sid])
        return any(target in r['targets'] for r in self.records[sid])

    def mesh(self, sid: str, side: str | None = None, morph: dict | None = None) -> trimesh.Trimesh | None:
        """The structure's triangles (nodes of one side and the midline ones, or all), morph weights applied."""
        self.need([sid])
        parts = []
        for r in self.records[sid]:
            if r['mode'] != 4 or (side is not None and r['name'] not in (side, 'both', 'M')):
                continue
            P = r['P'].copy()
            for k, w in sorted((morph or {}).items()):
                if k in r['targets']:
                    P += w * r['targets'][k]
            parts.append(trimesh.Trimesh(P, r['I'].reshape(-1, 3), process=False))
        if not parts:
            return None
        return trimesh.util.concatenate(parts) if len(parts) > 1 else parts[0]


# ---------------------------------------------------------------------------------------------- geometry
def _closest_on_tri(P, A, B, C):
    """Closest points on triangles (A, B, C) to points P, all (n, 3) (Ericson's regions, vectorised)."""
    ab, ac, ap = B - A, C - A, P - A
    d1, d2 = (ab * ap).sum(1), (ac * ap).sum(1)
    bp = P - B
    d3, d4 = (ab * bp).sum(1), (ac * bp).sum(1)
    cp = P - C
    d5, d6 = (ab * cp).sum(1), (ac * cp).sum(1)
    vc = d1 * d4 - d3 * d2
    vb = d5 * d2 - d1 * d6
    va = d3 * d6 - d5 * d4
    den = va + vb + vc
    den = np.where(np.abs(den) < 1e-18, 1e-18, den)
    res = A + ab * (vb / den)[:, None] + ac * (vc / den)[:, None]
    m = (d1 <= 0) & (d2 <= 0); res[m] = A[m]
    m = (d3 >= 0) & (d4 <= d3); res[m] = B[m]
    m = (d6 >= 0) & (d5 <= d6); res[m] = C[m]
    m = (vc <= 0) & (d1 >= 0) & (d3 <= 0)
    t = d1 / np.where(np.abs(d1 - d3) < 1e-18, 1e-18, d1 - d3)
    res[m] = (A + ab * t[:, None])[m]
    m = (vb <= 0) & (d2 >= 0) & (d6 <= 0)
    t = d2 / np.where(np.abs(d2 - d6) < 1e-18, 1e-18, d2 - d6)
    res[m] = (A + ac * t[:, None])[m]
    m = (va <= 0) & ((d4 - d3) >= 0) & ((d5 - d6) >= 0)
    t = (d4 - d3) / np.where(np.abs((d4 - d3) + (d5 - d6)) < 1e-18, 1e-18, (d4 - d3) + (d5 - d6))
    res[m] = (B + (C - B) * t[:, None])[m]
    return res


class Surf:
    """A triangle surface: exact closest points, the generalised winding number, and ray hits."""

    def __init__(self, mesh: trimesh.Trimesh):
        self.m = mesh
        V = np.asarray(mesh.vertices, float)
        self.tri = V[np.asarray(mesh.faces, np.int64)]
        self.cen = self.tri.mean(1)
        self.rad = np.linalg.norm(self.tri - self.cen[:, None], axis=2).max(1)
        self.tree = cKDTree(self.cen)
        self.rmax = float(self.rad.max())
        self.lo, self.hi = V.min(0), V.max(0)

    def closest(self, Q, k=24):
        Q = np.atleast_2d(np.asarray(Q, float))
        k = min(k, len(self.tri))
        d0, idx = self.tree.query(Q, k=k)
        if k == 1:
            idx, d0 = idx[:, None], d0[:, None]
        best_d = np.full(len(Q), np.inf)
        best_p = np.zeros_like(Q)
        for j in range(idx.shape[1]):
            T = self.tri[idx[:, j]]
            p = _closest_on_tri(Q, T[:, 0], T[:, 1], T[:, 2])
            d = np.linalg.norm(p - Q, axis=1)
            m = d < best_d
            best_d[m], best_p[m] = d[m], p[m]
        for i in np.nonzero(d0[:, -1] < best_d + self.rmax)[0]:   # a triangle further by centroid may still be closer
            cand = sorted(self.tree.query_ball_point(Q[i], best_d[i] + self.rmax))
            if not cand:
                continue
            T = self.tri[cand]
            p = _closest_on_tri(np.repeat(Q[i:i + 1], len(cand), 0), T[:, 0], T[:, 1], T[:, 2])
            d = np.linalg.norm(p - Q[i], axis=1)
            j = int(np.argmin(d))
            if d[j] < best_d[i]:
                best_d[i], best_p[i] = d[j], p[j]
        return best_p, best_d

    def winding(self, Q, chunk=100):
        Q = np.atleast_2d(np.asarray(Q, float))
        out = np.zeros(len(Q))
        A, B, C = self.tri[:, 0], self.tri[:, 1], self.tri[:, 2]
        for s in range(0, len(Q), chunk):
            q = Q[s:s + chunk, None, :]
            a, b, c = A[None] - q, B[None] - q, C[None] - q
            la, lb, lc = (np.linalg.norm(x, axis=2) for x in (a, b, c))
            det = np.einsum('ijk,ijk->ij', a, np.cross(b, c))
            den = la * lb * lc + np.einsum('ijk,ijk->ij', a, b) * lc + np.einsum('ijk,ijk->ij', b, c) * la + np.einsum('ijk,ijk->ij', c, a) * lb
            out[s:s + chunk] = (2 * np.arctan2(det, den)).sum(1) / (4 * np.pi)
        return out

    def signed(self, Q):
        _, d = self.closest(Q)
        return np.where(np.abs(self.winding(Q)) > 0.5, -d, d)

    def ray(self, o, d, tmax=np.inf):
        """Distances t > 0 (up to tmax) at which o + t d (d unit) meets the surface, sorted."""
        o, d = np.asarray(o, float), np.asarray(d, float)
        if np.isfinite(tmax):
            e = o + d * tmax
            if (np.minimum(o, e) > self.hi + 1e-6).any() or (np.maximum(o, e) < self.lo - 1e-6).any():
                return np.zeros(0)
        oc = self.cen - o
        tc = oc @ d
        perp = np.linalg.norm(oc - np.outer(tc, d), axis=1)
        keep = (perp <= self.rad + 1e-6) & (tc >= -self.rad) & (tc <= tmax + self.rad)
        if not keep.any():
            return np.zeros(0)
        A, B, C = self.tri[keep, 0], self.tri[keep, 1], self.tri[keep, 2]
        e1, e2 = B - A, C - A
        p = np.cross(d[None], e2)
        det = (e1 * p).sum(1)
        ok = np.abs(det) > 1e-12
        inv = np.where(ok, 1.0 / np.where(ok, det, 1), 0)
        s = o[None] - A
        u = (s * p).sum(1) * inv
        q = np.cross(s, e1)
        v = (q * d[None]).sum(1) * inv
        t = (e2 * q).sum(1) * inv
        hit = ok & (u >= 0) & (v >= 0) & (u + v <= 1) & (t > 1e-6) & (t <= tmax)
        return np.sort(t[hit])


def smooth(C, rounds=1):
    C = C.copy()
    for _ in range(rounds):
        C[1:-1] = 0.25 * C[:-2] + 0.5 * C[1:-1] + 0.25 * C[2:]
    return C


def resample(C, step):
    s = arclen(C)
    t = np.arange(0, s[-1] + 1e-9, step)
    return np.stack([np.interp(t, s, C[:, k]) for k in range(3)], 1)


def arclen(C):
    return np.r_[0.0, np.cumsum(np.linalg.norm(np.diff(C, axis=0), axis=1))]


def tube_centreline(mesh: trimesh.Trimesh, step=0.5, bin_mm=0.75) -> np.ndarray:
    """Centre line of an unbranched tube: the geodesic parameter between its two far ends (Dijkstra over the edges),
    binned and averaged, smoothed, then each point moved to the centroid of the tube's cross-section through it."""
    mesh = mesh.copy()
    mesh.merge_vertices(digits_vertex=3)
    V = np.asarray(mesh.vertices, float)
    E = np.asarray(mesh.edges_unique, np.int64)
    L = np.linalg.norm(V[E[:, 0]] - V[E[:, 1]], axis=1)
    adj = [[] for _ in range(len(V))]
    for (a, b), w in zip(E.tolist(), L.tolist()):
        adj[a].append((b, w)); adj[b].append((a, w))

    def dij(src):
        dist = np.full(len(V), np.inf); dist[src] = 0.0; h = [(0.0, src)]
        while h:
            dd, u = heapq.heappop(h)
            if dd > dist[u]:
                continue
            for v, w in adj[u]:
                if dd + w < dist[v]:
                    dist[v] = dd + w; heapq.heappush(h, (dd + w, v))
        return dist
    comp = trimesh.graph.connected_components(E, nodes=np.arange(len(V)))
    big = min(comp, key=lambda c: (-len(c), int(np.min(c))))
    d0 = dij(int(np.min(big)))
    a = int(np.argmax(np.where(np.isfinite(d0), d0, -1)))
    da = dij(a)
    b = int(np.argmax(np.where(np.isfinite(da), da, -1)))
    db = dij(b)
    fin = np.isfinite(da) & np.isfinite(db)
    dmax = float(da[fin].max())
    s = np.full(len(V), np.nan)
    s[fin] = da[fin] / (da[fin] + db[fin] + 1e-12) * dmax
    nb = max(2, int(np.ceil(np.nanmax(s) / bin_mm)))
    edges = np.linspace(0, np.nanmax(s) + 1e-9, nb + 1)
    pts = [V[fin & (s >= edges[i]) & (s < edges[i + 1])].mean(0) for i in range(nb) if (fin & (s >= edges[i]) & (s < edges[i + 1])).sum() >= 3]
    C = resample(smooth(np.array(pts), 2), step)
    T = np.gradient(C, axis=0)
    T /= np.linalg.norm(T, axis=1, keepdims=True) + 1e-12
    out = []
    for p, t in zip(C, T):
        sec = mesh.section(plane_origin=p, plane_normal=t)
        best = None
        for ent in ([] if sec is None else sec.discrete):
            if len(ent) < 4:
                continue
            c = ent.mean(0)
            dd = np.linalg.norm(c - p)
            if dd < max(2.5, 1.5 * np.linalg.norm(ent - c, axis=1).max()) and (best is None or dd < best[0]):
                best = (dd, c)
        out.append(p if best is None else best[1])
    return resample(smooth(np.array(out), 1), step)


def basis(axis):
    a = unit(axis)
    t = np.array([1.0, 0, 0]) if abs(a[0]) < 0.9 else np.array([0, 1.0, 0])
    e1 = unit(np.cross(a, t))
    return a, e1, np.cross(a, e1)


# ---------------------------------------------------------------------------------------------- bone
def bone_field(key: str):
    """The bone as the model draws it: True inside. v3: its field smoothed as skullbase_v3_skull.py smooths it before
    taking the surface; v1: its field as softened (skullbase_v1_skull.py); both at SURFACE_LEVEL."""
    z = np.load(BUILD / CFG[key]['build'] / "skull_bone.npz")
    b = z['b'].astype(np.float32)
    if key == 'v3':
        b = ndimage.gaussian_filter(b, V3_SMOOTH_VOX)
    inv = np.linalg.inv(z['a'])
    return lambda P: ndimage.map_coordinates(b, nib.affines.apply_affine(inv, np.atleast_2d(P)).T, order=1, mode='constant') >= SURFACE_LEVEL


def runs(mask, t):
    out, i = [], 0
    while i < len(mask):
        if mask[i]:
            j = i
            while j + 1 < len(mask) and mask[j + 1]:
                j += 1
            out.append([r1(t[i]), r1(t[j])]); i = j + 1
        else:
            i += 1
    return out


# ---------------------------------------------------------------------------------------------- the foramen ovale
HALF, STEP = 10.0, 0.2


def grid_pts(c, e1, e2, half=HALF, step=STEP):
    u = np.arange(-half, half + 1e-9, step)
    U, W = np.meshgrid(u, u, indexing='ij')
    return c + U[..., None] * e1 + W[..., None] * e2, u


def hole(mask, u, step=STEP):
    """The free region connected to the window's centre (or the free pixel nearest it, within 2 mm); None if it reaches
    the window's edge (not enclosed)."""
    n = len(u); ci = n // 2
    free = ~mask
    si, sj = ci, ci
    if not free[ci, ci]:
        ii, jj = np.nonzero(free)
        if not len(ii):
            return None
        d = (ii - ci) ** 2 + (jj - ci) ** 2
        k = int(np.argmin(d))
        if d[k] * step ** 2 > 4.0:
            return None
        si, sj = ii[k], jj[k]
    lab, _ = ndimage.label(free)
    reg = lab == lab[si, sj]
    if reg[0].any() or reg[-1].any() or reg[:, 0].any() or reg[:, -1].any():
        return None
    return reg


def shape_of(reg, u, step=STEP):
    ii, jj = np.nonzero(reg)
    P = np.c_[u[ii], u[jj]]
    C = np.vstack([P + np.array(o) * step / 2 for o in [(-1, -1), (-1, 1), (1, -1), (1, 1)]])
    H = C[ConvexHull(C).vertices]
    length = float(np.linalg.norm(H[:, None] - H[None], axis=2).max())
    ang = np.radians(np.arange(0, 180, 1.0))
    dirs = np.c_[np.cos(ang), np.sin(ang)]
    ext = H @ dirs.T
    widths = ext.max(0) - ext.min(0)
    return {'area': len(P) * step ** 2, 'length': length, 'width': float(widths.min()), 'centroid_uv': P.mean(0),
            'long_uv': dirs[int(np.argmax(widths))]}


def sections(bone, c, axis, wr):
    a, e1, e2 = basis(axis)
    rows = []
    for w in wr:
        G, u = grid_pts(c + w * a, e1, e2)
        reg = hole(bone(G.reshape(-1, 3)).reshape(G.shape[:2]), u)
        if reg is None:
            rows.append((float(w), None)); continue
        sh = shape_of(reg, u)
        cu, cv = sh['centroid_uv']
        sh['centre'] = c + w * a + cu * e1 + cv * e2
        sh['long'] = sh['long_uv'][0] * e1 + sh['long_uv'][1] * e2
        rows.append((float(w), sh))
    return rows


def narrowest(rows):
    ok = [(w, s) for w, s in rows if s is not None]
    return min(ok, key=lambda x: (x[1]['area'], abs(x[0]))) if ok else None


def cone_dirs(axis, max_deg=35, step=7):
    a, e1, e2 = basis(axis)
    out = [a]
    for th in range(step, max_deg + 1, step):
        for ph in range(0, 360, 45):
            t, p = np.radians(th), np.radians(ph)
            out.append(unit(np.cos(t) * a + np.sin(t) * (np.cos(p) * e1 + np.sin(p) * e2)))
    return out


def nerve_axis(M: Model, sid: str, near: np.ndarray):
    """The nerve's centre line, and its direction (pointing down) over 6 mm round its point nearest `near`."""
    C = tube_centreline(M.mesh(sid, 'R'))
    s = arclen(C)
    i = int(np.argmin(np.linalg.norm(C - near, axis=1)))
    j0, j1 = int(np.searchsorted(s, s[i] - 3)), min(len(C) - 1, int(np.searchsorted(s, s[i] + 3)))
    t = unit(C[j1] - C[j0])
    return C, (-t if t[2] > 0 else t)


def ovale(M: Model, bone, F0: np.ndarray):
    """The narrowest section square to the canal: the axis (near the mandibular nerve's) and the section."""
    C, t = nerve_axis(M, M.cfg['v3n'], F0)
    best = None
    for d in cone_dirs(t):
        nw = narrowest(sections(bone, F0, d, np.arange(-6, 6.01, 1.0)))
        if nw is not None and (best is None or nw[1]['area'] < best[1]['area'] - 1e-9):
            best = (d, nw[1])
    if best is None:
        raise RuntimeError(f"{M.key}: no enclosed section of the foramen ovale")
    axis = best[0]
    w, s = narrowest(sections(bone, F0, axis, np.arange(-8, 8.01, 0.5)))
    return {'axis': axis if axis[2] < 0 else -axis, 'centre': s['centre'], 'length': s['length'], 'width': s['width'], 'area': s['area'],
            'long': s['long'], 'nerve_axis': t, 'nerve_line': C, 'axis_to_nerve_deg': float(np.degrees(np.arccos(min(1.0, abs(axis @ t)))))}


def half_max_extent(ct, c, d, reach=8.0, step=0.05):
    """The opening's extent along d through c in the CT: each side's wall where the HU profile first reaches half way
    from the opening's lowest value (within 1.5 mm of c) to that side's highest (within `reach`)."""
    t = np.arange(-reach, reach + 1e-9, step)
    hu = ct.sample(c + np.outer(t, d))
    mid = np.abs(t) <= 1.5
    lo = float(hu[mid].min())
    ends = []
    for sgn in (1, -1):
        side = (sgn * t >= 0)
        tt, hh = t[side][::sgn], hu[side][::sgn]
        peak = float(hh.max())
        half = 0.5 * (lo + peak)
        k0 = int(np.argmin(np.where(np.abs(tt) <= 1.5, hh, np.inf)))
        k = k0 + int(np.argmax(hh[k0:] >= half))
        a = (half - hh[k - 1]) / (hh[k] - hh[k - 1])
        ends.append(tt[k - 1] + a * (tt[k] - tt[k - 1]))
    return float(ends[0] - ends[1]), c + 0.5 * (ends[0] + ends[1]) * d


def ovale_ct(o: dict) -> dict:
    """The CT's opening at the bone field's narrowest section: half-maximum profiles along its long and short axes,
    each re-centred on the other's midpoint twice."""
    import skullbase_canals as SC
    ct = SC.CTFrame()
    a = unit(o['axis'])
    lg = unit(o['long'] - (o['long'] @ a) * a)
    sh = np.cross(a, lg)
    c = o['centre'].copy()
    for _ in range(2):
        L, c = half_max_extent(ct, c, lg)
        W, c = half_max_extent(ct, c, sh)
    return {'lengthMm': r2(L), 'widthMm': r2(W), 'areaMm2': r2(np.pi / 4 * L * W),
            'how': 'half-maximum HU profiles across the CT through the opening, along the section’s long and short axes; area as an ellipse'}


# ---------------------------------------------------------------------------------------------- the needle
def segment_clear(bone, A, B, step=0.1):
    t = np.arange(0, np.linalg.norm(B - A) + 1e-9, step)
    return not bone(A + np.outer(t, unit(B - A))).any()


def clearance(bone, A, B, rmax=1.0, dr=0.05, step=0.1) -> float:
    """The largest radius (to `dr`, at most `rmax`) of a rod from A to B that no bone enters: the segment's points and
    twelve points round each at that radius."""
    u = unit(B - A)
    _, b1, b2 = basis(u)
    P = A + np.outer(np.arange(0, np.linalg.norm(B - A) + 1e-9, step), u)
    ang = np.radians(np.arange(0, 360, 30))
    ring = np.cos(ang)[:, None] * b1 + np.sin(ang)[:, None] * b2
    best = 0.0
    for r in np.arange(dr, rmax + 1e-9, dr):
        if bone((P[:, None, :] + r * ring[None]).reshape(-1, 3)).any():
            break
        best = float(r)
    return best


def rays_blocked(bone, cam, Q, beyond: float, step=0.25):
    """For rays from cam to each point of Q, carried on `beyond` mm past it (negative: stopping short), whether bone
    lies on them."""
    Q = np.atleast_2d(Q)
    D = Q - cam
    L = np.linalg.norm(D, axis=1)
    U = D / L[:, None]
    t = np.arange(0, L.max() + beyond + 1e-9, step)
    out = np.zeros(len(Q), bool)
    for s in range(0, len(Q), 256):
        P = cam + U[s:s + 256, None, :] * t[None, :, None]
        b = bone(P.reshape(-1, 3)).reshape(P.shape[:2]) & (t[None, :] <= (L[s:s + 256] + beyond)[:, None])
        out[s:s + 256] = b.any(1)
    return out


def angles(d_up):
    """The needle pointing inward and up (right side): from the vertical; toward the midline in a frontal projection;
    backward in a lateral projection."""
    return {'fromVerticalDeg': r1(np.degrees(np.arccos(d_up[2]))), 'medialDeg': r1(np.degrees(np.arctan2(-d_up[0], d_up[2]))),
            'backwardDeg': r1(np.degrees(np.arctan2(-d_up[1], d_up[2])))}


def eam_and_eminence(bone, tm):
    """The bony external acoustic meatus: sagittal sections lateral of the tympanic membrane, the enclosed hole followed
    out to its last section (its lateral end). The articular eminence: in columns x 2-14 mm medial of the meatus, the
    underside of the first bone from above along y; the mandibular fossa its highest point 3-18 mm in front of the
    meatus, the eminence the lowest within 15 mm in front of that; the medians over the columns."""
    last, c0 = None, np.asarray(tm, float).copy()
    for dx in np.arange(2, 30, 1.0):
        c = np.array([c0[0] + dx, c0[1], c0[2]])
        G, u = grid_pts(c, np.array([0, 1.0, 0]), np.array([0, 0, 1.0]), 12.0, 0.3)
        free = ~bone(G.reshape(-1, 3)).reshape(G.shape[:2])
        ii, jj = np.nonzero(free)
        if not len(ii):
            continue
        ci = len(u) // 2
        k = int(np.argmin((ii - ci) ** 2 + (jj - ci) ** 2))
        lab, _ = ndimage.label(free)
        reg = lab == lab[ii[k], jj[k]]
        if reg[0].any() or reg[-1].any() or reg[:, 0].any() or reg[:, -1].any():
            if last is not None:
                break
            continue
        a, b = np.nonzero(reg)
        last = c + u[a].mean() * np.array([0, 1.0, 0]) + u[b].mean() * np.array([0, 0, 1.0])
        c0 = np.array([c0[0], last[1], last[2]])
    eam = last

    def underside(x, y):
        z = np.arange(eam[2] + 22, eam[2] - 18, -0.25)
        b = bone(np.c_[np.full_like(z, x), np.full_like(z, y), z])
        if not b.any():
            return np.nan
        k = int(np.nonzero(b)[0][0])
        while k + 1 < len(b) and b[k + 1]:
            k += 1
        return z[k]
    emi = []
    for x in np.arange(eam[0] - 14, eam[0] - 1.9, 1.0):
        ys = np.arange(eam[1] + 2, eam[1] + 32, 0.5)
        zs = np.convolve(np.nan_to_num(np.array([underside(x, y) for y in ys]), nan=-99), np.ones(3) / 3, mode='same')
        w = (ys >= eam[1] + 3) & (ys <= eam[1] + 18)
        kf = int(np.argmax(np.where(w, zs, -1e9)))
        w2 = (ys > ys[kf]) & (ys <= ys[kf] + 15)
        if w2.any():
            ke = int(np.argmin(np.where(w2, zs, 1e9)))
            emi.append([x, ys[ke], zs[ke]])
    return eam, np.median(np.array(emi), 0)


def needle(M: Model, bone, o: dict, tip: np.ndarray, tip_at: str) -> tuple[dict, dict]:
    F = o['centre']
    a, e1, e2 = basis(o['axis'])
    log = {}
    out_end = lambda p: p + NEEDLE_OUT_MM * unit(p - tip)
    t = np.arange(-15, 45, 0.25)
    uc = unit(F - tip)
    log['centreLineBoneRunsMm'] = runs(bone(F + np.outer(t, uc)), t)
    if segment_clear(bone, tip, out_end(F)):
        X = F.copy()
        log['crossingRule'] = 'the line through the centre is clear'
    else:   # the clear part of the narrowest section: lines from the tip through each of its pixels, clear to the outer end;
        # of those, the one with the most room round it (the drawn needle has a thickness), then the one nearest their middle
        G, u = grid_pts(F, e1, e2)
        reg = hole(bone(G.reshape(-1, 3)).reshape(G.shape[:2]), u)
        if reg is None:
            raise RuntimeError(f"{M.key}: the foramen's narrowest section is not closed round its centre")
        H = G[reg]
        ok = np.array([segment_clear(bone, tip, out_end(p)) for p in H])
        Pc = H[ok]
        if not len(Pc):
            raise RuntimeError(f"{M.key}: no clear line from the tip through the foramen")
        room = np.array([clearance(bone, tip, out_end(p)) for p in Pc])
        mid = np.linalg.norm(Pc - Pc.mean(0), axis=1)
        X = Pc[int(np.lexsort((mid, -room))[0])]
        log['crossingRule'] = (f"{int(ok.sum())} of {len(H)} pixels of the opening give a clear line; the one with the most room "
                               f"round it ({room.max():.2f} mm), then the one nearest their middle")
    u = unit(X - tip)                       # outward and down
    outer = X + NEEDLE_OUT_MM * u
    d_up = -u
    off = X - F
    log['crossingOffset'] = {'medialMm': r2(-off[0]), 'frontMm': r2(off[1]), 'upMm': r2(off[2])}
    # the bone it crosses
    tt = np.arange(0, np.linalg.norm(outer - tip) + 1e-9, 0.05)
    bone_mm = float(bone(tip + np.outer(tt, u)).sum() * 0.05)
    # named structures near it
    seg_t = np.arange(-np.linalg.norm(X - tip), NEEDLE_OUT_MM + 1e-9, 0.25)     # along the line from the crossing
    S = X + np.outer(seg_t, u)
    near = []
    for name in NEAR_NAMES[M.key]:
        for sid in M.ids_named(name):
            m = M.mesh(sid, 'R')
            if m is None:
                continue
            sf = Surf(m)
            _, d = sf.closest(S)
            close = d < 3.0
            if close.any():
                inside = np.zeros(len(S), bool)
                inside[close] = np.abs(sf.winding(S[close])) > 0.5
                d = np.where(inside, 0.0, d)
            k = int(np.argmin(d))
            if d[k] <= NEAR_MM:
                near.append({'name': name, 'mm': r2(d[k]), 'atMm': r2(seg_t[k])})
    # the lateral aim: in a lateral projection at the articular eminence's height
    eam, emi = eam_and_eminence(bone, M.mesh(M.cfg['tm'], 'R').centroid)
    tz = (emi[2] - X[2]) / u[2]
    q = X + tz * u
    log['eam'], log['eminence'] = v2(eam), v2(emi)
    # the camera along the needle, and the opening it sees through
    along = X + ALONG_MM * u
    _, b1, b2 = basis(u)
    G, gu = grid_pts(X, b1, b2, 8.0, 0.25)
    blocked = rays_blocked(bone, along, G.reshape(-1, 3), beyond=15.0)
    reg = hole(blocked.reshape(G.shape[:2]), gu, 0.25)
    seen = 0.0 if reg is None else float(reg.sum() * 0.0625)
    # the overview: below and lateral, near square to the needle; the most of its middle seen past bone, as projected
    mid = 0.5 * (tip + outer)
    pts = tip + np.outer(np.linspace(0.2, 0.8, 61), outer - tip)
    cands = []
    for el in OVERVIEW_ELEV:
        for az in OVERVIEW_AZIM:
            e, a_ = np.radians(el), np.radians(az)
            v = np.array([np.cos(e) * np.cos(a_), np.cos(e) * np.sin(a_), np.sin(e)])
            off = float(np.degrees(np.arcsin(min(1.0, abs(v @ d_up)))))
            if off > OVERVIEW_OFF_DEG:
                continue
            vis = int((~rays_blocked(bone, mid + OVERVIEW_MM * v, pts, beyond=-0.6)).sum())
            cands.append((vis, round(off, 1), el, az, v))
    best = max(cands, key=lambda c: (round(c[0] * np.cos(np.radians(c[1])), 6), -c[1], -abs(c[2] + 20), -c[3]))
    top = max(c[0] for c in cands)
    ov = mid + OVERVIEW_MM * best[4]
    log['overview'] = {'dir': v2(best[4]), 'elevationDeg': best[2], 'azimuthDeg': best[3], 'offSquareDeg': best[1],
                       'needleMiddleSeenPastBonePct': round(100 * best[0] / len(pts)), 'bestSeenPct': round(100 * top / len(pts)), 'candidates': len(cands)}
    res = {
        'side': 'R', 'outer': v2(outer), 'crossing': v2(X), 'tip': v2(tip), 'tipAt': tip_at,
        'ovaleCentre': v2(F), 'crossingFromCentreMm': r2(np.linalg.norm(X - F)),
        'tipBeyondCrossingMm': r2(np.linalg.norm(X - tip)), 'outerBelowCrossingMm': int(NEEDLE_OUT_MM),
        'angles': angles(d_up), 'boneCrossedMm': r2(bone_mm), 'clearanceMm': r2(clearance(bone, tip, outer)),
        'nearest': sorted(near, key=lambda e: (e['atMm'], e['name'])),
        'lateralAim': {'lineAheadOfMeatusMm': r2(q[1] - eam[1]), 'eminenceAheadOfMeatusMm': r2(emi[1] - eam[1])},
        'views': {'along': {'position': v2(along), 'target': v2(X)}, 'overview': {'position': v2(ov), 'target': v2(mid)}},
        'openingSeenAlongMm2': r2(seen),
    }
    log['meshCheck'] = mesh_check(M, tip, outer, along, X, ov, pts)
    return res, log


def mesh_check(M: Model, tip, outer, along, X, ov, pts) -> dict:
    """The needle and its cameras against the drawn bone meshes (right side and midline): the needle's crossings, what
    lies between the along camera and the crossing, and how much of the needle's middle the overview sees."""
    bones = [Surf(m) for s in M.own if s['type'] == 'bone' and not s.get('approach') for m in [M.mesh(s['id'], 'R')] if m is not None]
    u = unit(outer - tip)
    L = np.linalg.norm(outer - tip)
    hits = sum(len(b.ray(tip, u, L)) for b in bones)
    dv = X - along
    blk = sum(len(b.ray(along, unit(dv), np.linalg.norm(dv) - 0.3)) for b in bones)
    vis = 0
    for p in pts:
        dv = p - ov
        Lp = np.linalg.norm(dv) - 0.6
        vis += not any(len(b.ray(ov, unit(dv), Lp)) for b in bones)
    return {'needleMeshCrossings': int(hits), 'alongCameraHits': int(blk), 'overviewNeedleMiddleSeenPct': round(100 * vis / len(pts))}


# ---------------------------------------------------------------------------------------------- the decompression (v3)
def root_line(M: Model, side: str, pons: Surf):
    """The nerve's centre line, its end at the pons last."""
    C = tube_centreline(M.mesh(M.cfg['nerve'], side))
    if pons.signed(C[:1])[0] < pons.signed(C[-1:])[0]:
        C = C[::-1]
    return C


def where_words(w, arc):
    """Where w (from the root to the artery) points: its largest component, and a second one at least 0.6 of it
    ('below and medial to the root')."""
    words = [('lateral to', 'medial to'), ('in front of', 'behind'), ('above', 'below')]
    a = np.abs(w)
    ks = [k for k in (2, 0, 1) if a[k] >= 0.6 * a.max()]
    ws = [words[k][0 if w[k] > 0 else 1] for k in ks]
    if len(ws) > 1:   # 'below and medial to', 'above and in front of'
        ws = [ws[0].replace(' to', '').replace(' of', ''), ws[1]]
    word = ' and '.join(ws)
    return f"{word} the root at its entry" if arc < 1.5 else f"{word} the root, {arc:.0f} mm out from its entry"


def nerve_root(M: Model, sid: str, stem: list):
    """Where a nerve leaves the brainstem: the mean of its vertices within 1 mm of the pons or medulla, within 5 mm of
    its vertex nearest them."""
    V = np.asarray(M.mesh(sid, 'R').vertices)
    d = np.min([s.closest(V)[1] for s in stem], axis=0)
    sel = V[d <= 1.0]
    if not len(sel):
        sel = V[np.argsort(d, kind='stable')[:12]]
    return sel[np.linalg.norm(sel - V[int(np.argmin(d))], axis=1) < 5].mean(0)


def mvd(M: Model) -> tuple[dict, dict, dict]:
    import skullbase_v3_tentorium as TT
    log = {}
    pons = Surf(M.mesh('pf_pons'))
    C = root_line(M, 'R', pons)
    s = arclen(C)
    rez = C[-1]
    sps = M.mesh('sb_superior_petrosal_sinus', 'R')
    i_p = int(np.argmin(Surf(sps).closest(C)[1]))
    porus = C[i_p]
    # the view's scene (groups.ts surgicalGroups for the retrosigmoid craniotomy), right side, shape 1; the bone removed
    # is see-through
    ap = M.approaches['retrosigmoid']
    replaced = [M.by[b]['replaces'] for b in ap['bones']]
    scene_ids = ([s_['id'] for s_ in M.own if s_['type'] == 'bone' and not s_.get('approach') and s_['id'] not in replaced] + list(ap['bones'])
                 + [s_['id'] for s_ in M.own if s_.get('category') in ('hindbrain', 'ventricle')]
                 + [s_['id'] for s_ in M.own if s_['name'] in RETRO_CONTEXT and not s_.get('approach')])
    scene_ids = [i for k, i in enumerate(scene_ids) if i not in scene_ids[:k] and i != M.cfg['nerve']]
    M.need(scene_ids)
    scene = []
    for sid in scene_ids:
        m = M.mesh(sid, 'R', {'retrosigmoid': 1.0})
        if m is not None and len(m.faces):
            scene.append((sid, Surf(m)))

    def first_hit(o, d, tmax):
        best = (np.inf, None)
        for sid, sf in scene:
            t = sf.ray(o, d, tmax)
            if len(t) and t[0] < best[0]:
                best = (float(t[0]), sid)
        return best
    # the camera: along the petrous ridge
    Cs = tube_centreline(sps)
    lat = Cs[0] if Cs[0][0] > Cs[-1][0] else Cs[-1]
    u = unit(lat - porus)
    hit, hit_id = first_hit(rez + 0.3 * u, u, 160.0)
    hit += 0.3
    tent = TT.Tentorium()
    tq = np.arange(0, 160, 0.25)
    P = rez + np.outer(tq, u)
    above = tent.covers(P) & (P[:, 2] > tent.height(P))
    t_tent = float(tq[int(np.argmax(above))]) if above.any() else np.inf
    D = min(hit, t_tent) - CAMERA_BACK_MM
    cam = rez + D * u
    log['camera'] = {'dir': v2(u), 'firstMeshMm': r1(hit), 'firstMesh': hit_id, 'tentoriumMm': r1(t_tent),
                     'hitsCameraToRoot': [sid for sid, sf in scene if len(sf.ray(cam, unit(rez - cam), D - 0.05))]}
    # the root's first ROOT_MM: surface samples, those facing the camera, seen or not
    nerve = M.mesh(M.cfg['nerve'], 'R')
    Ps, fi = trimesh.sample.sample_surface(nerve, SAMPLES, seed=SEED)
    Ps = np.asarray(Ps)
    Nn = np.asarray(nerve.face_normals)[fi]
    sv = s[cKDTree(C).query(Ps)[1]]
    r10 = (sv >= s[-1] - ROOT_MM)
    face = r10 & (((cam - Ps) * Nn).sum(1) > 0)
    idx = np.nonzero(face)[0]
    idx = idx[:: max(1, len(idx) // 400)]
    seen = 0
    occl: dict[str, int] = {}
    for i in idx:
        p = Ps[i] + 0.05 * unit(cam - Ps[i])
        h = first_hit(cam, unit(p - cam), np.linalg.norm(p - cam))
        if h[1] is None:
            seen += 1
        else:
            occl[h[1]] = occl.get(h[1], 0) + 1
    log['rootSamples'] = int(len(idx))
    log['occluders'] = dict(sorted(occl.items(), key=lambda kv: (-kv[1], kv[0])))
    # the craniotomy
    rem = M.mesh(ap['removed'], 'R')
    rem = rem if rem is not None else M.mesh(ap['removed'])
    rc = np.asarray(rem.triangles_center)
    centre = (rc * np.asarray(rem.area_faces)[:, None]).sum(0) / rem.area
    log['craniotomyCentre'] = v2(centre)
    log['burrHole'] = ap['burrHoles'][0]
    # arteries near the root's first ROOT_MM
    Pr, sr = Ps[r10], sv[r10]
    arts = []
    for name in ('Superior cerebellar artery', 'Superior cerebellar artery (fitted course)', 'Anterior inferior cerebellar artery'):
        for sid in M.ids_named(name):
            rest = Surf(M.mesh(sid, 'R'))
            moved = Surf(M.mesh(sid, 'R', {'retrosigmoid': 1.0}))
            pa, d = moved.closest(Pr)
            k = int(np.argmin(d))
            arts.append({'name': name, 'toRootMm': r2(d[k]), 'where': where_words(pa[k] - Pr[k], float(s[-1] - sr[k]))})
            log[f'{sid}@rest'] = r2(rest.closest(Pr)[1].min())
    stem = [pons, Surf(M.mesh('pf_medulla'))]
    nerves = []
    for name, key in (('Facial nerve (VII)', 'vii'), ('Vestibulocochlear nerve (VIII)', 'viii')):
        p = nerve_root(M, M.cfg[key], stem)
        nerves.append({'name': name, 'fromRootMm': r2(np.linalg.norm(p - rez)), 'belowMm': r2(rez[2] - p[2])})
        log[f'{key}Root'] = v2(p)
    log['porusToSpsMm'] = r2(Surf(sps).closest(porus[None])[1][0])
    log['rezToPonsMm'] = r2(pons.signed(rez[None])[0])
    res = {'side': 'R', 'rootEntry': v2(rez), 'porus': v2(porus), 'cisternalMm': r2(s[-1] - s[i_p]),
           'camera': {'position': v2(cam), 'target': v2(rez)}, 'cameraToRootMm': r2(D),
           'rootVisiblePct': round(100 * seen / max(1, len(idx))), 'craniotomyBelowRootMm': r2(rez[2] - centre[2]),
           'arteries': arts, 'nerves': nerves}
    # the root entry zone landmarks, right and left
    lms = []
    for side in ('R', 'L'):
        p = rez if side == 'R' else root_line(M, 'L', pons)[-1]
        dd = abs(float(pons.signed(p[None])[0]))
        lms.append({'id': f"lm_root_entry_zone_of_the_trigeminal_nerve_{side.lower()}", 'name': 'Root entry zone of the trigeminal nerve',
                    'bone': 'Pons', 'part': None, 'ras': v2(p), 'side': side, 'boneFrom': 'located on this CT', 'distanceToBoneMm': r2(dd),
                    'placed': f"Where the trigeminal nerve as drawn on this CT meets the fitted pons: the centre of the nerve's end there "
                              f"(each routed nerve is cut where it enters the drawn brainstem), {dd:.2f} mm from the pons's surface."})
    return res, lms, log


# ---------------------------------------------------------------------------------------------- per model
def v1_tip(M: Model, C: np.ndarray, F: np.ndarray, dist: float) -> np.ndarray:
    """The point on the nerve's run up from the foramen `dist` mm straight from its centre."""
    if np.linalg.norm(C[0] - F) > np.linalg.norm(C[-1] - F):
        C = C[::-1]
    r = np.linalg.norm(C - F, axis=1)
    i0 = int(np.argmin(r))
    if not (r[i0:] >= dist).any() or r[i0] >= dist:
        raise RuntimeError(f"{M.key}: the nerve's run never lies {dist:.1f} mm from the foramen's centre")
    j = i0 + int(np.argmax(r[i0:] >= dist))
    A, B = C[j - 1], C[j]
    e = B - A
    a2, b2, c2 = e @ e, 2 * e @ (A - F), (A - F) @ (A - F) - dist ** 2
    t = (-b2 + np.sqrt(b2 * b2 - 4 * a2 * c2)) / (2 * a2)
    return A + t * e


def run_model(key: str, tmp: Path, v3_cave_dist: float | None = None) -> tuple[dict, dict]:
    M = Model(key, tmp)
    bone = bone_field(key)
    log: dict = {}
    if key == 'v3':
        F0 = M.lm('Foramen ovale', 'R')
    else:
        F0 = M.lm('Foramen ovale', 'L') * np.array([-1.0, 1, 1])
    o = ovale(M, bone, F0)
    log['ovaleAxis'] = v2(o['axis'])
    log['ovaleAxisToNerveDeg'] = r1(o['axis_to_nerve_deg'])
    log['ovaleCentreFromLandmarkMm'] = r2(np.linalg.norm(o['centre'] - F0))
    ov = {'side': 'R', 'lengthMm': r2(o['length']), 'widthMm': r2(o['width']), 'areaMm2': r2(o['area']),
          'how': 'the narrowest section square to the canal (the axis that makes it narrowest), in the bone field the skull is drawn from',
          'ct': None}
    landmarks = []
    if key == 'v3':
        ov['ct'] = ovale_ct(o)
        tip = M.lm("Meckel's cave", 'R')
        tip_at = "Meckel's cave"
        mv, lms, mlog = mvd(M)
        landmarks += lms
        log['mvd'] = mlog
    else:
        mv = None
        tip = v1_tip(M, o['nerve_line'], o['centre'], v3_cave_dist)
        tip_at = 'the trigeminal nerve'   # (its run down to the foramen; Z-Anatomy's "Mandibular nerve (V3)" begins below it)
        left = next(l for l in M.landmarks if l['name'] == 'Foramen ovale' and l['side'] == 'L')
        sph = Surf(M.mesh(M.cfg['sphenoid'], 'R'))
        landmarks.append({'id': 'lm_foramen_ovale_r', 'name': 'Foramen ovale', 'bone': left['bone'], 'part': left['part'], 'ras': v2(F0),
                          'side': 'R', 'boneFrom': 'drawn by rule', 'distanceToBoneMm': r2(sph.closest(F0[None])[1][0]),
                          'placed': "Drawn by rule: the left foramen ovale's label point mirrored across the midline (Z-Anatomy labels the "
                                    "foramen on the left only; its skull is mirror-symmetric there)."})
    nd, nlog = needle(M, bone, o, tip, tip_at)
    log['needle'] = nlog
    ids = [l['id'] for l in M.landmarks]
    for l in landmarks:
        if l['id'] in ids:
            raise RuntimeError(f"{key}: landmark id {l['id']} exists already")
    return {'model': key, 'landmarks': landmarks, 'mvd': mv, 'needle': nd, 'ovale': ov}, log


def main() -> int:
    with tempfile.TemporaryDirectory(prefix='sb-trigeminal-') as td:
        tmp = Path(td)
        v3, log3 = run_model('v3', tmp)
        d3 = float(np.linalg.norm(np.array(v3['needle']['tip']) - np.array(v3['needle']['ovaleCentre'])))
        v1, log1 = run_model('zanatomy', tmp, d3)
    log1['tipFromCentreMm(v3 cave to v3 centre)'] = r2(d3)
    for name, data in (('sbv3-trigeminal.json', v3), ('sb-trigeminal.json', v1)):
        (GEN / name).write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n")
    print(json.dumps({'v3': log3, 'zanatomy': log1}, indent=1, ensure_ascii=False))
    for d in (v3, v1):
        if d['needle']['boneCrossedMm'] != 0:
            print(f"WARNING {d['model']}: the needle crosses {d['needle']['boneCrossedMm']} mm of bone")
    return 0


if __name__ == '__main__':
    sys.exit(main())
