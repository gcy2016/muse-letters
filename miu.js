// 小miu 的 3D 形象：橘白博美（参考图 assets/miu-avatar/）。
// 全部用代码拼出来的低多边形模型，脸朝 +z，脚踩 y=0，高约 1.6。
import * as THREE from "three";
import { fluff as rawFluff, smooth, clamp01, withGlb } from "./avatar-kit.js";

// 精细模型（GLB）放好后填路径，就会替换下面代码拼的模型；留空则只用代码模型。
// 例如 "assets/miu-avatar/miu.glb"。模型朝向不对时调 GLB_ROTATE_Y（弧度）。
var GLB_URL = "";
var GLB_ROTATE_Y = 0;
var HEIGHT = 1.6;

var ORANGE = new THREE.Color(0xec9f5e); // 背部、头顶
var CREAM = new THREE.Color(0xfff2dc); // 胸口、脸颊下半、四肢
var DEEP = new THREE.Color(0xd5823f); // 背中线、尾巴根部的深橘

// 毛团的颜色：colorAt 返回 0（奶白）~ 1（橘）~ 1.5（深橘）
var tone = new THREE.Color();
function fluff(rx, ry, rz, pos, colorAt, bump, detail) {
  return rawFluff(rx, ry, rz, pos, function (x, y, z) {
    var k = colorAt(x, y, z);
    if (k <= 1) return tone.copy(CREAM).lerp(ORANGE, Math.max(0, k));
    return tone.copy(ORANGE).lerp(DEEP, Math.min(1, k - 1));
  }, bump, detail);
}

// 身体：越靠上、越靠后越橘；前胸和肚子奶白
function bodyColor(x, y, z) {
  var k = 0.35 + clamp01((y - 0.4) / 0.4) * 0.75 - clamp01((z - 0.05) / 0.3) * 1.1;
  if (y > 0.85 && Math.abs(x) < 0.2 && z < 0.1) k += 0.4; // 背中线深一点
  return k;
}
// 头：头顶和眼睛以上橘色，脸颊下半奶白
function headColor(x, y, z) {
  return clamp01((y - 1.12) / 0.16) * 1.05 + (z < 0.2 ? 0.2 : 0) - clamp01((z - 0.45) / 0.2) * clamp01((1.24 - y) / 0.1);
}

// 返回小miu：先放代码模型，有 GLB 的话加载完自动换掉
export function createMiu() {
  return withGlb("小miu", buildSimple(), GLB_URL, GLB_ROTATE_Y, HEIGHT);
}

function buildSimple() {
  var g = new THREE.Group();

  // 腿和爪子（短）
  [[-0.2, 0.3], [0.2, 0.3], [-0.22, -0.32], [0.22, -0.32]].forEach(function (p) {
    g.add(fluff(0.12, 0.2, 0.13, [p[0], 0.2, p[1]], function () { return 0.1; }, 0.05, 2));
    g.add(fluff(0.12, 0.07, 0.15, [p[0], 0.05, p[1] + 0.04], function () { return 0; }, 0.03, 2));
  });

  // 身体（圆滚滚）+ 胸前的白毛围脖
  g.add(fluff(0.48, 0.44, 0.58, [0, 0.62, -0.05], bodyColor));
  g.add(fluff(0.42, 0.4, 0.3, [0, 0.78, 0.3], function (x, y) { return clamp01((y - 0.95) / 0.2) * 0.6; }, 0.12));

  // 头：外圈蓬松鬃毛 + 脸
  g.add(fluff(0.5, 0.44, 0.4, [0, 1.15, 0.18], function (x, y, z) {
    return clamp01((y - 1.0) / 0.25) * 1.1 - clamp01((z - 0.3) / 0.2) * clamp01((1.2 - y) / 0.2);
  }, 0.12));
  g.add(fluff(0.4, 0.37, 0.36, [0, 1.2, 0.3], headColor, 0.05));

  // 嘴筒、鼻头、嘴角
  g.add(fluff(0.15, 0.11, 0.13, [0, 1.07, 0.6], function () { return 0; }, 0.02, 2));
  var nose = smooth(new THREE.SphereGeometry(0.055, 12, 8), 0x2a1d18, 0, 1.12, 0.73, { roughness: 0.3 });
  nose.scale.set(1.25, 0.85, 0.8);
  g.add(nose);
  var lineMat = new THREE.MeshStandardMaterial({ color: 0x5a3a2a, roughness: 0.6 });
  var smile = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.009, 6, 16, Math.PI * 0.8), lineMat);
  smile.position.set(0, 1.07, 0.71);
  smile.rotation.z = Math.PI + Math.PI * 0.1; // 弧朝下 = 微笑
  g.add(smile);

  // 眼睛：大而圆、深色，带高光
  [-1, 1].forEach(function (s) {
    var eye = smooth(new THREE.SphereGeometry(0.068, 14, 10), 0x1e1410, s * 0.15, 1.24, 0.6, { roughness: 0.15 });
    eye.scale.z = 0.7;
    g.add(eye);
    g.add(smooth(new THREE.SphereGeometry(0.018, 8, 6), 0xffffff, s * 0.15 + 0.022, 1.265, 0.645, { emissive: 0xffffff, emissiveIntensity: 0.6 }));
  });

  // 三角立耳（外橘内浅）
  [-1, 1].forEach(function (s) {
    var ear = new THREE.Group();
    var outer = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.36, 4), new THREE.MeshStandardMaterial({ color: ORANGE, roughness: 1, flatShading: true }));
    outer.scale.z = 0.55;
    outer.castShadow = true;
    ear.add(outer);
    var inner = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.24, 4), new THREE.MeshStandardMaterial({ color: 0xf2c9a8, roughness: 1, flatShading: true }));
    inner.scale.z = 0.4;
    inner.position.set(0, -0.03, 0.035);
    ear.add(inner);
    ear.position.set(s * 0.25, 1.62, 0.22);
    ear.rotation.set(-0.1, 0, -s * 0.28);
    g.add(ear);
  });

  // 尾巴：蓬松大卷尾搭在背上，外圈奶白、根部橘
  var tail = new THREE.Group();
  tail.position.set(0, 0.95, -0.42);
  tail.scale.setScalar(0.8);
  [
    [0, 0.08, -0.12, 0.2, 1.3],
    [0, 0.3, -0.18, 0.28, 0.8],
    [0, 0.42, 0.02, 0.27, 0.4],
    [0, 0.28, 0.15, 0.22, 0.2],
    [0, 0.45, -0.32, 0.22, 0.1],
    [0, 0.22, -0.4, 0.17, 0],
  ].forEach(function (t) {
    var ball = fluff(t[3] * 1.1, t[3], t[3] * 1.15, [t[0], t[1], t[2]], function () { return t[4]; }, 0.16);
    tail.add(ball);
  });
  g.add(tail);
  g.userData.animate = function (t) { tail.rotation.z = Math.sin(t * 6) * 0.12; }; // 摇尾巴

  return g;
}
