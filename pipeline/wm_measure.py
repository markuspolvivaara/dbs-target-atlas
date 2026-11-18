"""What the white-matter cards say about the atlas bundles themselves, measured from the atlas's files.

Every streamline is read through build.read_trk_gz, so with its half voxel. Measured here:
  - the optic radiation's Meyer's loop: per streamline, how far its course runs forward of its thalamic end before it
    turns back, where the looping ones turn, where the bundle starts, and how far behind the template's temporal pole
    its most anterior point lies;
  - where the ends of the medial lemniscus, the reticulospinal tract, the extreme capsule fasciculus and the anterior
    commissure lie (the nearest Destrieux label of the template's pial surface, within END_REACH_MM), and their lengths;
  - the fornix against the Neudorfer 2020 fornix label of the DBS section (validate.py holds it to a tolerance).

Writes src/data/generated/wm-measured.json. The cards' sentences (src/tracts/content.ts, `measured`) are written out
by hand; tests/unit/tracts.test.ts holds every figure in them, and the regions they name, to this file, so after a
rebuild that moves a figure the test says which sentence to change.

Usage:  python pipeline/wm_measure.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import nibabel as nib
import numpy as np
import scipy.io as sio
from scipy import ndimage
from scipy.spatial import cKDTree

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build as B  # noqa: E402
from cortex_build import read_annot  # noqa: E402

ROOT = Path(__file__).resolve().parent
RAW = ROOT / "data" / "raw"
GENERATED = ROOT.parent / "src" / "data" / "generated"
TRACTS = RAW / "hcp1065" / "tracts"

END_REACH_MM = 8.0       # an end counts as cortical within this distance of a vertex of the pial surface
LOOP_FORWARD_MM = 5.0    # a streamline of the optic radiation loops when it runs this far forward of its thalamic end
LABEL_MIN_SHARE = 0.05   # labels holding at least this share of a bundle's ends are listed
FORNIX_ATLAS = "atlases/Atlas of the Human Hypothalamus (Neudorfer & Germann 2020)"


def length(sl: np.ndarray) -> float:
    return float(np.linalg.norm(np.diff(sl, axis=0), axis=1).sum())


class Cortex:
    """The template's pial surface (Lead-DBS, MNI 2009b) with its Destrieux labels, both hemispheres."""

    def __init__(self) -> None:
        surf = sio.loadmat(RAW / "cortex" / "CortexHiRes.mat", simplify_cells=True)
        des = read_annot("annot_a2009.mat")
        self.side_v = {s: np.asarray(surf[f"Vertices_{k}"], float) for s, k in (("L", "lh"), ("R", "rh"))}
        self.side_lab = {s: des[s][0] for s in "LR"}
        self.lab = np.concatenate([self.side_lab[s] for s in "LR"])
        self.tree = cKDTree(np.vstack([self.side_v[s] for s in "LR"]))

    def where(self, ends: np.ndarray) -> dict:
        """Share of the ends within END_REACH_MM of the surface, and the labels nearest to them (shares of all ends)."""
        d, i = self.tree.query(ends)
        near = d <= END_REACH_MM
        names, counts = np.unique(self.lab[i[near]], return_counts=True)
        shares = sorted(((c / len(ends), n) for c, n in zip(counts, names)), reverse=True)
        return {"centroid": ends.mean(0).round(1).tolist(), "nearCortexShare": round(float(near.mean()), 3),
                "labels": {n: round(float(s), 3) for s, n in shares if s >= LABEL_MIN_SHARE}}

    def temporal_pole_y(self, side: str) -> float:
        """The most anterior point of the temporal pole (Destrieux) on one side."""
        return float(self.side_v[side][self.side_lab[side] == "Pole_temporal", 1].max())


def optic_radiation(cx: Cortex) -> dict:
    out = {}
    for side in "LR":
        sls = B.read_trk_gz(TRACTS / f"projection/OR_{side}.trk.gz")
        start, apex = [], []
        for s in sls:
            if s[0, 1] < s[-1, 1]:
                s = s[::-1]                       # the thalamic (more anterior) end first
            start.append(s[0])
            apex.append(s[np.argmax(s[:, 1])])    # its most anterior point
        start, apex = np.array(start), np.array(apex)
        forward = apex[:, 1] - start[:, 1]
        loop = forward > LOOP_FORWARD_MM
        front, pole = float(apex[:, 1].max()), cx.temporal_pole_y(side)
        out[side] = {"streamlines": len(sls), "loopShare": round(float(loop.mean()), 3),
                     "loopApex": apex[loop].mean(0).round(1).tolist(), "thalamicEnd": start.mean(0).round(1).tolist(),
                     "mostAnteriorY": round(front, 1), "temporalPoleY": round(pole, 1),
                     "behindTemporalPoleMm": round(pole - front, 1)}
    return out


def ends(cx: Cortex) -> dict:
    """The two ends of each streamline, sorted by height (or by how far forward they lie)."""
    out = {}
    for tid, stem, axis, first, second in (("wm_ml", "projection/ML", 2, "upper", "lower"),
                                            ("wm_rst", "projection/RST", 2, "upper", "lower"),
                                            ("wm_emc", "association/EMC", 1, "front", "back")):
        out[tid] = {}
        for side in "LR":
            sls = B.read_trk_gz(TRACTS / f"{stem}_{side}.trk.gz")
            a = np.array([s[0] if s[0, axis] >= s[-1, axis] else s[-1] for s in sls])
            b = np.array([s[-1] if s[0, axis] >= s[-1, axis] else s[0] for s in sls])
            ln = np.array([length(s) for s in sls])
            out[tid][side] = {"streamlines": len(sls), "lengthMedianMm": round(float(np.median(ln))),
                              "lengthMeanMm": round(float(ln.mean())), first: cx.where(a), second: cx.where(b)}
    return out


def anterior_commissure(cx: Cortex) -> dict:
    """The file holds whole streamlines from one hemisphere to the other: its ends by the side they lie on."""
    sls = B.read_trk_gz(TRACTS / "commissural/AC.trk.gz")
    e = np.array([p for s in sls for p in (s[0], s[-1])])
    out: dict = {"streamlines": len(sls), "lengthMedianMm": round(float(np.median([length(s) for s in sls])))}
    for side, sel in (("L", e[:, 0] < 0), ("R", e[:, 0] >= 0)):
        out[side] = cx.where(e[sel])
    return out


def fornix_offset(side: str, hemi: str) -> tuple[float, list[int]]:
    """Median distance (mm) of the atlas fornix's points near the hypothalamus to the Neudorfer 2020 fornix label, and
    the whole-millimetre shift (up to 2 mm on each axis) that brings them closest."""
    sls = B.read_trk_gz(TRACTS / f"projection/F_{side}.trk.gz")
    pts = np.vstack(sls[::max(1, len(sls) // 300)])
    m = nib.load(RAW / f"{FORNIX_ATLAS}/{hemi}/fornix.nii.gz")
    md = np.asanyarray(m.dataobj) > 0.5
    dist = ndimage.distance_transform_edt(~md, sampling=np.abs(np.diag(m.affine)[:3]))
    minv = np.linalg.inv(m.affine)
    ijk = np.array(np.nonzero(md))
    a, b = nib.affines.apply_affine(m.affine, ijk.min(1)), nib.affines.apply_affine(m.affine, ijk.max(1))
    pts = pts[np.all((pts >= np.minimum(a, b) - 2) & (pts <= np.maximum(a, b) + 2), axis=1)]

    def med(off):
        q = np.rint(nib.affines.apply_affine(minv, pts + off)).astype(int)
        q = q[np.all((q >= 0) & (q < md.shape), axis=1)]
        dd = dist[tuple(q.T)]
        return float(np.median(dd[dd < 15]))
    offs = [np.array(v, float) - 2 for v in np.ndindex(5, 5, 5)]
    best = min(offs, key=med)
    return med(np.zeros(3)), [int(v) for v in best]


def main() -> int:
    cx = Cortex()
    fx = {}
    for side, hemi in (("L", "lh"), ("R", "rh")):
        med, shift = fornix_offset(side, hemi)
        fx[side] = {"medianMm": round(med, 1), "bestShiftMm": shift}   # one decimal: as the card prints it
    out = {"generatedBy": "pipeline/wm_measure.py", "endReachMm": END_REACH_MM, "loopForwardMm": LOOP_FORWARD_MM,
           "opticRadiation": optic_radiation(cx), "ends": ends(cx), "anteriorCommissure": anterior_commissure(cx),
           "fornix": fx}
    (GENERATED / "wm-measured.json").write_text(json.dumps(out, indent=1) + "\n")
    print(json.dumps(out, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
