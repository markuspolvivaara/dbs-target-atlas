"""Export the skull-base section's anatomy from the Z-Anatomy Blender file (runs inside Blender).

Usage (from the repository root):
  .tools/Blender.app/Contents/MacOS/Blender --factory-startup -b -noaudio \
      pipeline/data/raw/zanatomy/Z-Anatomy/Startup.blend --python pipeline/skullbase_export.py

Writes pipeline/data/build/skullbase/export.json with, in RAS millimetres relative to the
hypophysial fossa landmark (Z-Anatomy: +X = patient left, -Y = anterior, +Z = superior, metres):
  bones      cranial bones as triangle meshes
  soft       soft-tissue meshes (cavernous sinus, pituitary, tentorium, falx, optic chiasm)
  lines      arteries, veins and cranial nerves as centre-line polylines (cropped to the head), each point with
             the tube radius Z-Anatomy models there (its curve bevel), as [x, y, z, radius]
  landmarks  Z-Anatomy's labelled points on the cranial bones, with their collection path
  texts      the Wikipedia-derived definition of every exported structure (CC BY-SA 3.0)
Nothing is added or moved by hand: the file only converts what the model contains.
"""
import json
import math
import os
import re
import sys

import bpy
import mathutils
from mathutils.bvhtree import BVHTree

OUT = os.path.join(os.getcwd(), 'pipeline', 'data', 'build', 'skullbase', 'export.json')
ORIGIN_PIN = 'Hypophysial fossa.j'
HEAD_MARGIN_MM = 15.0  # keep geometry within the cranial bounding box plus this margin
NECK_MM = 45.0         # and down to this far below the lowest cranial bone (craniocervical junction)
LANDMARK_MAX_MM = 8.0   # an unhooked landmark must lie within this distance of a cranial bone
HOOKED_MAX_MM = 20.0    # a landmark hooked to a cranial bone (opening centres lie away from the rim)
BONE_SUBDIV = 1         # one Catmull-Clark level removes the facets of the low-poly bones...
BONE_KEEP = 0.42        # ...then quadric decimation keeps this share of its triangles (about 2.5x the original)
AO_RAYS = 24            # ambient occlusion baked per bone vertex: rays over the outward hemisphere
AO_DIST_MM = 12.0       # occluders farther than this are ignored
# landmarks are Z-Anatomy's skeletal labels; group labels (those with a '.g' heading object), teeth,
# ossicle parts and vertebral landmarks are left out
SKIP_LANDMARKS = ('tooth', 'teeth', 'dental', 'malleus', 'incus', 'stapes', 'ossicle', 'atlas', 'axis', 'dens ', 'cusp', 'root apex',
                  'mandib', 'hyoid', 'transverse process', 'mental ', 'genion', 'gnathion', 'mylohyoid', 'vertebra',
                  'spinal nerve', 'ligament tubercle', 'thyroid', 'sublingual', 'digastric')

parent: dict[str, str] = {}


def _walk(c):
    for ch in c.children:
        parent[ch.name] = c.name
        _walk(ch)


_walk(bpy.context.scene.collection)


def paths(o) -> list[list[str]]:
    """Collection paths of an object, innermost first."""
    out = []
    for c in o.users_collection:
        p = [c.name]
        while p[-1] in parent:
            p.append(parent[p[-1]])
        out.append(p)
    return out


def under(o, name: str) -> list[str] | None:
    """The most specific collection path of an object below collection `name` (innermost first)."""
    found = [p[:p.index(name)] for p in paths(o) if name in p]
    return max(found, key=len) if found else None


def base_name(n: str) -> str:
    for suf in ('.l', '.r', '.j', '.t', '.g', '.i', '.s'):
        if n.endswith(suf):
            return n[:-len(suf)]
    return n


# ---------------------------------------------------------------- frame
pin = bpy.data.objects[ORIGIN_PIN]
# the bone meshes live directly in the 'Cranium' collection (their landmarks in the 'Bones of cranium' tree);
# teeth, ossicles and nasal cartilages are left out
SKIP_BONES = ('tooth', 'incisor', 'canine', 'molar', 'cartilage', 'malleus', 'incus', 'stapes')
bones = [o for o in bpy.data.collections['Cranium'].objects
         if o.type == 'MESH' and len(o.data.vertices) > 50 and not any(k in o.name.lower() for k in SKIP_BONES)]
bone_names = {o.name for o in bones}
def _eval_pts(o):
    ev = o.evaluated_get(bpy.context.evaluated_depsgraph_get())
    m = ev.to_mesh()
    pts = [o.matrix_world @ v.co for v in m.vertices]
    ev.to_mesh_clear()
    return pts


bone_pts = [p for o in bones for p in _eval_pts(o)]
kd = mathutils.kdtree.KDTree(len(bone_pts))
for i, p in enumerate(bone_pts):
    kd.insert(p, i)
kd.balance()


def _bvh(o) -> BVHTree:
    """BVH of the evaluated mesh: some bones are stored as one half plus a Mirror modifier."""
    ev = o.evaluated_get(bpy.context.evaluated_depsgraph_get())
    m = ev.to_mesh()
    t = BVHTree.FromPolygons([o.matrix_world @ v.co for v in m.vertices], [list(pl.vertices) for pl in m.polygons])
    ev.to_mesh_clear()
    return t


bvh = {o.name: _bvh(o) for o in bones}


def surface(p) -> tuple[str, float]:
    """Nearest cranial bone surface to a point: (bone, distance in metres)."""
    best = min(((n, t.find_nearest(p)[3]) for n, t in bvh.items()), key=lambda x: x[1] if x[1] is not None else 9)
    return best


def pin_point(o) -> tuple[mathutils.Vector, str | None]:
    """A landmark is a 2-vertex line from its text label to the structure. The structure end is the
    vertex held by the line's Hook modifier, whose target object is the bone it belongs to; the hook
    moves that vertex at evaluation time, so the evaluated mesh gives its real position.
    Returns (point, hooked object name). Without a hook: the upper end and no owner."""
    ev = o.evaluated_get(bpy.context.evaluated_depsgraph_get())
    m = ev.to_mesh()
    pts = [ev.matrix_world @ v.co for v in m.vertices]
    ev.to_mesh_clear()
    for md in o.modifiers:
        if md.type == 'HOOK' and md.object is not None and len(md.vertex_indices):
            return pts[md.vertex_indices[0]], md.object.name
    return max(pts, key=lambda p: p.z), None


BONE_WORDS = {'sphenoid': 'Sphenoid bone', 'occipital bone': 'Occipital bone', 'temporal bone': 'Temporal bone',
              'petrous': 'Temporal bone', 'mastoid': 'Temporal bone', 'frontal bone': 'Frontal bone',
              'parietal bone': 'Parietal bone', 'ethmoid': 'Ethmoid bone'}


def bone_for(name: str, path: list[str] | None, nearest: str) -> tuple[str, str]:
    """(bone, how it was assigned): from the landmark's name, else its Z-Anatomy collection, else nearest surface."""
    low = name.lower()
    m = re.search(r'of (?:the )?(sphenoid|occipital|temporal|frontal|parietal|ethmoid) bone', low)
    if m:  # 'Sphenoidal angle of parietal bone' belongs to the parietal bone
        return m.group(1).capitalize() + ' bone', 'name'
    for w, b in BONE_WORDS.items():
        if w in low:
            return b, 'name'
    if path:
        return path[-1], 'collection'
    return (nearest.split('.')[0] if nearest else ''), 'nearest surface'


origin = pin_point(pin)[0]


def ras(p) -> list[float]:
    d = (p - origin) * 1000.0
    return [round(-d.x, 3), round(-d.y, 3), round(d.z, 3)]


lo = [min(ras(p)[i] for p in bone_pts) for i in range(3)]
hi = [max(ras(p)[i] for p in bone_pts) for i in range(3)]
box_lo = [lo[0] - HEAD_MARGIN_MM, lo[1] - HEAD_MARGIN_MM, lo[2] - NECK_MM]
box_hi = [hi[0] + HEAD_MARGIN_MM, hi[1] + HEAD_MARGIN_MM, hi[2] + HEAD_MARGIN_MM]


def inside(q) -> bool:
    return all(box_lo[i] <= q[i] <= box_hi[i] for i in range(3))


def mesh_data(o, smooth: bool = False):
    """Triangles of the evaluated mesh in RAS mm. smooth: one subdivision level then decimation (bones), with the
    world-space vertex normals for the occlusion bake."""
    added = []
    if smooth:
        sub = o.modifiers.new('export_subdiv', 'SUBSURF')
        sub.levels = sub.render_levels = BONE_SUBDIV
        dec = o.modifiers.new('export_decimate', 'DECIMATE')
        dec.ratio = BONE_KEEP
        added = [sub, dec]
    dg = bpy.context.evaluated_depsgraph_get()
    ev = o.evaluated_get(dg)
    m = ev.to_mesh()
    m.calc_loop_triangles()
    W = o.matrix_world
    world = [W @ v.co for v in m.vertices]
    nrm = [(W.to_3x3() @ v.normal).normalized() for v in m.vertices]
    verts = [ras(p) for p in world]
    tris = [list(t.vertices) for t in m.loop_triangles]
    ev.to_mesh_clear()
    for md in added:
        o.modifiers.remove(md)
    return (verts, tris, world, nrm) if smooth else (verts, tris)


def _hemisphere(n: int) -> list[mathutils.Vector]:
    """n cosine-weighted directions over the +Z hemisphere (Fibonacci spiral)."""
    out = []
    for i in range(n):
        r = math.sqrt((i + 0.5) / n)
        a = i * math.pi * (3 - math.sqrt(5))
        out.append(mathutils.Vector((r * math.cos(a), r * math.sin(a), math.sqrt(max(0.0, 1 - r * r)))))
    return out


def bake_ao(meshes: dict) -> dict:
    """Ambient occlusion per bone vertex: the share of hemisphere rays (around the vertex normal) that reach
    AO_DIST_MM without hitting any cranial bone. 1 = open, 0 = enclosed."""
    allv, allf = [], []
    for v_world, tris in ((m[2], m[1]) for m in meshes.values()):
        off = len(allv)
        allv += v_world
        allf += [[a + off, b + off, c + off] for a, b, c in tris]
    tree = BVHTree.FromPolygons(allv, allf)
    dirs = _hemisphere(AO_RAYS)
    dist = AO_DIST_MM / 1000.0
    out = {}
    for name, (_, _, world, nrm) in meshes.items():
        ao = []
        for p, n in zip(world, nrm):
            q = n.to_track_quat('Z', 'Y')
            o = p + n * 0.00005
            hits = sum(1 for d in dirs if tree.ray_cast(o, q @ d, dist)[0] is not None)
            ao.append(round(1 - hits / AO_RAYS, 3))
        out[name] = ao
    return out


def bevel_kd(o):
    """KD-tree (RAS mm) of the curve's evaluated tube surface, or None when it has no thickness."""
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
    """Centre lines of a curve object, split into connected runs and cropped to the head. Each point carries the
    radius of Z-Anatomy's tube there: the distance to the nearest vertex of the evaluated bevel surface (the
    tube's rings lie at that radius around the centre line); 0 when the curve has no bevel."""
    tube = bevel_kd(o)
    data = o.data.copy()
    data.bevel_depth = 0.0
    data.extrude = 0.0
    data.bevel_object = None
    tmp = o.copy()
    tmp.data = data
    bpy.context.scene.collection.objects.link(tmp)
    dg = bpy.context.evaluated_depsgraph_get()
    ev = tmp.evaluated_get(dg)
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
    out = []
    for r in runs:  # crop: keep the parts inside the head box
        cur = []
        for q in r:
            if inside(q):
                cur.append(q)
            elif cur:
                if len(cur) > 1:
                    out.append(cur)
                cur = []
        if len(cur) > 1:
            out.append(cur)
    return out


def text_for(name: str) -> str | None:
    t = bpy.data.texts.get(base_name(name))
    return t.as_string() if t else None


export = {'origin': {'pin': ORIGIN_PIN, 'note': 'RAS mm relative to the hypophysial fossa landmark'},
          'box': [box_lo, box_hi], 'bones': {}, 'soft': {}, 'lines': {}, 'landmarks': [], 'texts': {}}

smooth = {o.name: mesh_data(o, smooth=True) for o in bones}
ao = bake_ao(smooth)
for o in bones:
    v, t = smooth[o.name][:2]
    export['bones'][o.name] = {'verts': v, 'tris': t, 'ao': ao[o.name]}
    export['texts'][base_name(o.name)] = text_for(o.name)

MESH_VESSELS = ['Anterior communicating artery']
EXTRA_TEXTS = ['Mandibular nerve']
SOFT = ['Cavernous sinus.l', 'Cavernous sinus.r', 'Adenohypophysis', 'Neurohypophysis', 'Tentorium cerebelli.l',
        'Tentorium cerebelli.r', 'Falx cerebri', 'Optic chiasm.l', 'Optic chiasm.r']
for n in SOFT:
    o = bpy.data.objects.get(n)
    if o is None or o.type not in ('MESH', 'CURVE'):
        continue
    if o.type == 'CURVE':
        export['lines'][n] = {'kind': 'vein' if 'sinus' in n.lower() else 'nerve', 'runs': polylines(o)}
    else:
        v, t = mesh_data(o)
        export['soft'][n] = {'verts': v, 'tris': t}
    export['texts'][base_name(n)] = text_for(n)

for o in bpy.data.objects:
    if o.type != 'CURVE':
        continue
    kind = ('artery' if under(o, 'Systemic arteries') is not None else
            'vein' if under(o, 'Systemic veins') is not None else
            'nerve' if under(o, 'Cranial nerves') is not None else None)
    if kind is None or under(o, 'Head') is None:
        continue
    runs = polylines(o)
    if not runs:
        continue
    tree = under(o, {'artery': 'Systemic arteries', 'vein': 'Systemic veins', 'nerve': 'Cranial nerves'}[kind]) or []
    export['lines'][o.name] = {'kind': kind, 'runs': runs, 'path': tree}
    export['texts'][base_name(o.name)] = text_for(o.name)

# vessels modelled as meshes, not curves (the anterior communicating artery): a centre line along the mesh's long
# axis, with its mean distance from that axis as the radius
for name in MESH_VESSELS:
    o = bpy.data.objects.get(name)
    if o is None or o.type != 'MESH':
        continue
    vs = [ras(o.matrix_world @ v.co) for v in o.data.vertices]
    n = len(vs)
    c = [sum(v[i] for v in vs) / n for i in range(3)]
    cov = mathutils.Matrix([[sum((v[i] - c[i]) * (v[j] - c[j]) for v in vs) / n for j in range(3)] for i in range(3)])
    axis = mathutils.Vector((1.0, 0.0, 0.0))
    for _ in range(50):                                   # power iteration: the long axis
        axis = (cov @ axis).normalized()
    t = [sum((v[i] - c[i]) * axis[i] for i in range(3)) for v in vs]
    lo, hi = min(t), max(t)
    r = sum(((sum((v[i] - c[i]) ** 2 for i in range(3))) - tt * tt) ** 0.5 for v, tt in zip(vs, t)) / n
    run = [[round(c[i] + (lo + (hi - lo) * k / 4) * axis[i], 3) for i in range(3)] + [round(r, 3)] for k in range(5)]
    export['lines'][name] = {'kind': 'artery', 'runs': [run], 'path': under(o, 'Systemic arteries') or []}
    export['texts'][base_name(name)] = text_for(name)
for name in EXTRA_TEXTS:   # definitions for structures merged under these names in the build
    export['texts'][name] = text_for(name)

for o in bpy.data.objects:
    if not (o.name.endswith('.j') and o.type == 'MESH' and len(o.data.vertices) == 2):
        continue
    if not any('1: Skeletal system' in pth for pth in paths(o)):
        continue
    if o.name[:-2] + '.g' in bpy.data.objects or any(k in o.name.lower() for k in SKIP_LANDMARKS):
        continue
    path = under(o, 'Bones of cranium')
    p, hooked = pin_point(o)
    q = ras(p)
    near, d_m = surface(p)
    dist = d_m * 1000.0
    # a point hooked to a cranial bone belongs to it even when it marks the centre of an opening
    # (foramen magnum: 15 mm from the rim); unhooked points must lie on a bone
    limit = HOOKED_MAX_MM if hooked in bone_names else LANDMARK_MAX_MM
    if not inside(q) or dist > limit:
        if inside(q):
            export.setdefault('skippedLandmarks', []).append({'name': o.name[:-2], 'distanceToBoneMm': round(dist, 1)})
        continue  # only points on, or close to, a cranial bone
    if hooked in bone_names:
        bone, how = hooked.split('.')[0], 'hook'
    else:
        bone, how = bone_for(o.name[:-2], path, near)
    export['landmarks'].append({'name': o.name[:-2], 'ras': q, 'path': path, 'bone': bone, 'boneFrom': how, 'nearestSurface': near,
                                'pinEnds': [ras(o.matrix_world @ v.co) for v in o.data.vertices],
                                'distanceToBoneMm': round(dist, 2)})
    export['texts'][o.name[:-2]] = text_for(o.name)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w') as f:
    json.dump(export, f)
print(f"skull base export: {len(export['bones'])} bones, {len(export['soft'])} soft meshes, "
      f"{len(export['lines'])} line structures, {len(export['landmarks'])} landmarks -> {OUT}")
sys.stdout.flush()
