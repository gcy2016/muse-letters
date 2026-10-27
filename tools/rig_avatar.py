# 给简化后的角色模型绑骨：骨架 + 蒙皮权重 + 眨眼变形（blinkL / blinkR），写出带 skin 的 GLB。
# 用法：python tools/rig_avatar.py in.glb out.glb lulu|miu（完整流程见 tools/fix_avatar.py 开头）
# 骨头名字 pet.js 要用：root hips spine chest head tail0~3，四条腿 FL/FR/HL/HR 各有 _upper _lower _paw
# 模型坐标：y 朝上、脸朝 +z、脚踩 y=0（tools/fix_avatar.py 已经烘好）。各部位的位置是对着侧视/正视/俯视散点图和逐层测量定的。
import sys, json, struct
import numpy as np
sys.path.insert(0, __file__.rsplit("/", 1)[0])
from glbio import GLB

src, dst, who = sys.argv[1], sys.argv[2], sys.argv[3]
g = GLB(src)
P, UV, F = g.P, g.UV, g.F

def ss(e0, e1, v):
    t = np.clip((v - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)

# ---------- 每只的部位参数 ----------
CFG = {
    "lulu": dict(
        belly=0.122, spine_y=0.29, hips_z=-0.22, spine_z=0.0, chest_z=0.17,
        neck=(0, 0.44, 0.12), head_top=(0, 0.78, 0.15),
        head_aff=lambda x, y, z: ss(0.40, 0.47, y) * ss(-0.06, 0.04, z),
        tail=[(0.03, 0.40, -0.36), (0.0, 0.48, -0.41), (0.0, 0.56, -0.44), (0.0, 0.63, -0.47), (0.0, 0.68, -0.50)],
        tail_aff=lambda x, y, z: ss(-0.30, -0.35, z) * ss(0.35, 0.41, y),
        paws={"FL": (0.064, 0.209), "FR": (-0.129, 0.208), "HL": (0.123, -0.204), "HR": (-0.122, -0.227)},
        eyes={"L": ((0.083, 0.598, 0.36), 0.052, 0.048), "R": ((-0.098, 0.596, 0.36), 0.052, 0.048)},
    ),
    "miu": dict(
        belly=0.138, spine_y=0.32, hips_z=-0.17, spine_z=0.08, chest_z=0.30,
        neck=(0, 0.52, 0.24), head_top=(0, 0.88, 0.30),
        head_aff=lambda x, y, z: ss(0.47, 0.56, y) * ss(0.0, 0.10, z),
        tail=[(0.03, 0.52, -0.33), (0.03, 0.64, -0.40), (0.03, 0.75, -0.33), (0.03, 0.76, -0.20), (0.03, 0.68, -0.10)],
        tail_aff=lambda x, y, z: ss(0.52, 0.59, y) * ss(-0.02, -0.10, z),
        paws={"FL": (0.064, 0.388), "FR": (-0.179, 0.371), "HL": (0.141, -0.17), "HR": (-0.178, -0.16)},
        eyes={"L": ((0.058, 0.662, 0.49), 0.032, 0.026), "R": ((-0.093, 0.664, 0.49), 0.032, 0.026)},
    ),
}[who]

# ---------- 腿：从脚往上逐层找腿柱中心，得到膝盖、腿根的位置 ----------
legs = {}
for name, (px, pz) in CFG["paws"].items():
    c = np.array([px, pz]); axis = []
    for y0 in (0.03, 0.08, 0.13):
        s = P[(abs(P[:, 1] - y0) < 0.02) & (np.hypot(P[:, 0] - c[0], P[:, 2] - c[1]) < 0.08)]
        if len(s) > 20: c = np.array([s[:, 0].mean(), s[:, 2].mean()])
        axis.append(c.copy())
    paw = np.array([axis[0][0], 0.035, axis[0][1]])
    knee = np.array([axis[1][0], 0.10, axis[1][1]])
    top = np.array([axis[2][0], CFG["belly"] + 0.10, axis[2][1]])
    legs[name] = dict(paw=paw, knee=knee, top=top, toe=paw + [0, -0.015, 0.06])
    print(name, "top", top.round(3), "knee", knee.round(3), "paw", paw.round(3))

# ---------- 骨架（全部是不带旋转的骨头，静止姿势下局部轴和世界轴一致，转起来好算）----------
bones = []   # (name, parent_index, world_position)
def bone(name, parent, pos):
    bones.append((name, parent, np.array(pos, float))); return len(bones) - 1
y0 = CFG["spine_y"]
ROOT = bone("root", -1, (0, 0, 0))
HIPS = bone("hips", ROOT, (0, y0, CFG["hips_z"]))
SPINE = bone("spine", HIPS, (0, y0, CFG["spine_z"]))
CHEST = bone("chest", SPINE, (0, y0, CFG["chest_z"]))
HEAD = bone("head", CHEST, CFG["neck"])
tail_ids = []
par = HIPS
for i, p in enumerate(CFG["tail"][:-1]):
    par = bone(f"tail{i}", par, p); tail_ids.append(par)
leg_ids = {}
for name, L in legs.items():
    parent = CHEST if name[0] == "F" else HIPS
    a = bone(f"{name}_upper", parent, L["top"])
    b = bone(f"{name}_lower", a, L["knee"])
    c = bone(f"{name}_paw", b, L["paw"])
    leg_ids[name] = [a, b, c]

# 每根骨头管的那一段（从骨头起点到下一个关节）
seg = {}
seg[HIPS] = (bones[HIPS][2], bones[SPINE][2])
seg[SPINE] = (bones[SPINE][2], bones[CHEST][2])
seg[CHEST] = (bones[CHEST][2], np.array(CFG["neck"], float))
seg[HEAD] = (np.array(CFG["neck"], float), np.array(CFG["head_top"], float))
for i, b in enumerate(tail_ids): seg[b] = (np.array(CFG["tail"][i], float), np.array(CFG["tail"][i + 1], float))
for name, ids in leg_ids.items():
    L = legs[name]
    seg[ids[0]] = (L["top"], L["knee"]); seg[ids[1]] = (L["knee"], L["paw"]); seg[ids[2]] = (L["paw"], L["toe"])

def segdist(p, a, b):
    ab = b - a; t = np.clip(((p - a) @ ab) / max(ab @ ab, 1e-12), 0, 1)
    return np.linalg.norm(p - (a + t[:, None] * ab), axis=1)

def chain_weights(ids, power=4):
    d = np.stack([segdist(P, *seg[b]) for b in ids], 1)
    w = 1.0 / (d + 0.01) ** power
    return w / w.sum(1, keepdims=True)

x, y, z = P[:, 0], P[:, 1], P[:, 2]
# ---------- 各部位的归属度（0~1，交界处渐变）----------
aff = {}
aff["head"] = CFG["head_aff"](x, y, z)
aff["tail"] = CFG["tail_aff"](x, y, z) * (1 - aff["head"])
for name, L in legs.items():
    r = np.hypot(x - L["knee"][0], z - L["knee"][2])
    aff[name] = ss(CFG["belly"] + 0.07, CFG["belly"] - 0.01, y) * ss(0.11, 0.07, r)
total = sum(aff.values())
over = np.maximum(total, 1)
for k in aff: aff[k] = aff[k] / over
aff["body"] = np.clip(1 - sum(aff.values()), 0, 1)

W = np.zeros((len(P), len(bones)))
W[:, [HIPS, SPINE, CHEST]] += aff["body"][:, None] * chain_weights([HIPS, SPINE, CHEST])
W[:, HEAD] += aff["head"]
W[:, tail_ids] += aff["tail"][:, None] * chain_weights(tail_ids, 6)
for name, ids in leg_ids.items():
    W[:, ids] += aff[name][:, None] * chain_weights(ids, 6)
# 每个点最多 4 根骨头
order = np.argsort(-W, 1)[:, :4]
J4 = order.astype(np.uint16)
W4 = np.take_along_axis(W, order, 1)
W4 /= W4.sum(1, keepdims=True)
print("bones", len(bones), "max influences used", (W4 > 0.01).sum(1).max())
for k in ("head", "tail"): print(k, "verts >0.5:", (aff[k] > 0.5).sum())

# ---------- 法线：按位置焊接后重算（简化后原来的法线和表面对不上，脸上会发花）----------
key = np.round(P / 1e-6).astype(np.int64)
_, wid = np.unique(key, axis=0, return_inverse=True); wid = wid.ravel()
fn = np.cross(P[F[:, 1]] - P[F[:, 0]], P[F[:, 2]] - P[F[:, 0]])
acc_n = np.zeros((wid.max() + 1, 3))
for k in range(3): np.add.at(acc_n, wid[F[:, k]], fn)
N = acc_n[wid]; ln = np.linalg.norm(N, axis=1, keepdims=True)
N = np.where(ln > 1e-12, N / np.maximum(ln, 1e-12), [0, 1, 0])   # 没被任何面用到的零散点给个默认朝上

# ---------- 眨眼：眼睛一圈往“下眼皮线”收拢，画在贴图上的眼睛被压成一条缝 ----------
morphs = {}
for side, (c, rx, ry) in CFG["eyes"].items():
    c = np.array(c)
    d = ((x - c[0]) / (rx * 1.4)) ** 2 + ((y - c[1]) / (ry * 1.6)) ** 2
    front = z > c[2] - 0.05
    k = np.where(front & (d < 1), 0.95 * ss(1.0, 0.45, d), 0)
    lid = c[1] - 0.35 * ry
    D = np.zeros_like(P)
    D[:, 1] = (lid - y) * k
    morphs["blink" + side] = D
    print("blink", side, "verts moved:", (k > 0).sum())

# ---------- 写 GLB ----------
J = g.J
chunks, views, accs = [], [], []
def add_view(b, target=None):
    off = sum(len(c) for c in chunks); chunks.append(b + b"\0" * ((-len(b)) % 4))
    v = {"buffer": 0, "byteOffset": off, "byteLength": len(b)}
    if target: v["target"] = target
    views.append(v); return len(views) - 1
def add_acc(arr, ctype, typ, target=None, minmax=False):
    a = {"bufferView": add_view(np.ascontiguousarray(arr).tobytes(), target), "componentType": ctype, "count": len(arr), "type": typ}
    if minmax: a["min"] = arr.min(0).tolist(); a["max"] = arr.max(0).tolist()
    accs.append(a); return len(accs) - 1
ip = add_acc(P.astype(np.float32), 5126, "VEC3", 34962, True)
inr = add_acc(N.astype(np.float32), 5126, "VEC3", 34962)
iuv = add_acc(UV.astype(np.float32), 5126, "VEC2", 34962)
ij = add_acc(J4, 5123, "VEC4", 34962)
iw = add_acc(W4.astype(np.float32), 5126, "VEC4", 34962)
ii = add_acc(F.astype(np.uint32).ravel(), 5125, "SCALAR", 34963)
targets = [{"POSITION": add_acc(D.astype(np.float32), 5126, "VEC3", 34962, True)} for D in morphs.values()]
# 贴图按用途缩小：颜色 2048、法线 1024、粗糙度 512（网页上角色只占屏幕一小块，再大看不出来）
import io
from PIL import Image
mat = J["materials"][0]
limit = {}
def slot(tex, px):
    if tex is not None: limit[J["textures"][tex["index"]]["source"]] = px
slot(mat["pbrMetallicRoughness"].get("baseColorTexture"), 2048)
slot(mat.get("normalTexture"), 1024)
slot(mat["pbrMetallicRoughness"].get("metallicRoughnessTexture"), 512)
images = []
for i in range(len(J["images"])):
    b, mime = g.image_bytes(i)
    im = Image.open(io.BytesIO(b)).convert("RGB")
    k = limit.get(i, 1024) / max(im.size)
    if k < 1: im = im.resize((round(im.size[0] * k), round(im.size[1] * k)), Image.LANCZOS)
    buf = io.BytesIO(); im.save(buf, "PNG")
    images.append({"bufferView": add_view(buf.getvalue()), "mimeType": "image/png"})
    print("image", i, im.size)
# 骨头节点：平移 = 相对父骨头的位置
nodes = [{"name": who, "mesh": 0, "skin": 0}]
first_bone = 1
for i, (name, parent, pos) in enumerate(bones):
    rel = pos - (bones[parent][2] if parent >= 0 else 0)
    nodes.append({"name": name, "translation": rel.tolist()})
for i, (name, parent, pos) in enumerate(bones):
    kids = [first_bone + j for j, b in enumerate(bones) if b[1] == i]
    if kids: nodes[first_bone + i]["children"] = kids
ibm = np.stack([np.eye(4) for _ in bones]).astype(np.float32)
for i, b in enumerate(bones): ibm[i][:3, 3] = -b[2]
ibm = np.ascontiguousarray(ibm.transpose(0, 2, 1))   # glTF 矩阵按列存
iibm = add_acc(ibm.reshape(len(bones), 16), 5126, "MAT4")
out = {
    "asset": {"version": "2.0", "generator": "muse-letters rig.py"},
    "scene": 0, "scenes": [{"nodes": [0, first_bone]}],
    "nodes": nodes,
    "skins": [{"joints": list(range(first_bone, first_bone + len(bones))), "inverseBindMatrices": iibm, "skeleton": first_bone}],
    "meshes": [{"primitives": [{"attributes": {"POSITION": ip, "NORMAL": inr, "TEXCOORD_0": iuv, "JOINTS_0": ij, "WEIGHTS_0": iw},
                                "indices": ii, "material": 0, "targets": targets}],
                "weights": [0] * len(targets), "extras": {"targetNames": list(morphs)}}],
    "materials": J["materials"], "textures": J["textures"], "images": images, "samplers": J.get("samplers", [{}]),
    "accessors": accs, "bufferViews": views, "buffers": [{"byteLength": sum(len(c) for c in chunks)}],
}
if "extensionsUsed" in J: out["extensionsUsed"] = J["extensionsUsed"]
js = json.dumps(out, separators=(",", ":")).encode(); js += b" " * ((-len(js)) % 4)
body = b"".join(chunks)
open(dst, "wb").write(struct.pack("<III", 0x46546C67, 2, 28 + len(js) + len(body)) + struct.pack("<II", len(js), 0x4E4F534A) + js + struct.pack("<II", len(body), 0x004E4942) + body)
print("wrote", dst)
