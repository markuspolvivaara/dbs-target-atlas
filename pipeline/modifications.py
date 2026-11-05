"""A durable record of what the pipeline's steps change in a section's structures: src/data/generated/<prefix>-modifications.json.

Each step that moves, clears, joins or redraws a structure after its source calls record(): one entry per step (replaced
when the step runs again) with the structures it touched, the operation, its parameters, its measured effect, the
validation it ran and its result, and the pipeline revision (git) and date it ran at. The derivation strings on the
cards say the same in words; this file keeps the numbers.
"""
from __future__ import annotations

import datetime
import json
import subprocess
from pathlib import Path

GEN = Path(__file__).resolve().parent.parent / "src" / "data" / "generated"


def revision() -> str:
    try:
        rev = subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True, cwd=GEN, check=True).stdout.strip()
        dirty = subprocess.run(["git", "status", "--porcelain", "--", "pipeline"], capture_output=True, text=True, cwd=GEN).stdout.strip()
        return rev + ("+changes" if dirty else "")
    except (OSError, subprocess.CalledProcessError):
        return "unknown"


def record(prefix: str, step: str, operation: str, structures: list[str], parameters: dict, metrics: dict,
           validation: dict | None = None) -> None:
    """Write (or replace) this step's entry in <prefix>-modifications.json."""
    p = GEN / f"{prefix}-modifications.json"
    data = json.loads(p.read_text()) if p.exists() else {"steps": []}
    entry = {"step": step, "operation": operation, "structures": sorted(set(structures)), "parameters": parameters,
             "metrics": metrics, "validation": validation or {}, "revision": revision(),
             "date": datetime.date.today().isoformat()}
    data["steps"] = [e for e in data["steps"] if e["step"] != step] + [entry]
    data["steps"].sort(key=lambda e: e["step"])
    p.write_text(json.dumps(data, indent=1, ensure_ascii=False, default=float) + "\n")
