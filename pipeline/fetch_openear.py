"""Fetch members of the OpenEar temporal-bone library (Sieber et al. 2019, Sci Data 6:180297; Zenodo record 1473724,
CC BY 4.0): eight cadaver temporal bones, each a zip of 4-14 GB, of which only the named members are read (HTTP range
requests). Files land in pipeline/data/raw/openear/<specimen>/ (git-ignored) and are hash-pinned in
pipeline/data/raw/openear/lock.json on first fetch, checked after.

  pipeline/.venv/bin/python -I pipeline/fetch_openear.py volumes          # bone and label volumes of all eight
  pipeline/.venv/bin/python -I pipeline/fetch_openear.py models ZETA      # one specimen's structure meshes

Downloaded files are data only: nothing in them is executed.
"""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

from remotezip import RemoteZip

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "data" / "raw" / "openear"
URL = "https://zenodo.org/records/1473724/files/{}.zip?download=1"
SPECIMENS = ["ALPHA", "BETA", "GAMMA", "DELTA", "EPSILON", "ETA", "THETA", "ZETA"]
VOLUMES = ["06_Segmentation/Segmentation.seg.nrrd", "07_3D_Models/Bone.nrrd"]


def sha256(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def fetch(specimen: str, want) -> list[Path]:
    dest = OUT / specimen
    dest.mkdir(parents=True, exist_ok=True)
    got = []
    with RemoteZip(URL.format(specimen)) as z:
        for info in z.infolist():
            if info.is_dir() or not want(info.filename):
                continue
            target = dest / Path(info.filename).name
            # a member's name is data from the archive: keep only its base name, inside this specimen's folder
            if target.resolve().parent != dest.resolve():
                raise SystemExit(f"unexpected member path {info.filename!r}")
            if not target.exists() or target.stat().st_size != info.file_size:
                with z.open(info) as src, open(target, "wb") as dst:
                    while chunk := src.read(1 << 20):
                        dst.write(chunk)
            got.append(target)
            print(f"{specimen}: {target.name} {target.stat().st_size:,d} bytes")
    return got


def main() -> int:
    mode = sys.argv[1] if len(sys.argv) > 1 else "volumes"
    if mode == "volumes":
        files = [p for s in SPECIMENS for p in fetch(s, lambda n: n in VOLUMES)]
    elif mode == "models":
        s = sys.argv[2].upper()
        files = fetch(s, lambda n: n.startswith("07_3D_Models/") and n.endswith(".ply") and "Bone" not in n)
    else:
        raise SystemExit(__doc__)
    lock_p = OUT / "lock.json"
    lock = json.loads(lock_p.read_text()) if lock_p.exists() else {}
    for p in files:
        key = f"{p.parent.name}/{p.name}"
        h = sha256(p)
        if key in lock and lock[key] != h:
            raise SystemExit(f"{key}: hash changed ({h} != {lock[key]})")
        lock[key] = h
    lock_p.write_text(json.dumps(dict(sorted(lock.items())), indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
