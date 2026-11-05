# 噜噜、噜妹（站姿小河马，混元 3D 生成，2026-11-05）：在 Blender 里减面、绑骨（两条腿站的骨架）、加眨眼，出 .blend 和网页用的 GLB。
# 用法（要装 Blender 的 Python 模块 bpy，pip install bpy）：
#   python tools/rig_hippo.py 原始.glb lulu|lumei 输出目录
#   → 输出目录/<who>.blend（骨架 + 权重 + 眨眼 + 几段示范动画，Blender 里打开就能播）、<who>-rig.glb（再压缩成网页用的）
#   压缩：gltf-transform webp <who>-rig.glb w.glb --quality 85 && gltf-transform meshopt w.glb assets/hippo/<who>.glb --level medium
# 骨头名字 hippo.js 要用：root hips spine chest head tail0 tail1，armL/armR 的 _upper _lower，legL/legR 的 _upper _lower _foot
# 坐标（Blender）：z 朝上、脸朝 -y、脚踩 z=0；L 是角色自己的左边（+x）。下面的位置是对着正交正视、侧视图量的。
import sys, math
import bpy, bmesh
import numpy as np
from mathutils import Vector

src, who, outdir = sys.argv[1], sys.argv[2], sys.argv[3].rstrip("/")

CFG = {
    "lulu": dict(
        hips=(0, 0.03, 0.30), spine=(0, 0.03, 0.42), chest=(0, 0.02, 0.54), neck=(0, 0.02, 0.62), top=(0, 0.0, 1.0),
        tail=[(0, 0.25, 0.30), (0, 0.30, 0.29), (0, 0.33, 0.25)],
        arm=[(0.21, 0.0, 0.60), (0.28, -0.01, 0.48), (0.30, -0.03, 0.35)],
        leg=[(0.13, 0.02, 0.30), (0.135, 0.02, 0.15), (0.135, 0.03, 0.06), (0.135, -0.10, 0.03)],
        eyes={"L": ((0.094, 0.85), 0.034, 0.032), "R": ((-0.096, 0.85), 0.034, 0.032)}, eye_front=-0.10,
        skirt=None, armpit=0.50, arm_d=0.075, crease=0.3, reach=1.15,
    ),
    "lumei": dict(
        hips=(0, 0.02, 0.28), spine=(0, 0.02, 0.40), chest=(0, 0.02, 0.52), neck=(0, 0.03, 0.60), top=(0, 0.0, 1.05),
        tail=[(0, 0.24, 0.28), (0, 0.29, 0.28), (0, 0.32, 0.27)],
        arm=[(0.19, -0.01, 0.55), (0.24, -0.04, 0.46), (0.26, -0.05, 0.34)],
        leg=[(0.10, 0.0, 0.28), (0.10, 0.0, 0.15), (0.10, 0.0, 0.06), (0.10, -0.08, 0.03)],
        eyes={"L": ((0.086, 0.82), 0.030, 0.036), "R": ((-0.086, 0.82), 0.030, 0.036)}, eye_front=-0.12,
        skirt=0.19,   # 裙子：这个高度以上、腿柱外面的点不跟着腿走，只跟身子
        armpit=0.47, arm_d=0.07, crease=0.3, reach=1.25,
    ),
}[who]
C = CFG

def ss(e0, e1, v):
    t = np.clip((v - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
obj = [o for o in bpy.context.scene.objects if o.type == "MESH"][0]
obj.name = who
bpy.context.view_layer.objects.active = obj
obj.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# ---------- 焊接 + 减面（5 万面 → 约 2 万面；贴图坐标存在面角上，焊接不影响贴图）----------
bm = bmesh.new(); bm.from_mesh(obj.data)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
bm.to_mesh(obj.data); bm.free()
m = obj.modifiers.new("dec", "DECIMATE"); m.ratio = 0.42
bpy.ops.object.modifier_apply(modifier="dec")
for p in obj.data.polygons: p.use_smooth = True
print("faces", len(obj.data.polygons), "verts", len(obj.data.vertices))

# ---------- 材质：贴图缩小（颜色 2048、法线 1024），去掉粗糙度贴图和过亮的高光 ----------
mat = obj.data.materials[0]
nt = mat.node_tree
bsdf = [n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"][0]
for name, px in (("Base Color", 2048),):
    for l in bsdf.inputs[name].links:
        im = l.from_node.image; im.scale(px, px); print("tex", name, im.size[:])
nmap = [n for n in nt.nodes if n.type == "NORMAL_MAP"]
if nmap:
    for l in nmap[0].inputs["Color"].links:
        im = l.from_node.image; im.scale(1024, 1024); print("tex normal", im.size[:])
for name in ("Metallic", "Roughness"):
    for l in list(bsdf.inputs[name].links): nt.links.remove(l)
bsdf.inputs["Metallic"].default_value = 0.0
bsdf.inputs["Roughness"].default_value = 0.75
bsdf.inputs["Specular IOR Level"].default_value = 0.3
bsdf.inputs["Specular Tint"].default_value = (1, 1, 1, 1)
for n in list(nt.nodes):
    if n.type == "TEX_IMAGE" and not n.outputs[0].links: nt.nodes.remove(n)
mat.use_backface_culling = False


# ---------- 把胳膊和身子切开 ----------
# 混元生成的是一整张连在一起的皮：胳膊垂下来贴着身子的那一长条，胳膊和身子是同一片面连着的，一抬手就扯出一片“翅膀”。
# 找出腋下以下的胳膊（从手尖沿网格往上找，碰到胳膊和身子贴住的那条往里凹的折痕就停），
# 把连着胳膊和身子的那些面删掉，胳膊这边、身子这边的缺口各自补一片，胳膊就能单独抬起来。
def arm_sets(me):
    # 从手尖沿着网格往上找，碰到“往里凹的折痕”（胳膊和身子贴住的那条缝）就停；只找腋下以下、离胳膊骨头不太远的点
    bm_ = bmesh.new(); bm_.from_mesh(me); bm_.verts.ensure_lookup_table(); bm_.edges.ensure_lookup_table()
    P = np.array([v.co[:] for v in bm_.verts])
    res = {}
    for sd, sx in (("L", 1), ("R", -1)):
        da = np.minimum(segdist0(P, *[np.array(p) * [sx, 1, 1] for p in C["arm"][:2]]), segdist0(P, *[np.array(p) * [sx, 1, 1] for p in C["arm"][1:]]))
        ok = (P[:, 2] < C["armpit"]) & (da < C["arm_d"] * C["reach"])
        tip = np.array(C["arm"][2]) * [sx, 1, 1]
        dt = np.linalg.norm(P - tip, axis=1) + (~ok) * 9
        seeds = np.where(dt < dt.min() + 0.03)[0]          # 手尖附近的点都当起点（只用一个点，可能四面都是折痕走不出去）
        keep = np.zeros(len(P), bool); keep[seeds] = True; st = list(seeds)
        while st:
            v = bm_.verts[st.pop()]
            for e in v.link_edges:
                o = e.other_vert(v).index
                if keep[o] or not ok[o]: continue
                if len(e.link_faces) == 2 and e.calc_face_angle_signed(0) < -C["crease"]: continue
                keep[o] = True; st.append(o)
        res[sd] = keep
    bm_.free()
    return res
def segdist0(p, a, b):
    ab = b - a; t = np.clip(((p - a) @ ab) / max(ab @ ab, 1e-12), 0, 1)
    return np.linalg.norm(p - (a + t[:, None] * ab), axis=1)
P0 = np.array([v.co[:] for v in obj.data.vertices])
sets = arm_sets(obj.data)
bm = bmesh.new(); bm.from_mesh(obj.data); bm.verts.ensure_lookup_table()
uvl = bm.loops.layers.uv.active
nV0 = len(bm.verts)
extra_arm = {"L": [], "R": []}
def fan(edges, inward):
    # 一串边界边连到一个中心点上补成一片；中心往 inward 方向缩一点，补出来的面不会鼓出来
    vs = list({v for e in edges for v in e.verts})
    c = sum((v.co for v in vs), Vector()) / len(vs)
    c = c + (inward - c) * 0.15
    cv = bm.verts.new(c)
    uvs = []
    for v in vs:
        for l in v.link_loops: uvs.append(l[uvl].uv.copy()); break
    cuv = sum(uvs, Vector((0, 0))) / max(len(uvs), 1)
    for e in edges:
        f0 = e.link_faces[0]
        # 新面的顶点顺序和旁边原来那个面相反，法线朝向就一致
        l0 = [l for l in f0.loops if l.edge == e][0]
        a_, b_ = l0.vert, l0.link_loop_next.vert
        try: nf = bm.faces.new((b_, a_, cv))
        except ValueError: continue
        nf.smooth = True; nf.material_index = f0.material_index
        for l in nf.loops:
            if l.vert is cv: l[uvl].uv = cuv
            else:
                for l2 in l.vert.link_loops:
                    if l2.face is not nf: l[uvl].uv = l2[uvl].uv; break
    return cv
for sd, A in sets.items():
    inA = lambda v: v.index < len(A) and A[v.index]
    bridge = [f for f in bm.faces if any(inA(v) for v in f.verts) and not all(inA(v) for v in f.verts)
              and all(v.co.z < C["armpit"] for v in f.verts)]
    bmesh.ops.delete(bm, geom=bridge, context="FACES_ONLY")
    bm.verts.ensure_lookup_table()
    bnd = [e for e in bm.edges if e.is_boundary]
    arm_e = [e for e in bnd if all(inA(v) for v in e.verts)]
    body_e = [e for e in bnd if not any(inA(v) for v in e.verts) and all(v.co.z < C["armpit"] + 0.01 for v in e.verts)]
    sx = 1 if sd == "L" else -1
    axis_mid = Vector(C["arm"][1]) * Vector((sx, 1, 1))
    if arm_e: extra_arm[sd].append(fan(arm_e, axis_mid))
    if body_e: fan(body_e, Vector((0, C["chest"][1], C["spine"][2])))
    print("arm", sd, "verts", int(A.sum()), "cut faces", len(bridge), "patched edges arm/body", len(arm_e), len(body_e))
    bm.verts.index_update(); bm.verts.ensure_lookup_table()
# 补洞时新加的点：胳膊那边的中心点也算胳膊
nNew = len(bm.verts)
for sd in sets:
    A = np.zeros(nNew, bool); A[:len(sets[sd])] = sets[sd]
    for v in extra_arm[sd]: A[v.index] = True
    sets[sd] = A
bm.normal_update()
bm.to_mesh(obj.data); bm.free()

# ---------- 骨架 ----------
arm_data = bpy.data.armatures.new(who + "_rig")
rig = bpy.data.objects.new(who + "_rig", arm_data)
bpy.context.scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode="EDIT")
eb = arm_data.edit_bones
def bone(name, head, tail, parent=None, connect=False):
    b = eb.new(name); b.head = Vector(head); b.tail = Vector(tail)
    if parent: b.parent = eb[parent]; b.use_connect = connect
    return b
C = CFG
bone("root", (0, 0, 0), (0, 0.15, 0)).use_deform = False
bone("hips", C["hips"], C["spine"], "root")
bone("spine", C["spine"], C["chest"], "hips", True)
bone("chest", C["chest"], C["neck"], "spine", True)
bone("head", C["neck"], C["top"], "chest", True)
bone("tail0", C["tail"][0], C["tail"][1], "hips")
bone("tail1", C["tail"][1], C["tail"][2], "tail0", True)
for side, sx in (("L", 1), ("R", -1)):
    A = [(x * sx, y, z) for x, y, z in C["arm"]]
    bone(f"arm{side}_upper", A[0], A[1], "chest")
    bone(f"arm{side}_lower", A[1], A[2], f"arm{side}_upper", True)
    G = [(x * sx, y, z) for x, y, z in C["leg"]]
    bone(f"leg{side}_upper", G[0], G[1], "hips")
    bone(f"leg{side}_lower", G[1], G[2], f"leg{side}_upper", True)
    bone(f"leg{side}_foot", G[2], G[3], f"leg{side}_lower", True)
for b in eb: b.roll = 0
bpy.ops.object.mode_set(mode="OBJECT")

# ---------- 自动权重（Blender 的骨热度法），然后修：没分到的点按最近的骨头补，裙子不跟腿 ----------
bpy.ops.object.select_all(action="DESELECT")
obj.select_set(True); rig.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.parent_set(type="ARMATURE_AUTO")

deform = [b.name for b in arm_data.bones if b.use_deform]
segs = {b.name: (np.array(b.head_local), np.array(b.tail_local)) for b in arm_data.bones if b.use_deform}
P = np.array([v.co[:] for v in obj.data.vertices])
nV = len(P)
W = np.zeros((nV, len(deform)))
gi = {g.index: deform.index(g.name) for g in obj.vertex_groups if g.name in deform}
for v in obj.data.vertices:
    for g in v.groups:
        if g.group in gi: W[v.index, gi[g.group]] = g.weight
def segdist(p, a, b):
    ab = b - a; t = np.clip(((p - a) @ ab) / max(ab @ ab, 1e-12), 0, 1)
    return np.linalg.norm(p - (a + t[:, None] * ab), axis=1)
D = np.stack([segdist(P, *segs[n]) for n in deform], 1)
empty = W.sum(1) < 1e-3
W[empty] = 0
W[empty, D[empty].argmin(1)] = 1
print("verts without weights fixed:", int(empty.sum()))
x, y, z = P[:, 0], P[:, 1], P[:, 2]
if C["skirt"] is not None:
    lx = abs(C["leg"][0][0])
    r = np.hypot(np.abs(x) - lx, y - C["leg"][1][1])
    off = ss(C["skirt"] - 0.02, C["skirt"] + 0.02, z) * ss(0.07, 0.10, r)   # 1 = 裙子（不跟腿）
    legcols = [i for i, n in enumerate(deform) if n.startswith("leg")]
    moved = W[:, legcols].sum(1) * off
    W[:, legcols] *= (1 - off)[:, None]
    W[:, deform.index("hips")] += moved
# 胳膊：腋下以下只跟胳膊走（上面切开以后，胳膊是单独一块）；身子上离手近的点（短裤、裙子）不跟胳膊
below = z < C["armpit"]
# 用切开时找到的胳膊点（切开只删面、在后面追加补洞的点，原来的点编号不变）
sets = {sd: np.concatenate([A, np.zeros(nV - len(A), bool)]) for sd, A in sets.items()}
for sd in "LR":
    cols_ = [deform.index(f"arm{sd}_upper"), deform.index(f"arm{sd}_lower")]
    inarm = sets[sd]
    print("arm", sd, "weighted verts:", int(inarm.sum()))
    cut_ = below & ~inarm
    Wc = W[cut_]; Wc[:, cols_] = 0; W[cut_] = Wc
    Wa = W[inarm]; keep = np.zeros(len(deform), bool); keep[cols_] = True
    Wa[:, ~keep] = 0; Wa[Wa.sum(1) < 1e-6, cols_[1]] = 1; W[inarm] = Wa
W = np.where(W.sum(1, keepdims=True) < 1e-6, np.eye(len(deform))[deform.index("hips")], W)
# 脑袋以上（含头顶小橘子、帽子）整块跟头走，不被胳膊拉
headw = ss(C["neck"][2] + 0.03, C["neck"][2] + 0.10, z)
W *= (1 - headw)[:, None]; W[:, deform.index("head")] += headw
# 每个点最多 4 根骨头，归一化
order = np.argsort(-W, 1)
W[np.arange(nV)[:, None], order[:, 4:]] = 0
W /= W.sum(1, keepdims=True)
for g in list(obj.vertex_groups): obj.vertex_groups.remove(g)
for j, n in enumerate(deform):
    g = obj.vertex_groups.new(name=n)
    for wv in np.unique(np.round(W[:, j], 3)):
        if wv <= 0: continue
        g.add([int(i) for i in np.where(np.round(W[:, j], 3) == wv)[0]], float(wv), "REPLACE")

# ---------- 眨眼：眼睛一圈往下眼皮线收拢，画在贴图上的眼睛压成一条缝 ----------
obj.shape_key_add(name="Basis")
for side, ((cx, cz), rx, rz) in C["eyes"].items():
    d = ((x - cx) / (rx * 1.4)) ** 2 + ((z - cz) / (rz * 1.6)) ** 2
    k = np.where((y < C["eye_front"]) & (d < 1), 0.95 * ss(1.0, 0.45, d), 0)
    lid = cz - 0.35 * rz
    sk = obj.shape_key_add(name="blink" + side, from_mix=False)
    co = P.copy(); co[:, 2] += (lid - z) * k
    sk.data.foreach_set("co", co.ravel())
    sk.value = 0.0
    print("blink", side, "verts", int((k > 0).sum()))

# ---------- 示范动画（只放在 .blend 里给人看；网页上的动作在 hippo.js 里实时算）----------
from math import radians
from mathutils import Quaternion
# 转动都按“世界方向的轴”写：x 轴 = 左右（正 = 往前抬/低头）、y 轴 = 前后（正 = 往角色右边歪）、z 轴 = 竖直（正 = 往左转）
AX = {"x": Vector((1, 0, 0)), "y": Vector((0, 1, 0)), "z": Vector((0, 0, 1))}
def local_q(pb, ax, deg):
    R = pb.bone.matrix_local.to_3x3()
    world = Quaternion(AX[ax] * (1 if ax != "x" else -1), radians(deg))   # Blender 里脸朝 -y：绕 -x 转正角 = 往前抬
    return (R.inverted() @ world.to_matrix() @ R).to_quaternion()
def act(name, keys):
    rig.animation_data_create()
    a = bpy.data.actions.new(name); rig.animation_data.action = a
    for f, pose in keys:
        for pb in rig.pose.bones: pb.rotation_mode = "QUATERNION"; pb.rotation_quaternion = (1, 0, 0, 0)
        for bn, rots in pose.items():
            q = Quaternion()
            for ax, deg in rots: q = local_q(rig.pose.bones[bn], ax, deg) @ q
            rig.pose.bones[bn].rotation_quaternion = q
        for pb in rig.pose.bones: pb.keyframe_insert("rotation_quaternion", frame=f)
    a.use_fake_user = True
    return a
walk = lambda s: {"legL_upper": [("x", 25 * s)], "legR_upper": [("x", -25 * s)], "legL_lower": [("x", -12 * max(0, -s))],
                  "legR_lower": [("x", -12 * max(0, s))], "armL_upper": [("x", -20 * s)], "armR_upper": [("x", 20 * s)],
                  "hips": [("z", 5 * s)], "chest": [("z", -4 * s)]}
act("walk", [(1, walk(1)), (13, walk(-1)), (25, walk(1))])
# 挥右手：右臂往外侧抬起来（绕 y 轴，往角色右边是正），小臂左右摆
wave = lambda s: {"armR_upper": [("y", 130)], "armR_lower": [("y", 15 + 25 * s)], "head": [("y", -8)]}
act("wave", [(1, {}), (8, wave(1)), (16, wave(-1)), (24, wave(1)), (32, wave(-1)), (40, {})])
rig.animation_data.action = bpy.data.actions["walk"]
bpy.context.scene.frame_start, bpy.context.scene.frame_end = 1, 24
# 贴图打包进 .blend（缩小后的），打开就有颜色
for im in bpy.data.images:
    if im.users: im.pack()
bpy.ops.wm.save_as_mainfile(filepath=f"{outdir}/{who}.blend", compress=True)
# 导出网页用的：静止姿势，不带动画
rig.animation_data.action = None
for pb in rig.pose.bones: pb.rotation_quaternion = (1, 0, 0, 0)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(filepath=f"{outdir}/{who}-rig.glb", export_format="GLB", export_skins=True, export_morph=True,
                          export_animations=False, export_yup=True, export_image_format="JPEG", export_jpeg_quality=90,
                          export_normals=True, export_tangents=False)
print("done")
