"""Skull base v1 (the Z-Anatomy model) with what Skull base v3 shows on its CT, made from Z-Anatomy's own models: the
craniotomies (skullbase_v3_approach.py with SB_PROFILE=v1), the brain and its surgical shapes (skullbase_v1_brain.py),
and the items they add to v1's manifest.

  pipeline/.venv/bin/python -I -W ignore pipeline/skullbase_v1.py approaches
      (after skullbase_build.py, skullbase_v1_skull.py and SB_PROFILE=v1 skullbase_v3_approach.py; then compress.mjs
      skullbase and skullbase_build.py finalize)

Everything here is the Z-Anatomy model's (BodyParts3D, CC BY-SA): no CT, no TopBrain vessel, no registered ear, no
template brain. Where Z-Anatomy lacks something v3 drew from other data, it is drawn by rule with v3's sourced rules and
says so.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

REPO = ROOT.parent
KIND = "skullbase"
PREFIX = "sb"
BUILD = ROOT / "data" / "build" / KIND
GEN = REPO / "src" / "data" / "generated"
PUBLIC = REPO / "public" / "assets"
LICENCE = "CC BY-SA 4.0 (Z-Anatomy); BodyParts3D CC BY-SA 2.1 Japan"


def whole_bones() -> dict:
    """v1's bones as skullbase_v1_skull.py wrote them (the meshes v1 draws): {name: (verts, tris, ao)}."""
    return {n: (np.array(b["verts"], float), np.array(b["tris"], int), np.array(b["ao"], float))
            for n, b in json.loads((BUILD / "skull.json").read_text())["bones"].items()}


def approaches() -> int:
    """The craniotomies' items (approach.json, cut on Z-Anatomy's skull) into v1's manifest, and sb-approaches.json."""
    import skullbase_v3 as V3
    p = GEN / f"{PREFIX}-manifest.json"
    m = json.loads(p.read_text())
    items = [it for it in m["structures"] if not it.get("approach") and not it.get("forView")]
    for f in BUILD.glob("sb_appr_*.glb"):
        f.unlink()
    V3.approach_items(items, None, build=BUILD, kind=KIND, prefix=PREFIX, licence=LICENCE, owner="Z-Anatomy's",
                      whole_bones=whole_bones())
    for it in items:
        f = REPO / "public" / it["file"]
        if not it.get("bytes") and f.exists():
            it["bytes"] = f.stat().st_size
    m["structures"] = items
    p.write_text(json.dumps(m, indent=1, ensure_ascii=False))
    print("approach items:", sum(1 for it in items if it.get("approach")))
    return 0


CARRIED_NOTE = ("In the telovelar and retrosigmoid views it is carried with the cerebellum it lies on, as the cerebellum's "
                "shapes move it (skullbase_v1_pfossa.py).")


CORTEX_NOTE = ("Z-Anatomy draws it on its cortex, which reaches into the model's own bone in places: it is moved with that "
               "cortex as the cortex is pushed back inside the cranial cavity, and kept inside the cavity itself "
               "(skullbase_v1_brain.py).")


def brain() -> int:
    """The cerebrum (skullbase_v1_brain.py) and the posterior fossa (skullbase_v1_pfossa.py) into v1's manifest, their
    definitions (Z-Anatomy's Wikipedia texts) into sb-definitions.json, and their reports into sb-v1fit.json."""
    import skullbase_build as SB
    p = GEN / f"{PREFIX}-manifest.json"
    m = json.loads(p.read_text())
    br = json.loads((BUILD / "brain.json").read_text())
    pf = json.loads((BUILD / "pfossa.json").read_text())
    new = br["items"] + pf["items"]
    ids = {it["id"] for it in new}
    for it in new:
        f = REPO / "public" / it["file"]
        it["bytes"] = f.stat().st_size if f.exists() else 0
    m["structures"] = [s for s in m["structures"] if s["id"] not in ids] + new
    # the Kawase view's lifted temporal lobe, again from the temporal lobe just written
    import skullbase_v3 as V3
    aps = json.loads((BUILD / "approach.json").read_text())
    if "kawase" in aps:
        m["structures"] = [s for s in m["structures"] if s.get("forView") != "kawase"]
        V3.lift_temporal_lobe(m["structures"], aps["kawase"], build=BUILD, kind=KIND)
    carried = pf["report"].get("carried", {})
    for it in m["structures"]:      # the arteries on the cerebellum, carried with its shapes (skullbase_v1_pfossa.py)
        if it["name"] in carried:
            it["morph"] = True
            it["bytes"] = (REPO / "public" / it["file"]).stat().st_size
            note = CARRIED_NOTE
            if note not in it.get("derivation", ""):
                it["derivation"] = (it.get("derivation", "") + " " + note).strip()
    moved = br["report"].get("arteries", {})
    for it in m["structures"]:      # the cortical arteries, moved with the cortex out of the bone (skullbase_v1_brain.py)
        if it["name"] in moved:
            it["centroid"] = moved[it["name"]]["centroid"]
            if CORTEX_NOTE not in it.get("derivation", ""):
                it["derivation"] = (it.get("derivation", "") + " " + CORTEX_NOTE).strip()
    p.write_text(json.dumps(m, indent=1, ensure_ascii=False))
    # the floor of the fourth ventricle's landmarks (skullbase_v1_pfossa.rhomboid)
    lp = GEN / f"{PREFIX}-landmarks.json"
    lms = json.loads(lp.read_text())
    new_l = pf.get("landmarks", [])
    lids = {lm["id"] for lm in new_l}
    lp.write_text(json.dumps([lm for lm in lms if lm["id"] not in lids] + new_l, indent=1, ensure_ascii=False))
    dp = GEN / f"{PREFIX}-definitions.json"
    defs = json.loads(dp.read_text())
    for name, raw in pf.get("texts", {}).items():
        d = SB.definition(raw)
        if d and name not in defs:
            defs[name] = d
    dp.write_text(json.dumps(defs, indent=1, ensure_ascii=False))
    fp = GEN / f"{PREFIX}-v1fit.json"
    fit = json.loads(fp.read_text()) if fp.exists() else {}
    fit.update({"brain": br["report"], "pfossa": pf["report"]})
    fp.write_text(json.dumps(fit, indent=1, default=str))
    print("brain items:", len(new))
    return 0


def ear() -> int:
    """The ear (skullbase_v1_ear.py) into v1's manifest, its drawn landmarks into sb-landmarks.json, its definitions
    (Z-Anatomy's Wikipedia texts) into sb-definitions.json, its report into sb-v1fit.json."""
    import skullbase_build as SB
    e = json.loads((BUILD / "ear.json").read_text())
    p = GEN / f"{PREFIX}-manifest.json"
    m = json.loads(p.read_text())
    ids = {it["id"] for it in e["items"]}
    for it in e["items"]:
        f = REPO / "public" / it["file"]
        it["bytes"] = f.stat().st_size if f.exists() else 0
    m["structures"] = [s for s in m["structures"] if s["id"] not in ids] + e["items"]
    p.write_text(json.dumps(m, indent=1, ensure_ascii=False))
    lp = GEN / f"{PREFIX}-landmarks.json"
    lms = json.loads(lp.read_text())
    lids = {lm["id"] for lm in e["landmarks"]}
    lp.write_text(json.dumps([lm for lm in lms if lm["id"] not in lids] + e["landmarks"], indent=1, ensure_ascii=False))
    dp = GEN / f"{PREFIX}-definitions.json"
    defs = json.loads(dp.read_text())
    for name, raw in e["texts"].items():
        d = SB.definition(raw)
        if d:
            defs[name] = d
    dp.write_text(json.dumps(defs, indent=1, ensure_ascii=False))
    fp = GEN / f"{PREFIX}-v1fit.json"
    fit = json.loads(fp.read_text()) if fp.exists() else {}
    fit["ear"] = e["report"]
    fp.write_text(json.dumps(fit, indent=1, default=str))
    print("ear items:", len(e["items"]), "landmarks:", len(e["landmarks"]))
    return 0


def cavernous() -> int:
    """The cavernous sinus's walls and the triangles (skullbase_v1_cavernous.py) into v1's manifest, its report into
    sb-v1fit.json."""
    c = json.loads((BUILD / "cavernous.json").read_text())
    p = GEN / f"{PREFIX}-manifest.json"
    m = json.loads(p.read_text())
    ids = {it["id"] for it in c["items"]}
    for it in c["items"]:
        f = REPO / "public" / it["file"]
        it["bytes"] = f.stat().st_size if f.exists() else 0
    m["structures"] = [s for s in m["structures"] if s["id"] not in ids] + c["items"]
    p.write_text(json.dumps(m, indent=1, ensure_ascii=False))
    fp = GEN / f"{PREFIX}-v1fit.json"
    fit = json.loads(fp.read_text()) if fp.exists() else {}
    fit["cavernous"] = {**c["report"], "mirrored": c["mirrored"]}
    fp.write_text(json.dumps(fit, indent=1, default=str))
    print("cavernous items:", len(c["items"]))
    return 0


if __name__ == "__main__":
    cmd = sys.argv[1:2]
    if cmd == ["approaches"]:
        sys.exit(approaches())
    if cmd == ["brain"]:
        sys.exit(brain())
    if cmd == ["ear"]:
        sys.exit(ear())
    if cmd == ["cavernous"]:
        sys.exit(cavernous())
    print(__doc__)
    sys.exit(2)
