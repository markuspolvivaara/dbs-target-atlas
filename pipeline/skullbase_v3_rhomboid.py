"""Skull base v3: landmarks of the floor of the fourth ventricle (the rhomboid fossa), for the telovelar view.

  pipeline/.venv/bin/python -I -W ignore pipeline/skullbase_v3_rhomboid.py      (after skullbase_pfossa.py)

Z-Anatomy does not label the floor's landmarks, but its brainstem has the cranial nerve nuclei under them (exported by
brainstem_export.py) and its fourth ventricle is the one the telovelar view shows, fitted into this CT by
skullbase_pfossa.py. Each landmark is placed on the model's ventricle, then carried onto the fitted one by vertex (the
two meshes are the same, vertex for vertex; the fit moves each vertex):
  on the floor (the ventricle's surface against the pons and medulla, within FLOOR_MM of them), on its own side, the
  point straight behind the middle of the nucleus under the landmark (nearest across and along the brainstem): the facial colliculus over the abducens nucleus, the hypoglossal trigone over the
  hypoglossal nucleus, the vagal trigone over the posterior (dorsal) nucleus of the vagus, the vestibular area over the
  vestibular nuclei, each side;
  the obex: the caudal tip of the floor at the midline (the ventricle's lowest point within MIDLINE_MM of it);
  the median sulcus: the floor at the midline at the level of the facial colliculi.
These are the model's, not this patient's (a CT does not show the brainstem): approximate.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import numpy as np
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
GEN = ROOT.parent / "src" / "data" / "generated"
BUILD = ROOT / "data" / "build"
FLOOR_MM = 1.5
MIDLINE_MM = 1.5
OVER = {  # landmark: (the nucleus under it, the part of the brainstem it is on)
    "Facial colliculus": ("Nucleus of abducens nerve", "Pons"),
    "Hypoglossal trigone": ("Nucleus of hypoglossal nerve", "Medulla oblongata"),
    "Vagal trigone": ("Posterior nucleus of vagus nerve", "Medulla oblongata"),
    "Vestibular area": ("Vestibular nuclei", "Pons"),
}


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_")


def fitted_ventricle() -> np.ndarray:
    """The fitted fourth ventricle's vertices in the model's order: skullbase_pfossa.py writes it as L and R nodes, each
    the vertices its faces use (np.unique order), so the order is rebuilt the same way."""
    import trimesh
    from skullbase_pfossa import side_of
    m = json.loads((BUILD / "skullbase-ct" / "pfossa.json").read_text())["meshes"]["Fourth ventricle"]
    v, t = np.array(m["verts"], float), np.array(m["tris"], int)
    side = side_of("Fourth ventricle", v)
    sc = trimesh.load(BUILD / "skullbase-v3" / "pf_fourth_ventricle.glb", force="scene", process=False)
    out = np.full(v.shape, np.nan)
    for node in sc.graph.nodes_geometry:
        T, g = sc.graph[node]
        P = np.asarray(sc.geometry[g].vertices) @ T[:3, :3].T + T[:3, 3]
        used = np.unique(t[(side[t] == node).sum(1) >= 2])
        if len(used) != len(P):
            raise SystemExit(f"fourth ventricle node {node}: {len(P)} vertices, expected {len(used)}")
        out[used] = P
    return out


def rhomboid_landmarks() -> list[dict]:
    bs = json.loads((BUILD / "brainstem" / "export.json").read_text())["meshes"]
    V = np.array(bs["Fourth ventricle"]["verts"], float)          # the model's ventricle (Z-Anatomy's frame)
    X = fitted_ventricle()                                         # ... the same vertices, fitted into this CT
    stem = np.vstack([np.array(bs[f"{p}.{s}"]["verts"], float) for p in ("Pons", "Medulla oblongata") for s in "lr"])
    floor = np.nonzero(cKDTree(stem).query(V)[0] <= FLOOR_MM)[0]
    out = []

    def add(name, side, i, on, placed):
        if not np.isfinite(X[i]).all():
            raise SystemExit(f"{name}: vertex {i} not in the fitted ventricle")
        out.append({"id": f"lm_{slug(name)}" + ("" if side == "M" else f"_{side.lower()}"), "name": name, "bone": on, "part": "Floor of fourth ventricle",
                    "ras": np.round(X[i], 2).tolist(), "side": side, "boneFrom": "fitted model, carried onto this CT",
                    "distanceToBoneMm": 0.0, "placed": placed})
    fc = {}
    for name, (nucleus, on) in OVER.items():
        for s in "RL":
            N = np.array(bs[f"{nucleus}.{s.lower()}"]["verts"], float)
            own = floor[np.sign(V[floor, 0]) == (1 if s == "R" else -1)]     # (its own half of the floor: the nuclei lie close to the midline)
            c = N.mean(0)
            _, j = cKDTree(V[own][:, [0, 2]]).query(c[[0, 2]])         # (seen from behind: straight back from it, onto the floor)
            i = int(own[j])
            d = float(np.linalg.norm(V[i] - c))
            if name == "Facial colliculus":
                fc[s] = V[i]
            add(name, s, i, on, f"On the floor of the fitted model's fourth ventricle, straight behind the middle of the {nucleus.lower()} "
                                f"under it ({d:.1f} mm from it); the model's (Z-Anatomy), not this patient's, carried into this CT with the "
                                "ventricle (approximate).")
    mid = floor[np.abs(V[floor, 0]) <= MIDLINE_MM]
    lowest = int(mid[np.argmin(V[mid, 2])])
    add("Obex", "M", lowest, "Medulla oblongata", "The caudal tip of the floor at the midline in the fitted model's fourth ventricle (its "
        "lowest point there); the model's, not this patient's, carried into this CT with the ventricle (approximate).")
    level = (fc["R"] + fc["L"]) / 2
    i = int(mid[np.argmin(np.linalg.norm(V[mid] - level, axis=1))])
    add("Median sulcus of fourth ventricle", "M", i, "Pons", "The floor at the midline at the level of the facial colliculi in the fitted "
        "model's fourth ventricle; the model's, not this patient's, carried into this CT with the ventricle (approximate).")
    return out


def main() -> int:
    new = rhomboid_landmarks()
    p = GEN / "sbv3-landmarks.json"
    lms = [l for l in json.loads(p.read_text()) if l["id"] not in {n["id"] for n in new}]
    p.write_text(json.dumps(lms + new, indent=1, ensure_ascii=False))
    for l in new:
        print(f"  {l['name']} {l['side']} {l['ras']}  {l['placed'][:90]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
