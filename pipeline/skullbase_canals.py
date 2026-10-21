"""The TopBrain CT sampled in Skull base v3's frame (v2's: mm from the fitted hypophysial fossa), for finding the skull
base's openings in it (skullbase_v3_base.floor_holes): the frame transform is the one skullbase_ct.py writes."""
from __future__ import annotations

from pathlib import Path

import nibabel as nib
import numpy as np
from scipy import ndimage

ROOT = Path(__file__).resolve().parent
CT_PATH = ROOT / "data" / "raw" / "topbrain" / "topcow_ct_011_0000.nii.gz"
FRAME = ROOT / "data" / "build" / "skullbase-ct" / "frame.npz"

BONE_HU = 350.0       # bone in the CT, for the openings (thin, blurred walls stay above this)


class CTFrame:
    def __init__(self):
        img = nib.load(CT_PATH)
        self.hu = np.asanyarray(img.dataobj).astype(np.float32)
        self.inv = np.linalg.inv(img.affine)
        f = np.load(FRAME)
        self.R, self.fossa = f["R"], f["fossa"]

    def to_scanner(self, P):
        return np.atleast_2d(P) @ self.R.T + self.fossa

    def sample(self, P, order=1):
        q = (self.inv @ np.c_[self.to_scanner(P), np.ones(len(np.atleast_2d(P)))].T)[:3]
        return ndimage.map_coordinates(self.hu, q, order=order, mode="constant", cval=-1000)
