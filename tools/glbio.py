# 读写简单 GLB（单网格单材质），rig.py / 测量脚本共用
import json, struct, io
import numpy as np
from PIL import Image
CT = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8}
NC = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}
class GLB:
    def __init__(self, path):
        raw = open(path, "rb").read()
        jl = struct.unpack("<I", raw[12:16])[0]
        self.J = json.loads(raw[20:20 + jl]); self.BIN = raw[20 + jl + 8:]
        p = self.J["meshes"][0]["primitives"][0]
        self.P = self.acc(p["attributes"]["POSITION"]).astype(np.float64)
        self.UV = self.acc(p["attributes"]["TEXCOORD_0"]).astype(np.float64)
        self.F = self.acc(p["indices"]).astype(np.int64).reshape(-1, 3)
    def acc(self, i):
        a = self.J["accessors"][i]; bv = self.J["bufferViews"][a["bufferView"]]
        off = bv.get("byteOffset", 0) + a.get("byteOffset", 0); n = NC[a["type"]]; dt = np.dtype(CT[a["componentType"]])
        stride = bv.get("byteStride", 0)
        if stride and stride != n * dt.itemsize:   # 交错存放：每个顶点隔 stride 字节
            raw = np.frombuffer(self.BIN, dtype=np.uint8, count=stride * (a["count"] - 1) + n * dt.itemsize, offset=off)
            idx = (np.arange(a["count"]) * stride)[:, None] + np.arange(n * dt.itemsize)[None]
            arr = np.ascontiguousarray(raw[idx]).view(dt).reshape(a["count"], n)
        else:
            arr = np.frombuffer(self.BIN, dtype=dt, count=a["count"] * n, offset=off).reshape(-1, n)
        return arr if n > 1 else arr.ravel()
    def image_bytes(self, i):
        bv = self.J["bufferViews"][self.J["images"][i]["bufferView"]]; o = bv.get("byteOffset", 0)
        return self.BIN[o:o + bv["byteLength"]], self.J["images"][i].get("mimeType", "image/png")
    def texture(self, slot):   # slot: "base" | "normal"
        m = self.J["materials"][0]
        t = m["pbrMetallicRoughness"]["baseColorTexture"]["index"] if slot == "base" else m["normalTexture"]["index"]
        b, _ = self.image_bytes(self.J["textures"][t]["source"])
        return np.asarray(Image.open(io.BytesIO(b)).convert("RGB")).astype(np.float32)
def sample(img, uv):
    h, w = img.shape[:2]
    x = np.clip(uv[:, 0] * w - 0.5, 0, w - 1.001); y = np.clip(uv[:, 1] * h - 0.5, 0, h - 1.001)
    xi, yi = x.astype(int), y.astype(int); fx, fy = (x - xi)[:, None], (y - yi)[:, None]
    return (img[yi, xi] * (1 - fx) * (1 - fy) + img[yi, xi + 1] * fx * (1 - fy) + img[yi + 1, xi] * (1 - fx) * fy + img[yi + 1, xi + 1] * fx * fy)
