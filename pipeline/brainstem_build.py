"""Build the brainstem section's structures in MNI space (ICBM 2009b).

  pipeline/.venv/bin/python -I -W ignore pipeline/brainstem_build.py
  node pipeline/compress.mjs brainstem
  pipeline/.venv/bin/python -I -W ignore pipeline/brainstem_build.py finalize

Inputs
  pipeline/data/build/brainstem/export.json   the Z-Anatomy export (brainstem_export.py, in Blender)
  pipeline/data/raw/t2.nii                    the ICBM 2009b T2 template (the fit's target: brainstem_fit.py)
  pipeline/data/raw/aan/                      Harvard Ascending Arousal Network atlas 2.0 (CC0)
  pipeline/data/raw/hcp842/tracks/            four tracts of the HCP-YA tractography atlas (Yeh 2018): its streamline
                                              files (CC BY-SA 4.0; fetch_sources.py), checked against HCP_TRK_MD5
  pipeline/data/raw/hcp842/                   the same tracts' volumes (NIfTI files, Zenodo 10.5281/zenodo.3627772,
                                              checked against HCP_MD5): what the streamline files are checked against
Writes
  pipeline/data/build/brainstem/*.glb         uncompressed GLBs (compress.mjs -> public/assets/brainstem/)
  src/data/generated/bs-manifest.json         structures (the section also shows DBS nuclei and HCP-1065 tracts)
  src/data/generated/bs-zones.json            safe entry zones: how each was drawn, with the model's measurements
  src/data/generated/bs-definitions.json      Wikipedia-derived definitions shipped with Z-Anatomy (CC BY-SA 3.0)

What comes from where
  - The brainstem's surface, its surface features, the ventricles around it, the cranial nerve nuclei, the cranial
    nerves III-XII and the arteries around it: the Z-Anatomy model (one adult), fitted into MNI space by
    brainstem_fit.py. Positions are approximate; internal nuclei most of all (the model's are simple shapes).
  - The ascending arousal network nuclei: surfaces of the AAN 2.0 labels (MNI152, 1 mm), which are MNI-native.
  - The medial longitudinal fasciculus, the central tegmental tract, the spinothalamic tract and the lateral
    lemniscus (the audit's D-008, November 2026): the streamlines of the HCP-YA tractography atlas (ICBM-152 space as
    FSL's FA template has it), drawn as the white-matter section draws its tracts. Neither Z-Anatomy nor the HCP-1065
    atlas has them. They are drawn where the atlas has them, without a shift: tract_fit measures each against the
    fitted brainstem and the T2 template, and the cards state what it found. The atlas's grid ends at z = -50.5 mm,
    and its streamlines with it (the spinothalamic tract's run 2 mm on). The streamline files give their points from
    the centre of the grid's first voxel, not from its corner as the TrackVis format has it: hcp_streamlines moves
    them by half a voxel and checks them against the atlas's own volumes of the same tracts.
  - Safe entry zones: drawn by rule on the fitted surface from the published definitions (src/brainstem/content.ts
    carries the claims and their sources); each zone's construction is stated in bs-zones.json.
"""
from __future__ import annotations

import gzip
import hashlib
import io
import json
import re
import shutil
import sys
from pathlib import Path

import nibabel as nib
import numpy as np
from scipy import ndimage
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from brainstem_fit import EXPORT, PARTS, Fitted, vertex_normals  # noqa: E402
from build import isosurface, resample  # noqa: E402
from glb import LINES, TRIANGLES, write_glb  # noqa: E402
from skullbase_build import TUBE_MIN_RADIUS_MM, definition, mesh_split, tube  # noqa: E402

REPO = ROOT.parent
KIND = "brainstem"
BUILD = ROOT / "data" / "build" / KIND
GEN = REPO / "src" / "data" / "generated"
PUBLIC = REPO / "public" / "assets"
PALETTE = json.loads((REPO / "src" / "data" / "palette.json").read_text())
CITES = json.loads((ROOT / "sources" / "citations.json").read_text())
AAN_DIR = ROOT / "data" / "raw" / "aan"
AAN_FILE = AAN_DIR / "AAN_Brainstem_MNI152_1mm_v2p0.nii"

ZA = {"name": "Z-Anatomy (based on BodyParts3D), fitted into MNI space",
      "licence": "CC BY-SA 4.0 (Z-Anatomy); BodyParts3D CC BY-SA 2.1 Japan; definitions from Wikipedia, CC BY-SA 3.0",
      "cite": ["mitsuhashi2009", "fonov2011"]}
AAN = {"name": "Harvard Ascending Arousal Network Atlas 2.0", "licence": "CC0 1.0", "cite": ["edlow2023aan", "olchanyi2025"]}
HCP_DIR = ROOT / "data" / "raw" / "hcp842"
HCP = {"name": "HCP-YA tractography atlas (Yeh 2018)",
       "licence": "CC BY-SA 4.0 (brain.labsolver.org/hcp_trk_atlas.html; the volumes: Zenodo record 10.5281/zenodo.3627772); "
                  "derived from Human Connectome Project data, so also subject to the WU-Minn HCP Open Access Data Use Terms",
       "cite": ["yeh2018hcpyatrk", "yeh2018hcpya", "yeh2018"]}
DATASETS = {
    "zanatomy": {"name": ZA["name"], "licence": ZA["licence"], "url": "https://github.com/Z-Anatomy/Models-of-human-anatomy",
                 "attribution": ["BodyParts3D - The Database Center for Life Science - CC-BY-SA 2.1 Japan",
                                 "Z-Anatomy - The libre 3D atlas of anatomy - CC-BY-SA 4.0",
                                 "Definitions: Wikipedia - CC-BY-SA 3.0 (the source page is linked on each definition)"],
                 "cite": ZA["cite"],
                 "note": "One adult model (BodyParts3D), fitted onto the ICBM 2009b template's brainstem: a similarity transform, "
                         "then a smooth deformation, to the boundary between brainstem tissue and fluid on the T2 template. The "
                         "surface follows the template closely; nerves, arteries and the nuclei inside are carried along, so their "
                         "positions are approximate (the model's nuclei are simple shapes)."},
    "aan": {"name": AAN["name"], "licence": AAN["licence"], "url": "https://doi.org/10.5061/dryad.zw3r228d2",
            "attribution": ["Edlow BL, Kinney HC (2023). Harvard Ascending Arousal Network Atlas - Version 2.0. Dryad. CC0 1.0"],
            "cite": AAN["cite"],
            "note": "Ten brainstem nuclei of the ascending arousal network, annotated on ex vivo MRI with histology, in MNI152 space at 1 mm."},
    "hcp842": {"name": HCP["name"], "licence": HCP["licence"], "url": "https://brain.labsolver.org/hcp_trk_atlas.html",
               "attribution": ["Yeh FC (2018). HCP-YA (HCP842) tractography atlas: streamline files, brain.labsolver.org/hcp_trk_atlas.html. CC BY-SA 4.0",
                               "Yeh FC (2018). HCP-YA Tractography Atlas (NIFTI Files). Zenodo. CC BY-SA 4.0"],
               "cite": HCP["cite"],
               "note": "The atlas's streamlines of each tract and side, from tractography on the averaged diffusion MRI of 842 "
                       "Human Connectome Project participants, labelled by neuroanatomists. Space: ICBM-152 as FSL's "
                       "fractional anisotropy template has it (Yeh 2018), not the ICBM 2009b template this section is drawn on; "
                       "the streamlines are drawn where the atlas has them, without a shift, and each tract's card states how "
                       "they sit in the fitted brainstem and on the T2 template. The atlas's grid ends at z = -50.5 mm, about "
                       "where this model's pons meets its medulla, and its streamlines end there (the spinothalamic tract's "
                       "about 2 mm lower), so no tract of the atlas is drawn through the medulla. The streamline files were "
                       "checked against the atlas's volumes of the same tracts (NIfTI files, Zenodo)."},
}

# ---------------------------------------------------------------- what is built
SURFACE = {"Midbrain": "bs_midbrain", "Pons": "bs_pons", "Medulla oblongata": "bs_medulla"}
FEATURES = {"Olive": "bs_olive", "Pyramid of medulla oblongata": "bs_pyramid", "Superior colliculus": "bs_superior_colliculus",
            "Inferior colliculus": "bs_inferior_colliculus", "Base of peduncle": "bs_crus", "Medial geniculate body": "bs_mgb"}
CSF = {"Fourth ventricle": "bs_fourth_ventricle", "Aqueduct of midbrain": "bs_aqueduct"}
# cranial nerve nuclei: (Z-Anatomy name, id, cranial nerve)
CN_NUCLEI = [
    ("Nucleus of oculomotor nerve", "bs_n_oculomotor", 3),
    ("Accessory nucleus of oculomotor nerve", "bs_n_edinger_westphal", 3),
    ("Nucleus of trochlear nerve", "bs_n_trochlear", 4),
    ("Nucleus of abducens nerve", "bs_n_abducens", 6),
    ("Motor nucleus of facial nerve", "bs_n_facial", 7),
    ("Superior salivatory nucleus", "bs_n_sup_salivatory", 7),
    ("Anterior cochlear nucleus", "bs_n_cochlear_ant", 8),
    ("Posterior cochlear nucleus", "bs_n_cochlear_post", 8),
    ("Vestibular nuclei", "bs_n_vestibular", 8),
    ("Inferior salivatory nucleus", "bs_n_inf_salivatory", 9),
    ("Nucleus ambiguus", "bs_n_ambiguus", 10),
    ("Posterior nucleus of vagus nerve", "bs_n_dorsal_vagal", 10),
    ("Nucleus of solitary tract", "bs_n_solitary", 10),
    ("Nucleus of accessory nerve", "bs_n_accessory", 11),
    ("Nucleus of hypoglossal nerve", "bs_n_hypoglossal", 12),
]
# nuclei that serve more than one cranial nerve (the audit's D-008): every nerve, in order. The sources are with the
# claims in src/brainstem/content.ts (SHARED_NUCLEI); `cranialNerve` above stays the one the list is sorted by
SHARED_NUCLEI = {"bs_n_ambiguus": [9, 10, 11], "bs_n_solitary": [7, 9, 10]}
# tracts of the HCP-YA tractography atlas: (id, name, abbreviation, the volume files' stem, colour token); the streamline
# files are named by the abbreviation
HCP_TRACTS = [
    ("bs_t_mlf", "Medial longitudinal fasciculus", "MLF", "Medial_Longitudinal_Fasciculus", "bsMlf"),
    ("bs_t_ctt", "Central tegmental tract", "CTT", "Central_Tegmental_Tract", "bsCtt"),
    ("bs_t_stt", "Spinothalamic tract", "STT", "Spinothalamic_Tract", "bsStt"),
    ("bs_t_ll", "Lateral lemniscus", "LL", "Lateral_Lemniscus", "bsLl"),
]
HCP_STEP_MM = 1.0         # the streamlines are resampled to this step (the files' own steps are 0.5 to 2 mm)
HCP_MIN_LENGTH_MM = 10.0  # a streamline shorter than this is left out (the files hold a few of one point or a millimetre)
# md5 of each streamline file as downloaded on 18 November 2026 (its folder lists no checksums)
HCP_TRK_MD5 = {
    "MLF_L": "48a2f794403457e7d4ebc7f5f93aacd6", "MLF_R": "68f0e17427291e519af13db235e11d87",
    "CTT_L": "7708e9956f37d9793e6e152d4753af0d", "CTT_R": "c6a8f240d803f8654d7d30a6d3f81c55",
    "STT_L": "bfae216317ae985c4f23991aa22fd448", "STT_R": "21de05d61a5f302f3f0af8aaa869254a",
    "LL_L": "bac48ee213d7fe6e112a26f1780f5742", "LL_R": "a34aefe441f8a57f035ebe1ab942c500",
}
# md5 of each volume file, as the Zenodo record lists it
HCP_MD5 = {
    "Medial_Longitudinal_Fasciculus_L": "e72cd27fc0f1d2e0bcb6bb62ee9d7f02", "Medial_Longitudinal_Fasciculus_R": "96174fa252a7bba2ceacab993152f4ed",
    "Central_Tegmental_Tract_L": "b6399ce5733a7cf15d02713f608cbf45", "Central_Tegmental_Tract_R": "64a3c25541efce93d4406e6725c64327",
    "Spinothalamic_Tract_L": "3def58e4028e3fc81531247fea1b74d8", "Spinothalamic_Tract_R": "78097a51f56a8bae36e60909856cf148",
    "Lateral_Lemniscus_L": "65c5825c93933fbb8b91398724c60cbc", "Lateral_Lemniscus_R": "897d5b4b4c013175cc507bba99f7c4ac",
}
NERVES = {"Oculomotor nerve (III)": 3, "Trochlear nerve (IV)": 4, "Trigeminal nerve (V)": 5, "Abducens nerve (VI)": 6,
          "Facial nerve (VII)": 7, "Vestibulocochlear nerve (VIII)": 8, "Glossopharyngeal nerve (IX)": 9, "Vagus nerve (X)": 10,
          "Accessory nerve (XI)": 11, "Hypoglossal nerve (XII)": 12}
TRIGEMINAL_ROOTS = ["Motor root of trigeminal nerve", "Sensory root of trigeminal nerve"]
ARTERIES = ["Basilar artery", "Vertebral artery", "Posterior cerebral artery", "Superior cerebellar artery",
            "Anterior inferior cerebellar artery", "Posterior inferior cerebellar artery", "Posterior communicating artery"]
NERVE_REACH_MM = 20.0     # nerves are kept to this far outside the brainstem (their cisternal course)
ARTERY_REACH_MM = 12.0    # arteries: their course next to the brainstem
# AAN 2.0 labels (README): midline nuclei, then the paired ones (left 73xx, right 74xx)
AAN_MIDLINE = {7201: ("Dorsal raphe", "DR"), 7202: ("Median raphe", "MnR"), 7203: ("Periaqueductal grey", "PAG"),
               7204: ("Ventral tegmental area", "VTA")}
AAN_PAIRED = {1: ("Locus coeruleus", "LC"), 2: ("Laterodorsal tegmental nucleus", "LDTg"), 3: ("Mesencephalic reticular formation", "mRt"),
              4: ("Parabrachial complex", "PBC"), 5: ("Pontine reticular formation (pontis oralis)", "PnO"),
              6: ("Pedunculotegmental nucleus", "PTg")}
AAN_STEP_MM = 0.5         # the 1 mm labels are resampled (linearly) to this grid before their surface is taken

# fourth-ventricle floor (Erginoglu 2026, 40 cadavers): the sulcus limitans 3.09 mm (right) and 3.03 mm (left) from
# the median sulcus; the aqueduct-to-facial-colliculus and facial-colliculus-to-obex segments 43.57 % and 43.34 % of
# the floor's length, so the colliculus itself takes the remaining 13.09 %
SULCUS_LIMITANS_MM = {"R": 3.09, "L": 3.03}
FC_ROSTRAL, FC_CAUDAL = 0.4357, 0.4334
FLOOR_MLF_MM = 0.5        # the zones' medial edge: just off the median sulcus (the medial longitudinal fasciculus)
SEZ_OFFSET_MM = 0.3       # zone patches float this far off the surface
SEZ_WIDTH_MM = 1.2        # half-width of a zone drawn along a line (an incision)


def colour(token: str) -> dict:
    return {"token": token, "light": PALETTE["light"][token], "dark": PALETTE["dark"][token]}


def cite(keys: list[str]) -> tuple[list[str], list[str]]:
    return [CITES[k]["citation"] for k in keys], [CITES[k]["url"] for k in keys]


def tri_normals(v: np.ndarray, t: np.ndarray) -> np.ndarray:
    return vertex_normals(v, t)


def orient(v: np.ndarray, t: np.ndarray) -> np.ndarray:
    """Faces wound outward (positive enclosed volume)."""
    c = v.mean(0)
    vol = np.einsum("ij,ij->i", v[t[:, 0]] - c, np.cross(v[t[:, 1]] - c, v[t[:, 2]] - c)).sum()
    return t if vol >= 0 else t[:, ::-1]


def orient_tube(v: np.ndarray, t: np.ndarray, k: int = 40) -> tuple[np.ndarray, np.ndarray]:
    """Faces and normals of a tube-like mesh (the model's aqueduct, whose source mesh has some triangles folded
    inwards), both taken to point away from the tube's local centre (the mean of the k nearest vertices)."""
    tree = cKDTree(v)
    _, nb = tree.query(v, k=min(k, len(v)))
    n = v - v[nb].mean(1)
    n /= np.linalg.norm(n, axis=1, keepdims=True) + 1e-12
    fn = np.cross(v[t[:, 1]] - v[t[:, 0]], v[t[:, 2]] - v[t[:, 0]])
    t = np.where((np.einsum("ij,ij->i", fn, n[t].sum(1)) < 0)[:, None], t[:, ::-1], t)
    return t, n


def node(side: str, v: np.ndarray, t: np.ndarray, n: np.ndarray | None = None) -> dict:
    return {"name": side, "positions": v, "normals": tri_normals(v, t) if n is None else n, "indices": t, "mode": TRIANGLES}


def split_nodes(v: np.ndarray, t: np.ndarray, n: np.ndarray | None = None) -> list[dict]:
    """A midline mesh cut at x = 0 into left and right nodes, lit with the whole mesh's normals (a thin half's own
    normals fold at the cut)."""
    n = tri_normals(v, t) if n is None else n
    halves = mesh_split(v, t, np.arange(len(v), dtype=float))
    return [node(sd, hv, ht, n[idx.astype(int)]) for sd, (hv, ht, idx) in sorted(halves.items())]


# ---------------------------------------------------------------- the fitted surface and rules on it
def facing(v: np.ndarray, t: np.ndarray, n: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """A patch on the surface, each triangle wound to face the way the surface does (its vertices' normals n), lit
    with those normals."""
    fn = np.cross(v[t[:, 1]] - v[t[:, 0]], v[t[:, 2]] - v[t[:, 0]])
    back = np.einsum("ij,ij->i", fn, n[t].sum(1)) < 0
    t = np.where(back[:, None], t[:, ::-1], t)
    return v, t, n


class Surface:
    """The fitted brainstem surface (six halves). Snapping and casting use the outer surface only (not the midline
    faces where the halves meet)."""

    def __init__(self, parts: dict[str, tuple[np.ndarray, np.ndarray]]):
        vs, ts, ns, owner, off = [], [], [], [], 0
        for name, (v, t) in parts.items():
            vs.append(v); ts.append(t + off); ns.append(tri_normals(v, t)); owner += [name] * len(v)
            off += len(v)
        self.V, self.T, self.N = np.vstack(vs), np.vstack(ts), np.vstack(ns)
        self.owner = np.array(owner)
        self.outer = ~((np.abs(self.V[:, 0]) < 0.6) & (np.abs(self.N[:, 0]) > 0.8))
        self.oi = np.nonzero(self.outer)[0]
        self.tree = cKDTree(self.V[self.oi])
        self._meshes: dict = {}
        self._solid: tuple[np.ndarray, np.ndarray, float] | None = None
        self._outside: np.ndarray | None = None

    def nearest(self, p: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        d, j = self.tree.query(np.atleast_2d(p))
        return d, self.oi[j]

    def inside(self, p: np.ndarray) -> np.ndarray:
        """Whether points lie inside the brainstem (the union of its closed parts), from a 0.5 mm solid mask."""
        if self._solid is None:
            self._solid = self._solid_mask()
        mask, lo, step = self._solid
        ijk = np.rint((np.atleast_2d(p) - lo) / step).astype(int)
        ok = np.all((ijk >= 0) & (ijk < mask.shape), axis=1)
        out = np.zeros(len(ijk), bool)
        out[ok] = mask[ijk[ok, 0], ijk[ok, 1], ijk[ok, 2]]
        return out

    def outside_mm(self, p: np.ndarray) -> np.ndarray:
        """How far outside the brainstem points lie (mm; 0 inside it), from the same 0.5 mm solid mask."""
        if self._solid is None:
            self._solid = self._solid_mask()
        mask, lo, step = self._solid
        if self._outside is None:
            self._outside = ndimage.distance_transform_edt(~mask) * step
        ijk = np.rint((np.atleast_2d(p) - lo) / step).astype(int)
        ijk = np.clip(ijk, 0, np.array(mask.shape) - 1)      # (a point beyond the grid: as far as the grid's edge is)
        return self._outside[ijk[:, 0], ijk[:, 1], ijk[:, 2]]

    def _solid_mask(self, step: float = 0.5) -> tuple[np.ndarray, np.ndarray, float]:
        """Scanline fill: for each closed part, every grid line along x is filled between successive crossings of the
        part's triangles (parity); the brainstem is the union of its parts. (Testing against the nearest surface
        vertex fails near the faces where the parts meet inside the brainstem.)"""
        lo = self.V.min(0) - 2 * step
        hi = self.V.max(0) + 2 * step
        # a grid symmetric about x = 0, so the two sides are filled alike
        xm = np.ceil(np.abs(self.V[:, 0]).max() / step + 2) * step
        lo[0], hi[0] = -xm, xm
        shape = np.ceil((hi - lo) / step).astype(int) + 1
        mask = np.zeros(shape, bool)
        xs = lo[0] + step * np.arange(shape[0])
        for part in np.unique(self.owner):
            vi = np.nonzero(self.owner == part)[0]
            tri = self.T[np.isin(self.T, vi).all(1)]
            hits: dict[tuple[int, int], list[float]] = {}
            for a, b, c in self.V[tri]:
                ys, zs = np.array([a[1], b[1], c[1]]), np.array([a[2], b[2], c[2]])
                j0, j1 = int(np.ceil((ys.min() - lo[1]) / step)), int(np.floor((ys.max() - lo[1]) / step))
                k0, k1 = int(np.ceil((zs.min() - lo[2]) / step)), int(np.floor((zs.max() - lo[2]) / step))
                if j1 < j0 or k1 < k0:
                    continue
                det = (b[1] - a[1]) * (c[2] - a[2]) - (c[1] - a[1]) * (b[2] - a[2])
                if abs(det) < 1e-12:
                    continue
                J, K = np.meshgrid(np.arange(j0, j1 + 1), np.arange(k0, k1 + 1), indexing="ij")
                y, z = lo[1] + step * J.ravel(), lo[2] + step * K.ravel()
                u = ((y - a[1]) * (c[2] - a[2]) - (c[1] - a[1]) * (z - a[2])) / det
                v = ((b[1] - a[1]) * (z - a[2]) - (y - a[1]) * (b[2] - a[2])) / det
                inn = (u >= 0) & (v >= 0) & (u + v < 1)
                x = a[0] + u * (b[0] - a[0]) + v * (c[0] - a[0])
                for jj, kk, xx in zip(J.ravel()[inn], K.ravel()[inn], x[inn]):
                    hits.setdefault((int(jj), int(kk)), []).append(float(xx))
            for (jj, kk), xl in hits.items():
                xl = sorted(xl)
                for x0, x1 in zip(xl[0::2], xl[1::2]):
                    mask[(xs >= x0) & (xs <= x1), jj, kk] = True
        return mask, lo, step

    def _mesh(self, sel: np.ndarray | None) -> dict:
        """Outer faces of the selected vertices: triangle corners, normals and a centroid tree (cached per selection)."""
        key = None if sel is None else sel.tobytes()
        if key not in self._meshes:
            ok = self.outer if sel is None else (sel & self.outer)
            f = self.T[ok[self.T].all(1)]
            tri = self.V[f]
            n = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
            n /= np.linalg.norm(n, axis=1, keepdims=True) + 1e-12
            self._meshes[key] = {"tri": tri, "n": n, "tree": cKDTree(tri.mean(1))}
        return self._meshes[key]

    @staticmethod
    def _rays(tri: np.ndarray, o: np.ndarray, d: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """Möller-Trumbore, every ray against every triangle: (distance along each ray to its first hit or inf, face)."""
        e1, e2 = tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0]
        best_t = np.full(len(o), np.inf)
        best_f = np.full(len(o), -1)
        for k0 in range(0, len(o), 64):
            O, D = o[k0:k0 + 64, None, :], d[k0:k0 + 64, None, :]
            pv = np.cross(D, e2[None])
            det = np.einsum("rfk,fk->rf", pv, e1)
            inv = 1.0 / np.where(np.abs(det) < 1e-12, np.nan, det)
            tv = O - tri[None, :, 0]
            u = np.einsum("rfk,rfk->rf", tv, pv) * inv
            qv = np.cross(tv, e1[None])
            v = np.einsum("rfk,rk->rf", qv, D[:, 0]) * inv
            t = np.einsum("rfk,fk->rf", qv, e2) * inv
            hit = (u >= 0) & (v >= 0) & (u + v <= 1) & (t > 0)
            t = np.where(hit, t, np.inf)
            f = np.argmin(t, axis=1)
            best_t[k0:k0 + 64] = t[np.arange(len(f)), f]
            best_f[k0:k0 + 64] = f
        return best_t, best_f

    @staticmethod
    def _closest_on_tri(p: np.ndarray, a: np.ndarray, b: np.ndarray, c: np.ndarray) -> np.ndarray:
        """Closest points on triangles (a, b, c) to points p (Ericson, Real-Time Collision Detection 5.1.5), vectorised."""
        ab, ac, ap = b - a, c - a, p - a
        d1, d2 = (ab * ap).sum(1), (ac * ap).sum(1)
        bp = p - b
        d3, d4 = (ab * bp).sum(1), (ac * bp).sum(1)
        cp = p - c
        d5, d6 = (ab * cp).sum(1), (ac * cp).sum(1)
        va, vb, vc = d3 * d6 - d5 * d4, d5 * d2 - d1 * d6, d1 * d4 - d3 * d2
        den = 1.0 / np.where(va + vb + vc == 0, 1e-12, va + vb + vc)
        out = a + ab * (vb * den)[:, None] + ac * (vc * den)[:, None]
        with np.errstate(divide="ignore", invalid="ignore"):
            cases = [
                ((d1 <= 0) & (d2 <= 0), a),
                ((d3 >= 0) & (d4 <= d3), b),
                ((d6 >= 0) & (d5 <= d6), c),
                ((vc <= 0) & (d1 >= 0) & (d3 <= 0), a + ab * np.nan_to_num(d1 / (d1 - d3))[:, None]),
                ((vb <= 0) & (d2 >= 0) & (d6 <= 0), a + ac * np.nan_to_num(d2 / (d2 - d6))[:, None]),
                ((va <= 0) & ((d4 - d3) >= 0) & ((d5 - d6) >= 0),
                 b + (c - b) * np.nan_to_num((d4 - d3) / ((d4 - d3) + (d5 - d6)))[:, None]),
            ]
        for m, q in reversed(cases):
            out = np.where(m[:, None], q, out)
        return out

    def closest(self, P: np.ndarray, sel=None) -> tuple[np.ndarray, np.ndarray]:
        """Closest points on the selected outer surface, and the face normals there."""
        m = self._mesh(sel)
        P = np.atleast_2d(P)
        _, cand = m["tree"].query(P, k=min(12, len(m["tri"])))
        best = np.full(len(P), np.inf)
        bq, bn = np.zeros_like(P), np.zeros_like(P)
        for k in range(cand.shape[1]):
            f = cand[:, k]
            t = m["tri"][f]
            q = self._closest_on_tri(P, t[:, 0], t[:, 1], t[:, 2])
            d = np.linalg.norm(q - P, axis=1)
            better = d < best
            best[better], bq[better], bn[better] = d[better], q[better], m["n"][f][better]
        return bq, bn

    def cast(self, p: np.ndarray, d: np.ndarray, sel: np.ndarray | None = None, reach: float = 25.0) -> tuple[np.ndarray, np.ndarray]:
        """The surface point (and its face normal) first met coming from p + reach*d towards p (d: the outward
        direction), on the selected part of the outer surface; past its edge, the nearest point of it."""
        P, Nn = self.cast_many(np.atleast_2d(p), d, sel, reach)
        return P[0], Nn[0]

    def cast_many(self, ps: np.ndarray, d: np.ndarray, sel=None, reach: float = 25.0, fallback: bool = True):
        m = self._mesh(sel)
        d = d / np.linalg.norm(d)
        o = ps + reach * d
        t, f = self._rays(m["tri"], o, np.repeat(-d[None], len(ps), 0))
        P = o - t[:, None] * d
        Nn = m["n"][np.maximum(f, 0)]
        miss = ~np.isfinite(t)
        if miss.any():
            if fallback:
                P[miss], Nn[miss] = self.closest(ps[miss], sel)
            else:
                P[miss] = np.nan
        return P, Nn

    def line(self, pts: list[np.ndarray], d: np.ndarray | list[np.ndarray], sel=None, step: float = 0.4) -> tuple[np.ndarray, np.ndarray]:
        """A polyline through pts, densified, cast onto the surface along the outward direction(s) d, smoothed and put
        back on the surface. Returns the points and the surface normals there."""
        out = []
        for k in range(len(pts) - 1):
            a, b = np.asarray(pts[k], float), np.asarray(pts[k + 1], float)
            n = max(2, int(np.linalg.norm(b - a) / step))
            for u in np.linspace(0, 1, n, endpoint=k == len(pts) - 2):
                dd = d if isinstance(d, np.ndarray) else (1 - u) * d[k] + u * d[k + 1]
                out.append(self.cast(a + u * (b - a), dd, sel)[0])
        P = np.array(out)
        # smooth (casting picks up the surface's facets), drop near-duplicates, smooth again
        for _ in range(8):
            if len(P) > 4:
                P[1:-1] = (P[:-2] + 2 * P[1:-1] + P[2:]) / 4
        keep = [0]
        for i in range(1, len(P)):
            if np.linalg.norm(P[i] - P[keep[-1]]) >= 0.3 or i == len(P) - 1:
                keep.append(i)
        P = P[keep]
        Q, Nn = self.closest(P, sel)
        for _ in range(4):
            if len(Q) > 4:
                Q[1:-1] = (Q[:-2] + 2 * Q[1:-1] + Q[2:]) / 4
        return self.closest(Q, sel)

    @staticmethod
    def ribbon(P: np.ndarray, Nrm: np.ndarray, width: float = SEZ_WIDTH_MM) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """A band of the given half-width along a surface line, lifted off the surface and facing outwards."""
        T = np.gradient(P, axis=0)
        T /= np.linalg.norm(T, axis=1, keepdims=True) + 1e-12
        B = np.cross(Nrm, T)
        B /= np.linalg.norm(B, axis=1, keepdims=True) + 1e-12
        lift = P + SEZ_OFFSET_MM * Nrm
        v = np.vstack([lift - width * B, lift + width * B])
        nv = np.vstack([Nrm, Nrm])
        n = len(P)
        t = []
        for i in range(n - 1):
            t += [[i, i + 1, n + i], [i + 1, n + i + 1, n + i]]
        return facing(v, np.array(t), nv)

    def area(self, origin: np.ndarray, du: np.ndarray, dv: np.ndarray, us: np.ndarray, vs: np.ndarray, inside, d: np.ndarray,
             sel=None) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """A patch: a grid origin + u*du + v*dv cast onto the surface along the outward direction d; grid cells whose
        four corners satisfy inside(u, v, point) are kept. Lifted off the surface and facing outwards."""
        G = origin + us[:, None, None] * du + vs[None, :, None] * dv
        flat = G.reshape(-1, 3)
        P, Nn = self.cast_many(flat, d, sel, fallback=False)
        U, Vv = np.meshgrid(us, vs, indexing="ij")
        ok = ~np.isnan(P[:, 0]) & np.array([inside(u, v, q) if not np.isnan(q[0]) else False
                                              for u, v, q in zip(U.ravel(), Vv.ravel(), P)])
        ok = ok.reshape(U.shape)
        idx = np.arange(ok.size).reshape(ok.shape)
        t = []
        for i in range(ok.shape[0] - 1):
            for j in range(ok.shape[1] - 1):
                if ok[i, j] and ok[i + 1, j] and ok[i, j + 1] and ok[i + 1, j + 1]:
                    a, b, c, e = idx[i, j], idx[i + 1, j], idx[i, j + 1], idx[i + 1, j + 1]
                    t += [[a, b, e], [a, e, c]]
        if not t:
            return np.zeros((0, 3)), np.zeros((0, 3), int), np.zeros((0, 3))
        t = np.array(t)
        used, inv = np.unique(t, return_inverse=True)
        v = P[used] + SEZ_OFFSET_MM * Nn[used]
        return facing(v, inv.reshape(-1, 3), Nn[used])


def exits(runs: list[np.ndarray], surf: Surface, min_out: float = 8.0) -> list[np.ndarray]:
    """Where a nerve's centre lines leave the brainstem: crossings of the surface after which the line stays outside
    for at least min_out mm (loops near the fourth ventricle's floor are skipped)."""
    found = []
    for r in runs:
        p = r[:, :3]
        if len(p) < 2:
            continue
        ins = surf.inside(p)
        seg = np.r_[0.0, np.linalg.norm(np.diff(p, axis=0), axis=1)]
        for i in np.nonzero(ins[:-1] != ins[1:])[0]:
            # the outside side of the crossing and how far the line stays out
            if ins[i]:
                j, step = i + 1, 1
            else:
                j, step = i, -1
            run_len = 0.0
            k = j
            while 0 <= k < len(p) and not ins[k]:
                run_len += seg[k] if step > 0 else seg[k + 1] if k + 1 < len(p) else 0
                k += step
            if run_len >= min_out:
                found.append((p[i] + p[i + 1]) / 2)
    return found


# ---------------------------------------------------------------- AAN
def label_surface(mask: np.ndarray, aff: np.ndarray, faces: int = 3000):
    """Surface of a 1 mm label, resampled linearly to AAN_STEP_MM first (small nuclei keep their shape)."""
    ijk = np.argwhere(mask)
    lo = nib.affines.apply_affine(aff, ijk.min(0) - 2)
    hi = nib.affines.apply_affine(aff, ijk.max(0) + 2)
    lo, hi = np.minimum(lo, hi), np.maximum(lo, hi)
    ax = [np.arange(lo[k], hi[k] + 1e-6, AAN_STEP_MM) for k in range(3)]
    G = np.stack(np.meshgrid(*ax, indexing="ij"), -1)
    src = nib.affines.apply_affine(np.linalg.inv(aff), G.reshape(-1, 3)).T
    vol = ndimage.map_coordinates(mask.astype(np.float32), src, order=1).reshape(G.shape[:3])
    a2 = np.diag([AAN_STEP_MM] * 3 + [1.0])
    a2[:3, 3] = lo
    m = isosurface(vol, a2, 0.5, 0.8, faces)
    return np.asarray(m.vertices), np.asarray(m.faces)


# ---------------------------------------------------------------- a structure's file and manifest entry
def structure(sid: str, name: str, mtype: str, token: str, nodes: list[dict], derivation: str, *, dataset="zanatomy", **extra) -> dict:
    """Write a structure's GLB into the build folder and return its manifest entry."""
    nodes = [n for n in nodes if len(n["indices"])]
    if not nodes:
        raise SystemExit(f"{sid}: no geometry")
    write_glb(BUILD / f"{sid}.glb", nodes, {"id": sid})
    cent = {n["name"]: np.asarray(n["positions"]).mean(0).round(2).tolist() for n in nodes}
    for sd in ("L", "R"):
        cent.setdefault(sd, cent.get("R" if sd == "L" else "L"))
    cits, urls = cite(DATASETS[dataset]["cite"])
    return {"id": sid, "name": name, "aliases": extra.pop("aliases", []), "type": mtype,
            "file": f"assets/{KIND}/{sid}.glb", "bytes": 0, "colour": colour(token), "dataset": dataset,
            "source": DATASETS[dataset]["name"], "licence": DATASETS[dataset]["licence"],
            "citation": cits, "citationUrls": urls, "refIds": [], "derivation": derivation,
            "centroid": {"L": cent["L"], "R": cent["R"]}, **extra}


def dataset_infos() -> dict:
    """The manifest's record of each dataset."""
    return {k: {"name": d["name"], "licence": d["licence"], "url": d["url"], "note": d["note"], "attribution": d["attribution"],
                "citation": cite(d["cite"])[0], "citationUrls": cite(d["cite"])[1]} for k, d in DATASETS.items()}


# ---------------------------------------------------------------- tracts of the HCP-YA atlas
HCP_DERIVATION = ("The streamlines of the atlas's bundle for this tract ({L} on the left, {R} on the right: all but those "
                  "shorter than 10 mm), resampled to 1 mm. Drawn where the atlas has them, in its own ICBM-152 space, without a shift onto this section's ICBM "
                  "2009b template. They end where the atlas's grid does, near z = -50 mm, so the tract is not drawn through "
                  "the medulla. On-screen density is the atlas's count of streamlines, not a measure of the tract's size.")


def hcp_volume(stem: str, sd: str) -> tuple[np.ndarray, np.ndarray]:
    """One tract's volume of the HCP-YA atlas (a side): its voxels and the affine; the file checked against the md5
    the Zenodo record lists."""
    f = HCP_DIR / f"{stem}_{sd}.nii.gz"
    if not f.exists():
        raise SystemExit(f"{f} missing: the HCP-YA tractography atlas's NIfTI files, https://doi.org/10.5281/zenodo.3627772")
    if hashlib.md5(f.read_bytes()).hexdigest() != HCP_MD5[f"{stem}_{sd}"]:
        raise SystemExit(f"{f}: not the file the Zenodo record lists (md5)")
    img = nib.load(f)
    # the atlas's grid: 1 mm, its lowest layer of voxels centred on z = -50 mm (so the grid ends at z = -50.5 mm)
    if not (np.allclose(np.abs(np.diag(img.affine)[:3]), 1.0) and np.isclose(img.affine[2, 3], -50.0)):
        raise SystemExit(f"{f}: not on the atlas's grid ({img.affine.tolist()})")
    return np.asarray(img.dataobj) > 0, img.affine


def hcp_streamlines(abbr: str, sd: str, grid: tuple[int, ...]) -> tuple[list[np.ndarray], int, np.ndarray]:
    """One tract's streamlines of the HCP-YA atlas (a side), in the atlas's millimetres, how many the file holds, and
    the half voxel (mm) they were moved by.

    The file is a TrackVis one written by DSI Studio on the atlas's grid (the volumes' grid: checked). nibabel reads a
    TrackVis file's points as measured from the corner of the first voxel, as the format has it; these files give
    them from that voxel's centre, so every point is moved by half a voxel. Read that way, every point that lies in
    the atlas's grid lies in the atlas's own volume of the tract (tract_fit's inOwnVolumeShare, held to 0.99 by
    validate); as nibabel reads them, 68 to 94 % did (cornerReadShare). Streamlines of a single point or shorter than
    HCP_MIN_LENGTH_MM are left out."""
    f = HCP_DIR / "tracks" / f"{abbr}_{sd}.trk.gz"
    if not f.exists():
        raise SystemExit(f"{f} missing: the HCP-YA tractography atlas's streamline files (fetch_sources.py; https://brain.labsolver.org/hcp_trk_atlas.html)")
    raw = f.read_bytes()
    if hashlib.md5(raw).hexdigest() != HCP_TRK_MD5[f"{abbr}_{sd}"]:
        raise SystemExit(f"{f}: not the file downloaded on 18 November 2026 (md5)")
    trk = nib.streamlines.TrkFile.load(io.BytesIO(gzip.decompress(raw)), lazy_load=False)
    hd = trk.header
    if tuple(int(d) for d in hd["dimensions"]) != tuple(grid) or not np.allclose(hd["voxel_sizes"], 1.0) or bytes(hd["voxel_order"]).strip(b"\x00") != b"LPS":
        raise SystemExit(f"{f}: not on the atlas's grid ({hd['dimensions']}, {hd['voxel_sizes']}, {hd['voxel_order']})")
    half = np.asarray(hd["voxel_to_rasmm"], float)[:3, :3] @ np.full(3, 0.5)
    sls = [np.asarray(sl, float) + half for sl in trk.streamlines]
    keep = [sl for sl in sls if len(sl) >= 2 and np.linalg.norm(np.diff(sl, axis=0), axis=1).sum() >= HCP_MIN_LENGTH_MM]
    return keep, len(sls), half


def tract_fit(lines: list[np.ndarray], held: int, half: np.ndarray, mask: np.ndarray, aff: np.ndarray, surf: Surface, csf: Surface, t2) -> dict:
    """How one side of an HCP-YA tract sits on this section's template. The atlas is in ICBM-152 space as FSL's FA
    template has it, this section on ICBM 2009b, and the streamlines are drawn without a shift, so this is measured
    and shown on the tract's card rather than assumed. Of the drawn streamlines' points (one per HCP_STEP_MM, so a
    share of points is a share of length): how many lie at the fitted brainstem's levels (below its upper end; the
    tracts run on into the diencephalon), the share of those inside the fitted brainstem, the share more than 1 mm
    outside it and the farthest (mm), the share inside the model's fourth ventricle or aqueduct; and, against the T2
    template itself (independent of the fit), the share of all points that are fluid there. Also the streamlines'
    number (drawn, and held by the file), their extent along z and their lengths (the shortest, the median and the
    longest), and the check of the file's coordinates: the share of the points inside the atlas's grid that lie in
    the atlas's own volume of the tract, the same share had the points been read from the voxel's corner (without
    hcp_streamlines' half voxel), and the share below the grid."""
    from brainstem_fit import FLUID_LEVEL
    P = np.vstack(lines)
    length = np.array([np.linalg.norm(np.diff(sl, axis=0), axis=1).sum() for sl in lines])
    at = P[P[:, 2] <= surf.V[:, 2].max()]
    out = surf.outside_mm(at)
    def own(Q: np.ndarray) -> tuple[np.ndarray, float]:
        ijk = np.rint(nib.affines.apply_affine(np.linalg.inv(aff), Q)).astype(int)
        ok = np.all((ijk >= 0) & (ijk < mask.shape), axis=1)
        return ijk, float(mask[tuple(ijk[ok].T)].mean())
    ijk, in_own = own(P)
    return {
        "streamlines": int(len(lines)), "sourceStreamlines": int(held), "points": int(len(P)),
        "zMm": [round(float(P[:, 2].min()), 1), round(float(P[:, 2].max()), 1)],
        "lengthMm": [round(float(length.min()), 1), round(float(np.median(length)), 1), round(float(length.max()), 1)],
        "atBrainstemLevels": int(len(at)),
        "insideShare": round(float(surf.inside(at).mean()), 3),
        "outsideOver1mmShare": round(float((out > 1).mean()), 3), "outsideMaxMm": round(float(out.max()), 1),
        "inVentricleShare": round(float(csf.inside(at).mean()), 3),
        "fluidShare": round(float((t2(P) >= FLUID_LEVEL).mean()), 3),
        "inOwnVolumeShare": round(in_own, 3), "cornerReadShare": round(own(P - half)[1], 3),
        "belowGridShare": round(float((ijk[:, 2] < 0).mean()), 3),
    }


def line_node(side: str, lines: list[np.ndarray], held: int) -> dict:
    """Streamlines as one glTF node of line segments (as build.py's line_nodes writes the white-matter tracts)."""
    idx, off = [], 0
    for sl in lines:
        k = len(sl)
        idx.append(np.column_stack([np.arange(off, off + k - 1), np.arange(off + 1, off + k)]))
        off += k
    return {"name": side, "positions": np.vstack(lines), "normals": None, "indices": np.vstack(idx), "mode": LINES,
            "extras": {"streamlines": len(lines), "sourceStreamlines": held}}


def hcp_tracts(surf: Surface, csf_meshes: dict[str, tuple[np.ndarray, np.ndarray]]) -> tuple[list[dict], dict]:
    """The four tracts of the HCP-YA atlas: each side's streamlines (written to the build folder as line segments),
    their manifest entries, and how each side sits on this template (tract_fit)."""
    t2 = template_t2()
    csf = Surface(csf_meshes)
    items, report = [], {}
    for sid, name, abbr, stem, token in HCP_TRACTS:
        nodes, sides = [], {}
        for sd in ("L", "R"):
            mask, aff = hcp_volume(stem, sd)
            raw, held, half = hcp_streamlines(abbr, sd, mask.shape)
            lines = [resample(sl, HCP_STEP_MM) for sl in raw]
            if (np.vstack(lines)[:, 0].mean() < 0) != (sd == "L"):
                raise SystemExit(f"{abbr}_{sd}: on the other side of the midline")
            nodes.append(line_node(sd, lines, held))
            sides[sd] = tract_fit(lines, held, half, mask, aff, surf, csf, t2)
        report[sid] = sides
        n = {sd: sides[sd]["streamlines"] for sd in sides}
        items.append(structure(sid, name, "tract", token, nodes, HCP_DERIVATION.format(**n), dataset="hcp842", category="tract", abbr=abbr,
                               aliases=[abbr], role="tract", streamlines=n, sourceStreamlines={sd: sides[sd]["sourceStreamlines"] for sd in sides}))
    return items, report


def tracts_only() -> int:
    """Add (or redo) the HCP-YA tracts and the shared nuclei's lists of nerves in the manifest as built, leaving every
    other structure and file as it is: what a full build would write for them, without redoing the rest (a full build
    rewrites the arousal network's surfaces with small differences).

      pipeline/.venv/bin/python -I -W ignore pipeline/brainstem_build.py tracts
      node pipeline/compress.mjs brainstem bs_t_mlf.glb bs_t_ctt.glb bs_t_stt.glb bs_t_ll.glb
      pipeline/.venv/bin/python -I -W ignore pipeline/brainstem_build.py finalize
    """
    ex = json.loads(EXPORT.read_text())
    F = Fitted(ex)
    BUILD.mkdir(parents=True, exist_ok=True)

    def fitted(name: str) -> tuple[np.ndarray, np.ndarray]:
        m = ex["meshes"][name]
        return F(m["verts"]), np.array(m["tris"])
    parts = {}
    for base in SURFACE:
        for suf in (".l", ".r"):
            v, t = fitted(base + suf)
            parts[base + suf] = (v, orient(v, t))
    tract_items, tract_report = hcp_tracts(Surface(parts), {b: fitted(b) for b in CSF})
    p = GEN / "bs-manifest.json"
    m = json.loads(p.read_text())
    rest = [it for it in m["structures"] if it["dataset"] != "hcp842"]
    after = max(i for i, it in enumerate(rest) if it.get("category") == "aan") + 1     # where a full build puts them
    for it in rest:
        if it["id"] in SHARED_NUCLEI:
            it["cranialNerves"] = SHARED_NUCLEI[it["id"]]
    m["structures"] = rest[:after] + tract_items + rest[after:]
    m["fit"]["tracts"] = tract_report
    m["datasets"] = dataset_infos()
    p.write_text(json.dumps(m, indent=1, ensure_ascii=False))
    (BUILD / "tracts-report.json").write_text(json.dumps(tract_report, indent=1))
    print(f"brainstem tracts: {len(tract_items)} tracts of the HCP-YA atlas; {json.dumps(tract_report)}")
    return 0


def cst_only() -> int:
    """Take tract_check again (the white-matter section's corticospinal tract inside the fitted pons and medulla) after
    that section's tracts were rebuilt, leaving every structure and file as it is.

      pipeline/.venv/bin/python -I -W ignore pipeline/build.py wm
      pipeline/.venv/bin/python -I -W ignore pipeline/brainstem_build.py cst
      pipeline/.venv/bin/python -I -W ignore pipeline/brainstem_build.py finalize
    """
    ex = json.loads(EXPORT.read_text())
    F = Fitted(ex)
    parts = {}
    for base in SURFACE:
        for suf in (".l", ".r"):
            m = ex["meshes"][base + suf]
            v = F(m["verts"])
            parts[base + suf] = (v, orient(v, np.array(m["tris"])))
    found = tract_check(Surface(parts))
    if not found:
        raise SystemExit(f"{CST_GLB} missing: pipeline/build.py wm")
    p = GEN / "bs-manifest.json"
    m = json.loads(p.read_text())
    was = m["fit"].get("cstInsideShare")
    m["fit"].update(found)
    p.write_text(json.dumps(m, indent=1, ensure_ascii=False))
    print(f"brainstem: corticospinal tract inside the fitted pons and medulla {found['cstInsideShare']} (was {was})")
    return 0


# ---------------------------------------------------------------- main
def main() -> int:
    ex = json.loads(EXPORT.read_text())
    F = Fitted(ex)
    BUILD.mkdir(parents=True, exist_ok=True)
    for old in BUILD.glob("*.glb"):
        old.unlink()
    za_cit, za_urls = cite(ZA["cite"])
    items: list[dict] = []
    fitted_meshes: dict[str, np.ndarray] = {}

    def mesh_of(name: str) -> tuple[np.ndarray, np.ndarray]:
        m = ex["meshes"][name]
        v = F(m["verts"])
        fitted_meshes[name] = v
        return v, orient(v, np.array(m["tris"]))

    def add(sid: str, name: str, mtype: str, token: str, nodes: list[dict], derivation: str, *, dataset="zanatomy", **extra):
        items.append(structure(sid, name, mtype, token, nodes, derivation, dataset=dataset, **extra))

    fit_note = "Z-Anatomy mesh fitted into MNI space (brainstem_fit.py: similarity, then smooth deformation, to the T2 template's tissue-fluid boundary)."
    # the brainstem and its surface features
    parts = {}
    for base, sid in SURFACE.items():
        sides = {}
        for sd, suf in (("L", ".l"), ("R", ".r")):
            v, t = mesh_of(base + suf)
            sides[sd] = (v, t)
            parts[base + suf] = (v, t)
        add(sid, base, "soft", "bsSurface", [node(sd, v, t) for sd, (v, t) in sides.items()], fit_note,
            category="surface", fitted=True, layer="cortex")
    surf = Surface(parts)
    for base, sid in FEATURES.items():
        nodes = [node(sd, *mesh_of(base + suf)) for sd, suf in (("L", ".l"), ("R", ".r"))]
        add(sid, base, "soft", "bsFeature", nodes, fit_note, category="feature", fitted=True, layer="cortex")
    for base, sid in CSF.items():
        v, t = mesh_of(base)
        t, n = orient_tube(v, t) if base == "Aqueduct of midbrain" else (t, None)
        add(sid, base, "soft", "bsCsf", split_nodes(v, t, n),
            "Cut at the midline (x = 0) into left and right halves. " + fit_note, category="csf", fitted=True, layer="cortex")
    # cranial nerve nuclei
    for base, sid, cn in CN_NUCLEI:
        nodes = []
        for sd, suf in (("L", ".l"), ("R", ".r")):
            v, t = mesh_of(base + suf)
            if len(t) < 4:
                continue
            nodes.append(node(sd, v, t))
        shared = {"cranialNerves": SHARED_NUCLEI[sid]} if sid in SHARED_NUCLEI else {}
        add(sid, base, "nucleus", "bsNucleus", nodes,
            "The Z-Anatomy model's nucleus (a simple shape standing for its position and extent), fitted into MNI space with the "
            "brainstem: approximate.", category="cnNucleus", cranialNerve=cn, fitted=True, layer="nuclei", **shared)
    # ascending arousal network (AAN 2.0)
    img = nib.load(AAN_FILE)
    lab = np.asarray(img.dataobj).astype(int)
    aan_d = "Surface of the AAN 2.0 label (MNI152, 1 mm), resampled linearly to 0.5 mm and smoothed lightly (sigma 0.4 mm)."
    for code, (name, abbr) in AAN_MIDLINE.items():
        v, t = label_surface(lab == code, img.affine)
        add(f"bs_aan_{abbr.lower()}", name, "nucleus", "bsAan", split_nodes(v, t),
            "Cut at the midline (x = 0) into left and right halves. " + aan_d, dataset="aan", category="aan", abbr=abbr,
            aliases=[abbr], layer="nuclei")
    for k, (name, abbr) in AAN_PAIRED.items():
        nodes = [node(sd, *label_surface(lab == code, img.affine)) for sd, code in (("L", 7300 + k), ("R", 7400 + k))]
        add(f"bs_aan_{abbr.lower()}", name, "nucleus", "bsAan", nodes, aan_d, dataset="aan", category="aan", abbr=abbr,
            aliases=[abbr], layer="nuclei")
    # four tracts of the HCP-YA tractography atlas
    tract_items, tract_report = hcp_tracts(surf, {b: (fitted_meshes[b], np.array(ex["meshes"][b]["tris"])) for b in CSF})
    items += tract_items

    # nerves and arteries: tubes around the fitted centre lines, kept near the brainstem
    def fitted_runs(names: list[str], reach: float) -> dict[str, list[np.ndarray]]:
        per: dict[str, list[np.ndarray]] = {"L": [], "R": []}
        for n in names:
            ln = ex["lines"].get(n)
            if ln is None:
                continue
            for r in ln["runs"]:
                r = np.array(r, float)
                p = F(r[:, :3])
                d, _ = surf.nearest(p)
                keep = surf.inside(p) | (d <= reach)
                rad = r[:, 3] * F.s
                # contiguous pieces within reach
                start = None
                for i in range(len(p) + 1):
                    if i < len(p) and keep[i]:
                        start = i if start is None else start
                    elif start is not None:
                        if i - start >= 2:
                            piece = np.c_[p[start:i], rad[start:i]]
                            side = "L" if piece[:, 0].mean() < 0 else "R"
                            per[side].append(piece)
                        start = None
        return per

    def tube_nodes(per: dict[str, list[np.ndarray]]) -> list[dict]:
        out = []
        for sd, runs in per.items():
            vs, ns, ts, off = [], [], [], 0
            for r in runs:
                v_, n_, t_ = tube(r)
                if not len(t_):
                    continue
                vs.append(v_); ns.append(n_); ts.append(t_ + off)
                off += len(v_)
            if ts:
                out.append({"name": sd, "positions": np.vstack(vs), "normals": np.vstack(ns), "indices": np.vstack(ts), "mode": TRIANGLES})
        return out

    nerve_exits: dict[str, dict[str, list[np.ndarray]]] = {}
    for base, cn in NERVES.items():
        per = fitted_runs([base + ".l", base + ".r"], NERVE_REACH_MM)
        nodes = tube_nodes(per)
        if base == "Trigeminal nerve (V)":   # the roots are meshes in the model
            for sd, suf in (("L", ".l"), ("R", ".r")):
                rv, rt = [], []
                off = 0
                for root in TRIGEMINAL_ROOTS:
                    v, t = mesh_of(root + suf)
                    rv.append(v); rt.append(t + off); off += len(v)
                v, t = np.vstack(rv), np.vstack(rt)
                nd = next(n for n in nodes if n["name"] == sd)
                k = len(nd["positions"])
                nd["positions"] = np.vstack([nd["positions"], v])
                nd["normals"] = np.vstack([nd["normals"], tri_normals(v, t)])
                nd["indices"] = np.vstack([nd["indices"], t + k])
        # rootlets (hypoglossal) are short before they join: a shorter stretch outside counts
        # rootlets (hypoglossal) are short before they join, and the trochlear nerve hugs the midbrain: a shorter
        # stretch outside counts for them
        nerve_exits[base] = {sd: exits(per[sd], surf, 2.0 if cn == 12 else 8.0) for sd in ("L", "R")}
        if cn == 4:
            # the model's trochlear nerve hugs the midbrain (after the fit it runs just under the surface), so it has no
            # crossing: it leaves the back of the brainstem, so take where it runs furthest back
            nerve_exits[base] = {sd: [np.vstack([r[:, :3] for r in per[sd]])[np.argmin(np.vstack([r[:, :3] for r in per[sd]])[:, 1])]]
                                 for sd in ("L", "R")}
        add("bs_cn_" + re.sub(r"[^a-z]+", "_", base.lower().split(" (")[0]).strip("_"), base, "tube", "sbNerve", nodes,
            "Tube around the Z-Anatomy nerve's centre line (radius as the model draws it, at least "
            f"{TUBE_MIN_RADIUS_MM} mm), fitted into MNI space with the brainstem; kept to {NERVE_REACH_MM:.0f} mm outside the "
            "brainstem. Its course inside the brainstem is the model's: approximate.", category="nerve", cranialNerve=cn, fitted=True)
    for base in ARTERIES:
        names = [base] if base == "Basilar artery" else [base + ".l", base + ".r"]
        per = fitted_runs(names, ARTERY_REACH_MM)
        if base == "Basilar artery":   # one midline vessel: drawn with the right side
            per = {"R": per["L"] + per["R"], "L": []}
        add("bs_a_" + re.sub(r"[^a-z]+", "_", base.lower()).strip("_"), base, "tube", "sbArtery", tube_nodes(per),
            "Tube around the Z-Anatomy artery's centre line (radius as the model draws it), fitted into MNI space with the brainstem "
            f"and kept to its course within {ARTERY_REACH_MM:.0f} mm of the brainstem: approximate, and arteries vary between people.",
            category="artery", fitted=True)

    zones, measured = safe_entry_zones(ex, F, surf, fitted_meshes, nerve_exits, add)
    report = dict(F.report)
    report.update(tract_check(surf))
    report.update(wall_check(surf, (fitted_meshes["Fourth ventricle"], orient(fitted_meshes["Fourth ventricle"], np.array(ex["meshes"]["Fourth ventricle"]["tris"])))))
    report["tracts"] = tract_report

    # definitions (Z-Anatomy's Wikipedia texts) for the structures shown
    names = {it["name"] for it in items}
    defs = {}
    for n, raw in ex["texts"].items():
        d = definition(raw)
        if d and n in names:
            defs[n] = d
    za = DATASETS["zanatomy"]
    manifest = {
        "space": "MNI ICBM 2009b nonlinear asymmetric, RAS millimetres",
        "generatedBy": "pipeline/brainstem_export.py (Blender) + pipeline/brainstem_fit.py + pipeline/brainstem_build.py + pipeline/compress.mjs",
        "structures": items,
        "fit": report,
        "datasets": dataset_infos(),
        "dataset": {"name": za["name"], "licence": za["licence"], "url": za["url"], "note": za["note"], "attribution": za["attribution"],
                    "citation": za_cit, "citationUrls": za_urls},
    }
    GEN.mkdir(parents=True, exist_ok=True)
    (GEN / "bs-manifest.json").write_text(json.dumps(manifest, indent=1, ensure_ascii=False))
    (GEN / "bs-zones.json").write_text(json.dumps({"zones": zones, "measured": measured}, indent=1, ensure_ascii=False))
    (GEN / "bs-definitions.json").write_text(json.dumps(defs, indent=1, ensure_ascii=False))
    (BUILD / "report.json").write_text(json.dumps({"fit": report, "measured": measured,
                                                    "nerveExits": {k: {s: [p.round(1).tolist() for p in v] for s, v in d.items()} for k, d in nerve_exits.items()}}, indent=1))
    print(f"brainstem: {len(items)} structures, {len(zones)} safe entry zones, {len(defs)} definitions; fit {report}")
    return 0


# ---------------------------------------------------------------- an independent check of the fit
CST_GLB = ROOT / "data" / "build" / "wm" / "wm_cst.glb"   # the white-matter section's corticospinal tract (build.py)
CST_LEVELS = (-55.0, -30.0)                               # MNI z: from the pyramids up through the basis pontis


def tract_check(surf: Surface) -> dict:
    """Share of the HCP-1065 corticospinal tract's points (MNI-native, built independently) that lie inside the fitted
    pons and medulla between CST_LEVELS. Above them the tract runs in the crus, a separate mesh in the model."""
    import struct
    if not CST_GLB.exists():
        return {}
    b = CST_GLB.read_bytes()
    jl = struct.unpack("<I", b[12:16])[0]
    js = json.loads(b[20:20 + jl])
    blob = b[20 + jl + 8:]
    pts = []
    for nd in js["nodes"]:
        acc = js["accessors"][js["meshes"][nd["mesh"]]["primitives"][0]["attributes"]["POSITION"]]
        bv = js["bufferViews"][acc["bufferView"]]
        pts.append(np.frombuffer(blob, np.float32, acc["count"] * 3, bv.get("byteOffset", 0) + acc.get("byteOffset", 0)).reshape(-1, 3))
    P = np.vstack(pts)
    P = P[(P[:, 2] >= CST_LEVELS[0]) & (P[:, 2] < CST_LEVELS[1])]
    return {"cstInsideShare": round(float(surf.inside(P).mean()), 3), "cstLevels": list(CST_LEVELS)}


# ---------------------------------------------------------------- which wall the fitted surface lies on
WALL_REACH_MM, WALL_STEP_MM = 5.0, 0.25
# MNI z of four cross-sections: the midbrain through the cerebral peduncles, the pons twice, the open medulla
WIDTH_LEVELS = (("midbrain", -14.0), ("pons", -30.0), ("pons", -38.0), ("medulla", -55.0))


def template_t2():
    """The ICBM 2009b T2 template around the brainstem, smoothed a little (0.5 mm): a function of MNI points (mm)."""
    from brainstem_fit import T2
    img = nib.load(T2)
    aff = img.affine
    vox = float(np.sqrt((aff[:3, :3] ** 2).sum(0)).mean())
    lo = np.floor(nib.affines.apply_affine(np.linalg.inv(aff), np.array([-45.0, -80.0, -72.0]))).astype(int)
    hi = np.ceil(nib.affines.apply_affine(np.linalg.inv(aff), np.array([45.0, 20.0, 15.0]))).astype(int)
    lo, hi = np.minimum(lo, hi), np.maximum(lo, hi)
    sm = ndimage.gaussian_filter(np.asarray(img.dataobj[lo[0]:hi[0], lo[1]:hi[1], lo[2]:hi[2]], np.float32), 0.5 / vox)
    inv = np.linalg.inv(aff)

    def t2(p: np.ndarray) -> np.ndarray:
        return ndimage.map_coordinates(sm, (nib.affines.apply_affine(inv, np.atleast_2d(p)) - lo).T, order=1, mode="nearest")
    return t2


def wall_check(surf: Surface, ventricle: tuple[np.ndarray, np.ndarray]) -> dict:
    """A two-sided check of the fit against the T2 template itself, not against the fit's own target. Along the
    outward normal of every vertex of the fitted outer surface: the nearest place where the template goes from tissue
    to fluid (the brainstem's own surface) and the nearest where it goes from fluid to tissue (the far wall of the
    cistern: the clivus, the cerebellum, the temporal lobe). A surface fitted to the wrong wall lies on the second
    and millimetres outside the first, which a one-sided check (the tract inside the model) cannot see. Also: the
    share of the fitted solid that is fluid on the template, the model's width against the template tissue's at
    four levels, how much of the model's fourth ventricle is fluid on the template, and how much of any arousal
    network nucleus (AAN 2.0: MNI-native labels, placed independently of the fit) falls inside that ventricle."""
    from brainstem_fit import FLUID_LEVEL
    t2 = template_t2()

    keep = surf.outer & (surf.V[:, 2] > -70)          # not the faces where the halves meet; inside the template's volume
    V, N = surf.V[keep], surf.N[keep]
    ts = np.arange(-WALL_REACH_MM, WALL_REACH_MM + 1e-6, WALL_STEP_MM)
    prof = np.stack([t2(V + t * N) for t in ts], 1)

    def nearest(cross: np.ndarray) -> np.ndarray:
        step = prof[:, 1:] - prof[:, :-1]
        tc = np.where(cross, ts[:-1] + (FLUID_LEVEL - prof[:, :-1]) / np.where(np.abs(step) < 1e-6, 1e-6, step) * WALL_STEP_MM, np.nan)
        j = np.argmin(np.where(np.isnan(tc), 1e9, np.abs(tc)), axis=1)
        return tc[np.arange(len(V)), j]
    own = nearest((prof[:, :-1] < FLUID_LEVEL) & (prof[:, 1:] >= FLUID_LEVEL))
    far = nearest((prof[:, :-1] >= FLUID_LEVEL) & (prof[:, 1:] < FLUID_LEVEL))
    has_own = ~np.isnan(own)
    mask, mlo, mstep = surf._solid if surf._solid is not None else surf._solid_mask()
    surf._solid = (mask, mlo, mstep)
    cells = np.argwhere(mask)
    solid = mlo + mstep * cells
    solid = solid[solid[:, 2] > -70]
    widths = []
    for part, z in WIDTH_LEVELS:
        # the fitted surface's section at this level: where its triangles' edges cross the plane
        tv = surf.V[surf.T]
        pts = []
        for a, b in ((0, 1), (1, 2), (2, 0)):
            pa, pb = tv[:, a], tv[:, b]
            cr = (pa[:, 2] - z) * (pb[:, 2] - z) < 0
            w = (z - pa[cr, 2]) / (pb[cr, 2] - pa[cr, 2])
            pts.append(pa[cr] + w[:, None] * (pb[cr] - pa[cr]))
        P = np.vstack(pts)
        cy = (P[:, 1].min() + P[:, 1].max()) / 2
        near = P[np.abs(P[:, 1] - cy) < 0.6]
        model = float(near[:, 0].max() - near[:, 0].min())
        # the template's tissue across the same line: from the midline out to the first fluid on each side
        xs = np.arange(-40.0, 40.01, 0.25)
        tis = t2(np.stack([xs, np.full_like(xs, cy), np.full_like(xs, z)], 1)) < FLUID_LEVEL
        c = len(xs) // 2
        a = b = c
        while a > 0 and tis[a - 1]:
            a -= 1
        while b < len(xs) - 1 and tis[b + 1]:
            b += 1
        widths.append({"part": part, "z": z, "modelMm": round(model, 1), "templateMm": round(float(xs[b] - xs[a]), 1) if tis[c] else None})
    vent = Surface({"Fourth ventricle": ventricle})
    vmask, vlo, vstep = vent._solid_mask()
    vent._solid = (vmask, vlo, vstep)
    vcells = vlo + vstep * np.argwhere(vmask)
    aimg = nib.load(AAN_FILE)
    lab = np.asarray(aimg.dataobj).astype(int)
    in_vent = {}
    for abbr, codes in [(a, [c]) for c, (_, a) in AAN_MIDLINE.items()] + [(a, [7300 + k, 7400 + k]) for k, (_, a) in AAN_PAIRED.items()]:
        P = nib.affines.apply_affine(aimg.affine, np.argwhere(np.isin(lab, codes)))
        in_vent[abbr] = round(float(vent.inside(P).mean()), 3) if len(P) else 0.0
    worst = max(in_vent, key=lambda k: in_vent[k])
    return {
        "ventricleFluidShare": round(float((t2(vcells) >= FLUID_LEVEL).mean()), 3),
        "aanInVentricleMaxShare": in_vent[worst], "aanInVentricleWorst": worst,
        "ownWallWithin1mmShare": round(float((np.abs(own[has_own]) <= 1).sum() / len(V)), 3),
        "farWallWithin1mmShare": round(float((np.abs(far[~np.isnan(far)]) <= 1).sum() / len(V)), 3),
        "ownWallSignedMedianMm": round(float(np.median(own[has_own])), 2),
        "surfaceInFluidShare": round(float((t2(V) >= FLUID_LEVEL).mean()), 3),
        "solidFluidShare": round(float((t2(solid) >= FLUID_LEVEL).mean()), 3),
        "widths": widths,
    }


# ---------------------------------------------------------------- safe entry zones
def safe_entry_zones(ex, F, surf: Surface, fm: dict[str, np.ndarray], nerve_exits, add) -> tuple[list[dict], dict]:
    """Each zone drawn by rule on the fitted surface, per side (sg = -1 left, +1 right). Returns the zone list for
    bs-zones.json and the model's measurements used."""
    zones: list[dict] = []
    measured: dict = {}
    up, ant = np.array([0, 0, 1.0]), np.array([0, 1.0, 0])
    owner = surf.owner
    pons = np.isin(owner, ["Pons.l", "Pons.r"])
    medulla = np.isin(owner, ["Medulla oblongata.l", "Medulla oblongata.r"])
    midbrain = np.isin(owner, ["Midbrain.l", "Midbrain.r"])
    V, N = surf.V, surf.N
    lm = {x["name"]: F([x["ras"]])[0] for x in ex["landmarks"]}   # right side in the model
    sides = {"L": -1, "R": 1}

    def mirror_side(p: np.ndarray, sg: int) -> np.ndarray:
        q = p.copy()
        q[0] = sg * abs(q[0])
        return q

    def pick_exit(base: str, sd: str, pred) -> np.ndarray:
        cand = [p for p in nerve_exits[base][sd] if pred(p)]
        if not cand:
            raise SystemExit(f"{base} {sd}: no exit point")
        return np.array(cand[0])

    def zone(zid, name, region, per_side: dict, how: str, kind: str):
        nodes, anchors = [], {}
        for sd, geom in per_side.items():
            v, t, n = geom["patch"]
            nodes.append(node(sd, v, t, n))
            anchors[sd] = np.asarray(geom["anchor"]).round(2).tolist()
        add(zid, name, "target", "bsSez", nodes, how, category="sez", schematic=True, layer="targets", bsRegion=region)
        zones.append({"id": zid, "name": name, "region": region, "kind": kind, "construction": how, "anchor": anchors})

    def line_zone(pts, d, sel, width=SEZ_WIDTH_MM):
        P, Nn = surf.line(pts, d, sel)
        return {"patch": Surface.ribbon(P, Nn, width), "anchor": P[len(P) // 2], "length": float(np.linalg.norm(np.diff(P, axis=0), axis=1).sum())}

    # ---- midbrain
    per = {}
    for sd, sg in sides.items():
        e3 = pick_exit("Oculomotor nerve (III)", sd, lambda p: p[1] > -22)
        lat = np.array([sg, 0, 0.0])
        p = e3 + 2.0 * lat
        per[sd] = line_zone([p + 3 * up, p - 3 * up], ant + 0.6 * lat, midbrain)
        measured[f"oculomotorExit{sd}"] = e3.round(1).tolist()
    zone("sez_perioculomotor", "Perioculomotor zone (anterior mesencephalic zone)", "midbrain", per,
         "A vertical line 6 mm long on the front of the midbrain, 2 mm lateral to where the model's oculomotor nerve leaves it "
         "(an incision parallel and lateral to the nerve, medial to the corticospinal fibres of the crus).", "line")

    per = {}
    crus = {"L": fm["Base of peduncle.l"], "R": fm["Base of peduncle.r"]}
    for sd, sg in sides.items():
        mg = fm[f"Medial geniculate body.{sd.lower()}"]
        top = mg[:, 2].min()
        side_pons = V[pons & (np.sign(V[:, 0]) == sg)]
        bottom = side_pons[np.abs(side_pons[:, 0]) > np.percentile(np.abs(side_pons[:, 0]), 80), 2].max()
        cr = crus[sd]
        pts = []
        for z in np.arange(top, bottom, -1.0):
            b = cr[np.abs(cr[:, 2] - z) < 0.75]
            if len(b) < 5:
                continue
            outer = b[np.abs(b[:, 0]) >= np.percentile(np.abs(b[:, 0]), 70)]
            pts.append(outer[np.argmin(outer[:, 1])])
        per[sd] = line_zone(pts, np.array([sg, -0.3, 0.0]), midbrain, 1.0)
        measured[f"lmsLength{sd}"] = round(per[sd]["length"], 1)
    zone("sez_lateral_mesencephalic_sulcus", "Lateral mesencephalic sulcus", "midbrain", per,
         "The groove on the side of the midbrain between the crus (in front) and the tegmentum (behind): the posterior edge of "
         "the model's crus on its lateral surface, from below the medial geniculate body down to the pons.", "line")

    for zid, name, col, how in (
        ("sez_supracollicular", "Supracollicular zone", "Superior colliculus",
         "A transverse line just above the upper edge of the model's superior colliculus, from the midline 5 mm to each side (the "
         "length is illustrative; the incision's depth is limited by the aqueduct)."),
        ("sez_infracollicular", "Infracollicular zone", "Inferior colliculus",
         "A transverse line midway between the lower edge of the model's inferior colliculus and its trochlear nerve where that "
         "runs furthest back (leaving the back of the midbrain), from the midline 5 mm to each side (the length is illustrative)."),
    ):
        per = {}
        for sd, sg in sides.items():
            c = fm[f"{col}.{sd.lower()}"]
            near = c[np.abs(c[:, 0]) < 6]
            if col == "Superior colliculus":
                z = near[:, 2].max() + 0.75
            else:
                # where the trochlear nerve runs furthest back (it leaves the back of the midbrain)
                e4 = nerve_exits["Trochlear nerve (IV)"][sd][0]
                z = (near[:, 2].min() + e4[2]) / 2
                measured[f"trochlearExit{sd}"] = np.round(e4, 1).tolist()
            y = near[:, 1].min()
            per[sd] = line_zone([np.array([sg * 0.6, y, z]), np.array([sg * 5.0, y, z])], np.array([0, -1.0, 0.25]), midbrain, 1.0)
        zone(zid, name, "midbrain", per, how, "line")

    # ---- ventral pons
    per = {}
    for sd, sg in sides.items():
        e3 = pick_exit("Oculomotor nerve (III)", sd, lambda p: p[1] > -22)
        x = e3[0]
        ventral = pons & (np.abs(V[:, 0] - x) < 0.75) & (N[:, 1] > 0.3)
        z_top = V[ventral, 2].max()
        y = V[ventral][np.argmax(V[ventral, 2]), 1]
        per[sd] = line_zone([np.array([x, y, z_top - 0.5]), np.array([x, y, z_top - 4.5])], ant, pons, 1.0)
        measured[f"pontomesencephalicSulcusZ{sd}"] = round(float(z_top), 1)
    zone("sez_supratrigeminal", "Supratrigeminal zone (Cavalheiro 2015)", "pons", per,
         "A vertical line 4 mm long on the front of the pons, starting just below the pontomesencephalic sulcus (the top of the "
         "model's pons there), in the sagittal plane of the oculomotor nerve's exit.", "line")

    per = {}
    for sd, sg in sides.items():
        e5 = pick_exit("Trigeminal nerve (V)", sd, lambda p: p[1] > -25)
        e7 = pick_exit("Facial nerve (VII)", sd, lambda p: abs(p[0]) > 9) if nerve_exits["Facial nerve (VII)"][sd] else None
        z_lo = (e5[2] + e7[2]) / 2 if e7 is not None else e5[2] - 6
        p = e5 + np.array([-sg * 3.5, 0, 0])
        per[sd] = line_zone([p, np.array([p[0], p[1], z_lo])], np.array([sg * 0.6, 1.0, 0]), pons, 1.2)
        measured[f"trigeminalEntry{sd}"] = e5.round(1).tolist()
        if e7 is not None:
            measured[f"facialExit{sd}"] = e7.round(1).tolist()
    zone("sez_peritrigeminal", "Peritrigeminal zone", "pons", per,
         "A vertical line on the anterolateral pons, 3.5 mm medial to where the model's trigeminal nerve enters it, from that "
         "level halfway down towards the facial nerve's exit (between the nerve and the corticospinal fibres).", "line")

    # ---- floor of the fourth ventricle
    v4 = fm["Fourth ventricle"]
    mid = v4[np.abs(v4[:, 0]) < 2]
    z_aq, z_obex = mid[:, 2].max(), mid[:, 2].min()
    floor_len = z_aq - z_obex
    measured["floorLengthMm"] = round(float(floor_len), 1)
    # the facial colliculus by the published proportions of the floor (the model's abducens nucleus is a rough shape)
    fc_top, fc_bot = z_aq - FC_ROSTRAL * floor_len, z_obex + FC_CAUDAL * floor_len
    measured["facialColliculus"] = {"rostralMarginZ": round(float(fc_top), 1), "caudalMarginZ": round(float(fc_bot), 1)}
    floor_sel = pons | medulla
    back = np.array([0, -1.0, 0.15])
    floor_y = float(mid[:, 1].mean())
    zones_floor = {"sup": {}, "inf": {}, "med": {}}
    for sd, sg in sides.items():
        ab = fm[f"Nucleus of abducens nerve.{sd.lower()}"].mean(0)
        xii_top = fm[f"Nucleus of hypoglossal nerve.{sd.lower()}"][:, 2].max()
        sl = SULCUS_LIMITANS_MM[sd]
        measured[f"abducensNucleusZ{sd}"] = round(float(ab[2]), 1)
        measured[f"hypoglossalTrigoneTopZ{sd}"] = round(float(xii_top), 1)
        us = np.arange(0.0, sl + 0.26, 0.25)
        origin = np.array([0, floor_y, 0.0])
        du, dv = np.array([sg * 1.0, 0, 0]), np.array([0, 0, 1.0])

        def tri(z_base, z_apex):
            def inside(u, v, q):
                h = (v - z_base) / (z_apex - z_base)
                return 0 <= h <= 1 and FLOOR_MLF_MM <= u <= FLOOR_MLF_MM + (sl - FLOOR_MLF_MM) * (1 - h) + 1e-9 and q[1] > floor_y - 12
            return inside

        for key, z0, z1 in (("sup", fc_top, z_aq - 1.0), ("inf", fc_bot, xii_top)):
            vs = np.arange(min(z0, z1), max(z0, z1) + 0.26, 0.25)
            patch = surf.area(origin, du, dv, us, vs, tri(z0, z1), back, floor_sel)
            anchor = np.array([sg * (FLOOR_MLF_MM + sl) / 3, floor_y, z0 + (z1 - z0) / 3])
            zones_floor[key][sd] = {"patch": patch, "anchor": surf.cast(anchor, back, floor_sel)[0]}
        vs = np.arange(fc_top, z_aq - 1.0 + 0.26, 0.25)
        patch = surf.area(origin, du, dv, np.arange(0.0, 0.81, 0.2), vs, lambda u, v, q: q[1] > floor_y - 12, back, floor_sel)
        zones_floor["med"][sd] = {"patch": patch, "anchor": surf.cast(np.array([sg * 0.4, floor_y, (fc_top + z_aq) / 2]), back, floor_sel)[0]}
    zone("sez_suprafacial", "Suprafacial triangle", "floor", zones_floor["sup"],
         "On the floor of the fourth ventricle: a triangle with its base on the rostral margin of the facial colliculus, from "
         f"{FLOOR_MLF_MM} mm off the median sulcus (the medial longitudinal fasciculus) to the sulcus limitans, and its apex at the "
         "top of the floor. The facial colliculus is placed by the proportions measured in 40 cadavers (Erginoglu 2026): its "
         "rostral margin 43.6 % of the floor's length below the aqueduct, its caudal margin 43.3 % above the obex; the sulcus "
         "limitans 3.1 mm (right) and 3.0 mm (left) from the median sulcus (the same study).", "area")
    zone("sez_infrafacial", "Infrafacial triangle", "floor", zones_floor["inf"],
         "On the floor of the fourth ventricle: a triangle with its base on the caudal margin of the facial colliculus (median "
         "sulcus to sulcus limitans, placed as for the suprafacial triangle) and its apex next to the median sulcus at the top "
         "of the model's hypoglossal nucleus (the hypoglossal trigone).", "area")
    zone("sez_median_sulcus", "Median sulcus above the facial colliculus", "floor", zones_floor["med"],
         "On the floor of the fourth ventricle: a strip 0.8 mm to each side of the median sulcus, from the rostral margin of the "
         "facial colliculus to the top of the floor.", "area")

    # ---- medulla
    per = {}
    bottom = V[medulla, 2].min()
    for sd, sg in sides.items():
        xii = [p for p in nerve_exits["Hypoglossal nerve (XII)"][sd] if abs(p[0]) > 6]
        if len(xii) < 2:
            raise SystemExit(f"hypoglossal rootlets {sd}: {len(xii)} exits")
        xii = np.array(sorted(xii, key=lambda p: -p[2]))
        a = xii[-1]
        dvec = xii[-1] - xii[0]
        dvec /= np.linalg.norm(dvec)
        steps = max(1.0, (a[2] - bottom - 1.0) / max(-dvec[2], 0.3))
        per[sd] = line_zone([a, a + steps * dvec], np.array([sg * 0.7, 1.0, 0]), medulla, 1.0)
        measured[f"hypoglossalRootlets{sd}"] = len(xii)
    zone("sez_anterolateral_sulcus", "Anterolateral (preolivary) sulcus", "medulla", per,
         "The groove in front of the olive along which the model's hypoglossal rootlets leave the medulla, drawn from the lowest "
         "rootlet down to the lower end of the model's medulla (where the first cervical rootlets begin).", "line")

    per = {}
    for sd, sg in sides.items():
        ol = fm[f"Olive.{sd.lower()}"]
        otree = cKDTree(ol)
        c = ol.mean(0)
        lat = np.array([sg * 1.0, 0, 0])
        us = np.arange(-8, 8.01, 0.3)
        vs = np.arange(-9, 9.01, 0.3)
        patch = surf.area(np.array([0, c[1], c[2]]), np.array([0, 1.0, 0]), np.array([0, 0, 1.0]), us, vs,
                          lambda u, v_, q: otree.query(q)[0] < 1.5, lat, medulla)
        per[sd] = {"patch": patch, "anchor": surf.cast(c, lat, medulla)[0]}
    zone("sez_olivary", "Olivary zone", "medulla", per,
         "The surface of the medulla over the model's olive, between the preolivary sulcus in front and the postolivary sulcus behind.", "area")

    per = {}
    for sd, sg in sides.items():
        ol = fm[f"Olive.{sd.lower()}"]
        pts = []
        for z in np.arange(ol[:, 2].max() - 0.5, ol[:, 2].min() + 0.5, -1.0):
            b = ol[np.abs(ol[:, 2] - z) < 0.6]
            if len(b) > 3:
                pts.append(b[np.argmin(b[:, 1])])
        per[sd] = line_zone(pts, np.array([sg * 1.0, -0.5, 0]), medulla, 1.0)
    zone("sez_postolivary_sulcus", "Postolivary (retro-olivary) sulcus", "medulla", per,
         "The groove behind the model's olive: its posterior edge on the surface of the medulla, from its upper to its lower end.", "line")

    dorsal = medulla & (N[:, 1] < -0.2)
    z_top = z_obex - 0.5
    gr, cu, tg = lm["Gracile tubercle"], lm["Cuneate tubercle"], lm["Trigeminal tubercle"]
    for zid, name, xs, how in (
        ("sez_posterior_median_sulcus", "Posterior median sulcus (below the obex)", 0.4,
         "The midline groove on the back of the medulla, from just below the obex (the lower tip of the model's fourth ventricle) "
         "to the lower end of its medulla."),
        ("sez_posterior_intermediate_sulcus", "Posterior intermediate sulcus", (abs(gr[0]) + abs(cu[0])) / 2,
         "The groove between the gracile and cuneate fasciculi on the back of the medulla, midway between the model's gracile and "
         "cuneate tubercles, from below the obex to the lower end of its medulla."),
        ("sez_posterolateral_sulcus", "Posterolateral sulcus", (abs(cu[0]) + abs(tg[0])) / 2,
         "The groove between the cuneate fasciculus and the spinal trigeminal tract, midway between the model's cuneate and "
         "trigeminal tubercles, from below the obex to the lower end of its medulla."),
    ):
        per = {}
        for sd, sg in sides.items():
            pts = []
            for z in np.arange(z_top, bottom + 1.0, -1.0):
                b = V[dorsal & (np.abs(V[:, 2] - z) < 0.6) & (np.abs(sg * V[:, 0] - xs) < 1.0) & (sg * V[:, 0] > 0)]
                if len(b):
                    pts.append(np.array([sg * xs, b[:, 1].min(), z]))
            per[sd] = line_zone(pts, np.array([0, -1.0, 0]) + (0 if xs < 1 else 0.5) * np.array([sg, 0, 0]), medulla,
                                0.4 if xs < 1 else 1.0)
        zone(zid, name, "medulla", per, how, "line")
    measured["obexZ"] = round(float(z_obex), 1)
    measured["aqueductOpeningZ"] = round(float(z_aq), 1)
    return zones, measured


# ---------------------------------------------------------------- validation and finalize
def validate() -> int:
    m = json.loads((GEN / "bs-manifest.json").read_text())
    z = json.loads((GEN / "bs-zones.json").read_text())
    fails, n = [], 0

    def check(ok: bool, msg: str) -> None:
        nonlocal n
        n += 1
        if not ok:
            fails.append(msg)
    for it in m["structures"]:
        c = it["centroid"]
        if c["L"] != c["R"] and abs(c["L"][0] - c["R"][0]) > 1:
            check(c["L"][0] < c["R"][0], f"{it['id']}: left centroid x {c['L'][0]} not left of right {c['R'][0]}")
        check((REPO / "public" / it["file"]).exists(), f"{it['id']}: {it['file']} missing")
        # everything lies in the brainstem's neighbourhood of MNI space
        check(-80 < c["R"][2] < 15 and -75 < c["R"][1] < 15, f"{it['id']}: centroid {c['R']} outside the brainstem region")
    fit = m["fit"]
    check(fit["warpedMedianMm"] < 1.0, f"fit median {fit['warpedMedianMm']} mm")
    # not too small: the corticospinal tract (built separately) runs inside the fitted pons and medulla
    check(fit.get("cstInsideShare", 0) > 0.9, f"corticospinal tract inside the fitted pons and medulla: {fit.get('cstInsideShare')}")
    # not too large, and on the right wall (wall_check, against the T2 template itself): a model fitted to the far wall
    # of the cisterns passed the two checks above and failed every one of these
    check(fit.get("ownWallWithin1mmShare", 0) >= 0.4, f"surface within 1 mm of the brainstem's own tissue-fluid boundary: {fit.get('ownWallWithin1mmShare')}")
    check(fit.get("farWallWithin1mmShare", 1) <= 0.15, f"surface within 1 mm of the cistern's far wall: {fit.get('farWallWithin1mmShare')}")
    check(abs(fit.get("ownWallSignedMedianMm", 9)) <= 1.0, f"surface to its own boundary, signed median: {fit.get('ownWallSignedMedianMm')} mm")
    check(fit.get("solidFluidShare", 1) <= 0.12, f"share of the fitted solid that is fluid on the template: {fit.get('solidFluidShare')}")
    check(fit.get("ventricleFluidShare", 0) >= 0.7, f"share of the model's fourth ventricle that is fluid on the template: {fit.get('ventricleFluidShare')}")
    check(fit.get("aanInVentricleMaxShare", 1) <= 0.15,
          f"arousal nucleus inside the model's fourth ventricle: {fit.get('aanInVentricleWorst')} {fit.get('aanInVentricleMaxShare')}")
    for w in fit.get("widths", []):
        if w["templateMm"]:
            check(0.8 <= w["modelMm"] / w["templateMm"] <= 1.25, f"{w['part']} at z {w['z']}: model {w['modelMm']} mm wide, template tissue {w['templateMm']} mm")
    check(len(fit.get("widths", [])) == len(WIDTH_LEVELS), "the widths at four levels")
    check(0.85 < fit["scale"] < 1.2, f"fit scale {fit['scale']}")
    check(len(z["zones"]) >= 14, f"{len(z['zones'])} zones")
    for zz in z["zones"]:
        check(set(zz["anchor"]) == {"L", "R"}, f"{zz['id']}: both sides")
    ids = {it["id"] for it in m["structures"]}
    check(all(x["id"] in ids for x in z["zones"]), "every zone has a structure")
    # the HCP-YA tracts: each drawn on both sides, measured, and where the atlas has it (these bounds are what the
    # build measured in November 2026, with room: a change of space or of file would break them)
    by_id = {it["id"]: it for it in m["structures"]}
    for sid, name, _, _, _ in HCP_TRACTS:
        check(sid in by_id and by_id[sid]["dataset"] == "hcp842", f"{sid}: the tract of the HCP-YA atlas")
        for sd in ("L", "R"):
            f = fit.get("tracts", {}).get(sid, {}).get(sd)
            check(f is not None, f"{sid} {sd}: not measured")
            if f is None:
                continue
            check(by_id[sid]["type"] == "tract" and by_id[sid]["streamlines"][sd] == f["streamlines"] >= 5, f"{sid} {sd}: {f['streamlines']} streamlines")
            check(-53.5 <= f["zMm"][0] <= -50.0 and -10 <= f["zMm"][1] <= 5, f"{sid} {sd}: z from {f['zMm'][0]} to {f['zMm'][1]} mm")
            check(f["insideShare"] >= 0.5, f"{sid} {sd}: {f['insideShare']} of its points inside the fitted brainstem")
            check(f["outsideMaxMm"] <= 5.0, f"{sid} {sd}: {f['outsideMaxMm']} mm outside the fitted brainstem")
            check(f["inVentricleShare"] <= 0.1, f"{sid} {sd}: {f['inVentricleShare']} of its points in the model's ventricle or aqueduct")
            check(f["fluidShare"] <= 0.55, f"{sid} {sd}: {f['fluidShare']} of its points fluid on the T2 template")
            # the streamline file read in the atlas's own coordinates: its points lie in the atlas's volume of the tract
            check(f["inOwnVolumeShare"] >= 0.99, f"{sid} {sd}: {f['inOwnVolumeShare']} of its points in the atlas's own volume of the tract")
            check(f["belowGridShare"] <= 0.03, f"{sid} {sd}: {f['belowGridShare']} of its points below the atlas's grid")
    # a nucleus that serves several nerves lists them, the one it is sorted by among them
    for sid, cns in SHARED_NUCLEI.items():
        it = by_id.get(sid, {})
        check(it.get("cranialNerves") == cns and it.get("cranialNerve") in cns, f"{sid}: serves {cns}")
    print(f"brainstem validation: {n - len(fails)}/{n} checks passed")
    for f in fails:
        print("FAIL", f)
    return 1 if fails else 0


def finalize() -> None:
    """After compress.mjs: drop compressed files of structures that no longer exist, fill in file sizes and
    copy the manifest next to the assets."""
    p = GEN / "bs-manifest.json"
    m = json.loads(p.read_text())
    keep = {Path(it["file"]).name for it in m["structures"]}
    for f in (PUBLIC / KIND).glob("*.glb"):
        if f.name not in keep:
            f.unlink()
    for it in m["structures"]:
        it["bytes"] = (REPO / "public" / it["file"]).stat().st_size
    p.write_text(json.dumps(m, indent=1, ensure_ascii=False))
    shutil.copy(p, PUBLIC / "bs-manifest.json")


if __name__ == "__main__":
    if sys.argv[1:] == ["finalize"]:
        finalize()
        sys.exit(validate())
    if sys.argv[1:] == ["tracts"]:
        sys.exit(tracts_only())
    if sys.argv[1:] == ["cst"]:
        sys.exit(cst_only())
    sys.exit(main())
