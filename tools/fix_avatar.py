# 修混元生成的角色模型（2026-10-27，用户发来的 lulu 第一版、小miu 多视图版）：
# 删掉不相连的碎块；lulu 再删掉多出来的尾巴 B、补洞（照右半边镜像补形状和毛色），把尾巴 A 挪到正中、卷尖朝后，清掉左后脚背上的杂块。
# 里面的坐标是对着这两个文件测出来的，换了模型要重新量。
# 用法：python tools/fix_avatar.py in.glb out.glb [--lulu]
# 完整流程（出来的就是 assets/*-avatar/*.glb）：
#   1. python tools/fix_avatar.py 原始.glb fixed.glb [--lulu]
#   2. gltf-transform weld fixed.glb weld.glb && gltf-transform simplify weld.glb simp.glb --ratio 0.045 --error 0.002
#   3. python tools/rig_avatar.py simp.glb rig.glb lulu|miu
#   4. gltf-transform webp rig.glb webp.glb --quality 85 && gltf-transform meshopt webp.glb out.glb --level medium
import sys, json, struct
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components

src, dst = sys.argv[1], sys.argv[2]
LULU = "--lulu" in sys.argv

# ---------- 读 GLB ----------
raw = open(src, "rb").read()
jlen = struct.unpack("<I", raw[12:16])[0]
J = json.loads(raw[20:20 + jlen])
binoff = 20 + jlen + 8
BIN = raw[binoff:]
CT = {5126: np.float32, 5125: np.uint32, 5123: np.uint16}
NC = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}
def acc(i):
    a = J["accessors"][i]; bv = J["bufferViews"][a["bufferView"]]
    off = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
    n = NC[a["type"]]; dt = CT[a["componentType"]]
    arr = np.frombuffer(BIN, dtype=dt, count=a["count"] * n, offset=off)
    return arr.reshape(-1, n) if n > 1 else arr
prim = J["meshes"][0]["primitives"][0]
P = acc(prim["attributes"]["POSITION"]).astype(np.float64)
UV = acc(prim["attributes"]["TEXCOORD_0"]).astype(np.float32)
F = acc(prim["indices"]).astype(np.int64).reshape(-1, 3)
# 节点绕 x 轴转了 90°：直接把旋转烘进顶点，(x, y, z) -> (x, -z, y)，之后 y 朝上
P = np.stack([P[:, 0], -P[:, 2], P[:, 1]], 1)
print("in: verts", len(P), "faces", len(F))

# ---------- 按位置焊接（UV 接缝处的重复顶点算同一个点）----------
key = np.round(P / 1e-6).astype(np.int64)
_, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
inv = inv.reshape(-1)
W = P[first].copy()                     # 焊接后的位置
WF = inv[F]                             # 焊接后的面

def components(wf, n):
    e = np.vstack([wf[:, [0, 1]], wf[:, [1, 2]], wf[:, [2, 0]]])
    g = coo_matrix((np.ones(len(e)), (e[:, 0], e[:, 1])), shape=(n, n))
    return connected_components(g, directed=False)[1]

# ---------- 1. 删掉不相连的碎块，只留最大的一块 ----------
lab = components(WF, len(W))[WF[:, 0]]
keep = lab == np.bincount(lab).argmax()
print("removed loose faces:", (~keep).sum())

def boundary_edges(wf):
    e = np.sort(np.vstack([wf[:, [0, 1]], wf[:, [1, 2]], wf[:, [2, 0]]]), 1)
    u, c = np.unique(e, axis=0, return_counts=True)
    return u[c == 1]
print("open edges before:", len(boundary_edges(WF[keep])))

cap_faces = np.zeros((0, 3), np.int64)
if LULU:
    # ---------- 2. 删掉尾巴 B（从猫的左侧屁股伸出去的那条）----------
    x, y, z = W[:, 0], W[:, 1], W[:, 2]
    inB = (x > 0.185) & (z < -0.2) & (y > 0.28)
    killB = inB[WF].any(1)
    keep &= ~killB
    print("removed tail B faces:", killB.sum())

    # ---------- 2b. 左后脚背上那一小坨：先切断它和腿相连的一窄条，它就成了单独一块，整块删掉 ----------
    band = (x > 0.06) & (x < 0.17) & (y > 0.066) & (y < 0.096) & (z > -0.258) & (z < -0.240)
    kb = keep & band[WF].any(1)
    keep &= ~kb
    fl = components(WF[keep], len(W))[WF[:, 0]]
    big = np.bincount(fl[keep]).argmax()
    small = keep & (fl != big)
    keep &= ~small
    print("removed paw lump faces:", kb.sum() + small.sum())

    # ---------- 3. 补洞：每个开口从外圈往中心一圈圈收拢（不在边上加点，周围的面不会裂）----------
    be = boundary_edges(WF[keep])
    adj = {}
    for a, b in be:
        adj.setdefault(a, []).append(b); adj.setdefault(b, []).append(a)
    seen, loops = set(), []
    for s0 in adj:
        if s0 in seen: continue
        loop, prev, cur = [s0], None, s0
        seen.add(s0)
        while True:
            nxt = [t for t in adj[cur] if t != prev and t not in seen]
            if not nxt: break
            prev, cur = cur, nxt[0]; seen.add(cur); loop.append(cur)
        loops.append(loop)
    print("hole loops:", [len(l) for l in loops])
    # 洞口边上的面原来的走向，用来决定补面的朝向
    kf = WF[keep]
    edge_dir = {}
    for f3 in kf[np.isin(kf, np.array(list(adj))).any(1)]:
        for i in range(3): edge_dir[(f3[i], f3[(i + 1) % 3])] = True
    new_w, caps, centers, lump_new = [], [], [], []
    K = 10
    for loop in loops:
        if len(loop) < 3: continue
        loop = np.array(loop)
        if (loop[0], loop[1]) in edge_dir: loop = loop[::-1]   # 补面边的走向要和原面相反
        c = W[loop].mean(0)
        is_lump = c[1] < 0.2                     # 脚背那个洞；其余是尾巴 B 留下的洞
        if not is_lump: centers.append(c)
        n_before = len(new_w)
        prev_ids = loop
        for k in range(1, K):
            t = k / K
            pts = W[loop] * (1 - t) + c * t
            ids = np.arange(len(W) + len(new_w), len(W) + len(new_w) + len(loop)); new_w.extend(pts)
            n = len(loop)
            for i in range(n):
                a, b = prev_ids[i], prev_ids[(i + 1) % n]
                cc, d = ids[i], ids[(i + 1) % n]
                caps.append([a, b, d]); caps.append([a, d, cc])
            prev_ids = ids
        ci = len(W) + len(new_w); new_w.append(c)
        for i in range(len(loop)):
            caps.append([prev_ids[i], prev_ids[(i + 1) % len(loop)], ci])
        lump_new.extend([is_lump] * (len(new_w) - n_before))
    nW0 = len(W)
    W = np.vstack([W, np.array(new_w)])
    cap_faces = np.array(caps, np.int64)
    centers = np.array(centers)
    lump_new = np.array(lump_new)
    print("cap verts", len(new_w), "cap faces", len(cap_faces), "centers", centers.round(3).tolist())

    # ---------- 4. 用右半边屁股做镜子：把左边洞口一带推到镜像后的表面上，残根就没了 ----------
    from scipy.spatial import cKDTree
    def xfade(x):   # 中线附近（x 0.04→0.10）从不改渐变到全改
        t = np.clip((x - 0.04) / 0.06, 0, 1); return t * t * (3 - 2 * t)
    x0, y0, z0 = W[:nW0, 0], W[:nW0, 1], W[:nW0, 2]
    tailA0 = (x0 < 0.1) & (z0 < -0.25) & (y0 > 0.40)
    alive = np.zeros(nW0, bool); alive[np.unique(WF[keep])] = True
    right = alive & (x0 < -0.03) & ~tailA0
    ridx = np.where(right)[0]
    mir = W[ridx] * np.array([-1, 1, 1])
    tree = cKDTree(mir)
    dist_c = np.min(np.linalg.norm(W[:, None, :] - centers[None], axis=2), 1)
    R0, R1 = 0.05, 0.1
    region = (dist_c < R1) & (W[:, 0] > 0.04)
    region[:nW0] &= alive
    region[nW0:] = ~lump_new                   # 脚背的补面不照镜子（两条后腿姿势不一样）
    wgt = np.clip((R1 - dist_c) / (R1 - R0), 0, 1); wgt = wgt * wgt * (3 - 2 * wgt)
    wgt *= xfade(W[:, 0])
    wgt[nW0:] = np.where(lump_new, 0, 1)
    ri = np.where(region)[0]
    _, nn = tree.query(W[ri])
    W[ri] += wgt[ri, None] * (mir[nn] - W[ri])
    # 再轻轻抹几遍，去掉投影留下的小台阶
    allf = np.vstack([WF[keep], cap_faces])
    e = np.vstack([allf[:, [0, 1]], allf[:, [1, 2]], allf[:, [2, 0]]]); e = np.vstack([e, e[:, ::-1]])
    A = coo_matrix((np.ones(len(e)), (e[:, 0], e[:, 1])), shape=(len(W), len(W))).tocsr(); A.data[:] = 1
    deg = np.asarray(A.sum(1)).ravel(); deg[deg == 0] = 1
    for it in range(8):
        W = W + (0.5 * wgt * region)[:, None] * ((A @ W) / deg[:, None] - W)
    # 补面顶点的 UV：取镜像位置上右半边那个点的 UV（贴图上的条纹也跟着镜像过来）
    _, nn = tree.query(W[nW0:] * np.array([-1, 1, 1]))
    cap_uv_src = first[ridx[nn]]
    print("projected verts:", len(ri))

    # ---------- 5. 尾巴 A：整条挪到正中，卷尖转向正后方 ----------
    # 实测：尾巴 A 从屁股后面约 0.41 高处长出来，中心 x≈-0.09，往上偏到 -0.11～-0.15。
    # 所有分界都做成渐变，免得挪动的点和不动的点之间撕出折痕。
    def ss(e0, e1, v):
        t = np.clip((v - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)
    x, y, z = W[:, 0], W[:, 1], W[:, 2]
    # 尾巴根部：按离尾巴中轴的水平距离判断（管子里整段挪，管子外 3 厘米内渐变）
    cx = -0.086 - np.clip(y - 0.42, 0, 0.14) * 0.22
    cz = -0.394 - np.clip(y - 0.42, 0, 0.12) * 0.30
    r = np.hypot(x - cx, z - cz)
    side = ss(0.09, 0.06, r)
    # 再往上（屁股以上）后面只有尾巴，整块都算
    side = np.maximum(side, ss(0.52, 0.56, y) * ss(-0.28, -0.32, z) * ss(0.08, 0.04, x))
    # 平移：尾巴本身整段挪；尾巴根周围的屁股后面一片跟着滑过去（离根越远挪得越少），根才能落到正中又不扯皮
    base = np.array([-0.09, 0.42, -0.40])
    d = np.linalg.norm(W - base, axis=1)
    warp = ss(0.28, 0.07, d) * ss(-0.18, -0.30, z)
    w_shift = np.maximum(ss(0.40, 0.46, y) * side, warp)
    w_rot = ss(0.45, 0.56, y) * side                   # 露出屁股以后：再转卷尖
    piv = np.array([-0.104, 0, -0.427])                # 0.50 高处尾巴截面的中心
    ang = np.deg2rad(-90) * w_rot                      # 卷尖原来朝猫的右侧，转 -90° 朝后
    dx, dz = x - piv[0], z - piv[2]
    nx = piv[0] + dx * np.cos(ang) + dz * np.sin(ang)
    nz = piv[2] - dx * np.sin(ang) + dz * np.cos(ang)
    W[:, 0] = nx + 0.10 * w_shift
    W[:, 2] = nz
    print("tail A moved verts:", (w_shift > 0).sum())

# ---------- 6. 拼回带 UV 的顶点，重算平滑法线 ----------
F2 = F[keep]
outP = W[inv]                                      # 原顶点按焊接位置更新
outUV = UV.copy()
if len(cap_faces):
    # 补洞的面：圈上的点沿用原顶点；新加的点用镜像过来的 UV
    cap_ids = np.unique(cap_faces)
    newv = cap_ids[cap_ids >= nW0]
    ring = cap_ids[cap_ids < nW0]
    remap = {w: len(outP) + i for i, w in enumerate(np.concatenate([newv, ring]))}
    outP = np.vstack([outP, W[newv], W[ring]])
    # 圈上的点：复制一份，也用镜像 UV，这样补面整块用的都是右边那片贴图
    _, nn2 = tree.query(W[ring] * np.array([-1, 1, 1]))
    outUV = np.vstack([outUV, UV[cap_uv_src[newv - nW0]], UV[first[ridx[nn2]]]])
    inv = np.concatenate([inv, newv, ring])
    F2 = np.vstack([F2, np.vectorize(remap.get)(cap_faces)])
# 去掉没被引用的顶点
used = np.unique(F2)
newidx = -np.ones(len(outP), np.int64); newidx[used] = np.arange(len(used))
outP, outUV, winv, F2 = outP[used], outUV[used], inv[used], newidx[F2]
# 法线：在焊接拓扑上算面积加权平均，接缝两侧一致
fn = np.cross(outP[F2[:, 1]] - outP[F2[:, 0]], outP[F2[:, 2]] - outP[F2[:, 0]])
_, wid = np.unique(winv, return_inverse=True)
acc_n = np.zeros((wid.max() + 1, 3))
for k in range(3): np.add.at(acc_n, wid[F2[:, k]], fn)
N = acc_n[wid]; N /= np.linalg.norm(N, axis=1, keepdims=True) + 1e-12
print("out: verts", len(outP), "faces", len(F2))

# ---------- 6b. lulu：重绘洞口一带的贴图（照镜子取右半边的毛色），补面单独放到贴图底部新加的一条 ----------
import io
from PIL import Image
def load_img(i):
    bv = J["bufferViews"][J["images"][i]["bufferView"]]
    o = bv.get("byteOffset", 0)
    return np.asarray(Image.open(io.BytesIO(BIN[o:o + bv["byteLength"]])).convert("RGB")).astype(np.float32)
tex = None
if LULU:
    from scipy.spatial import cKDTree
    tex = [load_img(i) for i in range(len(J["images"]))]
    Ht, Wt = tex[0].shape[:2]
    STRIP = 256
    H2 = Ht + STRIP
    tex = [np.vstack([t, np.zeros((STRIP, t.shape[1], 3), np.float32)]) for t in tex]
    outUV = outUV.astype(np.float64)
    outUV[:, 1] *= Ht / H2
    # 补面顶点（排在最后）在新加的那条里按平面投影摊开
    ncap = len(newv) + len(ring)
    capv = np.arange(len(outP) - ncap, len(outP))
    cp = outP[capv] - outP[capv].mean(0)
    _, _, vt = np.linalg.svd(cp, full_matrices=False)
    q = cp @ vt[:2].T
    q -= q.min(0); sc = min((STRIP - 32) / q[:, 1].max(), (Wt / 2) / q[:, 0].max())
    outUV[capv, 0] = (16 + q[:, 0] * sc) / Wt
    outUV[capv, 1] = (Ht + 16 + q[:, 1] * sc) / H2
    capset = np.zeros(len(outP), bool); capset[capv] = True

    def wfun(p):
        d = np.min(np.linalg.norm(p[:, None, :] - centers[None], axis=2), 1)
        w = np.clip((R1 - d) / (R1 - R0), 0, 1); w = w * w * (3 - 2 * w)
        return w * xfade(p[:, 0])
    # 参照：右半边身体的三角面
    tri = outP[F2]
    cen = tri.mean(1)
    refm = (tri[:, :, 0] < -0.04).all(1) & (cen[:, 1] < 0.5)
    ref_t = np.where(refm)[0]
    rtree = cKDTree(cen[ref_t])
    # 要重绘的三角面：洞口附近左边的 + 全部补面
    vw = wfun(outP)
    lumpcap = capset[F2].all(1) & (outP[F2].mean(1)[:, 1] < 0.2)
    lump_c = outP[F2[lumpcap]].reshape(-1, 3).mean(0) if lumpcap.any() else None
    tgt = np.where((vw[F2] > 0).any(1) | capset[F2].all(1))[0]
    # 脚背补面周围一圈（不含补面本身）的 UV，用来取平均颜色
    if lump_c is not None:
        nb = (~capset) & (np.linalg.norm(outP - lump_c, axis=1) < 0.015)
        lump_uv = outUV[nb] * [Wt, H2] - 0.5
    print("bake triangles:", len(tgt))
    PX, PY, PP, PW, PL = [], [], [], [], []
    for t in tgt:
        uv = outUV[F2[t]] * [Wt, H2]
        x0, y0 = np.floor(uv.min(0)).astype(int); x1, y1 = np.ceil(uv.max(0)).astype(int)
        gx, gy = np.meshgrid(np.arange(x0 - 3, x1 + 4), np.arange(y0 - 3, y1 + 4))
        pts = np.stack([gx.ravel() + 0.5, gy.ravel() + 0.5], 1)
        a, b, c = uv
        m = np.array([b - a, c - a]).T
        if abs(np.linalg.det(m)) < 1e-9: continue
        l12 = np.linalg.solve(m, (pts - a).T).T
        bc = np.column_stack([1 - l12.sum(1), l12])
        area2 = abs(np.linalg.det(m))
        min_alt = area2 / max(np.linalg.norm(b - a), np.linalg.norm(c - b), np.linalg.norm(a - c))
        eps = min((6.0 if capset[F2[t]].all() else 2.5) / max(min_alt, 1e-6), 1.0)   # 往外多涂约 2.5 个像素：缩小看（mipmap）时边上不会透出旧颜色
        ok = (bc >= -eps).all(1)
        if not ok.any(): continue
        bc = bc[ok]; p = bc @ outP[F2[t]]
        PX.append(gx.ravel()[ok]); PY.append(gy.ravel()[ok]); PP.append(p)
        PW.append(np.ones(len(p)) if capset[F2[t]].all() else wfun(p))
        PL.append(np.full(len(p), lumpcap[t]))
    PX = np.concatenate(PX); PY = np.concatenate(PY); PP = np.vstack(PP); PW = np.concatenate(PW); PL = np.concatenate(PL)
    inb = (PX >= 0) & (PX < Wt) & (PY >= 0) & (PY < H2)
    PX, PY, PP, PW, PL = PX[inb], PY[inb], PP[inb], PW[inb], PL[inb]
    # 镜像点落在哪个右侧三角面上，插值出那里的 UV
    mp = PP * [-1, 1, 1]
    _, k = rtree.query(mp)
    rt = F2[ref_t[k]]
    A_, B_, C_ = outP[rt[:, 0]], outP[rt[:, 1]], outP[rt[:, 2]]
    v0, v1, v2 = B_ - A_, C_ - A_, mp - A_
    d00 = (v0 * v0).sum(1); d01 = (v0 * v1).sum(1); d11 = (v1 * v1).sum(1); d20 = (v2 * v0).sum(1); d21 = (v2 * v1).sum(1)
    den = d00 * d11 - d01 * d01; den[den == 0] = 1e-12
    bv_ = (d11 * d20 - d01 * d21) / den; bw = (d00 * d21 - d01 * d20) / den
    bary = np.clip(np.column_stack([1 - bv_ - bw, bv_, bw]), 0, None); bary /= bary.sum(1, keepdims=True)
    suv = (bary[:, :, None] * outUV[rt]).sum(1) * [Wt, H2] - 0.5
    def bilinear(img, xy):
        x = np.clip(xy[:, 0], 0, img.shape[1] - 1.001); y = np.clip(xy[:, 1], 0, img.shape[0] - 1.001)
        xi, yi = x.astype(int), y.astype(int); fx, fy = (x - xi)[:, None], (y - yi)[:, None]
        return (img[yi, xi] * (1 - fx) * (1 - fy) + img[yi, xi + 1] * fx * (1 - fy)
                + img[yi + 1, xi] * (1 - fx) * fy + img[yi + 1, xi + 1] * fx * fy)
    w = PW[:, None]
    flat = np.array([128, 128, 255], np.float32)
    nt = [None] * len(tex)
    capT = (PY >= Ht)
    for i in range(len(tex)):
        src = bilinear(tex[i], suv)
        if lump_c is not None and PL.any():
            src[PL] = bilinear(tex[i], lump_uv).mean(0)
        if i == J["materials"][0].get("normalTexture", {}).get("index", -1) and J["textures"][i]["source"] == i:
            src = np.repeat(flat[None], len(PX), 0)     # 法线贴图：重绘区域放平
        tex[i][Ht:] = src[capT].mean(0) if capT.any() else tex[i][:Ht].mean((0, 1))
        cur = tex[i][PY, PX]
        nt[i] = tex[i].copy()
        nt[i][PY, PX] = cur * (1 - w) + src * w
    tex = nt
    print("baked texels:", len(PX))

# ---------- 7. 写 GLB：几何换成新的，三张贴图原样保留 ----------
chunks, views = [], []
def add_view(b, target=None):
    off = sum(len(c) for c in chunks)
    pad = (-len(b)) % 4
    chunks.append(b + b"\0" * pad)
    v = {"buffer": 0, "byteOffset": off, "byteLength": len(b)}
    if target: v["target"] = target
    views.append(v); return len(views) - 1
accs = []
def add_acc(arr, ctype, typ, target, minmax=False):
    vi = add_view(arr.tobytes(), target)
    a = {"bufferView": vi, "componentType": ctype, "count": len(arr), "type": typ}
    if minmax: a["min"] = arr.min(0).tolist(); a["max"] = arr.max(0).tolist()
    accs.append(a); return len(accs) - 1
ip = add_acc(outP.astype(np.float32), 5126, "VEC3", 34962, True)
inn = add_acc(N.astype(np.float32), 5126, "VEC3", 34962)
iuv = add_acc(outUV.astype(np.float32), 5126, "VEC2", 34962)
iix = add_acc(F2.astype(np.uint32).reshape(-1), 5125, "SCALAR", 34963)
images = []
for i, img in enumerate(J["images"]):
    if tex is not None:
        buf = io.BytesIO(); Image.fromarray(np.clip(tex[i], 0, 255).astype(np.uint8)).save(buf, "PNG"); b = buf.getvalue()
    else:
        bv = J["bufferViews"][img["bufferView"]]
        b = BIN[bv.get("byteOffset", 0): bv.get("byteOffset", 0) + bv["byteLength"]]
    images.append({"bufferView": add_view(b), "mimeType": "image/png"})
out = {
    "asset": {"version": "2.0", "generator": "muse-letters fix.py"},
    "scene": 0, "scenes": [{"nodes": [0]}],
    "nodes": [{"mesh": 0, "name": "lulu" if LULU else "miu"}],
    "meshes": [{"primitives": [{"attributes": {"POSITION": ip, "NORMAL": inn, "TEXCOORD_0": iuv}, "indices": iix, "material": 0}]}],
    "materials": J["materials"], "textures": J["textures"], "images": images,
    "samplers": J.get("samplers", [{}]),
    "accessors": accs, "bufferViews": views,
    "buffers": [{"byteLength": sum(len(c) for c in chunks)}],
}
for k in ("extensionsUsed",):
    if k in J: out[k] = J[k]
js = json.dumps(out, separators=(",", ":")).encode()
js += b" " * ((-len(js)) % 4)
body = b"".join(chunks)
glb = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(body))
glb += struct.pack("<II", len(js), 0x4E4F534A) + js + struct.pack("<II", len(body), 0x004E4942) + body
open(dst, "wb").write(glb)
print("wrote", dst, len(glb))
