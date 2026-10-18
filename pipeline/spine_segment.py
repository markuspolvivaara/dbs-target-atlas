"""Segment the spine section's CT with TotalSegmentator (run with pipeline/.venv-seg, which has it installed).

  pipeline/.venv-seg/bin/python -I pipeline/spine_segment.py [task ...]   (default: every task in TASKS)
  pipeline/.venv-seg/bin/python -I pipeline/spine_segment.py --ccj         (the craniocervical junction's CT)

The CT is the VerSe whole-spine scan fetched by fetch_sources.py (sub-verse823). TotalSegmentator's open tasks are
Apache-2.0 ("openly available for any usage"); its outputs here are derived from that CT, so they stay CC BY-SA 4.0
with it. Model weights are downloaded once into pipeline/data/raw/totalseg_weights (git-ignored).

Writes pipeline/data/build/spine/ts/<task>/<class>.nii.gz and pipeline/data/build/spine/ts/run.json (versions,
tasks, device, timings).
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data" / "build" / "spine" / "ts"
CT = RAW / "verse" / "sub-verse823" / "sub-verse823_dir-iso_ct.nii.gz"
# Open (Apache-2.0) TotalSegmentator tasks used by the spine section:
#   total                   bones (sacrum, hips, ribs, skull), spinal cord, vessels, viscera, iliopsoas (lumbar, all regions)
#   vertebrae_body          vertebral bodies and intervertebral discs (all regions)
#   headneck_bones_vessels  internal carotid arteries, internal jugular veins, hyoid, thyroid and cricoid cartilage (cervical)
#   headneck_muscles        prevertebral (longus) muscles, scalenes, sternocleidomastoid ... (cervical)
#   craniofacial_structures skull (craniocervical junction)
#   abdominal_muscles       psoas major, quadratus lumborum, erector spinae, transversospinalis (T4-L4 only)
TASKS = ["total", "vertebrae_body", "headneck_bones_vessels", "headneck_muscles", "craniofacial_structures", "abdominal_muscles"]
# The craniocervical junction's own CT (VerSe sub-gl090, a cervical scan that reaches the clivus; the whole-spine CT
# stops 8 mm above C1): its skull, and of the total task only the canal's contents
CCJ_CT = RAW / "verse" / "sub-gl090" / "sub-gl090_dir-ax_ct.nii.gz"
CCJ_OUT = ROOT / "data" / "build" / "spine" / "ccj" / "ts"
CCJ_TASKS = {"craniofacial_structures": [], "total": ["--roi_subset", "spinal_cord"]}


def device() -> str:
    try:
        import torch
        if torch.backends.mps.is_available():
            return "mps"
    except Exception:
        pass
    return "cpu"


def main() -> int:
    ccj = sys.argv[1:] == ["--ccj"]
    ct, out = (CCJ_CT, CCJ_OUT) if ccj else (CT, OUT)
    if not ct.exists():
        print(f"missing {ct}: run fetch_sources.py first", file=sys.stderr)
        return 1
    env = {**os.environ, "TOTALSEG_HOME_DIR": str(RAW / "totalseg_weights")}
    exe = Path(sys.executable).parent / "TotalSegmentator"
    dev = device()
    tasks = list(CCJ_TASKS) if ccj else sys.argv[1:] or TASKS
    unknown = set(tasks) - set(TASKS)
    if unknown:
        print(f"unknown tasks {sorted(unknown)}", file=sys.stderr)
        return 1
    out.mkdir(parents=True, exist_ok=True)
    rp = out / "run.json"
    run = json.loads(rp.read_text()) if rp.exists() else {"ct": ct.name, "device": dev, "tasks": {}}
    try:
        import totalsegmentator
        from importlib.metadata import version
        run["totalsegmentator"] = version("TotalSegmentator")
        run["torch"] = version("torch")
    except Exception as e:  # versions are informative only
        run["versionError"] = str(e)
    for task in tasks:
        dst = out / task
        if dst.exists() and any(dst.glob("*.nii.gz")):
            print(f"{task}: already segmented")
            continue
        dst.mkdir(parents=True, exist_ok=True)
        t0 = time.time()
        cmd = [str(exe), "-i", str(ct), "-o", str(dst), "-ta", task, "-d", dev, *(CCJ_TASKS.get(task, []) if ccj else [])]
        print(" ".join(cmd), flush=True)
        r = subprocess.run(cmd, env=env)
        if r.returncode:
            return r.returncode
        run["tasks"][task] = {"seconds": round(time.time() - t0), "files": len(list(dst.glob("*.nii.gz")))}
        rp.write_text(json.dumps(run, indent=1))  # after every task, so a later run keeps the record
    rp.write_text(json.dumps(run, indent=1))
    print(json.dumps(run))
    return 0


if __name__ == "__main__":
    sys.exit(main())
