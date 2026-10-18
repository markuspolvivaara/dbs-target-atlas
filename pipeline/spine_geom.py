"""Measured geometry of the spine CT for the spine section: canal and foramina per level, the schematic lumbar roots
built on them, and the psoas zones of Uribe et al. 2010 at each lumbar disc.

All measurements are taken on one subject's CT (VerSe sub-verse823) and its segmentations; nothing is typed in. The
roots and zones are drawn by rule from those measurements and are flagged schematic.

Frames: for a pair of levels (upper U, lower D) the local axes are
  e_z  cranial, from D's body centre to U's body centre (the spine's own axis there),
  e_x  patient right, orthogonal to e_z,
  e_y  anterior (e_z x e_x).
In-plane coordinates are (u, v, w) along (e_x, e_y, e_z) in millimetres.
"""
from __future__ import annotations

import numpy as np
import nibabel as nib
from scipy import ndimage

from meshcheck import orient_outward

STEP = 0.5  # sampling step of the resampled planes (mm)


class Grid:
    """A labelled volume (CT voxel grid) that can be sampled at RAS points (nearest neighbour). Pass `around` (RAS points)
    to keep only the box around them plus `margin` mm: sampling the whole CT would copy hundreds of millions of voxels."""

    def __init__(self, labels: np.ndarray, affine: np.ndarray, around: np.ndarray | None = None, margin: float = 80.0):
        if around is not None:
            inv = np.linalg.inv(affine)
            ijk = nib.affines.apply_affine(inv, np.asarray(around))
            vox = np.abs(np.diag(affine)[:3])
            lo = np.maximum(np.floor(ijk.min(0) - margin / vox).astype(int), 0)
            hi = np.minimum(np.ceil(ijk.max(0) + margin / vox).astype(int) + 1, labels.shape)
            labels = labels[lo[0]:hi[0], lo[1]:hi[1], lo[2]:hi[2]]
            affine = affine.copy()
            affine[:3, 3] = nib.affines.apply_affine(affine, lo)
        self.labels = np.ascontiguousarray(labels.astype(np.uint8))
        self.inv = np.linalg.inv(affine)
        self.affine = affine

    def sample(self, pts: np.ndarray) -> np.ndarray:
        ijk = nib.affines.apply_affine(self.inv, pts.reshape(-1, 3)).T
        return ndimage.map_coordinates(self.labels, ijk, order=0, mode="constant", cval=0).reshape(pts.shape[:-1])


def frame(c_up: np.ndarray, c_down: np.ndarray) -> np.ndarray:
    ez = c_up - c_down
    ez /= np.linalg.norm(ez)
    ex = np.array([1.0, 0, 0]) - ez[0] * ez
    ex /= np.linalg.norm(ex)
    ey = np.cross(ez, ex)
    return np.stack([ex, ey, ez])  # rows: e_x, e_y, e_z


def plane(origin: np.ndarray, F: np.ndarray, us: np.ndarray, vs: np.ndarray, w: float = 0.0, axes=(0, 1)) -> np.ndarray:
    """RAS points of a regular grid on a plane spanned by two frame axes, offset w along the third."""
    a, b = axes
    c = 3 - a - b
    U, V = np.meshgrid(us, vs, indexing="ij")
    return origin + U[..., None] * F[a] + V[..., None] * F[b] + w * F[c]


def canal(grid: Grid, label: int, c: np.ndarray, F: np.ndarray) -> dict | None:
    """The vertebral canal of one vertebra: the hole its ring encloses, in planes through its body centre normal to the
    spine axis (a +-3 mm slab is merged so the ring closes). Returns width (u), depth (v), area and centre."""
    us = np.arange(-35, 35 + STEP, STEP)
    vs = np.arange(-65, 15 + STEP, STEP)
    ring = np.zeros((len(us), len(vs)), bool)
    for w in np.arange(-3, 3 + STEP, STEP):
        ring |= grid.sample(plane(c, F, us, vs, w)) == label
    ring = ndimage.binary_closing(ring, iterations=2)
    hole = ndimage.binary_fill_holes(ring) & ~ring
    lab, n = ndimage.label(hole)
    if not n:
        return None
    # the canal: the largest hole behind the body centre
    sizes = ndimage.sum(hole, lab, range(1, n + 1))
    cents = ndimage.center_of_mass(hole, lab, range(1, n + 1))
    cand = [(s, i + 1) for i, s in enumerate(sizes) if vs[int(cents[i][1])] < -5]
    if not cand:
        return None
    k = max(cand)[1]
    m = lab == k
    iu, iv = np.nonzero(m)
    cu, cv = us[iu].mean(), vs[iv].mean()
    return {"width": round(float(np.ptp(us[iu]) + STEP), 1), "depth": round(float(np.ptp(vs[iv]) + STEP), 1),
            "area": round(float(m.sum() * STEP * STEP), 0), "u": float(cu), "v": float(cv),
            "halfWidth": float(max(abs(us[iu].min()), abs(us[iu].max()))),
            "uMin": float(us[iu].min()), "uMax": float(us[iu].max()), "vMin": float(vs[iv].min()), "vMax": float(vs[iv].max()),
            "centre": (c + cu * F[0] + cv * F[1]).tolist()}


def foramen(grid: Grid, up: int, down: int, extra: set[int], mid: np.ndarray, F: np.ndarray, u_from: float, h: float,
            close_mm: float = 3.0) -> dict | None:
    """The intervertebral foramen on one side, in parasagittal planes (u = u_from outward in 1 mm steps, 12 planes): the
    gap in the bone-and-disc profile that is roofed by the upper vertebra and floored by the lower one. Small gaps in its
    wall (the facet joint line) are bridged by a morphological closing of close_mm, then the gap is grown back to the
    true bone edge. Returns height (along the spine), width (antero-posterior), area and centroid of the first plane
    where such a gap is found."""
    vs = np.arange(-60, 25 + STEP, STEP)
    ws = np.arange(-(h / 2 + 18), h / 2 + 18 + STEP, STEP)
    it = max(1, int(round(close_mm / STEP)))
    side = np.sign(u_from)
    for du in range(12):
        u = u_from + side * du
        labs = grid.sample(plane(mid + u * F[0], F, vs, ws, axes=(1, 2)))
        solid = np.isin(labs, list({up, down} | extra))
        closed = ndimage.binary_closing(np.pad(solid, it), iterations=it)[it:-it, it:-it]
        hole = ndimage.binary_fill_holes(closed) & ~closed
        lab, n = ndimage.label(hole)
        best = None
        for k in range(1, n + 1):
            m = lab == k
            if m.sum() * STEP * STEP < 10:
                continue
            m = ndimage.binary_dilation(m, iterations=it) & ~solid  # back to the true bone edge
            iv, iw = np.nonzero(m)
            if vs[iv].mean() > -5:  # in front of the posterior body wall: not a foramen
                continue
            ring = ndimage.binary_dilation(m, iterations=3) & solid
            rw = ws[np.nonzero(ring)[1]]
            above = set(np.unique(labs[ring & (np.broadcast_to(ws, labs.shape) > ws[iw].mean())]))
            below = set(np.unique(labs[ring & (np.broadcast_to(ws, labs.shape) < ws[iw].mean())]))
            if up not in above or down not in below or not len(rw):
                continue
            if best is None or m.sum() > best.sum():
                best = m
        if best is None:
            continue
        iv, iw = np.nonzero(best)
        cv, cw = vs[iv].mean(), ws[iw].mean()
        return {"height": round(float(np.ptp(ws[iw]) + STEP), 1), "width": round(float(np.ptp(vs[iv]) + STEP), 1),
                "area": round(float(best.sum() * STEP * STEP), 0), "u": float(u), "v": float(cv), "w": float(cw),
                "top": float(ws[iw].max()), "centre": (mid + u * F[0] + cv * F[1] + cw * F[2]).tolist()}
    return None


def lateral_point(mask_pts: np.ndarray, centre: np.ndarray, F: np.ndarray, side: int, band: float = 3.0) -> np.ndarray | None:
    """The most lateral point (on one side) of a set of RAS points within +-band mm of a plane through `centre`."""
    rel = mask_pts - centre
    w = rel @ F[2]
    near = mask_pts[np.abs(w) < band]
    if not len(near):
        return None
    u = (near - centre) @ F[0]
    return near[np.argmax(side * u)]


def catmull(points: list[np.ndarray], per: int = 8) -> np.ndarray:
    """A smooth curve through the given points (Catmull-Rom, ends repeated)."""
    P = [points[0]] + points + [points[-1]]
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for t in np.linspace(0, 1, per, endpoint=False):
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(points[-1])
    return np.array(out)


def tube(path: np.ndarray, radius: float, sides: int = 10) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Closed tube (positions, normals, triangles) along a polyline with a constant radius."""
    T = np.gradient(path, axis=0)
    T /= np.linalg.norm(T, axis=1, keepdims=True)
    a = np.array([0, 0, 1.0]) if abs(T[0, 2]) < 0.9 else np.array([1.0, 0, 0])
    N = [np.cross(T[0], a)]
    N[0] /= np.linalg.norm(N[0])
    for i in range(1, len(path)):
        n = N[-1] - T[i] * np.dot(N[-1], T[i])
        N.append(n / max(np.linalg.norm(n), 1e-9))
    N = np.array(N)
    B = np.cross(T, N)
    ang = np.linspace(0, 2 * np.pi, sides, endpoint=False)
    dirs = np.cos(ang)[None, :, None] * N[:, None, :] + np.sin(ang)[None, :, None] * B[:, None, :]
    pos = (path[:, None, :] + radius * dirs).reshape(-1, 3)
    nrm = dirs.reshape(-1, 3)
    tris = []
    for i in range(len(path) - 1):
        for k in range(sides):
            a0, a1 = i * sides + k, i * sides + (k + 1) % sides
            tris += [[a0, a1, a0 + sides], [a1, a1 + sides, a0 + sides]]  # wound outward (around the tangent)
    caps_p, caps_n = [], []
    for end, sgn in ((0, -1.0), (len(path) - 1, 1.0)):
        c = len(pos) + len(caps_p)
        caps_p.append(path[end]); caps_n.append(sgn * T[end])
        for k in range(sides):
            caps_p.append(path[end] + radius * dirs[end, k]); caps_n.append(sgn * T[end])
        for k in range(sides):
            u, v = c + 1 + k, c + 1 + (k + 1) % sides
            tris.append([c, v, u] if sgn < 0 else [c, u, v])
    return np.vstack([pos, caps_p]), np.vstack([nrm, caps_n]), np.array(tris)


def ellipsoid(centre: np.ndarray, axes: np.ndarray, radii: tuple[float, float, float], n: int = 14):
    """Ellipsoid mesh (positions, normals, triangles) with semi-axes `radii` along the rows of `axes`."""
    th = np.linspace(0, np.pi, n)
    ph = np.linspace(0, 2 * np.pi, 2 * n, endpoint=False)
    TH, PH = np.meshgrid(th, ph, indexing="ij")
    unit = np.stack([np.sin(TH) * np.cos(PH), np.sin(TH) * np.sin(PH), np.cos(TH)], -1).reshape(-1, 3)
    r = np.array(radii)
    pos = centre + (unit * r) @ axes
    nrm = (unit / r) @ axes
    nrm /= np.linalg.norm(nrm, axis=1, keepdims=True)
    tris = []
    m = 2 * n
    for i in range(n - 1):
        for j in range(m):
            a, b = i * m + j, i * m + (j + 1) % m
            c, d = a + m, b + m
            tris += [[a, c, b], [b, c, d]]
    return pos, nrm, np.array(tris)


def slab(corners: np.ndarray, normal: np.ndarray, thick: float = 1.0):
    """A thin box from 4 coplanar corners (in order) extruded +-thick/2 along `normal`: positions, normals, triangles."""
    top = corners + normal * thick / 2
    bot = corners - normal * thick / 2
    pos = np.vstack([top, bot])
    quads = [[0, 1, 2, 3], [7, 6, 5, 4], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]]
    tris = []
    for q in quads:
        tris += [[q[0], q[1], q[2]], [q[0], q[2], q[3]]]
    tris = np.array(tris)
    tris = orient_outward(pos, tris)  # the corners' order (mirrored on the right) decides the winding
    # flat-ish normals: from the box centre outward
    c = pos.mean(0)
    nrm = pos - c
    nrm /= np.linalg.norm(nrm, axis=1, keepdims=True)
    return pos, nrm, tris
