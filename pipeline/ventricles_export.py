"""Export the ventricles from the Z-Anatomy Blender file for the ventricles section (runs inside
Blender).

Usage (from the repository root):
  .tools/Blender.app/Contents/MacOS/Blender --factory-startup -b -noaudio \
      pipeline/data/raw/zanatomy/Z-Anatomy/Startup.blend --python pipeline/ventricles_export.py

Writes pipeline/data/build/ventricles/ventricles_export.json in the skull-base export's frame (RAS millimetres relative
to the hypophysial fossa landmark, like skullbase_export.py, so Skull base v2's fit carries it onto the CT):
  meshes     the lateral ventricles, the third ventricle, the aqueduct and the fourth ventricle
  texts      the Wikipedia-derived definition of every exported structure (CC BY-SA 3.0)
Nothing is added or moved by hand: the file only converts what the model contains.
"""
import json
import os
import sys

import bpy

OUT = os.path.join(os.getcwd(), 'pipeline', 'data', 'build', 'ventricles', 'ventricles_export.json')
ORIGIN_PIN = 'Hypophysial fossa.j'
NAMES = ['Lateral ventricle.l', 'Lateral ventricle.r', 'Third ventricle', 'Aqueduct of midbrain', 'Fourth ventricle']


def base_name(n: str) -> str:
    for suf in ('.l', '.r', '.j', '.t', '.g', '.i', '.s'):
        if n.endswith(suf):
            return n[:-len(suf)]
    return n


def pin_point(o):
    """A label line's structure end: the vertex held by its Hook modifier (at evaluation time); else the upper end."""
    ev = o.evaluated_get(bpy.context.evaluated_depsgraph_get())
    m = ev.to_mesh()
    pts = [ev.matrix_world @ v.co for v in m.vertices]
    ev.to_mesh_clear()
    for md in o.modifiers:
        if md.type == 'HOOK' and md.object is not None and len(md.vertex_indices):
            return pts[md.vertex_indices[0]], md.object.name
    return max(pts, key=lambda p: p.z), None


origin = pin_point(bpy.data.objects[ORIGIN_PIN])[0]


def ras(p) -> list[float]:
    d = (p - origin) * 1000.0
    return [round(-d.x, 3), round(-d.y, 3), round(d.z, 3)]


def mesh_data(o):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = o.evaluated_get(dg)
    m = ev.to_mesh()
    m.calc_loop_triangles()
    verts = [ras(o.matrix_world @ v.co) for v in m.vertices]
    tris = [list(t.vertices) for t in m.loop_triangles]
    ev.to_mesh_clear()
    return verts, tris


def text_for(name: str) -> str | None:
    t = bpy.data.texts.get(base_name(name))
    return t.as_string() if t else None


export = {'origin': {'pin': ORIGIN_PIN, 'note': 'RAS mm relative to the hypophysial fossa landmark'}, 'meshes': {}, 'texts': {}}
for n in NAMES:
    o = bpy.data.objects.get(n)
    if o is None or o.type != 'MESH':
        print('missing mesh', n)
        continue
    v, t = mesh_data(o)
    export['meshes'][n] = {'verts': v, 'tris': t}
    export['texts'][base_name(n)] = text_for(n)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w') as f:
    json.dump(export, f)
print(f"ventricles export: {len(export['meshes'])} meshes -> {OUT}")
sys.stdout.flush()
