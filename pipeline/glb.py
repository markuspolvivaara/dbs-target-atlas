"""Minimal glTF 2.0 binary writer for triangle meshes and line sets.

Each node carries one primitive and is named "L", "R" (or "both"), so the
viewer can toggle hemispheres per node. Coordinates are written unchanged:
glTF units = MNI millimetres, axes = RAS (x right, y anterior, z superior).
The viewer applies a single root rotation to map RAS onto its Y-up scene.
"""
from __future__ import annotations

import json
import struct
from pathlib import Path

import numpy as np

FLOAT, UINT16, UINT32 = 5126, 5123, 5125
ARRAY_BUFFER, ELEMENT_ARRAY_BUFFER = 34962, 34963
TRIANGLES, LINES = 4, 1


class _Builder:
    def __init__(self) -> None:
        self.bin = bytearray()
        self.views: list[dict] = []
        self.accessors: list[dict] = []

    def _view(self, data: bytes, target: int) -> int:
        while len(self.bin) % 4:
            self.bin.append(0)
        self.views.append({"buffer": 0, "byteOffset": len(self.bin), "byteLength": len(data), "target": target})
        self.bin.extend(data)
        return len(self.views) - 1

    def vec3(self, a: np.ndarray) -> int:
        a = np.ascontiguousarray(a, dtype=np.float32)
        v = self._view(a.tobytes(), ARRAY_BUFFER)
        self.accessors.append({
            "bufferView": v, "componentType": FLOAT, "count": int(a.shape[0]), "type": "VEC3",
            "min": a.min(0).tolist(), "max": a.max(0).tolist(),
        })
        return len(self.accessors) - 1

    def scalar(self, a: np.ndarray) -> int:
        a = np.ascontiguousarray(a, dtype=np.float32).ravel()
        v = self._view(a.tobytes(), ARRAY_BUFFER)
        self.accessors.append({"bufferView": v, "componentType": FLOAT, "count": int(a.size), "type": "SCALAR",
                               "min": [float(a.min())], "max": [float(a.max())]})
        return len(self.accessors) - 1

    def indices(self, a: np.ndarray) -> int:
        a = np.asarray(a).ravel()
        if a.max() < 65535:
            a, ct = a.astype(np.uint16), UINT16
        else:
            a, ct = a.astype(np.uint32), UINT32
        v = self._view(np.ascontiguousarray(a).tobytes(), ELEMENT_ARRAY_BUFFER)
        self.accessors.append({"bufferView": v, "componentType": ct, "count": int(a.size), "type": "SCALAR"})
        return len(self.accessors) - 1


def write_glb(path: Path, nodes: list[dict], extras: dict | None = None) -> None:
    """nodes: [{name, positions (n,3), normals (n,3)|None, indices, mode, extras}]

    Optional per node: colors (n,3) in 0..1 (COLOR_0), scalars {"_NAME": (n,)} (custom vertex attributes),
    targets [{"positions": (n,3) deltas, "normals": (n,3) deltas, "name": optional}] (morph targets, weights 0; when every
    target is named, the names go to the mesh's extras.targetNames).
    """
    b = _Builder()
    meshes, gnodes = [], []
    for n in nodes:
        attrs = {"POSITION": b.vec3(n["positions"])}
        if n.get("normals") is not None:
            attrs["NORMAL"] = b.vec3(n["normals"])
        if n.get("colors") is not None:
            attrs["COLOR_0"] = b.vec3(n["colors"])
        for k, a in (n.get("scalars") or {}).items():
            attrs[k] = b.scalar(a)
        prim = {"attributes": attrs, "indices": b.indices(n["indices"]), "mode": n.get("mode", TRIANGLES)}
        mesh = {"name": n["name"], "primitives": [prim]}
        if n.get("targets"):
            prim["targets"] = [{"POSITION": b.vec3(t["positions"]), **({"NORMAL": b.vec3(t["normals"])} if t.get("normals") is not None else {})}
                               for t in n["targets"]]
            mesh["weights"] = [0.0] * len(n["targets"])
            if all(t.get("name") for t in n["targets"]):     # named targets (three.js morphTargetDictionary)
                mesh["extras"] = {"targetNames": [t["name"] for t in n["targets"]]}
        meshes.append(mesh)
        node = {"name": n["name"], "mesh": len(meshes) - 1}
        if n.get("extras"):
            node["extras"] = n["extras"]
        gnodes.append(node)
    gltf = {
        "asset": {"version": "2.0", "generator": "dbs-atlas pipeline"},
        "scene": 0,
        "scenes": [{"nodes": list(range(len(gnodes)))}],
        "nodes": gnodes,
        "meshes": meshes,
        "accessors": b.accessors,
        "bufferViews": b.views,
        "buffers": [{"byteLength": len(b.bin)}],
    }
    if extras:
        gltf["extras"] = extras
    js = json.dumps(gltf, separators=(",", ":")).encode()
    js += b" " * ((4 - len(js) % 4) % 4)
    bn = bytes(b.bin) + b"\0" * ((4 - len(b.bin) % 4) % 4)
    total = 12 + 8 + len(js) + 8 + len(bn)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, total))
        f.write(struct.pack("<II", len(js), 0x4E4F534A) + js)
        f.write(struct.pack("<II", len(bn), 0x004E4942) + bn)


def read_glb_full(path: Path) -> dict:
    """A GLB as write_glb writes it: {node name: {"positions", "normals", "indices", "targets": [{"name", "positions",
    "normals"}]}} (target deltas; names from the mesh's extras.targetNames)."""
    import json
    import struct
    b = Path(path).read_bytes()
    n = struct.unpack("<I", b[12:16])[0]
    g = json.loads(b[20:20 + n])
    blob = b[20 + n + 8:]

    def acc(i):
        a = g["accessors"][i]
        bv = g["bufferViews"][a["bufferView"]]
        k = {"SCALAR": 1, "VEC3": 3}[a["type"]]
        dt = {5126: np.float32, 5125: np.uint32, 5123: np.uint16}[a["componentType"]]
        arr = np.frombuffer(blob, dt, a["count"] * k, bv.get("byteOffset", 0) + a.get("byteOffset", 0))
        return arr.reshape(a["count"], k).astype(float) if k > 1 else arr.astype(np.int64)
    out = {}
    for node in g["nodes"]:
        if node.get("mesh") is None:
            continue
        mesh = g["meshes"][node["mesh"]]
        p = mesh["primitives"][0]
        names = (mesh.get("extras") or {}).get("targetNames", [])
        out[node.get("name", str(len(out)))] = {
            "positions": acc(p["attributes"]["POSITION"]),
            "normals": acc(p["attributes"]["NORMAL"]) if "NORMAL" in p["attributes"] else None,
            "indices": acc(p["indices"]).reshape(-1, 3),
            "targets": [{"name": names[i] if i < len(names) else None, "positions": acc(t["POSITION"]),
                         "normals": acc(t["NORMAL"]) if "NORMAL" in t else None} for i, t in enumerate(p.get("targets", []))],
        }
    return out
