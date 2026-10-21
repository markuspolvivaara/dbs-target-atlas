"""Minimal NRRD reader (attached data, raw or gzip encoding), for the OpenEar volumes: header fields and the array, with
the voxel-to-space affine; Slicer segmentation files (.seg.nrrd) also give their segments (name, layer, label value)."""
from __future__ import annotations

import gzip
import re
from pathlib import Path

import numpy as np

TYPES = {"unsigned char": np.uint8, "uchar": np.uint8, "uint8": np.uint8, "signed char": np.int8, "int8": np.int8,
         "short": np.int16, "int16": np.int16, "unsigned short": np.uint16, "ushort": np.uint16, "uint16": np.uint16,
         "int": np.int32, "int32": np.int32, "unsigned int": np.uint32, "uint32": np.uint32, "float": np.float32,
         "double": np.float64}


def read(path: str | Path) -> tuple[np.ndarray, dict, np.ndarray]:
    raw = Path(path).read_bytes()
    end = raw.index(b"\n\n")
    header = raw[:end].decode("latin1")
    fields: dict[str, str] = {}
    for line in header.splitlines()[1:]:
        if line.startswith("#") or ":" not in line:
            continue
        k, v = line.split(":", 1)
        fields[k.strip()] = v.lstrip("=").strip()
    sizes = [int(x) for x in fields["sizes"].split()]
    dtype = np.dtype(TYPES[fields["type"]])
    if fields.get("endian", "little") == "big":
        dtype = dtype.newbyteorder(">")
    body = raw[end + 2:]
    enc = fields.get("encoding", "raw")
    if enc in ("gzip", "gz"):
        body = gzip.decompress(body)
    elif enc != "raw":
        raise ValueError(f"encoding {enc}")
    arr = np.frombuffer(body, dtype=dtype, count=int(np.prod(sizes))).reshape(sizes[::-1]).T   # NRRD: fastest axis first
    dirs = re.findall(r"\(([^)]*)\)", fields.get("space directions", ""))
    m = np.array([[float(x) for x in d.split(",")] for d in dirs])
    origin = np.array([float(x) for x in re.findall(r"\(([^)]*)\)", fields["space origin"])[0].split(",")])
    aff = np.eye(4)
    aff[:3, :3] = m.T
    aff[:3, 3] = origin
    if fields.get("space", "").lower() in ("left-posterior-superior", "lps"):
        aff = np.diag([-1.0, -1.0, 1.0, 1.0]) @ aff   # to RAS
    segs = []
    for i in range(64):
        n = fields.get(f"Segment{i}_Name")
        if n is None:
            break
        segs.append({"name": n, "layer": int(fields.get(f"Segment{i}_Layer", 0)),
                     "value": int(fields.get(f"Segment{i}_LabelValue", 1))})
    fields["segments"] = segs
    return arr, fields, aff
