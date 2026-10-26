"""Ventricles section, the endoscopic third ventriculostomy (ETV) view: the structures that form the walls, floor and
contents of the lateral and third ventricles, and the landmarks and trajectory an ETV is placed by. Called by
ventricles_build.py (it needs the ventricles' fit and the drawn surface).

What comes from where:
  - The structures (DEEP): the Z-Anatomy model's (exported with its ventricles by ventricles_export.py), carried onto this
    CT by the same fit as its ventricles (so they keep their places around them). Stray pieces of the model's meshes
    (CLEAN_MIN_FACES, CLEAN_FAR_MM) are left out. The CT does not show any of them.
  - The walls: where the CT shows the ventricles, they are its own, and they are larger than the fitted model's in
    places; each structure that forms a wall is pushed out of the drawn cavity (WALL_GAP_MM beyond its surface), along
    the shortest way out, the pushes smoothed over the structure (WALL_PASSES). The choroid plexus lies in the cavity
    and stays there.
  - The mammillary bodies: the model's (the two small bodies of its hypothalamus) lie about 6 mm further forward than
    da Silva 2024 measured in 200 MRIs; they are moved, unchanged in shape, so that their anterosuperior point lies
    where da Silva puts it behind the anterior commissure (MB_BEHIND_AC_MM, along the AC-PC line), at the height of
    the model's floor there; and the cavity is drawn round them, so that they bulge into the floor (MB_GAP_MM).
  - The choroid plexus with the hydrocephalus shape: it follows the shape, and at each foramen of Monro, which grows
    backwards, it is shifted towards the thalamus, the foramen's posterior border, until it lies against it
    (PLEXUS_MONRO_MM, PLEXUS_THALAMUS_MM; its tela is fixed along the choroidal fissure by the thalamus's tenia: Azab 2014).
  - The AC-PC frame: the fitted anterior and posterior commissures' centres; its origin the anterior commissure's
    posterosuperior border in the midline (as da Silva 2024 defines it).
  - The ETV target: the middle of the tuber cinereum, the midline floor halfway between the infundibular recess and
    the mammillary bodies (fenestrated behind the recess and in front of the mammillary bodies: da Silva 2024).
  - The trajectory: the line from the target through the middle of the right foramen of Monro, out to the outer
    table (as Sousa 2025 draws it on 187 MRIs); its depth and entry measured as Sousa does.
"""
from __future__ import annotations

import numpy as np
import trimesh
from scipy import ndimage
from scipy.spatial import cKDTree

# name, the Z-Anatomy objects, colour token, category; sided: the model's .l/.r objects; else a midline structure
# (drawn in left and right halves, as the section draws the third ventricle)
DEEP = [
    ("ve_fornix", "Fornix", ["Fornix.l", "Fornix.r"], "fx", "deep"),
    ("ve_septum_pellucidum", "Septum pellucidum", ["Septum pellucidum"], "sbMedialWall", "deep"),
    ("ve_choroid_plexus", "Choroid plexus", ["Choroid plexus.l", "Choroid plexus.r"], "veChoroid", "deep"),
    ("ve_thalamus", "Thalamus", ["Thalamus.l", "Thalamus.r"], "thal", "deep"),
    ("ve_caudate_nucleus", "Caudate nucleus", ["Caudate nucleus.l", "Caudate nucleus.r"], "str", "deep"),
    ("ve_stria_terminalis", "Stria terminalis", ["Stria terminalis.l", "Stria terminalis.r"], "sbMedialWall", "deep"),
    ("ve_hypothalamus", "Hypothalamus", ["Hypothalamus"], "sbBrain", "deep"),
    ("ve_mammillary_body", "Mammillary body", [], "mb", "deep"),
    ("ve_optic_chiasm", "Optic chiasm", ["Optic chiasm.l", "Optic chiasm.r"], "ot", "deep"),
    ("ve_optic_tract", "Optic tract", ["Optic tract.l", "Optic tract.r"], "ot", "deep"),
    ("ve_anterior_commissure", "Anterior commissure", ["Anterior commissure"], "sbMedialWall", "deep"),
    ("ve_posterior_commissure", "Posterior commissure", ["Posterior commissure"], "sbMedialWall", "deep"),
    ("ve_habenula", "Habenula", ["Habenula"], "sbMedialWall", "deep"),
    ("ve_pineal_gland", "Pineal gland", ["Pineal gland"], "sbBrain", "deep"),
    ("ve_corpus_callosum", "Corpus callosum", ["Corpus callosum"], "sbMedialWall", "deep"),
]
IN_CAVITY = ("ve_choroid_plexus",)   # lies in the ventricles: not pushed out
PLEXUS_EDGE_MM = 0.6       # the choroid plexus's mesh subdivided to edges this long (the endoscope's view draws its
                           # lobules by moving its vertices; the model's mesh is too coarse for them) ...
DEEP_EDGE_MM = 1.5         # ... and the others to this: their shapes are moved vertex by vertex (pushed out of the
                           # cavity, shaped with the hydrocephalus), and the model's large triangles would cut corners
CLEAN_MIN_FACES = 30       # pieces of a model mesh smaller than this are left out ...
CLEAN_FAR_MM = 60.0        # ... and so are vertices this far from its median (stray points of the model's file)
WALL_GAP_MM = 0.25         # a structure that forms a wall: kept this far outside the drawn cavity ...
WALL_PASSES = 12           # ... pushed out in up to this many passes, each push spread over its neighbours
WALL_SMOOTH = 6            # (this many neighbour-averaging rounds per pass)
MB_BEHIND_AC_MM = (8.56, 7.01)   # the mammillary bodies' anterosuperior point: this far behind (along the AC-PC line)
                                 # and below the anterior commissure's posterosuperior border (da Silva 2024, 200 MRIs)
MB_GAP_MM = 0.25           # the cavity drawn this far round them
MB_AGE_Y = 20.0            # their size: Vann 2022's growth curve of the two bodies' total volume (250 MRIs, 6-24 years;
MB_VOLUME_MM3 = 68.61 + 6.53 * MB_AGE_Y - 0.19 * MB_AGE_Y ** 2   # mm3 = 68.61 + 6.53 age - 0.19 age^2) at a young
                           # adult's age; each drawn as a sphere of half of it (the model's are thin plates, which no
                           # floor drawn over them shows as bulges: a modelling choice), centred where the model's lies
MB_DRAWN_MM = 5.5          # ... and drawn this wide (a little larger), their distance from the midline in proportion
                           # (so the groove between them stays): smaller, they barely show as the bulges an endoscopist
                           # sees (a display choice)
MB_WRAP_MM = (2.8, 5.5)    # with the hydrocephalus shape, the floor within the first of them (fading out by the second)
                           # wrapped down onto them, MB_GAP_MM off, so each shows as a bulge
MB_HYDRO_BEHIND_AC_MM = (11.30, 7.05)   # ... and in hydrocephalus (da Silva 2024, 24 MRIs: medians): further back. With the
                                        # hydrocephalus shape they are placed that far back in the shaped AC-PC frame ...
MB_PROTRUDE_MM = 4.0       # ... their tops this far above the shaped floor there, which then rests on them: they bulge
                           # into it (a modelling choice: the bumps endoscopists see)
PLEXUS_MONRO_MM = (6.0, 12.0)   # with the hydrocephalus shape, the choroid plexus within the first of a foramen's centre
                                # (fading out by the second) is shifted towards the thalamus, the foramen's posterior
                                # border (the foramen grows backwards; the plexus, fixed along the choroidal fissure by
                                # the thalamus's tenia, goes with it: Azab 2014) ...
PLEXUS_THALAMUS_MM = 0.3        # ... until its near side is this close to the thalamus, or more of it would leave the
                                # cavity (PLEXUS_OUT_FRAC beyond what already did)
PLEXUS_OUT_FRAC = 0.02


def clean(V: np.ndarray, F: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """A model mesh without its stray pieces: components under CLEAN_MIN_FACES faces and faces with a vertex more than
    CLEAN_FAR_MM from the median vertex left out; unused vertices dropped; each (nearly) closed piece wound outward (the
    model's left-side objects are mirror copies, wound inside out)."""
    med = np.median(V, 0)
    far = np.linalg.norm(V - med, axis=1) > CLEAN_FAR_MM
    F = F[~far[F].any(1)]
    m = trimesh.Trimesh(V, F, process=False)
    keep = [c for c in m.split(only_watertight=False) if len(c.faces) >= CLEAN_MIN_FACES]
    for c in keep:      # inside out: its signed volume negative (nearly closed pieces too; open sheets are about 0)
        if c.volume < -1.0:
            c.invert()
    m = trimesh.util.concatenate(keep)
    return np.asarray(m.vertices, float), np.asarray(m.faces, int)


def parts_of(V: np.ndarray, F: np.ndarray) -> list[tuple[np.ndarray, np.ndarray]]:
    """A mesh's connected pieces, largest first."""
    m = trimesh.Trimesh(V, F, process=False)
    return [(np.asarray(c.vertices, float), np.asarray(c.faces, int)) for c in sorted(m.split(only_watertight=False), key=lambda c: -len(c.faces))]


class ACPC:
    """da Silva 2024's frame: y along the AC-PC line (forwards), z square to it upwards in the midsagittal plane, the
    origin at the anterior commissure's posterosuperior border in the midline."""

    def __init__(self, ac: np.ndarray, pc: np.ndarray, midline: float):
        a, p = ac.mean(0), pc.mean(0)
        y = a - p
        y[0] = 0.0
        self.y = y / np.linalg.norm(y)
        z = np.array([0.0, 0.0, 1.0]) - self.y[2] * self.y
        z[0] = 0.0
        self.z = z / np.linalg.norm(z)
        near = ac[np.abs(ac[:, 0] - midline) < 3.0]
        ps = near[np.argmax(near @ self.z - near @ self.y)]
        self.o = np.array([midline, ps[1], ps[2]])
        self.length = float(np.linalg.norm(a - p))

    def of(self, P) -> np.ndarray:
        """Points' (y, z) in this frame (mm; y negative behind the origin)."""
        d = np.atleast_2d(P) - self.o
        return np.c_[d @ self.y, d @ self.z]

    def at(self, yy: float, zz: float, x: float | None = None) -> np.ndarray:
        p = self.o + yy * self.y + zz * self.z
        if x is not None:
            p[0] = x
        return p


def floor_z(third: np.ndarray, frame: ACPC, yy: float, half: float = 1.5) -> float:
    """The model's third ventricle floor height (frame z) at y = yy, near the midline."""
    yz = frame.of(third)
    s = (np.abs(third[:, 0] - frame.o[0]) < half) & (np.abs(yz[:, 0] - yy) < 1.0)
    return float(yz[s, 1].min())


def mammillary(hyp_parts: list, frame: ACPC, third: np.ndarray) -> tuple[list, dict]:
    """The mammillary bodies: spheres of Vann 2022's volume (MB_VOLUME_MM3) where the model's are (the hypothalamus
    mesh's two small pieces), moved so that their anterosuperior point lies MB_BEHIND_AC_MM behind the anterior
    commissure, at the height of the model's floor there. Returns the moved pieces and a report."""
    r = (3 * MB_VOLUME_MM3 / 2 / (4 * np.pi)) ** (1 / 3)
    k = MB_DRAWN_MM / (2 * r)
    ball = trimesh.creation.icosphere(subdivisions=3, radius=r * k)
    centres = [v.mean(0) * [k, 1, 1] - [frame.o[0] * (k - 1), 0, 0] for v, _ in hyp_parts[1:3]]
    mb = [(np.asarray(ball.vertices) + c, np.asarray(ball.faces)) for c in centres]
    model_mm3 = [round(abs(float(trimesh.Trimesh(v, f, process=False).volume)), 1) for v, f in hyp_parts[1:3]]
    allv = np.vstack([v for v, _ in mb])
    yz = frame.of(allv)
    i = int(np.argmax(yz[:, 1] + yz[:, 0]))          # anterosuperior: highest and furthest forward
    yy = -MB_BEHIND_AC_MM[0]
    zz = floor_z(third, frame, yy)
    target = frame.at(yy, zz, allv[i, 0])
    shift = target - allv[i]
    shift[0] = 0.0
    moved = [(v + shift, f) for v, f in mb]
    return moved, {"modelVolumeMm3": model_mm3, "volumeMm3": round(MB_VOLUME_MM3 / 2, 1), "diameterMm": round(2 * r, 2),
                   "drawnScale": round(k, 2), "drawnDiameterMm": round(2 * r * k, 2),
                   "modelAcpcMm": frame.of(allv[i])[0].round(2).tolist(), "placedAcpcMm": [round(yy, 2), round(zz, 2)],
                   "daSilvaAcpcMm": [-MB_BEHIND_AC_MM[0], -MB_BEHIND_AC_MM[1]], "movedMm": round(float(np.linalg.norm(shift)), 2)}


def mammillary_hydro(mb: list, frame_h: "ACPC", floor_h: np.ndarray) -> tuple[np.ndarray, dict]:
    """The mammillary bodies' move with the hydrocephalus shape, unchanged in shape and still in the midline: their
    anterosuperior point MB_HYDRO_BEHIND_AC_MM[0] behind the shaped anterior commissure (da Silva 2024's median in
    hydrocephalus), their tops MB_PROTRUDE_MM above the shaped floor there (floor_h: the third ventricle's walls as the
    shape moves them, before the floor is draped over them), so the floor, coming down, rests on them. Returns the move
    and a report."""
    allv = np.vstack([V for _, V, _ in mb])
    yz = frame_h.of(allv)
    i = int(np.argmax(yz[:, 1] + yz[:, 0]))
    yy = -MB_HYDRO_BEHIND_AC_MM[0]
    fy = frame_h.of(floor_h)
    near = (np.abs(floor_h[:, 0] - frame_h.o[0]) < 4.0) & (np.abs(fy[:, 0] - yy) < 1.5)
    z_floor = float(fy[near, 1].min())
    dy = (yy - yz[i, 0]) * frame_h.y
    top = float((frame_h.of(allv + dy))[:, 1].max())
    dz = (z_floor + MB_PROTRUDE_MM - top) * frame_h.z
    shift = dy + dz
    shift[0] = 0.0
    a = frame_h.of(allv[i] + shift)[0]
    return shift, {"placedAcpcMm": [round(float(a[0]), 2), round(float(a[1]), 2)],
                   "daSilvaHydroAcpcMm": [-MB_HYDRO_BEHIND_AC_MM[0], -MB_HYDRO_BEHIND_AC_MM[1]],
                   "protrudeMm": MB_PROTRUDE_MM, "movedMm": round(float(np.linalg.norm(shift)), 2)}


def solid_sd(meshes: list, lo: np.ndarray, shape: tuple, step: float, fill, sdf) -> np.ndarray:
    """Signed distance (mm, positive outside) from the union of closed meshes, on the grid."""
    m = np.zeros(shape, bool)
    for V, F in meshes:
        m |= fill(V, F, lo, shape, step)
    return sdf(m, step)


def push_out(V: np.ndarray, F: np.ndarray, sd: np.ndarray, lo: np.ndarray, step: float, wall_v: np.ndarray, wall_n: np.ndarray,
             wall_tree: cKDTree | None = None) -> tuple[np.ndarray, float]:
    """A structure's vertices moved out of the cavity (sd: its signed distance, positive inside; wall_v, wall_n: the
    drawn walls' vertices and outward normals): each point inside (or within WALL_GAP_MM of the wall), and each
    triangle whose centre is (a large triangle can span a narrow opening), moved to the nearest point of the wall and
    WALL_GAP_MM beyond it; the neighbours follow part of the way (smoothed over the mesh), so it does not tear; up to
    WALL_PASSES passes. Returns the moved vertices and the largest move."""
    from scipy.sparse import coo_matrix
    tree = wall_tree if wall_tree is not None else cKDTree(wall_v)
    n = len(V)
    e = np.vstack([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]])
    A = coo_matrix((np.ones(len(e) * 2), (np.r_[e[:, 0], e[:, 1]], np.r_[e[:, 1], e[:, 0]])), shape=(n, n)).tocsr()
    deg = np.maximum(np.asarray(A.sum(1)).ravel(), 1)
    inside = lambda P: ndimage.map_coordinates(sd, ((P - lo) / step).T, order=1, mode="nearest") + WALL_GAP_MM > 0   # noqa: E731
    X = V.copy()
    for _ in range(WALL_PASSES):
        bad = inside(X)
        cen = inside(X[F].mean(1))
        if cen.any():
            bad[np.unique(F[cen])] = True
        if not bad.any():
            break
        _, j = tree.query(X[bad])
        D = np.zeros_like(X)
        D[bad] = wall_v[j] + WALL_GAP_MM * wall_n[j] - X[bad]
        S = D.copy()
        for _ in range(WALL_SMOOTH):           # the neighbours follow part of the way
            S = 0.5 * (S + A @ S / deg[:, None])
        X = X + np.where(bad[:, None], D, S)
    return X, float(np.linalg.norm(X - V, axis=1).max())


def target_point(third: np.ndarray, frame: ACPC, mb_y: float) -> tuple[np.ndarray, np.ndarray, dict]:
    """The infundibular recess (the lowest point of the model's third ventricle in its front half, near the midline)
    and the ETV target: the midline floor halfway (along the AC-PC line) between it and the mammillary bodies'
    anterosuperior point, on the floor. Returns both and their AC-PC coordinates."""
    yz = frame.of(third)
    mid = np.abs(third[:, 0] - frame.o[0]) < 2.0
    front = mid & (yz[:, 0] > np.median(yz[mid, 0]))
    i = np.where(front)[0][np.argmin(yz[front, 1])]
    rec = third[i]
    yy = 0.5 * (yz[i, 0] + mb_y)
    zz = floor_z(third, frame, yy)
    tgt = frame.at(yy, zz, frame.o[0])
    return rec, tgt, {"infundibularRecessAcpcMm": yz[i].round(2).tolist(), "targetAcpcMm": [round(yy, 2), round(zz, 2)]}


def exit_point(start: np.ndarray, d: np.ndarray, bone_at, max_mm: float = 160.0, step: float = 0.25) -> np.ndarray | None:
    """Along the ray from start (inside the head) in direction d: the point where it leaves the last bone (the outer
    table), or None."""
    t = np.arange(0.0, max_mm, step)
    P = start + t[:, None] * d
    b = bone_at(P)
    if not b.any():
        return None
    last = np.where(b)[0].max()
    return P[min(last + 1, len(P) - 1)]


def trajectory(target: np.ndarray, monro: np.ndarray, bone_at, frame: ACPC, suture) -> dict:
    """Sousa 2025's line: from the target through the middle of the foramen of Monro, out to the outer table. Its entry,
    depth (entry to target), depth to the foramen, distances of the entry from the midline (the sagittal suture) and
    from the coronal suture (forwards positive), and its angles to the AC-PC perpendicular in the sagittal and coronal
    planes."""
    d = monro - target
    d /= np.linalg.norm(d)
    entry = exit_point(monro, d, bone_at)
    if entry is None:
        return {}
    down = -d
    zax, yax = frame.z, frame.y
    sag = np.degrees(np.arctan2(-(down @ yax), -(down @ zax)))            # positive: aimed backwards
    cor = np.degrees(np.arctan2(down[0] * np.sign(entry[0] - frame.o[0]) * -1, -(down @ zax)))   # positive: aimed medially
    sp = suture(entry[0])
    return {"entry": entry.round(2).tolist(), "direction": (-down).round(4).tolist(), "target": target.round(2).tolist(),
            "monro": monro.round(2).tolist(), "depthMm": round(float(np.linalg.norm(entry - target)), 1),
            "depthToMonroMm": round(float(np.linalg.norm(entry - monro)), 1),
            "fromMidlineMm": round(float(abs(entry[0] - frame.o[0])), 1), "fromCoronalSutureMm": round(float(entry[1] - sp[1]), 1),
            "sagittalAngleDeg": round(float(sag), 1), "coronalAngleDeg": round(float(cor), 1)}


def carried(carry, deep_export: dict, midline: float, third: np.ndarray) -> tuple[dict, ACPC, dict]:
    """The model's structures carried onto the CT and cleaned; the AC-PC frame; the mammillary bodies placed. Returns
    {id: [(side "R"/"L"/"M", V, F)]}, the frame and a report."""
    meshes = {n: clean(carry(np.array(m["verts"], float)), np.array(m["tris"], int)) for n, m in deep_export.items()}
    for n in meshes:
        edge = PLEXUS_EDGE_MM if n.startswith("Choroid plexus") else DEEP_EDGE_MM
        m = trimesh.Trimesh(*meshes[n], process=True)            # its split vertices merged
        V, F = trimesh.remesh.subdivide_to_size(m.vertices, m.faces, max_edge=edge)
        meshes[n] = (np.asarray(V, float), np.asarray(F, int))
    frame = ACPC(meshes["Anterior commissure"][0], meshes["Posterior commissure"][0], midline)
    hyp = parts_of(*meshes["Hypothalamus"])
    mb, mrep = mammillary(hyp, frame, third)
    out = {}
    for id_, _, objs, _, _ in DEEP:
        if id_ == "ve_mammillary_body":
            out[id_] = [("R" if v[:, 0].mean() > midline else "L", v, f) for v, f in mb]
        elif id_ == "ve_hypothalamus":
            out[id_] = [("M", *hyp[0])]
        elif len(objs) == 2:
            out[id_] = [(o[-1].upper(), *meshes[o]) for o in objs]
        else:
            out[id_] = [("M", *meshes[objs[0]])]
    return out, frame, {"mammillary": mrep, "acpcLengthMm": round(frame.length, 1)}


def walls(deep: dict, inside: np.ndarray, lo: np.ndarray, step: float, sdf, wall_v: np.ndarray, wall_n: np.ndarray) -> dict:
    """Each structure that forms a wall pushed out of the drawn cavity (push_out; wall_v, wall_n: its surface's
    vertices and outward normals); the choroid plexus (in the cavity) and the mammillary bodies (the cavity is drawn
    round them) as they are. Returns the largest move per structure."""
    sd = -sdf(inside, step)
    tree = cKDTree(wall_v)
    rep = {}
    for id_, pieces in deep.items():
        if id_ in IN_CAVITY or id_ == "ve_mammillary_body":
            continue
        moved = []
        for side, V, F in pieces:
            X, mx = push_out(V, F, sd, lo, step, wall_v, wall_n, tree)
            moved.append((side, X, F))
            rep[id_] = max(rep.get(id_, 0.0), round(mx, 2))
        deep[id_] = moved
    return rep


def shaped_walls(deep: dict, field, Vh: np.ndarray, Fh: np.ndarray, Nh: np.ndarray, fill, sdf, step: float = 0.5) -> tuple[dict, dict]:
    """The structures' moves with the hydrocephalus shape: the field's, then each structure pushed out of the shaped
    cavity (Vh, Fh: the ventricles as shaped), as at rest; the walls are draped over the vessels and the field alone
    lags them in places. The choroid plexus, in the cavity, keeps the field's move. Returns {id: [moves per piece]} and
    the largest push per structure."""
    lo = Vh.min(0) - 6.0
    shape = tuple(np.ceil((Vh.max(0) + 6.0 - lo) / step).astype(int) + 1)
    inside = fill(Vh, Fh, lo, shape, step)
    sd = -sdf(inside, step)
    tree = cKDTree(Vh)
    moves, rep = {}, {}
    for id_, pieces in deep.items():
        moves[id_] = []
        for side, V, F in pieces:
            D = field(V)
            if id_ not in IN_CAVITY and id_ != "ve_mammillary_body":
                X, mx = push_out(V + D, F, sd, lo, step, Vh, Nh, tree)
                D = X - V
                rep[id_] = max(rep.get(id_, 0.0), round(mx, 2))
            moves[id_].append(D)
    return moves, rep


def nodes(pieces: list, midline: float, moves: list | None = None) -> list[dict]:
    """GLB nodes "R" and "L": a sided structure's own meshes; a midline one in its left and right halves; with its
    moves (one array per piece), its morph target "hydrocephalus"."""
    out = []
    for k, (side, V, F) in enumerate(pieces):
        N = trimesh.Trimesh(V, F, process=False).vertex_normals.copy()     # of the whole, so a midline cut does not show
        D = moves[k] if moves is not None else np.zeros_like(V)
        Nh = trimesh.Trimesh(V + D, F, process=False).vertex_normals.copy()
        if side == "M":
            c = V[F].mean(1)[:, 0] > midline
            for s, sel in (("R", c), ("L", ~c)):
                used, inv = np.unique(F[sel], return_inverse=True)
                out.append((s, V[used], N[used], inv.reshape(-1, 3), D[used], Nh[used] - N[used]))
        else:
            out.append((side, V, N, F, D, Nh - N))
    res = []
    for s, V, N, F, D, dN in sorted(out, key=lambda t: t[0]):
        n = {"name": s, "positions": V, "normals": N, "indices": F, "mode": 4}
        if moves is not None:
            n["targets"] = [{"name": "hydrocephalus", "positions": D, "normals": dN}]
        res.append(n)
    return res


# ---------------------------------------------------------------- the hydrocephalus shape
# At the slider's full extent the ventricles are as large as the medians of Rosu 2026's 68 adults with hydrocephalus
# (Evans' index 0.42, third ventricle 23.5 mm wide), the fourth ventricle and aqueduct unchanged (triventricular, as
# behind an aqueductal stenosis, the most common pattern in that cohort), and the floor of the third ventricle pushed
# down to HYDRO_APEX_MM from the basilar apex (Aydin 2009 in moderately enlarged ventricles, as da Silva 2024 cites it;
# the apex itself does not move). How the walls get there is a shape, not a simulation: each wall moves out along its
# normal (the lateral ventricles' lateral walls in full, their roofs half as far, their ends a third; their medial walls,
# the septum, and their floors stay), and everything around follows a smooth field (HYDRO_SIGMA_MM), fading away from
# the walls. The floor's distance from the apex is measured to the floor's nearest point, as Aydin measures it from the
# floor.
HYDRO_EVANS = 0.42
HYDRO_THIRD_MM = 23.5
HYDRO_APEX_MM = 2.75
HYDRO_SIGMA_MM = 13.0      # the field's smoothness: wall moves averaged over this (Gaussian sigma) ...
HYDRO_FADE = 0.15          # ... and fading to none away from the walls (this share of a wall point's own weight)
HYDRO_SAMPLE_MM = 1.5      # wall points sampled this far apart
HYDRO_SIDE_MM = 0.75       # a point feels only the walls it lies outside of (or within this inside them): the walls
                           # across a narrow ventricle move the other way
HYDRO_FLOOR_MM = (6.0, 14.0)   # the floor moves down in full within the first of these of the target, none beyond the second
HYDRO_THIRD_BACK_MM = 6.0  # the third ventricle's side walls (the thalami) move apart in full this far behind the foramina
                           # of Monro, not at all at them: the columns of the fornix in front of the foramina stay ...
HYDRO_THIRD_BELOW_MM = (3.0, 8.0)  # ... and below them the hypothalamus's walls do, in full this far below the foramina
VESSEL_CLEAR_MM = 1.5      # the shaped walls kept this far from this CT's vessels (they do not move: the floor comes down
                           # between them, onto the basilar artery, not through them) ...
VESSEL_SIGMA_MM = 3.0      # ... by a correction of this reach, in up to VESSEL_PASSES passes
VESSEL_PASSES = 10
MONRO_WEIGHT = 30.0        # the foramina's own walls outweigh the lateral ventricles' around them (they hold the fornix)
MONRO_AREA_MM2 = (5.23, 32.6)  # the foramen's mean cross-section without and with hydrocephalus (Jean 2019, abstract):
                               # it grows backwards and outwards from the fornix column, which stays
FRONTAL_MM = 25.0          # Evans' index: the frontal horns, the ventricles' front this far (as ventricles_build.frontal_horns),
                           # above the foramina of Monro
THIRD_LEVEL_MM = 8.0       # the third ventricle's width: on axial slices from the foramina's level to this far below


class Field:
    """A smooth displacement field from wall points p (n, 3), their outward normals n and their moves u (n, 3): at x,
    the Gaussian-weighted mean of the moves of the walls x lies outside of (HYDRO_SIDE_MM), faded by HYDRO_FADE where
    the walls are far."""

    def __init__(self, p: np.ndarray, n: np.ndarray, u: np.ndarray, sigma: float = HYDRO_SIGMA_MM, w: np.ndarray | None = None):
        self.p, self.n, self.u, self.s = p, n, u, sigma
        self.w = np.ones(len(p)) if w is None else w
        self.tree = cKDTree(p)
        self.k0 = HYDRO_FADE * float(np.median(self._sum(p[:: max(1, len(p) // 400)])[1]))

    def _sum(self, X: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        num = np.zeros((len(X), 3))
        den = np.zeros(len(X))
        for i0 in range(0, len(X), 4000):
            Q = X[i0:i0 + 4000]
            for j, nb in enumerate(self.tree.query_ball_point(Q, 3 * self.s)):
                if not nb:
                    continue
                r = Q[j] - self.p[nb]
                d2 = (r ** 2).sum(1)
                side = np.clip(((r * self.n[nb]).sum(1) + HYDRO_SIDE_MM) / HYDRO_SIDE_MM, 0, 1)
                k = np.exp(-d2 / (2 * self.s ** 2)) * side * self.w[nb]
                num[i0 + j] = k @ self.u[nb]
                den[i0 + j] = k.sum()
        return num, den

    def __call__(self, X: np.ndarray) -> np.ndarray:
        num, den = self._sum(np.atleast_2d(X))
        return num / (den + self.k0)[:, None]


def wall_moves(V: np.ndarray, N: np.ndarray, part: np.ndarray, midline: float, target: np.ndarray, monro_y: float,
               a: dict) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """The drawn walls' moves (thinned to HYDRO_SAMPLE_MM): part says which ventricle each vertex is ("lateral",
    "monro", "third", "still"); a: {"lateral", "third", "floor"} mm; monro_y: the foramina's y."""
    keep = thin_points(V, HYDRO_SAMPLE_MM)
    V, N, part = V[keep], N[keep], part[keep]
    away = np.c_[np.sign(V[:, 0] - midline), np.zeros(len(V)), np.zeros(len(V))]
    u = np.zeros_like(V)
    lat = part == "lateral"
    # the lateral wall in full, the roof half, the front and back a third; the medial wall (the septum) and the floor
    # (the thalamus and caudate, over the fornix) stay
    g = np.clip(np.clip((N[lat] * away[lat]).sum(1), 0, 1) + 0.5 * np.clip(N[lat, 2], 0, 1) + 0.3 * np.abs(N[lat, 1]), 0, 1)
    u[lat] = a["lateral"] * g[:, None] * N[lat]
    mo = part == "monro"                                          # the foramen grows back and out, its front (the fornix) stays
    grow = 2 * (np.sqrt(MONRO_AREA_MM2[1] / np.pi) - np.sqrt(MONRO_AREA_MM2[0] / np.pi))
    u[mo] = grow * np.clip(-N[mo, 1] + (N[mo] * away[mo]).sum(1), 0, 1)[:, None] * N[mo]
    th = part == "third"
    d = np.linalg.norm(V[th] - target, axis=1)
    near = np.clip((HYDRO_FLOOR_MM[1] - d) / (HYDRO_FLOOR_MM[1] - HYDRO_FLOOR_MM[0]), 0, 1)
    down = np.clip(-N[th, 2], 0, 1)
    u[th, 2] -= a["floor"] * near * down                          # its floor down
    # its side walls apart: a field of their own (SideField), felt only behind the foramina
    us = np.zeros_like(V)
    us[th, 0] = a["third"] * N[th, 0] * np.abs(N[th, 0])
    return V, N, u, us, np.where(mo, MONRO_WEIGHT, 1.0)


class HydroField:
    """The hydrocephalus shape's displacement: the walls' moves (Field), plus the third ventricle's side walls' (a
    Field of their own) where the point lies behind the foramina of Monro (in full HYDRO_THIRD_BACK_MM behind them)
    or below them (in full HYDRO_THIRD_BELOW_MM[1] below): the thalami and the hypothalamus part, the columns of the
    fornix in front of the foramina and above stay."""

    def __init__(self, p: np.ndarray, n: np.ndarray, u: np.ndarray, us: np.ndarray, w: np.ndarray, monro_y: float, monro_z: float):
        self.main = Field(p, n, u, w=w)
        side = np.abs(us).sum(1) > 0
        self.side = Field(p[side], n[side], us[side]) if side.any() else None
        self.monro_y, self.monro_z = monro_y, monro_z

    def __call__(self, X: np.ndarray) -> np.ndarray:
        X = np.atleast_2d(X)
        D = self.main(X)
        if self.side is not None:
            back = np.clip((self.monro_y - X[:, 1]) / HYDRO_THIRD_BACK_MM, 0, 1)
            b0, b1 = HYDRO_THIRD_BELOW_MM
            below = np.clip((self.monro_z - b0 - X[:, 2]) / (b1 - b0), 0, 1)
            D += np.maximum(back, below)[:, None] * self.side(X)
        return D


class SumField:
    """The sum of displacement fields."""

    def __init__(self, *fields):
        self.fields = fields

    def __call__(self, X: np.ndarray) -> np.ndarray:
        return sum(f(X) for f in self.fields)


def clear_vessels(f, V: np.ndarray, N: np.ndarray, dist) -> tuple[object, dict]:
    """The shape corrected so that no wall comes within VESSEL_CLEAR_MM of this CT's vessels, nor closer than it was
    at rest (dist: the distance from them at points, mm): where a moved wall point does, it is pulled back along the distance's gradient, by a field of
    VESSEL_SIGMA_MM reach (the walls round it follow); repeated. Returns the corrected field and a report."""
    keep = thin_points(V, HYDRO_SAMPLE_MM)
    V, N = V[keep], N[keep]
    total, ps, ns, us = f, [], [], []
    h = 0.25
    clear = np.minimum(VESSEL_CLEAR_MM, dist(V))       # no closer than at rest, where that was closer already (dist: signed)
    for _ in range(VESSEL_PASSES):
        X = V + total(V)
        need = clear - dist(X)
        bad = need > 0.05
        if not bad.any():
            break
        Xb = X[bad]
        g = np.stack([(dist(Xb + h * e) - dist(Xb - h * e)) / (2 * h) for e in np.eye(3)], 1)
        g /= np.maximum(np.linalg.norm(g, axis=1, keepdims=True), 1e-9)
        ps.append(V[bad]); ns.append(N[bad]); us.append(need[bad, None] * g * 1.6)
        total = SumField(f, Field(np.vstack(ps), np.vstack(ns), np.vstack(us), sigma=VESSEL_SIGMA_MM))
    d = dist(V + total(V))
    return total, {"vesselIntrusionMaxMm": round(float(np.maximum(clear - d, 0).max()), 2), "correctedPoints": int(sum(len(p) for p in ps))}


def thin_points(P: np.ndarray, cell: float) -> np.ndarray:
    _, first = np.unique(np.floor(P / cell).astype(np.int64), axis=0, return_index=True)
    return np.sort(first)


def measures(V: np.ndarray, part: np.ndarray, target: np.ndarray, apex: np.ndarray, inner_skull: float, monro_z: float,
             D: np.ndarray | None = None, target_move: np.ndarray | None = None) -> dict:
    """Evans' index (the frontal horns' greatest width across both on an axial slice above the foramina of Monro, over
    the inner skull width), the third ventricle's greatest width (axial, from the foramina's level to THIRD_LEVEL_MM
    below: as Rosu 2026 measures it, at or near that level), and the target's distance from the basilar apex; of the
    drawn walls, moved by D if given (the levels move with them)."""
    X = V + (D if D is not None else 0)
    L = X[part == "lateral"]
    mz = monro_z + (float(np.median(D[part == "monro", 2])) if D is not None and (part == "monro").any() else 0.0)
    front = L[(L[:, 1] > L[:, 1].max() - FRONTAL_MM) & (L[:, 2] > mz)]
    zs = np.round(front[:, 2] / 0.5) * 0.5
    w = max(float(np.ptp(front[zs == z, 0])) for z in np.unique(zs) if (zs == z).sum() > 4)
    T = X[part == "third"]
    T = T[(T[:, 2] <= mz) & (T[:, 2] >= mz - THIRD_LEVEL_MM)]
    tz = np.round(T[:, 2] / 0.5) * 0.5
    w3 = max(float(np.ptp(T[tz == z, 0])) for z in np.unique(tz) if (tz == z).sum() > 4)
    F = X[part == "third"]
    floor = F[np.linalg.norm(F - (target + (target_move if target_move is not None else 0)), axis=1) < HYDRO_FLOOR_MM[1]]
    return {"evansIndex": round(w / inner_skull, 3), "frontalHornsMm": round(w, 1), "thirdWidthMm": round(w3, 1),
            "floorToApexMm": round(float(np.linalg.norm(floor - apex, axis=1).min()), 2)}


def hydrocephalus(V: np.ndarray, N: np.ndarray, part: np.ndarray, midline: float, target: np.ndarray, apex: np.ndarray,
                  inner_skull: float, monro: np.ndarray, vessel_dist=None) -> tuple[object, dict]:
    """The field that takes the drawn walls to the hydrocephalus shape, its three amplitudes found by iteration so that
    the moved walls measure HYDRO_EVANS, HYDRO_THIRD_MM and HYDRO_APEX_MM. Returns the field and a report."""
    monro_z, monro_y = float(monro[:, 2].mean()), float(monro[:, 1].mean())
    rest = measures(V, part, target, apex, inner_skull, monro_z)
    goal = {"evansIndex": HYDRO_EVANS, "thirdWidthMm": HYDRO_THIRD_MM, "floorToApexMm": HYDRO_APEX_MM}
    a = {"lateral": (HYDRO_EVANS * inner_skull - rest["frontalHornsMm"]) / 2, "third": (HYDRO_THIRD_MM - rest["thirdWidthMm"]) / 2,
         "floor": rest["floorToApexMm"] - HYDRO_APEX_MM}
    keys = {"lateral": "evansIndex", "third": "thirdWidthMm", "floor": "floorToApexMm"}
    for _ in range(10):
        p, n, u, us, w = wall_moves(V, N, part, midline, target, monro_y, a)
        f = HydroField(p, n, u, us, w, monro_y, monro_z)
        got = measures(V, part, target, apex, inner_skull, monro_z, f(V), f(target)[0])
        done = True
        for k, m in keys.items():
            gain, want = got[m] - rest[m], goal[m] - rest[m]
            if abs(got[m] - goal[m]) > (0.005 if m == "evansIndex" else 0.2):
                done = False
            if abs(gain) > 1e-6:
                a[k] *= float(np.clip(want / gain, 0.5, 2.0))
        if done:
            break
    p, n, u, us, w = wall_moves(V, N, part, midline, target, monro_y, a)
    f = HydroField(p, n, u, us, w, monro_y, monro_z)
    vrep = {}
    if vessel_dist is not None:
        f, vrep = clear_vessels(f, V, N, vessel_dist)
    got = measures(V, part, target, apex, inner_skull, monro_z, f(V), f(target)[0])
    return f, {**vrep, "rest": rest, "hydrocephalus": got, "amplitudeMm": {k: round(v, 2) for k, v in a.items()}, "goal": goal,
               "maxMoveMm": round(float(np.linalg.norm(f(V), axis=1).max()), 1)}


def plexus_on_thalamus(plexus: list, moves: list, thalamus: np.ndarray, monro: dict, wall_v: np.ndarray, wall_n: np.ndarray) -> tuple[list, dict]:
    """The choroid plexus's moves with the hydrocephalus shape, kept against the thalamus at the foramina: the plexus
    within PLEXUS_MONRO_MM of a shaped foramen's centre (monro) shifted as one piece towards the shaped thalamus
    (thalamus: its vertices), in steps, until its near side is PLEXUS_THALAMUS_MM from it or more of it than before
    would lie outside the shaped walls (wall_v, wall_n: vertices and outward normals); the shift fades out with the
    distance from the foramen. Returns the moves and, per side, the shift and the thalamus's distance (median) before
    and after."""
    tt, wt = cKDTree(thalamus), cKDTree(wall_v)

    def outside(P):
        d, i = wt.query(P)
        return (np.einsum("ij,ij->i", P - wall_v[i], wall_n[i]) > 0) & (d > 0.1)
    a, b = PLEXUS_MONRO_MM
    out, rep = [D.copy() for D in moves], {}
    for s, c in monro.items():
        c = np.asarray(c, float)
        P = [V + D for (_, V, _), D in zip(plexus, out)]
        core = np.vstack([X[np.linalg.norm(X - c, axis=1) < a] for X in P])
        if len(core) < 20:
            continue
        u = (thalamus[tt.query(core)[1]] - core).mean(0)
        u /= np.linalg.norm(u)
        base = outside(core).mean()
        t = 0.0
        for k in np.arange(0.25, 8.01, 0.25):
            Q = core + k * u
            if outside(Q).mean() > base + PLEXUS_OUT_FRAC or tt.query(Q)[0].min() < PLEXUS_THALAMUS_MM:
                break
            t = float(k)
        for X, D in zip(P, out):
            w = np.clip((b - np.linalg.norm(X - c, axis=1)) / (b - a), 0, 1)
            D += (t * w * w * (3 - 2 * w))[:, None] * u
        rep[s] = {"shiftMm": round(t, 2), "thalamusMedianMm": [round(float(np.median(tt.query(core)[0])), 2),
                                                               round(float(np.median(tt.query(core + t * u)[0])), 2)]}
    return out, rep


def wrap_floor(V: np.ndarray, F: np.ndarray, D: np.ndarray, third: np.ndarray, mb_dist, up: np.ndarray) -> tuple[np.ndarray, dict]:
    """The shaped floor wrapped onto the shaped mammillary bodies: each third-ventricle wall point (third: a mask) above
    them (their surface's outward direction there pointing up) and within MB_WRAP_MM of them moved towards them until
    MB_GAP_MM off (fading out over the band), the moves smoothed a little over the surface. mb_dist: their signed
    distance at points (mm). Returns the moves and a report."""
    from scipy.sparse import coo_matrix
    P = V + D
    d = mb_dist(P)
    h = 0.25
    g = np.stack([(mb_dist(P + h * e) - mb_dist(P - h * e)) / (2 * h) for e in np.eye(3)], 1)
    g /= np.maximum(np.linalg.norm(g, axis=1, keepdims=True), 1e-6)
    a, b = MB_WRAP_MM
    w = np.clip((b - d) / (b - a), 0, 1) * np.clip((g @ up - 0.2) / 0.3, 0, 1) * third
    m = -(np.maximum(d - MB_GAP_MM, 0) * w)[:, None] * g
    n = len(V)
    e = np.vstack([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]])
    A = coo_matrix((np.ones(len(e) * 2), (np.r_[e[:, 0], e[:, 1]], np.r_[e[:, 1], e[:, 0]])), shape=(n, n)).tocsr()
    deg = np.maximum(np.asarray(A.sum(1)).ravel(), 1)
    for _ in range(2):
        m = np.where(third[:, None], 0.5 * m + 0.5 * (A @ m) / deg[:, None], 0)
    out = D + m
    left = mb_dist(V + out)
    return out, {"wrappedPoints": int((np.linalg.norm(m, axis=1) > 0.05).sum()), "maxMoveMm": round(float(np.linalg.norm(m, axis=1).max()), 2),
                 "minGapMm": round(float(left[w > 0].min()) if (w > 0).any() else 0.0, 2)}


def jacobian_min(f, P: np.ndarray, h: float = 0.5) -> float:
    """The smallest Jacobian determinant of x -> x + f(x) at the points: positive, it does not fold."""
    J = np.stack([(f(P + h * e) - f(P - h * e)) / (2 * h) for e in np.eye(3)], -1) + np.eye(3)[None]
    return float(np.linalg.det(J).min())


def drape(V: np.ndarray, F: np.ndarray, D: np.ndarray, dist) -> tuple[np.ndarray, dict]:
    """The shaped walls stopped at this CT's vessels: each wall point moves along its shape's move only until it would
    come within VESSEL_CLEAR_MM of a vessel (or closer than it was at rest), the stops smoothed over the surface (a
    point stops no later than its neighbours' mean allows), so the floor drapes over the P1 segments rather than
    passing through them. Returns the moves and a report."""
    from scipy.sparse import coo_matrix
    n = len(V)
    e = np.vstack([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]])
    A = coo_matrix((np.ones(len(e) * 2), (np.r_[e[:, 0], e[:, 1]], np.r_[e[:, 1], e[:, 0]])), shape=(n, n)).tocsr()
    deg = np.maximum(np.asarray(A.sum(1)).ravel(), 1)
    clear = np.minimum(VESSEL_CLEAR_MM, dist(V)) - 0.05
    L = np.linalg.norm(D, axis=1)
    t = np.ones(n)
    steps = int(np.ceil(L.max() / 0.25)) if n else 0
    for k in range(1, steps + 1):
        f = k / steps
        moving = (t >= 1) & (L * f > 1e-6)
        if not moving.any():
            continue
        idx = np.where(moving)[0]
        hit = dist(V[idx] + f * D[idx]) < clear[idx]
        t[idx[hit]] = (k - 1) / steps
    raw = t.copy()
    for _ in range(6):                                   # smooth the stops: none later than its neighbours' mean allows
        t = np.minimum(raw, 0.5 * (t + A @ t / deg))
    Dd = D * t[:, None]
    left = np.maximum(clear + 0.05 - dist(V + Dd), 0)
    return Dd, {"stoppedPoints": int((t < 0.999).sum()), "vesselIntrusionMaxMm": round(float(left.max()), 2)}
