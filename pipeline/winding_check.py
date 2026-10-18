"""Check that every built mesh is wound outward, as the viewer needs to draw the near side of a surface:
  * each triangle's winding must agree with the vertex normals it is lit with (open surfaces and tubes too);
  * a closed structure (its nodes joined, e.g. the two halves of a vertebra) must enclose a positive volume, which
    catches meshes whose winding and normals are both inside out.

  pipeline/.venv/bin/python -I pipeline/winding_check.py [dir ...]   (default: every pipeline/data/build section)

Prints the offending meshes; exit 1 if any.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from pygltflib import GLTF2

ROOT = Path(__file__).resolve().parent
BUILD = ROOT / "data" / "build"


def read_nodes(path: Path):
    """Positions, normals and triangles of each primitive of an uncompressed GLB written by glb.write_glb."""
    g = GLTF2().load(str(path))
    blob = g.binary_blob()

    def acc(i):
        a = g.accessors[i]
        bv = g.bufferViews[a.bufferView]
        dt = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8}[a.componentType]
        n = {"SCALAR": 1, "VEC3": 3, "VEC2": 2, "VEC4": 4}[a.type]
        off = (bv.byteOffset or 0) + (a.byteOffset or 0)
        return np.frombuffer(blob, dt, a.count * n, off).reshape(a.count, n) if n > 1 else np.frombuffer(blob, dt, a.count, off)
    for node in g.nodes:
        if node.mesh is None:
            continue
        for p in g.meshes[node.mesh].primitives:
            if p.attributes.NORMAL is None or p.indices is None or (p.mode not in (None, 4)):
                continue
            yield node.name, acc(p.attributes.POSITION), acc(p.attributes.NORMAL), acc(p.indices).reshape(-1, 3)


def disagreement(P: np.ndarray, N: np.ndarray, T: np.ndarray) -> float:
    tri = P[T]
    fn = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    vn = N[T].sum(1)
    ok = np.linalg.norm(fn, axis=1) > 1e-12
    return float(((np.einsum("ij,ij->i", fn, vn) < 0) & ok).sum() / max(ok.sum(), 1))


MAX_INWARD = 0.05  # decimation leaves a few folded triangles in large meshes: up to 5% is tolerated


def closed_volume(parts: list[tuple[np.ndarray, np.ndarray]]) -> float | None:
    """Signed volume (mm3) of the structure's triangles joined (seam vertices merged), or None if it is not closed."""
    P = np.vstack([p for p, _ in parts])
    off = np.cumsum([0] + [len(p) for p, _ in parts[:-1]])
    T = np.vstack([t + o for (_, t), o in zip(parts, off)])
    _, uniq = np.unique(np.round(P, 3), axis=0, return_inverse=True)
    T2 = uniq.reshape(-1)[T]
    e = np.sort(np.concatenate([T2[:, [0, 1]], T2[:, [1, 2]], T2[:, [2, 0]]]), axis=1)
    _, counts = np.unique(e, axis=0, return_counts=True)
    if (counts == 1).mean() > 0.001:
        return None
    tri = P[T] - P.mean(0)
    return float(np.einsum("ij,ij->i", tri[:, 0], np.cross(tri[:, 1], tri[:, 2])).sum() / 6)


def main() -> int:
    dirs = [Path(d) for d in sys.argv[1:]] or [d for d in BUILD.iterdir() if d.is_dir() and d.name in ("meshes", "spine", "skullbase", "skullbase-ct", "cortex")]
    bad, n = [], 0
    for d in dirs:
        for f in sorted(d.glob("*.glb")):
            parts = []
            for name, P, N, T in read_nodes(f):
                n += 1
                part = (P.astype(np.float64), T.astype(np.int64))
                share = disagreement(P, N, T)
                if share > MAX_INWARD:
                    bad.append(f"{d.name}/{f.name}:{name} {share:.0%} of triangles disagree with their normals")
                vol = closed_volume([part])
                if vol is None:
                    parts.append(part)  # open on its own, e.g. one half of a structure split at the midline
                elif vol < 0:
                    bad.append(f"{d.name}/{f.name}:{name} closed but inside out ({vol / 1000:.2f} ml)")
            vol = closed_volume(parts) if parts else None
            if vol is not None and vol < 0:
                bad.append(f"{d.name}/{f.name}: closed (halves joined) but inside out ({vol / 1000:.1f} ml)")
    for b in bad:
        print(b)
    print(f"winding: {n - len(bad)}/{n} meshes wound outward")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
