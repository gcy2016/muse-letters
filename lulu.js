// lulu 的 3D 形象：美短起司猫，灰白虎斑（参考图 assets/lulu-avatar/）。
// 全部用代码拼出来的模型，四脚站立，脸朝 +z，脚踩 y=0，耳尖高约 1.6。
import * as THREE from "three";
import { fluff, smooth, clamp01, withGlb } from "./avatar-kit.js";

// 精细模型（GLB）放好后填路径，就会替换下面代码拼的模型；留空则只用代码模型。
// 例如 "assets/lulu-avatar/lulu.glb"。模型朝向不对时调 GLB_ROTATE_Y（弧度）。
var GLB_URL = "";
var GLB_ROTATE_Y = 0;
var HEIGHT = 1.6;

var WHITE = new THREE.Color(0xf8f8f6); // 脸中间、胸口、四肢、爪子
var GRAY = new THREE.Color(0xa3a2a7); // 背、身体两侧、头顶
var DARK = new THREE.Color(0x5e5e66); // 虎斑条纹、尾巴的深色环
var PINK = 0xf2b5bb;

// 毛色：先在浅灰和深灰之间按条纹取色，再按 white 往白色过渡
var tone = new THREE.Color();
function fur(stripe, white) {
  return tone.copy(GRAY).lerp(DARK, clamp01(stripe)).lerp(WHITE, clamp01(white));
}
// 背上和身体两侧的虎斑：横跨脊背的一道道条纹
function backStripe(x, y, z) { return clamp01((Math.sin(z * 22 + Math.sin(y * 8) * 1.2 + Math.abs(x) * 4) - 0.3) / 0.5) * 0.85; }

// 身体：背和两侧灰色虎斑；肚子、前胸和肩膀白
function bodyColor(x, y, z) {
  return fur(backStripe(x, y, z), clamp01((z - 0.1) / 0.12) + clamp01((0.5 - y) / 0.08));
}
// 后腿大腿：上面灰色虎斑，往下变白
function thighColor(x, y, z) {
  return fur(backStripe(x, y, z), clamp01((0.42 - y) / 0.1));
}
// 头（中心在 0, 1.2, 0.38）：额头中间一道白、眼睛以下白；头顶有竖纹，两颊有横纹
function headColor(x, y, z) {
  var ax = Math.abs(x), ly = y - 1.2, lz = z - 0.38;
  var white = clamp01((-0.01 - ly) / 0.04) * clamp01((lz + 0.05) / 0.1)
    + clamp01((0.045 + (0.25 - ly) * 0.25 - ax) / 0.03) * clamp01((lz - 0.1) / 0.08);
  var stripe = clamp01((Math.cos(x * 40) - 0.4) / 0.5) * clamp01((ly - 0.05) / 0.08); // 头顶竖纹
  if (ax > 0.17 && ly > -0.05 && ly < 0.08 && lz > 0) stripe = Math.max(stripe, clamp01((Math.sin(y * 70) - 0.5) / 0.4)); // 脸颊横纹
  return fur(stripe, white);
}
function white() { return WHITE; }

export function createLulu() {
  return withGlb("lulu", buildSimple(), GLB_URL, GLB_ROTATE_Y, HEIGHT);
}

function buildSimple() {
  var g = new THREE.Group();

  // 身体（细长）+ 白色前胸 + 脖子
  g.add(fluff(0.26, 0.27, 0.5, [0, 0.62, -0.1], bodyColor, 0.03));
  g.add(fluff(0.24, 0.28, 0.2, [0, 0.72, 0.26], white, 0.03));
  g.add(fluff(0.2, 0.18, 0.18, [0, 0.9, 0.3], white, 0.03, 2));

  // 四条细腿，白袜子；前爪有粉色肉垫
  [-1, 1].forEach(function (s) {
    g.add(fluff(0.075, 0.27, 0.08, [s * 0.12, 0.27, 0.28], white, 0.02, 2));
    g.add(fluff(0.085, 0.05, 0.1, [s * 0.12, 0.04, 0.32], white, 0.02, 2));
    for (var k = -1; k <= 1; k++) {
      g.add(smooth(new THREE.SphereGeometry(0.016, 8, 6), PINK, s * 0.12 + k * 0.035, 0.02, 0.41 - Math.abs(k) * 0.012, { roughness: 0.7 }));
    }
    g.add(fluff(0.13, 0.2, 0.17, [s * 0.15, 0.5, -0.42], thighColor, 0.03, 2));
    g.add(fluff(0.075, 0.25, 0.085, [s * 0.15, 0.25, -0.44], white, 0.02, 2));
    g.add(fluff(0.085, 0.05, 0.1, [s * 0.15, 0.04, -0.4], white, 0.02, 2));
  });

  // 头：零件按原坐标搭好，再把整个头往下、往后挪一点贴近身体（以后转头也是转这个组）
  var head = new THREE.Group();
  head.position.set(0, -0.08, -0.03);
  g.add(head);
  head.add(fluff(0.3, 0.27, 0.26, [0, 1.2, 0.38], headColor, 0.025));
  // 嘴筒：两团鼓鼓的腮帮 + 下巴，都是白的
  [-1, 1].forEach(function (s) { head.add(fluff(0.07, 0.055, 0.055, [s * 0.05, 1.09, 0.6], white, 0.01, 2)); });
  head.add(fluff(0.045, 0.03, 0.04, [0, 1.05, 0.58], white, 0.01, 2));
  // 粉鼻头（倒三角）
  var nose = smooth(new THREE.ConeGeometry(0.033, 0.033, 3), 0xf0a5ae, 0, 1.135, 0.655, { roughness: 0.4 });
  nose.rotation.set(Math.PI / 2 + 0.25, Math.PI, 0);
  nose.scale.set(1.3, 1, 0.8);
  head.add(nose);
  // 鼻子下面的小竖线
  head.add(smooth(new THREE.CylinderGeometry(0.004, 0.004, 0.035, 4), 0xc99aa0, 0, 1.1, 0.655));

  // 眼睛：琥珀色虹膜、黑瞳孔、高光
  [-1, 1].forEach(function (s) {
    var x = s * 0.11;
    var iris = smooth(new THREE.SphereGeometry(0.058, 16, 12), 0xc28e45, x, 1.23, 0.6, { roughness: 0.2 });
    iris.scale.z = 0.55;
    head.add(iris);
    var pupil = smooth(new THREE.SphereGeometry(0.035, 12, 10), 0x111111, x, 1.23, 0.633, { roughness: 0.1 });
    pupil.scale.set(0.85, 1.2, 0.4);
    head.add(pupil);
    head.add(smooth(new THREE.SphereGeometry(0.013, 8, 6), 0xffffff, x + 0.018, 1.25, 0.648, { emissive: 0xffffff, emissiveIntensity: 0.6 }));
  });

  // 大尖耳朵（外灰内粉）
  [-1, 1].forEach(function (s) {
    var ear = new THREE.Group();
    var outer = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.32, 4), new THREE.MeshStandardMaterial({ color: GRAY, roughness: 1, flatShading: true }));
    outer.scale.z = 0.45;
    outer.castShadow = true;
    ear.add(outer);
    var inner = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.23, 4), new THREE.MeshStandardMaterial({ color: PINK, roughness: 1, flatShading: true }));
    inner.scale.z = 0.3;
    inner.position.set(0, -0.025, 0.03);
    ear.add(inner);
    ear.position.set(s * 0.18, 1.45, 0.34);
    ear.rotation.set(-0.05, 0, -s * 0.3);
    head.add(ear);
  });

  // 胡须：每边三根细白线
  var whiskerMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  [-1, 1].forEach(function (s) {
    for (var k = 0; k < 3; k++) {
      var w = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.24, 3), whiskerMat);
      w.position.set(s * 0.17, 1.09 - k * 0.018, 0.6);
      w.rotation.set(0, s * 0.4, Math.PI / 2 + s * (k - 1) * 0.12);
      head.add(w);
    }
  });

  // 尾巴：从屁股往后、往下伸，灰黑相间的环，尾尖深色
  var tail = new THREE.Group();
  tail.position.set(0, 0.66, -0.56);
  var N = 24;
  for (var i = 0; i < N; i++) {
    var r = 0.075 - i * 0.001;
    var c = i >= N - 3 || i % 5 >= 3 ? DARK : GRAY;
    var a = i / (N - 1); // 先往后、往下垂，尾尖再微微翘起
    tail.add(fluff(r, r, r, [0, -0.42 * Math.sin(a * 2.4) * 0.9 + a * a * 0.12, -0.04 - a * 0.68], function () { return c; }, 0.03, 2));
  }
  g.add(tail);
  g.userData.animate = function (t) { tail.rotation.y = Math.sin(t * 1.8) * 0.25; }; // 尾巴慢慢甩

  return g;
}
