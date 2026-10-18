"""Export the brainstem section's anatomy from the Z-Anatomy Blender file (runs inside Blender).

Usage (from the repository root):
  .tools/Blender.app/Contents/MacOS/Blender --factory-startup -b -noaudio \
      pipeline/data/raw/zanatomy/Z-Anatomy/Startup.blend --python pipeline/brainstem_export.py

Writes pipeline/data/build/brainstem/export.json, in RAS millimetres of the model's own frame (Z-Anatomy: +X = patient
left, -Y = anterior, +Z = superior, metres); brainstem_build.py fits it into MNI space:
  meshes     the brainstem's parts and surface features, the ventricles around it and the nuclei Z-Anatomy models
  lines      cranial nerves III-XII and the arteries around the brainstem as centre lines, each point with the tube
             radius Z-Anatomy models there (its curve bevel), as [x, y, z, radius]
  landmarks  Z-Anatomy's labelled points on the brainstem (its sulci and surface features)
  texts      the Wikipedia-derived definition of every exported structure (CC BY-SA 3.0)
Nothing is added or moved by hand: the file only converts what the model contains.
"""
import json
import os
import sys

import bpy
import mathutils

OUT = os.path.join(os.getcwd(), 'pipeline', 'data', 'build', 'brainstem', 'export.json')

PAIRED = ['Midbrain', 'Pons', 'Medulla oblongata', 'Olive', 'Pyramid of medulla oblongata', 'Superior colliculus',
          'Inferior colliculus', 'Base of peduncle', 'Red nucleus', 'Medial geniculate body', 'Lateral geniculate body',
          'Interpeduncular fossa', 'Mamillary body', 'Motor root of trigeminal nerve', 'Sensory root of trigeminal nerve',
          # cranial nerve nuclei
          'Nucleus of oculomotor nerve', 'Accessory nucleus of oculomotor nerve', 'Nucleus of trochlear nerve',
          'Nucleus of abducens nerve', 'Motor nucleus of facial nerve', 'Superior salivatory nucleus',
          'Inferior salivatory nucleus', 'Nucleus ambiguus', 'Posterior nucleus of vagus nerve',
          'Nucleus of hypoglossal nerve', 'Nucleus of solitary tract', 'Nucleus of accessory nerve',
          'Anterior cochlear nucleus', 'Posterior cochlear nucleus', 'Vestibular nuclei']
SINGLE = ['Fourth ventricle', 'Aqueduct of midbrain', 'Third ventricle']
NERVES = ['Oculomotor nerve (III)', 'Trochlear nerve (IV)', 'Trigeminal nerve (V)', 'Abducens nerve (VI)', 'Facial nerve (VII)',
          'Vestibulocochlear nerve (VIII)', 'Glossopharyngeal nerve (IX)', 'Vagus nerve (X)', 'Accessory nerve (XI)',
          'Hypoglossal nerve (XII)']
ARTERIES = ['Basilar artery', 'Vertebral artery', 'Posterior cerebral artery', 'Superior cerebellar artery',
            'Anterior inferior cerebellar artery', 'Posterior inferior cerebellar artery', 'Posterior communicating artery']
PINS = ['Anterior median fissure of medulla oblongata', 'Anterolateral sulcus of medulla oblongata', 'Retro-olivary groove',
        'Posterolateral sulcus of medulla oblongata', 'Posterior median sulcus of medulla oblongata', 'Olive',
        'Pyramid of medulla oblongata', 'Gracile tubercle', 'Cuneate tubercle', 'Trigeminal tubercle',
        'Lateral funiculus of medulla oblongata']


def base_name(n: str) -> str:
    for suf in ('.l', '.r', '.j', '.t', '.g', '.i', '.s'):
        if n.endswith(suf):
            return n[:-len(suf)]
    return n


def ras(p) -> list[float]:
    return [round(-p.x * 1000.0, 3), round(-p.y * 1000.0, 3), round(p.z * 1000.0, 3)]


def mesh_data(o):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = o.evaluated_get(dg)
    m = ev.to_mesh()
    m.calc_loop_triangles()
    verts = [ras(o.matrix_world @ v.co) for v in m.vertices]
    tris = [list(t.vertices) for t in m.loop_triangles]
    ev.to_mesh_clear()
    return verts, tris


def bevel_kd(o):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = o.evaluated_get(dg)
    m = ev.to_mesh()
    vs = [ras(o.matrix_world @ v.co) for v in m.vertices] if len(m.polygons) else []
    ev.to_mesh_clear()
    if not vs:
        return None
    t = mathutils.kdtree.KDTree(len(vs))
    for i, v in enumerate(vs):
        t.insert(v, i)
    t.balance()
    return t


def polylines(o) -> list[list[list[float]]]:
    """Centre lines of a curve object, split into connected runs; each point with the radius of Z-Anatomy's tube
    there (the distance to the nearest vertex of the evaluated bevel surface), 0 without a bevel."""
    tube = bevel_kd(o)
    data = o.data.copy()
    data.bevel_depth = 0.0
    data.extrude = 0.0
    data.bevel_object = None
    tmp = o.copy()
    tmp.data = data
    bpy.context.scene.collection.objects.link(tmp)
    ev = tmp.evaluated_get(bpy.context.evaluated_depsgraph_get())
    m = ev.to_mesh()
    pts = [ras(tmp.matrix_world @ v.co) for v in m.vertices]
    pts = [q + [round(tube.find(q)[2], 3) if tube else 0.0] for q in pts]
    adj: dict[int, list[int]] = {}
    for e in m.edges:
        a, b = e.vertices
        adj.setdefault(a, []).append(b)
        adj.setdefault(b, []).append(a)
    ev.to_mesh_clear()
    bpy.data.objects.remove(tmp)
    bpy.data.curves.remove(data)
    runs, seen = [], set()
    starts = [v for v, n in adj.items() if len(n) != 2] + list(adj)
    for s in starts:
        for nb in adj.get(s, []):
            if (s, nb) in seen:
                continue
            run = [s, nb]
            seen.add((s, nb)); seen.add((nb, s))
            while len(adj[run[-1]]) == 2:
                nxt = [x for x in adj[run[-1]] if x != run[-2]][0]
                if (run[-1], nxt) in seen:
                    break
                seen.add((run[-1], nxt)); seen.add((nxt, run[-1]))
                run.append(nxt)
            runs.append([pts[i] for i in run])
    return runs


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


def text_for(name: str) -> str | None:
    t = bpy.data.texts.get(base_name(name))
    return t.as_string() if t else None


export = {'frame': 'Z-Anatomy model, RAS mm (x = -X, y = -Y, z = Z)', 'meshes': {}, 'lines': {}, 'landmarks': [], 'texts': {}}
names = [f'{b}.{s}' for b in PAIRED for s in 'lr'] + SINGLE
for n in names:
    o = bpy.data.objects.get(n)
    if o is None or o.type != 'MESH':
        print('missing mesh', n)
        continue
    v, t = mesh_data(o)
    export['meshes'][n] = {'verts': v, 'tris': t}
    export['texts'][base_name(n)] = text_for(n)
for kind, group in (('nerve', NERVES), ('artery', ARTERIES)):
    for b in group:
        for n in ([b] if b == 'Basilar artery' else [f'{b}.l', f'{b}.r']):
            o = bpy.data.objects.get(n)
            if o is None or o.type != 'CURVE':
                print('missing curve', n)
                continue
            export['lines'][n] = {'kind': kind, 'runs': polylines(o)}
            export['texts'][base_name(n)] = text_for(n)
for b in PINS:
    o = bpy.data.objects.get(b + '.j')
    if o is None:
        print('missing pin', b)
        continue
    p, hooked = pin_point(o)
    export['landmarks'].append({'name': b, 'ras': ras(p), 'hooked': hooked})
    export['texts'].setdefault(b, text_for(o.name))

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w') as f:
    json.dump(export, f)
print(f"brainstem export: {len(export['meshes'])} meshes, {len(export['lines'])} lines, {len(export['landmarks'])} landmarks -> {OUT}")
sys.stdout.flush()
