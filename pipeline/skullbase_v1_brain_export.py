"""Export the cerebral cortex from the Z-Anatomy Blender file for Skull base v1's surgical views (runs inside Blender).

Usage (from the repository root):
  blender --factory-startup -b -noaudio pipeline/data/raw/zanatomy/Z-Anatomy/Startup.blend --python pipeline/skullbase_v1_brain_export.py

Writes pipeline/data/build/skullbase/brain_export.json in the skull-base export's frame (RAS millimetres relative to the
hypophysial fossa landmark, like skullbase_export.py):
  patches   every gyrus and sulcus patch of the cortex (BodyParts3D models the cortex as separate patches), each with
            its lobe (the Z-Anatomy collection it sits in: frontal, parietal, temporal, occipital, insula, limbic; the
            interlobular sulci and the lateral fissure's patches as "between", their lobe found from their neighbours)
            and side
  callosum  the corpus callosum (the medial wall's reference for the interhemispheric view)
  texts     the Wikipedia-derived definition of every exported structure (CC BY-SA 3.0)
Nothing is added or moved by hand: the file only converts what the model contains.
"""
import json
import os
import sys

import bpy

OUT = os.path.join(os.getcwd(), 'pipeline', 'data', 'build', 'skullbase', 'brain_export.json')
ORIGIN_PIN = 'Hypophysial fossa.j'
LOBES = {'Frontal lobe': 'frontal', 'Parietal lobe': 'parietal', 'Temporal lobe': 'temporal', 'Occipital lobe': 'occipital',
         'Insula': 'insula', 'Limbic lobe': 'limbic', 'Interlobular sulci': 'between'}
SKIP = ('Hippocampus', 'Amygdaloid', 'Septal', 'Fornix', 'Caudate', 'Globus pallidus', 'Lentiform', 'Putamen', 'Thalamus')


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


def base_name(n):
    for suf in ('.l', '.r', '.j', '.t', '.g', '.i', '.s'):
        if n.endswith(suf):
            return n[:-len(suf)]
    return n


def walk(c, lobe, seen, out):
    for o in c.objects:
        if o.type != 'MESH' or len(o.data.vertices) < 20 or o.name in seen or any(k in o.name for k in SKIP):
            continue
        if not o.name.endswith(('.l', '.r')):
            continue
        seen.add(o.name)
        v, t = mesh_data(o)
        out.append({'name': base_name(o.name), 'side': 'L' if o.name.endswith('.l') else 'R', 'lobe': lobe, 'verts': v, 'tris': t})
    for ch in c.children:
        walk(ch, LOBES.get(ch.name, lobe), seen, out)


tel = bpy.data.collections['Telencephalon']
patches, seen = [], set()
for ch in tel.children:
    if ch.name in LOBES:
        walk(ch, LOBES[ch.name], seen, patches)
# the patches directly in the telencephalon (the lateral fissure's banks and a few sulci) and the poles
for o in list(tel.objects) + list(bpy.data.collections['Cerebral hemisphere'].objects):
    if o.type == 'MESH' and o.name.endswith(('.l', '.r')) and o.name not in seen and len(o.data.vertices) >= 20 \
            and not any(k in o.name for k in SKIP + ('White matter', 'Lateral ventricle', 'Stria')):
        seen.add(o.name)
        v, t = mesh_data(o)
        patches.append({'name': base_name(o.name), 'side': 'L' if o.name.endswith('.l') else 'R', 'lobe': 'between', 'verts': v, 'tris': t})
cc = bpy.data.objects['Corpus callosum']
cv, ct = mesh_data(cc)
texts = {}
for p in patches:
    t = bpy.data.texts.get(p['name'])
    texts[p['name']] = t.as_string() if t else None
out = {'origin': {'pin': ORIGIN_PIN, 'note': 'RAS mm relative to the hypophysial fossa landmark'}, 'patches': patches,
       'callosum': {'verts': cv, 'tris': ct}, 'texts': texts}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w') as f:
    json.dump(out, f)
print(f"brain export: {len(patches)} patches -> {OUT}")
sys.stdout.flush()
