"""Export the ear from the Z-Anatomy Blender file for Skull base v1's temporal-bone views (runs inside Blender).

Usage (from the repository root):
  blender --factory-startup -b -noaudio pipeline/data/raw/zanatomy/Z-Anatomy/Startup.blend --python pipeline/skullbase_v1_ear_export.py

Writes pipeline/data/build/skullbase/ear_export.json in the skull-base export's frame (RAS millimetres relative to the
hypophysial fossa landmark, like skullbase_export.py):
  meshes  the cochlea, the vestibule (with the semicircular canals), the malleus, incus and stapes and the tympanic
          membrane, each side ({name: {L: {verts, tris}, R: ...}})
  texts   the Wikipedia-derived definition of each (CC BY-SA 3.0)
Nothing is added or moved by hand: the file only converts what the model contains.
"""
import json
import os
import sys

import bpy

OUT = os.path.join(os.getcwd(), 'pipeline', 'data', 'build', 'skullbase', 'ear_export.json')
ORIGIN_PIN = 'Hypophysial fossa.j'
EAR = ('Cochlea', 'Vestibule', 'Malleus', 'Incus', 'Stapes', 'Tympanic membrane')


def pin_point(o):
    ev = o.evaluated_get(bpy.context.evaluated_depsgraph_get())
    m = ev.to_mesh()
    pts = [ev.matrix_world @ v.co for v in m.vertices]
    ev.to_mesh_clear()
    for md in o.modifiers:
        if md.type == 'HOOK' and md.object is not None and len(md.vertex_indices):
            return pts[md.vertex_indices[0]]
    return max(pts, key=lambda p: p.z)


origin = pin_point(bpy.data.objects[ORIGIN_PIN])


def ras(p):
    d = (p - origin) * 1000.0
    return [round(-d.x, 3), round(-d.y, 3), round(d.z, 3)]


def mesh_data(o):
    ev = o.evaluated_get(bpy.context.evaluated_depsgraph_get())
    m = ev.to_mesh()
    m.calc_loop_triangles()
    verts = [ras(o.matrix_world @ v.co) for v in m.vertices]
    tris = [list(t.vertices) for t in m.loop_triangles]
    ev.to_mesh_clear()
    return verts, tris


meshes, texts = {}, {}
for name in EAR:
    for side, suf in (('L', '.l'), ('R', '.r')):
        o = bpy.data.objects.get(name + suf)
        if o is None or o.type != 'MESH':
            continue
        v, t = mesh_data(o)
        meshes.setdefault(name, {})[side] = {'verts': v, 'tris': t}
    t = bpy.data.texts.get(name)
    texts[name] = t.as_string() if t else None
out = {'origin': {'pin': ORIGIN_PIN, 'note': 'RAS mm relative to the hypophysial fossa landmark'}, 'meshes': meshes, 'texts': texts}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w') as f:
    json.dump(out, f)
print(f"ear export: {sum(len(s) for s in meshes.values())} meshes -> {OUT}")
sys.stdout.flush()
