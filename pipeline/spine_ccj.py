"""The spine section's craniocervical junction (region 'ccj') from its own CT: VerSe sub-gl090 (CC BY-SA 4.0), a
cervical scan that reaches the clivus (the whole-spine CT the other regions use stops 8 mm above C1).

  pipeline/.venv/bin/python -I -W ignore pipeline/spine_ccj.py      (after spine_build.py, which also runs it; then
  node pipeline/compress.mjs spine and spine_build.py finalize, as after spine_build.py)

Inputs
  pipeline/data/raw/verse/sub-gl090/      CT (0.27 x 0.27 x 1.25 mm), hand-corrected vertebra masks C1-T3, centroids
  pipeline/data/build/spine/ccj/ts/       TotalSegmentator segmentations of it (spine_segment.py --ccj): skull, canal
Writes
  pipeline/data/build/spine/sp_ccj_*.glb  the occipital bone around the foramen magnum, C1, C2, C3, the dural sac
  public/assets/spine/ccj_midsag.png      the midsagittal CT the measurements are drawn on in the card
  the 'ccj' structures of src/data/generated/spine-manifest.json and the 'ccj' entry of spine-levels.json: the
  landmarks and measurements of the junction in its midsagittal plane (Fidan 2026's definitions)

Space: RAS millimetres of this CT, moved so the origin is the tip of the dens. A second subject: not registered to the
whole-spine CT, and shown on its own.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import nibabel as nib
import numpy as np
from scipy import ndimage

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from build import isosurface  # noqa: E402
from glb import write_glb  # noqa: E402
import spine_build as B  # noqa: E402

SUBJECT = "sub-gl090"
RAW = ROOT / "data" / "raw" / "verse" / SUBJECT
CT = RAW / f"{SUBJECT}_dir-ax_ct.nii.gz"
MASK = RAW / f"{SUBJECT}_dir-ax_seg-vert_msk.nii.gz"
TS = ROOT / "data" / "build" / "spine" / "ccj" / "ts"
STEP = 0.5            # mm: the thick-sliced CT is resampled to this grid before its surfaces are taken
SLAB = 1.5            # mm either side of the midsagittal plane: the measurements' landmarks lie within it
PLANE_SHIFTS = (-1.0, -0.5, 0.5, 1.0)  # mm: the plane moved this far sideways, for each measurement's range
OCCIPUT_REACH = 50.0  # mm around the middle of the foramen magnum: the part of the skull drawn
# the card's midsagittal image: this box (scene y anterior, z cranial; mm), PX px per mm, a slab IMAGE_SLAB mm thick
# averaged, bone window
IMAGE_BOX = ((-55.0, 30.0), (-50.0, 28.0))
PX = 5
IMAGE_SLAB = 2.0
WINDOW = (-200.0, 1400.0)   # HU at black and at white
VERTEBRAE = {1: "C1", 2: "C2", 3: "C3"}
DATASET = {
    "name": "VerSe cervical CT (sub-gl090) with TotalSegmentator segmentations",
    "licence": B.DATASET["licence"],
    "note": "The craniocervical junction comes from a second adult CT of the VerSe dataset (a cervical scan, 0.27 x 0.27 "
            "x 1.25 mm), not the whole-spine CT of the other regions, whose field of view ends just above C1. "
            "Coordinates are millimetres from the tip of the dens. C1-C3: CT surfaces within reach of VerSe's "
            "hand-corrected masks; the occipital bone (cut 50 mm around the foramen magnum) and the canal contents: "
            "TotalSegmentator segmentations of the same CT.",
}


def iso(vol: np.ndarray, aff: np.ndarray, order: int) -> tuple[np.ndarray, np.ndarray]:
    """Resample a block to STEP mm voxels (its corner voxels kept in place) and give the new grid's affine."""
    zooms = np.sqrt((aff[:3, :3] ** 2).sum(0))
    shape = np.maximum(np.round((np.array(vol.shape) - 1) * zooms / STEP).astype(int) + 1, 2)
    out = ndimage.zoom(vol, (shape - 1) / (np.array(vol.shape) - 1), order=order, mode="nearest", grid_mode=False)
    a = aff.copy()
    a[:3, :3] = aff[:3, :3] * ((np.array(vol.shape) - 1) / (np.array(out.shape) - 1))
    return out, a


def block(arr: np.ndarray, sel: np.ndarray, margin: int) -> tuple:
    idx = np.argwhere(sel)
    lo, hi = np.maximum(idx.min(0) - margin, 0), np.minimum(idx.max(0) + margin + 1, arr.shape)
    return tuple(slice(a, b) for a, b in zip(lo, hi))


def mesh_of(ct: np.ndarray, sel: np.ndarray, aff: np.ndarray, faces: int, bone: bool):
    """A surface from a mask: for bone the CT's BONE_HU surface within reach of the mask (as the vertebrae of the
    whole-spine CT), otherwise the mask's own; on the resampled grid."""
    cr = block(sel, sel, 6)
    a = aff.copy()
    a[:3, 3] = nib.affines.apply_affine(aff, [s.start for s in cr])
    m, a2 = iso(sel[cr].astype(np.float32), a, 1)
    if bone:
        c, _ = iso(ct[cr], a, 1)
        vol = B.bone_volume(c, m > 0.5, STEP)
        return isosurface(vol, a2, B.BONE_HU, B.SIGMA_VOX, faces)
    return isosurface(m, a2, 0.5, 1.5, faces)


def slab_points(sel: np.ndarray, aff: np.ndarray, o: np.ndarray) -> np.ndarray:
    """A mask's voxel centres within SLAB mm of the midsagittal plane (x = 0 here), in the scene's millimetres."""
    p = nib.affines.apply_affine(aff, np.argwhere(sel)) - o
    return p[np.abs(p[:, 0]) <= SLAB]


def nearest(a: np.ndarray, b: np.ndarray) -> tuple[float, np.ndarray, np.ndarray]:
    """The closest pair between two point sets (sagittal y, z only: the slab's thickness is not part of a distance
    measured on a midsagittal image)."""
    from scipy.spatial import cKDTree
    t = cKDTree(b[:, 1:])
    d, j = t.query(a[:, 1:])
    i = int(np.argmin(d))
    return float(d[i]), a[i], b[j[i]]


def line_fit(p: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """A line through sagittal points (y, z): its centre and unit direction, pointing cranially."""
    q = p[:, 1:]
    c = q.mean(0)
    d = np.linalg.svd(q - c, full_matrices=False)[2][0]
    return c, (d if d[1] > 0 else -d)


def measure(ct: np.ndarray, m: np.ndarray, skull: np.ndarray, aff: np.ndarray, o: np.ndarray) -> dict:
    """The junction's landmarks and measurements in its midsagittal plane, by Fidan 2026's definitions: ADI (the
    anterior arch of C1 to the closest point of the dens), PADI (the dens's posterior border to the closest point of
    the C1 posterior arch), McRae's line (basion to opisthion) and the dens tip's distance below it, BDI (basion to
    the tip of the dens), BAI (basion to the rostral extension of the posterior axial line, the line along the back of
    the C2 body) and the clivus-canal angle (Wackenheim: the clivus's posterior surface against the posterior axial
    line). Bone of the skull: the CT above BONE_HU within reach of TotalSegmentator's skull."""
    c1, c2 = slab_points(m == 1, aff, o), slab_points(m == 2, aff, o)
    bone = ct > B.BONE_HU
    # (the vertebrae's own bone, and a voxel around it, is never the skull's: the dens tip lies close under the basion)
    # TotalSegmentator's skull is coarse: its bone is the CT's within about 1 mm in-plane and one 1.25 mm slice of it
    flat = np.zeros((3, 3, 3), bool)
    flat[:, :, 1] = ndimage.generate_binary_structure(2, 1)
    reach = ndimage.binary_dilation(ndimage.binary_dilation(skull, flat, iterations=4))
    sk = slab_points(bone & reach & ~ndimage.binary_dilation(m > 0), aff, o)
    tip = c2[c2[:, 2] > c2[:, 2].max() - 0.01].mean(0)    # the centre of C2's top slice here (the origin)
    # C1's arches: in front of and behind the dens
    ant, post = c1[c1[:, 1] > tip[1]], c1[c1[:, 1] < tip[1] - 5]
    dens = c2[c2[:, 2] > ant[:, 2].min() - 5]
    adi, a1, a2 = nearest(ant, dens)
    padi, p1, p2 = nearest(dens, post)
    # the basion: the clivus's lowest point (skull bone near the dens, short of the face); the opisthion: the point of
    # the foramen magnum's posterior margin closest to it
    clivus = sk[(sk[:, 1] > tip[1] - 8) & (sk[:, 1] < tip[1] + 20) & (sk[:, 2] > tip[2] - 5)]
    basion = clivus[np.argmin(clivus[:, 2])]
    back = sk[(sk[:, 1] < post[:, 1].max()) & (sk[:, 2] > basion[2] - 10)]
    opisthion = back[np.argmin(np.linalg.norm(back[:, 1:] - basion[1:], axis=1))]
    mcrae = float(np.linalg.norm(basion[1:] - opisthion[1:]))
    u = (basion[1:] - opisthion[1:]) / mcrae
    nrm = np.array([-u[1], u[0]]) if u[0] > 0 else np.array([u[1], -u[0]])
    nrm = nrm if nrm[1] > 0 else -nrm                     # pointing cranially
    below = float(-(tip[1:] - opisthion[1:]) @ nrm)       # the dens tip's distance below the line (positive: below)
    bdi = float(np.linalg.norm(basion[1:] - tip[1:]))
    # the posterior axial line: the back of the C2 body, slice by slice the most posterior point of the axis's front
    # part (in front of the canal), from its lower endplate to the base of the dens
    z0, z1 = c2[:, 2].min() + 2, tip[2] - 18
    border = []
    zr = np.round(c2[:, 2], 1)
    for z in np.unique(zr):
        if not z0 <= z <= z1:
            continue
        q = c2[zr == z]
        front = q[q[:, 1] > tip[1] - 14]                  # the body (the arch lies well behind the canal)
        if len(front):
            border.append(front[np.argmin(front[:, 1])])
    border = np.array(border)
    pc, pd = line_fit(border)
    rel = basion[1:] - pc
    bai = float(rel[0] * pd[1] - rel[1] * pd[0])          # signed: positive when the basion lies in front of the line
    bai = bai if pd[1] > 0 else -bai
    t_top = float(rel @ pd)
    # the clivus's posterior surface: per slice above the basion, its most posterior bone
    cl = []
    zr = np.round(clivus[:, 2], 1)
    for z in np.unique(zr):
        if z < basion[2] + 2:
            continue
        q = clivus[zr == z]
        cl.append(q[np.argmin(q[:, 1])])
    cl = np.array(cl)
    cc, cd = line_fit(cl)
    cca = float(np.degrees(np.arccos(np.clip(cd @ -pd, -1, 1))))   # clivus upwards against the axial line downwards
    v3 = lambda q: [0.0, round(float(q[0]), 2), round(float(q[1]), 2)] if len(q) == 2 else [round(float(x), 2) for x in q]  # noqa: E731
    lo = pc + pd * float(((border[:, 1:] - pc) @ pd).min())
    return {
        "slab": SLAB,
        "landmarks": {"densTip": v3(tip), "basion": v3(basion), "opisthion": v3(opisthion),
                      "adi": [v3(a1), v3(a2)], "padi": [v3(p1), v3(p2)],
                      "axialLine": [v3(lo), v3(pc + pd * t_top)],
                      "clivusLine": [v3(cc + cd * float(min((cl[:, 1:] - cc) @ cd))), v3(cc + cd * float(max((cl[:, 1:] - cc) @ cd)))]},
        "measurements": {"adi": round(adi, 1), "padi": round(padi, 1), "mcrae": round(mcrae, 1), "densBelowMcRae": round(below, 1),
                         "bdi": round(bdi, 1), "bai": round(bai, 1), "cca": round(cca, 0)},
        "clivusMm": round(float(np.ptp(cl[:, 2])), 1), "axialPoints": int(len(border)),
    }


def midsagittal_image(ct: np.ndarray, aff: np.ndarray, o: np.ndarray) -> dict:
    """The junction's midsagittal plane as an image (anterior on the left, as seen from the patient's left), for the
    card: the CT averaged over IMAGE_SLAB mm across the plane, in a bone window."""
    from PIL import Image
    (y0, y1), (z0, z1) = IMAGE_BOX
    ys = np.arange(y1, y0, -1 / PX)                    # left to right: anterior to posterior
    zs = np.arange(z1, z0, -1 / PX)                    # top to bottom
    inv = np.linalg.inv(aff)
    acc = np.zeros((len(zs), len(ys)), np.float32)
    xs = np.linspace(-IMAGE_SLAB / 2, IMAGE_SLAB / 2, 5)
    Z, Y = np.meshgrid(zs, ys, indexing="ij")
    for x in xs:
        p = np.stack([np.full(Y.size, x), Y.ravel(), Z.ravel()], 1) + o
        acc += ndimage.map_coordinates(ct, nib.affines.apply_affine(inv, p).T, order=1, mode="nearest").reshape(Y.shape)
    img = np.clip((acc / len(xs) - WINDOW[0]) / (WINDOW[1] - WINDOW[0]), 0, 1)
    out = B.PUBLIC / "spine" / "ccj_midsag.png"
    Image.fromarray((img * 255).astype(np.uint8)).save(out, optimize=True)
    return {"file": "assets/spine/ccj_midsag.png", "width": len(ys), "height": len(zs), "pxPerMm": PX, "left": y1, "top": z1,
            "slab": IMAGE_SLAB}


def build(report: dict) -> tuple[list[dict], dict, dict]:
    """The junction's structures (for the manifest), its measurements, and the dataset note."""
    img = nib.load(CT)
    ct = np.asanyarray(img.dataobj).astype(np.float32)
    aff = img.affine
    m = np.asanyarray(nib.load(MASK).dataobj).astype(np.int16)
    skull = np.asanyarray(nib.load(TS / "craniofacial_structures" / "skull.nii.gz").dataobj) > 0
    cord = np.asanyarray(nib.load(TS / "total" / "spinal_cord.nii.gz").dataobj) > 0
    # origin: the tip of the dens (the centre of C2's highest slice near the midline)
    c2 = nib.affines.apply_affine(aff, np.argwhere(m == 2))
    mid = np.median(c2[:, 0])
    near = c2[np.abs(c2[:, 0] - mid) < SLAB]
    o = near[near[:, 2] > near[:, 2].max() - 0.01].mean(0)
    meas = measure(ct, m, skull, aff, o)
    # how much each value depends on where exactly the midsagittal plane is: its range with the plane moved sideways
    alt = [measure(ct, m, skull, aff, o + [dx, 0, 0])["measurements"] for dx in PLANE_SHIFTS]
    meas["range"] = {k: [min([v] + [a[k] for a in alt]), max([v] + [a[k] for a in alt])] for k, v in meas["measurements"].items()}
    meas["note"] = DATASET["note"]
    meas["image"] = midsagittal_image(ct, aff, o)
    a_o = aff.copy()
    a_o[:3, 3] -= o
    # the skull drawn: OCCIPUT_REACH mm around the middle of the foramen magnum
    fm = (np.array(meas["landmarks"]["basion"]) + np.array(meas["landmarks"]["opisthion"])) / 2
    idx = np.argwhere(skull)
    keep = np.linalg.norm(nib.affines.apply_affine(a_o, idx) - fm, axis=1) < OCCIPUT_REACH
    occ = np.zeros_like(skull)
    occ[tuple(idx[keep].T)] = True
    cord[:, :, :np.argwhere(m == 3)[:, 2].min()] = False   # the canal's contents from C3 up
    parts = [("sp_ccj_occiput", "Occipital bone (around the foramen magnum)", "spBone", "nuclei", "bone", occ, 30000, True,
              "TotalSegmentator craniofacial_structures: skull, within 50 mm of the middle of the foramen magnum, its CT surface")]
    for lab, name in VERTEBRAE.items():
        parts.append((f"sp_ccj_{name.lower()}", f"{name} (junction CT)", "spBone", "nuclei", "bone", m == lab, 9000, True,
                      f"CT surface at {B.BONE_HU} HU within reach of VerSe's hand-corrected mask for {name}"))
    parts.append(("sp_ccj_dural_sac", "Dural sac (spinal canal contents, junction CT)", "spCord", "tracts", "neural",
                  cord, 6000, True, "TotalSegmentator total: spinal_cord"))
    items = []
    for sid, name, token, layer, cat, sel, faces, bone, src in parts:
        if sel.sum() < 50:
            raise SystemExit(f"{sid}: empty")
        mesh = mesh_of(ct, sel, a_o, faces, bone and cat == "bone")
        write_glb(B.BUILD / f"{sid}.glb", B.halves(mesh, 0.0), {"id": sid})
        items.append({"id": sid, "name": name, "token": token, "layer": layer, "category": cat, "region": "ccj",
                      "faces": int(len(mesh.faces)), "centroid": mesh.centroid.round(2).tolist(), "source": src})
        report[sid] = items[-1]
        print(f"{sid:20s} faces {len(mesh.faces):6d} centroid {mesh.centroid.round(1)}")
    return items, meas, DATASET


def main() -> int:
    """Rebuild only the junction: its GLBs, its manifest entries and its spine-levels.json entry."""
    report: dict = {}
    items, meas, _ = build(report)
    mp = B.GEN / "spine-manifest.json"
    man = json.loads(mp.read_text())
    keep = [s for s in man["structures"] if s.get("region") != "ccj"]
    man["structures"] = keep + B.manifest_entries(items, junction=True)
    mp.write_text(json.dumps(man, indent=1, ensure_ascii=False))
    lp = B.GEN / "spine-levels.json"
    lv = json.loads(lp.read_text())
    lv["ccj"] = meas
    lp.write_text(json.dumps(lv, indent=1, default=float))
    print(json.dumps(meas["measurements"]), "clivus", meas["clivusMm"], "mm, axial line from", meas["axialPoints"], "slices")
    return 0


if __name__ == "__main__":
    sys.exit(main())
