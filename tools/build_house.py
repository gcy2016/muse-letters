# 房屋模型构建脚本：方案 B 的客厅（living-room.blend）+ 方案 C 的家具（cozy-home-interiors）拼成整套房子，导出 assets/house/house.glb。
# 运行：python tools/build_house.py   （加参数 split 只打印方案 B 拆出来的零件，不导出；需要 Blender 的 Python 模块 bpy 5.x，例如 uv venv -p 3.11 && uv pip install bpy==5.0.1；
#   最后一步用 npx 调 gltfpack 压缩，需要装好 Node.js）
# 坐标用 Blender 的：x 向右，y 向后（屋子后墙在 +y），z 向上，单位米，地面 z=0。导出 GLB 后变成 three.js 的 y 向上、前方 +z。
# 户型改了只需要改下面“户型”一节的数字，再跑一遍。
import bpy, bmesh, sys, os, math, zipfile, tempfile
from mathutils import Vector

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(REPO, "assets/house/source")
OUT = os.path.join(REPO, "assets/house/house.glb")
PHASE = sys.argv[-1] if len(sys.argv) > 1 and sys.argv[-1] in ("split",) else "all"

# ---------- 1. 打开方案 B，把一整块网格按位置拆开 ----------
bpy.ops.wm.open_mainfile(filepath=os.path.join(SRC, "living-room.blend"))
body = bpy.data.objects["living-room_body"]

# 左墙上的山水画删掉了（见下面 classify），墙面贴图里烘焙的画框影子也抹掉：用这块周围一圈的颜色从四边往里插值补上
def erase_painting_shadow():
    im = bpy.data.images["living-room_body_basecolor"]
    W, H = im.size
    px = [0.0] * (W * H * 4); im.pixels.foreach_get(px)
    c0, c1, r0, r1 = 714, 796, 678, 738   # 影子在贴图里的范围（像素，含边上的虚影），由墙面 UV 算出
    def get(c, r, k): return px[(r * W + c) * 4 + k]
    out = {}
    for r in range(r0 + 1, r1):
        for c in range(c0 + 1, c1):
            s, t = (c - c0) / (c1 - c0), (r - r0) / (r1 - r0)
            for k in range(3):
                L, R, B, T = get(c0, r, k), get(c1, r, k), get(c, r0, k), get(c, r1, k)
                corners = (1 - s) * (1 - t) * get(c0, r0, k) + s * (1 - t) * get(c1, r0, k) + (1 - s) * t * get(c0, r1, k) + s * t * get(c1, r1, k)
                out[(r * W + c) * 4 + k] = (1 - s) * L + s * R + (1 - t) * B + t * T - corners
    for i, v in out.items(): px[i] = v
    im.pixels.foreach_set(px); im.update(); im.pack()
erase_painting_shadow()
bm = bmesh.new(); bm.from_mesh(body.data); bm.verts.ensure_lookup_table(); bm.faces.ensure_lookup_table()

# 互相连着的面算一个零件
parent = list(range(len(bm.verts)))
def find(a):
    while parent[a] != a:
        parent[a] = parent[parent[a]]; a = parent[a]
    return a
for e in bm.edges:
    a, b = find(e.verts[0].index), find(e.verts[1].index)
    if a != b: parent[a] = b
parts = {}
for v in bm.verts:
    g = parts.setdefault(find(v.index), [[1e9] * 3, [-1e9] * 3])
    for i in range(3):
        g[0][i] = min(g[0][i], v.co[i]); g[1][i] = max(g[1][i], v.co[i])

# 零件分类：地板 / 底座（扔掉）/ 左墙 / 后墙 / 地毯 / 家具
def classify(mn, mx):
    d = [mx[i] - mn[i] for i in range(3)]
    if mx[2] <= 0.205:
        if mn[2] < 0.155: return "drop"
        return "floor" if d[0] > 3.5 or d[1] > 3.5 else "rug"   # 小块的是地毯边、灯座
    if -1.86 < mn[0] < -1.82 and mn[2] > 1.8 and mx[2] < 2.4 and mn[1] > -0.47 and mx[1] < 0.47: return "drop"  # 左墙上的山水画：那里挂合影（layout.js 的 photoLiving）
    if mn[0] < -1.82 and d[0] < 0.2: return "wallL"
    if mx[1] > 1.84 and d[1] < 0.2: return "wallB"
    if d[0] > 3.5 or d[1] > 3.5: return "struct"
    if mx[2] < 0.235: return "rug"
    return None
label = {r: classify(*g) for r, g in parts.items()}

# 家具：包围盒挨着的零件并成一件
cl = {r: r for r in parts}
def cf(a):
    while cl[a] != a:
        cl[a] = cl[cl[a]]; a = cl[a]
    return a
free = sorted([r for r in parts if label[r] is None], key=lambda r: parts[r][0][0])
active = []
for i in free:
    mn, mx = parts[i]
    active = [j for j in active if parts[j][1][0] + 0.004 >= mn[0]]
    for j in active:
        a, b = parts[j]
        if all(a[k] - 0.004 <= mx[k] and mn[k] - 0.004 <= b[k] for k in range(3)):
            ri, rj = cf(i), cf(j)
            if ri != rj: cl[ri] = rj
    active.append(i)
clusters = {}
for i in free:
    g = clusters.setdefault(cf(i), [[1e9] * 3, [-1e9] * 3])
    for k in range(3):
        g[0][k] = min(g[0][k], parts[i][0][k]); g[1][k] = max(g[1][k], parts[i][1][k])

# 按位置给家具起名（B 的局部坐标，包围盒中心 x,y）
B_NAMES = [
    ("bookshelf", -1.38, 1.67), ("sofa", 0.37, 1.37), ("tv_stand", -1.6, 0.0), ("floor_lamp", 1.76, 1.58),
    ("plant_big", -1.27, -1.42), ("armchair", 1.32, -0.92),
]
def cluster_group(r):
    mn, mx = clusters[r]
    if mn[2] > 1.5 and mx[1] > 1.6: return "wallB"          # 墙上的搁板和书
    if mx[1] > 1.82 and mx[2] < 0.6 and mx[0] - mn[0] < 0.15: return "wallB"  # 插座
    if mn[0] < -1.8 and mn[2] > 0.3 and mx[0] - mn[0] < 0.1: return "wallL"
    c = ((mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2)
    best = min(B_NAMES, key=lambda n: (n[1] - c[0]) ** 2 + (n[2] - c[1]) ** 2)
    if (best[1] - c[0]) ** 2 + (best[2] - c[1]) ** 2 < 0.15: return best[0]
    return "decor_%.1f_%.1f" % c
group_of_part = {}
for r in parts:
    group_of_part[r] = label[r] if label[r] is not None else cluster_group(cf(r))

def face_group(f):
    r = find(f.verts[0].index)
    g = group_of_part[r]
    if g == "struct":
        c = f.calc_center_median()
        return "wallL" if c.x < -1.8 else "wallB" if c.y > 1.8 else "floor" if c.z < 0.25 else "wallB"
    return g
fg = [face_group(f) for f in bm.faces]

if PHASE == "split":
    from collections import Counter
    print("GROUPS", Counter(fg))
    for r, (mn, mx) in clusters.items():
        print("CL %-22s min=(%.2f,%.2f,%.2f) max=(%.2f,%.2f,%.2f)" % (cluster_group(r), *mn, *mx))
    sys.exit(0)

# 拆成单独的物体。B 搬到屋子左后角：B 的 (x, y, z) → 屋子 (x-3, y+2, z-0.2)，地面落到 z=0
B_OFFSET = Vector((-3.0, 2.0, -0.2))
src_mats = list(body.data.materials)
b_objs = {}
for g in sorted(set(fg)):
    if g == "drop": continue
    bm2 = bm.copy()
    bmesh.ops.delete(bm2, geom=[f for f, x in zip(bm2.faces, fg) if x != g], context="FACES")
    me = bpy.data.meshes.new("lr_" + g)
    bm2.to_mesh(me); bm2.free()
    for m in src_mats: me.materials.append(m)
    # 家具的原点放在底面中心，墙和地板留在原点
    if g not in ("wallB", "wallL", "floor", "rug"):
        xs = [v.co.x for v in me.vertices]; ys = [v.co.y for v in me.vertices]; zs = [v.co.z for v in me.vertices]
        o = Vector(((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, min(zs)))
    else:
        o = Vector((0, 0, 0.2))
    for v in me.vertices: v.co -= o
    ob = bpy.data.objects.new("lr_" + g, me)
    ob.location = o + B_OFFSET
    bpy.context.scene.collection.objects.link(ob)
    b_objs[g] = ob
bm.free()
# 发光的小零件（蜡烛、灯罩、电视屏幕）挂到最近的家具上
for name in ("living-room_candle_glow", "living-room_floor_lamp_glow", "living-room_tv_glow"):
    o = bpy.data.objects[name]
    vs = [o.matrix_world @ v.co for v in o.data.vertices]
    c = sum(vs, Vector()) / len(vs) + B_OFFSET
    near = min((x for k, x in b_objs.items() if not k.startswith("wall") and k not in ("floor", "rug")), key=lambda x: (x.location.xy - c.xy).length)
    o.parent = near
    o.location = B_OFFSET - near.location  # near 没有旋转缩放，直接减就是相对位置
bpy.data.objects.remove(body)
bpy.data.objects.remove(bpy.data.objects["living-room"])

# 窗户模板：从 B 的后墙里取出窗框、玻璃和窗台。原点在窗洞底边中点、墙的室内面上，室内朝 -y
def take_window():
    wb = b_objs["wallB"]
    bm3 = bmesh.new(); bm3.from_mesh(wb.data)
    loc = wb.location - B_OFFSET  # 回到 B 局部坐标再判断
    par = {}
    for v in bm3.verts: par[v.index] = v.index
    def fd(a):
        while par[a] != a:
            par[a] = par[par[a]]; a = par[a]
        return a
    for e in bm3.edges:
        a, b = fd(e.verts[0].index), fd(e.verts[1].index)
        if a != b: par[a] = b
    box = {}
    for v in bm3.verts:
        p = v.co + loc
        g = box.setdefault(fd(v.index), [[1e9] * 3, [-1e9] * 3])
        for k in range(3):
            g[0][k] = min(g[0][k], p[k]); g[1][k] = max(g[1][k], p[k])
    lo, hi = (-0.18, 1.74, 1.2), (1.18, 2.01, 2.53)
    inside = {r for r, (mn, mx) in box.items() if all(lo[k] <= mn[k] and mx[k] <= hi[k] for k in range(3))}
    win = bm3.copy()
    bmesh.ops.delete(win, geom=[f for f in win.faces if fd(f.verts[0].index) not in inside], context="FACES")
    bmesh.ops.delete(bm3, geom=[f for f in bm3.faces if fd(f.verts[0].index) in inside], context="FACES")
    bm3.to_mesh(wb.data); bm3.free()
    me = bpy.data.meshes.new("window")
    win.to_mesh(me); win.free()
    for m in src_mats: me.materials.append(m)
    shift = Vector((0.5, 1.83, 1.25)) - loc
    for v in me.vertices: v.co -= shift
    return me
WINDOW_MESH = take_window()
# B 原来的窗户放回原处（单独成一个物体，跟后墙一起显示/隐藏）

# ---------- 2. 材质 ----------
def lin(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c) + (1.0,)
MATS = {}
def mat(name, hexcol, rough=0.9, emit=None):
    if name in MATS: return MATS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = lin(hexcol)
    p.inputs["Roughness"].default_value = rough
    if emit:
        p.inputs["Emission Color"].default_value = lin(emit); p.inputs["Emission Strength"].default_value = 1.0
    MATS[name] = m
    return m

# 方案 C 的 8 种材质，颜色往方案 B 的配色上靠（B：珊瑚红沙发、薄荷绿电视柜、黄色单人椅、橡木书架）
C_PALETTE = {
    "cream": "#f7efe2", "oak": "#e3ac6c", "walnut": "#8a5a3c", "sage": "#8fd0b4",
    "coral": "#ee7d6c", "mustard": "#f5c55a", "charcoal": "#3a3a44", "glass": "#a9d4ec",
}
for k, v in C_PALETTE.items(): mat("c_" + k, v, 0.85 if k != "glass" else 0.2)

# 墙面颜色：每个房间一种浅色，客厅沿用 B 的浅豆绿
WALL_COLORS = {
    "living": "#dcebd3", "kitchen": "#f6ead2", "study": "#d8e7f1", "bedroom": "#f7e1e1", "entry": "#efeedb", None: "#f4efe6",
}
for k, v in WALL_COLORS.items(): mat("wall_" + (k or "outside"), v, 0.95)
mat("baseboard", "#f7f4ef", 0.8)
mat("frame_oak", "#e3ac6c", 0.8)
mat("base_slab", "#c48552", 0.9)
mat("grout", "#e4ded4", 0.9)
mat("floor_wood", "#d39c62", 0.8); mat("floor_wood_dark", "#bb8350", 0.8)
mat("cork", "#cfa36d", 1.0)
mat("note_pink", "#f6b3c4"); mat("note_blue", "#a9c8f2"); mat("note_yellow", "#f8e08a"); mat("note_white", "#fbf8f1")
mat("miu_blue", "#8fb4f2"); mat("lulu_pink", "#f3a6bc")
mat("roof", "#e5836f", 0.85); mat("roof_edge", "#c96a58", 0.85); mat("chimney", "#f1e6d6", 0.9)

# ---------- 3. 户型 ----------
# 房间：x、y 是墙中线围成的范围（米）。客厅就是方案 B 原来的 4×4 房间，放在左后角。
H = 2.8                       # 墙高
T_EXT, T_INT = 0.17, 0.12     # 外墙、内墙厚度（外墙和 B 的一样厚）
SILL, WIN_W, WIN_H = 1.05, 1.2, 1.25   # 窗台高、窗宽、窗高（照 B 的窗户）
DOOR_W, DOOR_H = 0.9, 2.1
ROOMS = {
    "living":  dict(label="客厅",     x=(-5.0, -0.94), y=(-0.06, 4.0)),
    "kitchen": dict(label="厨房餐厅", x=(-0.94, 5.0), y=(-0.06, 4.0)),
    "study":   dict(label="书房",     x=(-5.0, -1.5),  y=(-3.5, -0.06)),
    "entry":   dict(label="玄关",     x=(-1.5, 1.2),   y=(-3.5, -0.06)),
    "bedroom": dict(label="卧室",     x=(1.2, 5.0),    y=(-3.5, -0.06)),
}
X0, X1, Y0, Y1 = -5.0, 5.0, -3.5, 4.0   # 外轮廓
def win(at): return dict(kind="window", at=at, w=WIN_W, z0=SILL, z1=SILL + WIN_H)
def door(at, w=DOOR_W): return dict(kind="door", at=at, w=w, z0=0, z1=DOOR_H)
def arch(at, w): return dict(kind="arch", at=at, w=w, z0=0, z1=2.3)
FRONT_DOOR_W, FRONT_DOOR_H = 0.97, 2.11
# 墙：(编号, 沿哪个轴, 中线坐标, 起点, 终点, 厚度, 负侧房间, 正侧房间, 门窗)。None 表示屋外
ye, xe = T_EXT / 2, T_EXT / 2
WALLS = [
    ("back_kitchen",  "x", Y1 - ye, -1.0, X1 - T_EXT, T_EXT, "kitchen", None, [win(2.55)]),
    ("right_kitchen", "y", X1 - xe, -0.06, Y1, T_EXT, "kitchen", None, [win(1.6)]),
    ("right_bedroom", "y", X1 - xe, Y0 + T_EXT, -0.06, T_EXT, "bedroom", None, [win(-1.45)]),
    ("front_bedroom", "x", Y0 + ye, 1.2, X1, T_EXT, None, "bedroom", [win(3.1)]),
    ("front_entry",   "x", Y0 + ye, -1.5, 1.2, T_EXT, None, "entry", [dict(kind="front_door", at=-0.15, w=FRONT_DOOR_W, z0=0, z1=FRONT_DOOR_H)]),
    ("front_study",   "x", Y0 + ye, X0, -1.5, T_EXT, None, "study", [win(-3.25)]),
    ("left_study",    "y", X0 + xe, Y0 + T_EXT, 0.0, T_EXT, None, "study", [win(-1.75)]),
    ("mid_living_study", "x", -0.06, X0 + T_EXT, -1.5, T_INT, "study", "living", []),
    ("mid_living_entry", "x", -0.06, -1.5, -0.94, T_INT, "entry", "living", []),
    ("mid_kitchen_entry", "x", -0.06, -0.94, 1.2, T_INT, "entry", "kitchen", [door(-0.15, 1.0)]),
    ("mid_kitchen_bedroom", "x", -0.06, 1.2, X1 - T_EXT, T_INT, "bedroom", "kitchen", []),
    ("living_kitchen", "y", -0.94, 0.0, Y1 - T_EXT, T_INT, "living", "kitchen", [arch(2.45, 1.5)]),
    ("study_entry",   "y", -1.5, Y0 + T_EXT, -0.12, T_INT, "study", "entry", [door(-1.2)]),
    ("entry_bedroom", "y", 1.2, Y0 + T_EXT, -0.12, T_INT, "entry", "bedroom", [door(-1.2)]),
]

def link(ob, parent=None):
    bpy.context.scene.collection.objects.link(ob)
    if parent is not None:
        ob.parent = parent
    return ob
def empty(name, loc=(0, 0, 0), parent=None, rot=0.0, **props):
    e = bpy.data.objects.new(name, None)
    e.location = loc; e.rotation_euler = (0, 0, math.radians(rot))
    for k, v in props.items(): e[k] = v
    return link(e, parent)

ROOT = empty("house", kind="house", units="m", version=1)
def box(name, size, loc, mats, face_mats=None, parent=None, **props):
    """长方体，原点在底面中心。mats：材质列表；face_mats：(-x,+x,-y,+y,底,顶) 各面用第几个材质"""
    sx, sy, sz = size
    vs = [(x, y, z) for z in (0, sz) for y in (-sy / 2, sy / 2) for x in (-sx / 2, sx / 2)]
    fs = [(0, 2, 6, 4), (1, 5, 7, 3), (0, 4, 5, 1), (2, 3, 7, 6), (0, 1, 3, 2), (4, 6, 7, 5)]
    me = bpy.data.meshes.new(name); me.from_pydata(vs, [], fs); me.update()
    for m in mats: me.materials.append(m)
    if face_mats:
        for p, i in zip(me.polygons, face_mats): p.material_index = i
    ob = bpy.data.objects.new(name, me); ob.location = loc
    for k, v in props.items(): ob[k] = v
    return link(ob, parent)

# ---------- 4. 墙、门窗、踢脚线 ----------
def build_wall(wid, axis, c, a0, a1, T, neg, pos, openings):
    # 导出后的 three.js 坐标：沿 x 的墙在 z=-c，Blender 的负侧（y<c）在 three 的 z 较大一侧
    if axis == "x":
        props = dict(axis="x", c=-c, roomA=pos or "", roomB=neg or "")
    else:
        props = dict(axis="z", c=c, roomA=neg or "", roomB=pos or "")
    run = empty("wall_" + wid, parent=ROOT, kind="wall", exterior=(neg is None or pos is None), **props)
    mneg, mpos = MATS["wall_" + (neg or "outside")], MATS["wall_" + (pos or "outside")]
    top = 0 if neg else 1
    fm = (top, top, 0, 1, top, top) if axis == "x" else (0, 1, top, top, top, top)
    def piece(b0, b1, z0, z1, part):
        if b1 - b0 < 0.005: return
        L, mid = b1 - b0, (b0 + b1) / 2
        size = (L, T, z1 - z0) if axis == "x" else (T, L, z1 - z0)
        loc = (mid, c, z0) if axis == "x" else (c, mid, z0)
        box("%s_%s_%.2f" % (wid, part, mid), size, loc, [mneg, mpos], fm, run, part=part, h=z1 - z0)
        if z0 == 0 and part in ("full", "below"):   # 踢脚线
            for side, room in ((-1, neg), (1, pos)):
                if room is None: continue
                off = side * (T / 2 + 0.008)
                bsize = (L, 0.016, 0.08) if axis == "x" else (0.016, L, 0.08)
                bloc = (mid, c + off, 0) if axis == "x" else (c + off, mid, 0)
                box("%s_base_%.2f_%d" % (wid, mid, side), bsize, bloc, [MATS["baseboard"]], None, run, part="base")
    cur = a0
    for op in sorted(openings, key=lambda o: o["at"]):
        b0, b1 = op["at"] - op["w"] / 2, op["at"] + op["w"] / 2
        piece(cur, b0, 0, H, "full")
        if op["z0"] > 0: piece(b0, b1, 0, op["z0"], "below")
        piece(b0, b1, op["z1"], H, "above")
        cur = b1
        inside_neg = neg is not None   # 窗户/门朝向哪个房间
        if op["kind"] == "window":
            if axis == "x":
                loc, rot = ((op["at"], c - T / 2, SILL), 0) if inside_neg else ((op["at"], c + T / 2, SILL), 180)
            else:
                loc, rot = ((c - T / 2, op["at"], SILL), -90) if inside_neg else ((c + T / 2, op["at"], SILL), 90)
            w = bpy.data.objects.new("%s_window_%.2f" % (wid, op["at"]), WINDOW_MESH)
            w.location = loc; w.rotation_euler = (0, 0, math.radians(rot)); w["part"] = "window"
            link(w, run)
        elif op["kind"] in ("door", "arch"):
            jw, d = 0.07, T + 0.04
            for s in (-1, 1):
                p = op["at"] + s * (op["w"] / 2 + jw / 2 - 0.005)
                size = (jw, d, op["z1"]) if axis == "x" else (d, jw, op["z1"])
                box("%s_jamb_%.2f_%d" % (wid, op["at"], s), size, (p, c, 0) if axis == "x" else (c, p, 0), [MATS["frame_oak"]], None, run, part="frame")
            size = (op["w"] + 2 * jw, d, 0.07) if axis == "x" else (d, op["w"] + 2 * jw, 0.07)
            box("%s_head_%.2f" % (wid, op["at"]), size, (op["at"], c, op["z1"]) if axis == "x" else (c, op["at"], op["z1"]), [MATS["frame_oak"]], None, run, part="frame")
        elif op["kind"] == "front_door":
            front_door(run, op["at"], c, T)
    piece(cur, a1, 0, H, "full")
    return run

# ---------- 5. 方案 C 的模型 ----------
CDIR = os.path.join(tempfile.mkdtemp(), "c")
with zipfile.ZipFile(os.path.join(SRC, "cozy-home-interiors-models.zip")) as z: z.extractall(CDIR)
CFILES = {}
for root, _, files in os.walk(CDIR):
    for f in files:
        if f.endswith(".glb"):
            CFILES[f.replace("cozy-home-interiors-", "").rsplit("-", 1)[0]] = os.path.join(root, f)

def import_c(name):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=CFILES[name])
    new = [o for o in bpy.data.objects if o not in before]
    for o in new:
        if o.type == "MESH":
            for i, m in enumerate(o.data.materials):
                base = m.name.split(".")[0]
                if "c_" + base in MATS: o.data.materials[i] = MATS["c_" + base]
    return new

C_CACHE = {}
def place(name, x, y, rot=0, room="", fid=None, z=0.0, solid=True, recolor=None, keep=None, parent=None, **props):
    """把 C 的一件家具放到 (x, y)，rot：朝向（0 朝前 -y，90 朝 +x，180 朝后，-90 朝 -x）"""
    holder = empty("furn_" + (fid or name), (x, y, z), parent or ROOT, rot, kind="furniture", room=room, solid=solid, **props)
    key = (name, tuple(sorted((recolor or {}).items())))
    if key in C_CACHE and keep is None:
        # 同一件家具再放一份：复制物体、共用网格，GLB 里只存一份
        def dup(o, par):
            n = o.copy(); link(n, par)
            for ch in o.children: dup(ch, n)
        for r in C_CACHE[key]: dup(r, holder)
        return holder
    new = import_c(name)
    for o in list(new):
        if keep is not None and o.type == "MESH" and not keep(o):
            new.remove(o); bpy.data.objects.remove(o)
    roots = [o for o in new if o.parent is None]
    for o in roots: o.parent = holder
    if keep is None: C_CACHE[key] = roots
    if recolor:
        for o in holder.children_recursive:
            if o.type == "MESH":
                for i, m in enumerate(o.data.materials):
                    if m and m.name in recolor: o.data.materials[i] = MATS[recolor[m.name]]
    return holder

def front_door(run, at, c, T):
    # 用 C 的入户门：只要门框、门扇和上面的小零件，不要它自带的那段墙
    keep = lambda o: not o.name.startswith("wall-front-door-2m_0") and not o.name.startswith("wall-front-door-2m_1")
    place("wall-front-door-2m", at, c, 0, room="entry", fid="front_door", solid=False, keep=keep, parent=run, part="door", interact="door")

# ---------- 6. 拼起来 ----------
for w in WALLS: build_wall(*w)

# 方案 B 原有的两面外墙（带挂画、搁板、插座），窗户放回原处
for key, wid, axis, c, roomA in (("wallB", "back_living", "x", -(Y1 - ye), ""), ("wallL", "left_living", "z", X0 + xe, "")):
    run = empty("wall_" + wid, parent=ROOT, kind="wall", exterior=True, axis=axis, c=c, roomA=roomA, roomB="living")
    ob = b_objs[key]; ob.parent = run; ob["part"] = "fixed"
    if key == "wallB":
        w = link(bpy.data.objects.new("back_living_window", WINDOW_MESH), run)
        w.location = Vector((0.5, 1.83, 1.25)) + B_OFFSET; w["part"] = "fixed"

# 地板：客厅用 B 原来的（贴图里烘焙了家具阴影，不能复制到别的房间）；书房、卧室铺 C 的木地板（颜色调成 B 的木色）；厨房、玄关铺 C 的地砖
FLOOR = {"living": "b", "study": "wood", "bedroom": "wood", "kitchen": "tile", "entry": "tile"}
lr_floor = b_objs["floor"]
for rid, r in ROOMS.items():
    x0, x1 = r["x"]; y0, y1 = r["y"]
    cx, cy, w, d = (x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0
    if FLOOR[rid] == "b":
        ob = lr_floor; ob.parent = ROOT
    else:
        wood = FLOOR[rid] == "wood"
        ob = empty("floor_" + rid, (cx, cy, -0.07 if wood else -0.065), ROOT)
        nx, ny = math.ceil(w / 2 - 0.05), math.ceil(d / 2 - 0.05)
        ob.scale = (w / (2 * nx), d / (2 * ny), 1)
        for i in range(nx):
            for j in range(ny):
                t = place("floor-wood-2m" if wood else "floor-tile-2m", (i - (nx - 1) / 2) * 2, (j - (ny - 1) / 2) * 2, 0, room=rid,
                          fid="tile_%s_%d_%d" % (rid, i, j), solid=False, parent=ob,
                          recolor={"c_oak": "floor_wood", "c_walnut": "floor_wood_dark"} if wood else {"c_charcoal": "grout"})
                t["kind"] = "floor_tile"
    ob["kind"] = "floor"; ob["room"] = rid
box("base_slab", (X1 - X0, Y1 - Y0, 0.205), ((X0 + X1) / 2, (Y0 + Y1) / 2, -0.25), [MATS["base_slab"]], None, ROOT, kind="base")

# 客厅：方案 B 的家具原样保留
for k, ob in b_objs.items():
    if k.startswith("wall") or k == "floor": continue
    ob.parent = ROOT; ob["kind"] = "furniture"; ob["room"] = "living"; ob["solid"] = k != "rug"
    if k == "sofa": ob["interact"] = "sofa"
    if k == "tv_stand": ob["interact"] = "tv"

# 厨房餐厅：后墙一排橱柜（冰箱、灶台、烤箱、水槽），吊柜，中间餐桌
K = "kitchen"
place("fridge", 4.46, 3.83 - 0.385, room=K)
place("base-cabinet", 3.79, 3.49, room=K, fid="base_cabinet_1")
place("hob", 3.79, 3.49, room=K, z=0.9, solid=False)
place("oven", 3.17, 3.49, room=K)
place("sink-unit", 2.55, 3.49, room=K)
place("base-cabinet", 1.91, 3.49, room=K, fid="base_cabinet_2")
place("drawer-base", 1.27, 3.49, room=K)
place("kettle", 1.95, 3.5, room=K, z=0.9, solid=False)
place("toaster", 1.25, 3.55, room=K, z=0.9, solid=False)
place("herb-pots", 2.95, 3.88 - 0.17 - 0.06, room=K, z=SILL, solid=False)
for i, x in enumerate((1.27, 3.79)):
    h = place("wall-cabinet", x, 3.83 - 0.19, room=K, fid="wall_cabinet_%d" % i, z=1.5, solid=False, wallmount="back_kitchen")
    h.scale = (1, 0.55, 1)
place("dining-table", 2.2, 1.55, room=K)
place("fruit-bowl", 2.2, 1.55, room=K, z=0.75, solid=False)
for i, (x, y, r) in enumerate(((1.8, 2.15, 0), (2.6, 2.15, 0), (1.8, 0.95, 180), (2.6, 0.95, 180))):
    place("dining-chair", x, y, r, room=K, fid="dining_chair_%d" % i)
place("plant-large", -0.45, 3.42, room=K)
place("kitchen-bin", 0.62, 3.58, room=K)

# 书房：电脑桌（以后点电脑打开入口）、书架、猫爬架、两个猫窝
S_ = "study"
place("gaming-desk", -3.3, -0.12 - 0.34, room=S_)
place("computer-monitor", -3.3, -0.33, room=S_, z=0.73, solid=False, interact="computer")
place("desk-chair", -3.3, -1.05, 180, room=S_)
place("plant-small", -2.75, -0.35, room=S_, z=0.73, solid=False)
place("bookcase", -4.83 + 0.19, -2.85, 90, room=S_)
place("cat-tree", -2.15, -2.7, room=S_)
place("plant-large", -2.0, -0.45, room=S_, fid="plant_large_study")
place("living-rug", -3.3, -1.45, room=S_, solid=False, fid="rug_study")
place("cat-bed", -4.1, -1.5, room=S_, fid="cat_bed_miu", solid=False, recolor={"c_coral": "miu_blue"})
place("cat-bed", -4.1, -2.2, room=S_, fid="cat_bed_lulu", solid=False, recolor={"c_coral": "lulu_pink"})

# 玄关：入户门（建墙时已放）、留言板（立式软木板，点它打开留言板）、鞋柜、镜子、拖鞋
E = "entry"
def message_board(x, y, rot):
    g = empty("furn_board", (x, y, 0), ROOT, rot, kind="furniture", room=E, solid=True, interact="board")
    oak, cork = MATS["frame_oak"], MATS["cork"]
    for s in (-1, 1):
        box("board_leg_%d" % s, (0.05, 0.05, 1.62), (s * 0.5, 0, 0), [oak], None, g)
        box("board_foot_%d" % s, (0.07, 0.4, 0.04), (s * 0.5, 0, 0), [oak], None, g)
    box("board_frame", (1.06, 0.045, 0.76), (0, 0, 0.82), [oak], None, g)
    box("board_cork", (0.96, 0.05, 0.66), (0, -0.003, 0.87), [cork], None, g)
    notes = [(-0.32, 1.32, "note_pink"), (-0.08, 1.38, "note_yellow"), (0.2, 1.3, "note_blue"), (-0.25, 1.05, "note_white"),
             (0.05, 1.08, "note_pink"), (0.3, 1.02, "note_yellow")]
    for i, (nx, nz, m) in enumerate(notes):
        box("board_note_%d" % i, (0.16, 0.012, 0.15), (nx, -0.03, nz - 0.075), [MATS[m]], None, g)
    return g
message_board(-1.44 + 0.25, -2.2, 90)
place("console-shelf", 1.14 - 0.19, -2.5, -90, room=E)
place("plant-small", 0.95, -2.75, room=E, z=0.7, solid=False, fid="plant_small_entry")
place("living-mirror", 1.14 - 0.03, -2.45, -90, room=E, z=1.1, solid=False, wallmount="entry_bedroom")
place("slippers", -0.55, -3.0, room=E, solid=False)
place("bath-mat", -0.15, -2.95, room=E, solid=False, fid="doormat")

# 卧室：双人床靠墙、两个床头柜和台灯、衣柜、斗柜、地毯
B_ = "bedroom"
place("double-bed", 2.45, -0.12 - 1.0, room=B_, interact="bed")
for i, x in enumerate((1.48, 3.43)):
    place("bedside-table", x, -0.35, room=B_, fid="bedside_table_%d" % i)
    place("table-lamp", x, -0.35, room=B_, z=0.5, solid=False, fid="table_lamp_%d" % i)
place("wardrobe", 4.83 - 0.56, -0.12 - 0.34, room=B_)
place("dresser", 1.26 + 0.26, -2.6, 90, room=B_)
place("bedroom-rug", 2.6, -2.45, room=B_, solid=False)
place("wall-art-frames", 2.45, -0.12 - 0.03, room=B_, z=1.45, solid=False, wallmount="mid_kitchen_bedroom")
place("slippers", 3.45, -1.6, -90, room=B_, solid=False, fid="slippers_bed")

# ---------- 6b. 屋顶（从外面看时才显示；进屋后 house.js 会藏起来，变成剖开看） ----------
def prism(name, top, depth, mats, parent, axis_down=True):
    """四边形 top（4 个点，逆时针）往下挤出 depth 厚的板"""
    bot = [(x, y, z - depth) for x, y, z in top]
    vs = list(top) + bot
    fs = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
    me = bpy.data.meshes.new(name); me.from_pydata(vs, [], fs); me.update()
    for m in mats: me.materials.append(m)
    for i, p in enumerate(me.polygons): p.material_index = 0 if i == 0 else min(1, len(mats) - 1)
    return link(bpy.data.objects.new(name, me), parent)
def tri_wall(name, x, inward, pts, T, m, parent):
    """山墙的三角形，pts 是外表面上的 3 个点 (y, z)，往屋里挤出 T"""
    vs = [(x, y, z) for y, z in pts] + [(x + inward * T, y, z) for y, z in pts]
    fs = [(0, 1, 2), (5, 4, 3), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)]
    me = bpy.data.meshes.new(name); me.from_pydata(vs, [], fs); me.update(); me.materials.append(m)
    return link(bpy.data.objects.new(name, me), parent)
ROOF = empty("roof", parent=ROOT, kind="roof")
PITCH, OVER, ROOF_T = math.radians(28), 0.35, 0.14
YM = (Y0 + Y1) / 2
ridge_z = H + (Y1 - Y0) / 2 * math.tan(PITCH)
eave_z = H - OVER * math.tan(PITCH)
rx0, rx1 = X0 - OVER, X1 + OVER
for side, ye in (("front", Y0 - OVER), ("back", Y1 + OVER)):
    top = [(rx0, ye, eave_z), (rx1, ye, eave_z), (rx1, YM, ridge_z), (rx0, YM, ridge_z)]
    if side == "back": top = [top[1], top[0], top[3], top[2]]
    prism("roof_" + side, [(x, y, z + ROOF_T) for x, y, z in top], ROOF_T, [MATS["roof"], MATS["roof_edge"]], ROOF)
box("roof_ridge", (rx1 - rx0 + 0.04, 0.22, 0.12), (0, YM, ridge_z + ROOF_T - 0.04), [MATS["roof_edge"]], None, ROOF)
for x, inward in ((X0, 1), (X1, -1)):
    tri_wall("gable_%d" % inward, x, inward, [(Y0, H), (Y1, H), (YM, ridge_z)], T_EXT, MATS["wall_outside"], ROOF)
# 烟囱：落在后坡上
cx, cy = 2.6, YM + 1.6
cz = H + (Y1 - cy) * math.tan(PITCH) - 0.3
box("chimney", (0.55, 0.55, ridge_z + 0.9 - cz), (cx, cy, cz), [MATS["chimney"]], None, ROOF)
box("chimney_cap", (0.68, 0.68, 0.1), (cx, cy, ridge_z + 0.9), [MATS["roof_edge"]], None, ROOF)
# 门口台阶（房子底座比地面高 0.25）
box("door_step", (1.5, 0.6, 0.2), (-0.15, Y0 - 0.3, -0.25), [MATS["base_slab"]], None, ROOT, kind="base")

# ---------- 7. 房间范围和位置点（导出成 three.js 坐标，给以后的互动空间用） ----------
for rid, r in ROOMS.items():
    x0, x1 = r["x"]; y0, y1 = r["y"]
    empty("room_" + rid, ((x0 + x1) / 2, (y0 + y1) / 2, 0), ROOT, kind="room", id=rid, label=r["label"],
          x0=x0, x1=x1, z0=-y1, z1=-y0)
# 位置点：角色站在这里、朝这个方向（0 朝前，180 朝后，90 朝右，-90 朝左）
SPOTS = [
    ("sofa", "living", "沙发", -2.63, 3.2, 0.45, 0), ("tv", "living", "电视前", -3.3, 2.0, 0, -90),
    ("living", "living", "客厅中间", -2.6, 0.75, 0, 0),
    ("dining", "kitchen", "餐桌", 2.2, 0.95, 0, 180), ("kitchen", "kitchen", "灶台前", 3.17, 2.85, 0, 180),
    ("computer", "study", "电脑前", -3.3, -1.05, 0, 180), ("cat_tree", "study", "猫爬架", -2.15, -2.7, 1.04, 0),
    ("cat_bed_miu", "study", "小miu 的猫窝", -4.1, -1.5, 0.08, 90), ("cat_bed_lulu", "study", "lulu 的猫窝", -4.1, -2.2, 0.08, 90),
    ("door", "entry", "门口", -0.15, -2.75, 0, 180), ("board", "entry", "留言板前", -0.55, -2.2, 0, -90),
    ("bed", "bedroom", "床上", 2.45, -1.4, 0.55, 0),
]
for sid, room, lab, x, y, z, rot in SPOTS:
    empty("spot_" + sid, (x, y, z), ROOT, rot, kind="spot", id=sid, room=room, label=lab)

# ---------- 8. 导出 ----------
for o in list(bpy.data.objects):  # 不属于房子的东西（B 文件里剩下的）不导出
    top = o
    while top.parent: top = top.parent
    if top != ROOT: print("NOT IN HOUSE:", o.name); bpy.data.objects.remove(o)
# B 的贴图 2048 → 1024（手机上看不出差别，下载小很多）
for img in bpy.data.images:
    if img.size[0] > 1024:
        img.scale(img.size[0] // 2, img.size[1] // 2)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
RAW = os.path.join(tempfile.mkdtemp(), "house-raw.glb")
bpy.ops.export_scene.gltf(filepath=RAW, export_format="GLB", export_extras=True, export_yup=True,
                          export_cameras=False, export_lights=False, export_image_format="JPEG", export_jpeg_quality=85, export_apply=False)
# 用 gltfpack 压缩（量化 + meshopt），3 MB 多压到 1 MB 以内。要保留节点名（-kn）和自定义数据（-ke），house.js 靠它们找墙、房间和位置点
import subprocess
subprocess.run(["npx", "--yes", "gltfpack@0.22.0", "-i", RAW, "-o", OUT, "-cc", "-kn", "-km", "-ke"], check=True)
print("WROTE", OUT, os.path.getsize(OUT), "(未压缩", os.path.getsize(RAW), ")")
