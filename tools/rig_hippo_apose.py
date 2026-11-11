# 噜噜（2026-11-10 的新模型：胳膊平举、两腿分开站的那版）绑骨。和 rig_hippo.py 的区别：
# 新模型四肢本来就和身子分开，不用切；权重按位置直接算（不用 Blender 的自动权重），再把胳膊放下来当作静止姿势。
# 用法（pip install bpy scipy）：
#   python tools/rig_hippo_apose.py 低模.blend lulu 输出目录
#   低模.blend：修好的高模减到约 3.6 万面、颜色和法线烘到新贴图后的文件（做法见 assets/hippo/SOURCE.md）
#   → 输出目录/<who>.blend（骨架 + 权重 + 眨眼 + 示范动画）、<who>-rig.glb（再压缩成网页用的，命令同 rig_hippo.py）
# 骨头名字和 rig_hippo.py 一样（hippo.js 要用），多了 armL_hand / armR_hand（手腕，现在没用到）。
# 坐标（Blender）：z 朝上、脸朝 -y、脚踩 z=0；L 是角色自己的左边（+x）。下面的位置按原模型大小（身高 1.164）量的，最后统一缩到 S 倍。
import sys, math
import bpy, numpy as np
import scipy.sparse as sp
from scipy import ndimage
from mathutils import Vector, Quaternion

src, who, outdir = sys.argv[1], sys.argv[2], sys.argv[3].rstrip("/")
S = 0.97                     # 缩到和旧模型一样高（约 1.13）
ARM_DOWN = math.radians(58)  # 静止时胳膊从平举往下放多少
CFG = {
    "lulu": dict(
        hips=(0, 0.0, 0.29), spine=(0, 0.0, 0.40), chest=(0, 0.0, 0.50), neck=(0, 0.0, 0.62), top=(0, 0.0, 1.05),
        tail=[(0, 0.19, 0.35), (0, 0.225, 0.35), (0, 0.26, 0.35)],
        arm=[(0.195, 0.033, 0.60), (0.31, 0.033, 0.60), (0.41, 0.033, 0.60), (0.52, 0.033, 0.60)],   # 肩、肘、腕、指尖
        leg=[(0.09, 0.01, 0.27), (0.09, 0.01, 0.15), (0.09, 0.01, 0.06), (0.09, -0.11, 0.02)],          # 髋、膝、踝、脚尖
        arm_z=(0.50, 0.685), head_x=0.245, crotch=0.20, eye_z=(0.84, 1.0),
    ),
}[who]
C = CFG
def ss(e0, e1, v):
    t = np.clip((v - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)

bpy.ops.wm.open_mainfile(filepath=src)
obj = [o for o in bpy.context.scene.objects if o.type == "MESH"][0]
obj.name = who
me = obj.data
nV = len(me.vertices)
P = np.empty(nV * 3); me.vertices.foreach_get("co", P); P = P.reshape(-1, 3)
x, y, z = P[:, 0], P[:, 1], P[:, 2]; ax = np.abs(x)

# ---------- 贴图：烘焙时没照到的黑点（手指缝里）用旁边的颜色补上 ----------
mat = me.materials[0]; nt = mat.node_tree
col = [n.image for n in nt.nodes if n.type == "TEX_IMAGE" and "color" in n.image.name][0]
w_, h_ = col.size; px = np.empty(w_ * h_ * 4, np.float32); col.pixels.foreach_get(px); px = px.reshape(h_, w_, 4)
hole = px[:, :, :3].max(2) < 0.02
idx = ndimage.distance_transform_edt(hole, return_distances=False, return_indices=True)
px[:, :, :3] = px[idx[0], idx[1], :3]; col.pixels.foreach_set(px.ravel()); col.update(); col.pack()
print("texture holes filled:", int(hole.sum()))

# ---------- 权重：按位置算 ----------
names = ["hips", "spine", "chest", "head", "tail0", "tail1"]
for sd in "LR": names += [f"arm{sd}_upper", f"arm{sd}_lower", f"arm{sd}_hand", f"leg{sd}_upper", f"leg{sd}_lower", f"leg{sd}_foot"]
W = np.zeros((nV, len(names))); I = {n: i for i, n in enumerate(names)}
sh, el, wr = C["arm"][0][0], C["arm"][1][0], C["arm"][2][0]
arm_all = {}
for sd, sx in (("L", 1), ("R", -1)):
    xs = x * sx
    # 胳膊这一条：靠近肩膀的一段按高度和头、身子分开（头在它上面）；再往外（比头还宽的地方）整个都是胳膊和手
    inarm = ((z > C["arm_z"][0]) & (z < C["arm_z"][1]) & (xs > sh - 0.02)) | ((xs > C["head_x"]) & (z > 0.40) & (z < 0.80))
    a = ss(sh - 0.012, sh + 0.045, xs) * inarm                                  # 肩膀一圈从胸过渡到胳膊
    lo = ss(el - 0.03, el + 0.03, xs); hd = ss(wr - 0.02, wr + 0.02, xs)
    W[:, I[f"arm{sd}_upper"]] = a * (1 - lo); W[:, I[f"arm{sd}_lower"]] = a * lo * (1 - hd); W[:, I[f"arm{sd}_hand"]] = a * lo * hd
    arm_all[sd] = a
    side = np.maximum(ss(0.0, 0.06, xs), ss(C["crotch"] + 0.01, C["crotch"] - 0.03, z) * (xs > 0))   # 裤裆正中归屁股，裤裆以下整条腿归腿
    g = ss(0.33, 0.21, z) * side
    kn = ss(0.18, 0.12, z); ft = ss(0.085, 0.045, z)
    W[:, I[f"leg{sd}_upper"]] = g * (1 - kn); W[:, I[f"leg{sd}_lower"]] = g * kn * (1 - ft); W[:, I[f"leg{sd}_foot"]] = g * kn * ft
tl = ss(0.195, 0.215, y) * (z > 0.29) * (z < 0.41) * (ax < 0.06)                 # 尾巴球
t1 = ss(0.215, 0.245, y)
limb = W.sum(1)
body = np.clip(1 - limb, 0, 1)
W[:, I["tail0"]] = tl * (1 - t1); W[:, I["tail1"]] = tl * t1
# 尾巴不跟腿
for n in names:
    if n.startswith("leg"): W[:, I[n]] *= (1 - tl)
body = np.clip(1 - W.sum(1), 0, 1)
hd_ = ss(C["neck"][2] - 0.02, C["neck"][2] + 0.025, z)
ch = ss(0.42, 0.52, z); spn = ss(0.30, 0.40, z)
W[:, I["head"]] = body * hd_
W[:, I["chest"]] = body * (1 - hd_) * ch
W[:, I["spine"]] = body * (1 - hd_) * (1 - ch) * spn
W[:, I["hips"]] = body * (1 - hd_) * (1 - ch) * (1 - spn)
# 沿网格抹两遍，过渡更顺
tri = np.empty(len(me.polygons) * 3, np.int32); me.polygons.foreach_get("vertices", tri); tri = tri.reshape(-1, 3)
i_ = np.concatenate([tri[:, 0], tri[:, 1], tri[:, 2], tri[:, 1], tri[:, 2], tri[:, 0]]); j_ = np.concatenate([tri[:, 1], tri[:, 2], tri[:, 0], tri[:, 0], tri[:, 1], tri[:, 2]])
A = sp.csr_matrix((np.ones(len(i_)), (i_, j_)), shape=(nV, nV)); A.data[:] = 1; A = sp.diags(1 / np.maximum(np.asarray(A.sum(1)).ravel(), 1)) @ A
for k in range(3): W = 0.5 * W + 0.5 * (A @ W)
order = np.argsort(-W, 1); W[np.arange(nV)[:, None], order[:, 4:]] = 0; W /= W.sum(1, keepdims=True)
print("weights: verts per bone", {n: int((W[:, I[n]] > 0.5).sum()) for n in names})

# ---------- 把胳膊放下来当静止姿势（按权重直接算出放下后的形状，骨架也按放下后的位置建）----------
def rot_y(p, piv, ang):   # 绕过 piv、前后方向（y 轴）的直线转；ang > 0 时 +x 一侧往下
    c, s = np.cos(ang), np.sin(ang); d = p - piv; q = d.copy()
    q[..., 0] = d[..., 0] * c + d[..., 2] * s; q[..., 2] = -d[..., 0] * s + d[..., 2] * c
    return q + piv
P2 = P.copy(); armJ = {}
for sd, sx in (("L", 1), ("R", -1)):
    piv = np.array(C["arm"][0]) * [sx, 1, 1]
    wa = W[:, [I[f"arm{sd}_upper"], I[f"arm{sd}_lower"], I[f"arm{sd}_hand"]]].sum(1)[:, None]
    P2 += wa * (rot_y(P, piv, ARM_DOWN * sx) - P)
    armJ[sd] = [rot_y(np.array(p) * [sx, 1, 1], piv, ARM_DOWN * sx) for p in C["arm"]]
P2 *= S
me.vertices.foreach_set("co", P2.ravel()); me.update()
sc = lambda p: tuple(np.array(p) * S)

# ---------- 骨架 ----------
arm_data = bpy.data.armatures.new(who + "_rig")
rig = bpy.data.objects.new(who + "_rig", arm_data)
bpy.context.scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode="EDIT")
eb = arm_data.edit_bones
def bone(name, head, tail, parent=None, connect=False):
    b = eb.new(name); b.head = Vector(sc(head)); b.tail = Vector(sc(tail))
    if parent: b.parent = eb[parent]; b.use_connect = connect
    return b
bone("root", (0, 0, 0), (0, 0.15, 0)).use_deform = False
bone("hips", C["hips"], C["spine"], "root")
bone("spine", C["spine"], C["chest"], "hips", True)
bone("chest", C["chest"], C["neck"], "spine", True)
bone("head", C["neck"], C["top"], "chest", True)
bone("tail0", C["tail"][0], C["tail"][1], "hips")
bone("tail1", C["tail"][1], C["tail"][2], "tail0", True)
for side, sx in (("L", 1), ("R", -1)):
    Aj = armJ[side]
    bone(f"arm{side}_upper", Aj[0], Aj[1], "chest")
    bone(f"arm{side}_lower", Aj[1], Aj[2], f"arm{side}_upper", True)
    bone(f"arm{side}_hand", Aj[2], Aj[3], f"arm{side}_lower", True)
    G = [(x_ * sx, y_, z_) for x_, y_, z_ in C["leg"]]
    bone(f"leg{side}_upper", G[0], G[1], "hips")
    bone(f"leg{side}_lower", G[1], G[2], f"leg{side}_upper", True)
    bone(f"leg{side}_foot", G[2], G[3], f"leg{side}_lower", True)
for b in eb: b.roll = 0
bpy.ops.object.mode_set(mode="OBJECT")
obj.parent = rig
md = obj.modifiers.new("Armature", "ARMATURE"); md.object = rig
for j, n in enumerate(names):
    g = obj.vertex_groups.new(name=n)
    for wv in np.unique(np.round(W[:, j], 3)):
        if wv <= 0: continue
        g.add([int(i) for i in np.where(np.round(W[:, j], 3) == wv)[0]], float(wv), "REPLACE")

# ---------- 眨眼：眼睛一圈往下眼皮线收拢。眼睛位置从贴图上找（深色的眼珠）----------
uvl = np.empty(len(me.loops) * 2, np.float32); me.uv_layers.active.data.foreach_get("uv", uvl); uvl = uvl.reshape(-1, 2)
lv = np.empty(len(me.loops), np.int32); me.loops.foreach_get("vertex_index", lv)
vuv = np.zeros((nV, 2)); vuv[lv] = uvl
vc = px[np.clip((vuv[:, 1] * h_).astype(int), 0, h_ - 1), np.clip((vuv[:, 0] * w_).astype(int), 0, w_ - 1), :3]
dark = (vc.sum(1) < 1.1) & (z > C["eye_z"][0]) & (z < C["eye_z"][1]) & (y < -0.08)
obj.shape_key_add(name="Basis")
X2, Y2, Z2 = P2[:, 0], P2[:, 1], P2[:, 2]
for side, sx in (("L", 1), ("R", -1)):
    e = P2[dark & (x * sx > 0.02)]
    cx, cz = np.median(e[:, 0]), np.median(e[:, 2]); rx = np.percentile(np.abs(e[:, 0] - cx), 95); rz = np.percentile(np.abs(e[:, 2] - cz), 95)
    yf = e[:, 1].max() + 0.03
    rzz = np.where(Z2 > cz, rz * 2.0, rz * 1.35)          # 上眼皮多动、下面少动（下面紧挨着鼻子那块的边）
    d = ((X2 - cx) / (rx * 2.1)) ** 2 + ((Z2 - cz) / rzz) ** 2
    k = np.where((Y2 < yf) & (d < 1), 1.0 * ss(1.0, 0.62, d), 0)
    lid = cz - 0.6 * rz
    sk = obj.shape_key_add(name="blink" + side, from_mix=False)
    co = P2.copy(); co[:, 2] += (lid - Z2) * k
    sk.data.foreach_set("co", co.ravel()); sk.value = 0.0
    print("blink", side, "eye centre", round(cx, 3), round(cz, 3), "radius", round(rx, 3), round(rz, 3), "verts", int((k > 0).sum()))

# ---------- 示范动画（只放在 .blend 里给人看；网页上的动作在 hippo.js 里实时算）----------
from math import radians
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
            for ax_, deg in rots: q = local_q(rig.pose.bones[bn], ax_, deg) @ q
            rig.pose.bones[bn].rotation_quaternion = q
        for pb in rig.pose.bones: pb.keyframe_insert("rotation_quaternion", frame=f)
    a.use_fake_user = True
    return a
walk = lambda s: {"legL_upper": [("x", 25 * s)], "legR_upper": [("x", -25 * s)], "legL_lower": [("x", -12 * max(0, -s))],
                  "legR_lower": [("x", -12 * max(0, s))], "armL_upper": [("x", -20 * s)], "armR_upper": [("x", 20 * s)],
                  "hips": [("z", 5 * s)], "chest": [("z", -4 * s)]}
act("walk", [(1, walk(1)), (13, walk(-1)), (25, walk(1))])
wave = lambda s: {"armR_upper": [("y", 75), ("x", 25)], "armR_lower": [("y", 40 + 25 * s)], "head": [("y", -8)]}
act("wave", [(1, {}), (8, wave(1)), (16, wave(-1)), (24, wave(1)), (32, wave(-1)), (40, {})])
rig.animation_data.action = bpy.data.actions["walk"]
bpy.context.scene.frame_start, bpy.context.scene.frame_end = 1, 24
bpy.data.orphans_purge(do_recursive=True)     # 没用到的旧贴图不带进 .blend
for im in bpy.data.images:
    if im.users: im.pack()
bpy.ops.wm.save_as_mainfile(filepath=f"{outdir}/{who}.blend", compress=True)
rig.animation_data.action = None
for pb in rig.pose.bones: pb.rotation_quaternion = (1, 0, 0, 0)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(filepath=f"{outdir}/{who}-rig.glb", export_format="GLB", export_skins=True, export_morph=True,
                          export_animations=False, export_yup=True, export_image_format="JPEG", export_jpeg_quality=92,
                          export_normals=True, export_tangents=False)
print("done")
