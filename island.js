// Muse 小岛：最简单的三维场景。点木牌打开留言板（board.html）。
import * as THREE from "three";
import { OrbitControls } from "./lib/OrbitControls.js";
import { createMiu } from "./miu.js";

var canvas = document.getElementById("scene");
var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;

var scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fd8f0);
scene.fog = new THREE.Fog(0x9fd8f0, 90, 220);

var camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
camera.position.set(13, 10, 17);

var controls = new OrbitControls(camera, canvas);
controls.target.set(0, 1.5, 0);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 10;
controls.maxDistance = 45;
controls.maxPolarAngle = Math.PI * 0.47; // 不钻到水下

// 光
scene.add(new THREE.HemisphereLight(0xffffff, 0x6aa0b0, 0.9));
var sun = new THREE.DirectionalLight(0xfff2d6, 1.6);
sun.position.set(12, 20, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.normalBias = 0.04; // 圆滚滚的模型上不出条纹
var sc = sun.shadow.camera;
sc.left = sc.bottom = -14; sc.right = sc.top = 14;
scene.add(sun);

function mat(color, opts) {
  return new THREE.MeshStandardMaterial(Object.assign({ color: color, roughness: 0.9, flatShading: true }, opts || {}));
}
function mesh(geo, material, x, y, z) {
  var m = new THREE.Mesh(geo, material);
  m.position.set(x || 0, y || 0, z || 0);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// 海
var water = mesh(new THREE.CircleGeometry(200, 48), mat(0x3fa7c9, { roughness: 0.4, flatShading: false }));
water.rotation.x = -Math.PI / 2;
water.castShadow = false;
scene.add(water);

// 岛：沙滩 + 草地
var island = new THREE.Group();
scene.add(island);
island.add(mesh(new THREE.CylinderGeometry(9, 10.5, 1.6, 28), mat(0xf1d9a0), 0, -0.3, 0));
island.add(mesh(new THREE.CylinderGeometry(7, 8, 0.6, 24), mat(0x7cc46a), 0, 0.7, 0));
island.add(mesh(new THREE.CylinderGeometry(3.2, 4.2, 0.8, 18), mat(0x8fd27a), -2.5, 1.2, -2.2));
var GROUND = 1.0;

// 椰子树
function palm(x, z, h, lean) {
  var g = new THREE.Group();
  var trunkMat = mat(0x9b6b43);
  for (var i = 0; i < 5; i++) {
    var seg = mesh(new THREE.CylinderGeometry(0.22 - i * 0.02, 0.26 - i * 0.02, h / 5, 7), trunkMat);
    seg.position.set(lean * i * 0.18, h / 10 + (i * h) / 5, 0);
    g.add(seg);
  }
  var leafMat = mat(0x3f9d4e);
  for (var k = 0; k < 6; k++) {
    var leaf = mesh(new THREE.ConeGeometry(0.45, 2.6, 4), leafMat);
    leaf.scale.z = 0.25;
    var a = (k / 6) * Math.PI * 2;
    leaf.position.set(lean * 0.9 + Math.cos(a) * 1.0, h + 0.1, Math.sin(a) * 1.0);
    leaf.rotation.set(0, -a, Math.PI / 2 - 0.35);
    leaf.rotation.order = "YZX";
    g.add(leaf);
  }
  for (var c = 0; c < 3; c++) {
    g.add(mesh(new THREE.SphereGeometry(0.2, 6, 5), mat(0x6b4a2b), lean * 0.9 + Math.cos(c * 2.1) * 0.3, h - 0.2, Math.sin(c * 2.1) * 0.3));
  }
  g.position.set(x, GROUND, z);
  island.add(g);
}
palm(-4.5, -1, 4.2, 1);
palm(-3, -4.2, 3.4, -0.6);
palm(4.8, -3.2, 3.8, -1);

// 石头、花、灌木
function rock(x, z, s) { island.add(mesh(new THREE.DodecahedronGeometry(s, 0), mat(0x9a9a9a), x, GROUND + s * 0.3, z)); }
rock(6.2, 2.5, 0.6); rock(5.6, 3.4, 0.35); rock(-6.4, 3, 0.5); rock(8.6, -1, 0.7);
function bush(x, z) { island.add(mesh(new THREE.IcosahedronGeometry(0.6, 0), mat(0x4f9e45), x, GROUND + 0.4, z)); }
bush(-1, -5.6); bush(2.5, -5.4); bush(-5.8, 1.5);
var flowerColors = [0xff7aa2, 0xffd166, 0xffffff, 0xc58cff];
for (var f = 0; f < 18; f++) {
  var ang = f * 2.4, r = 3 + (f % 5) * 0.7;
  var fx = Math.cos(ang) * r, fz = Math.sin(ang) * r;
  if (fz > 1 && Math.abs(fx) < 2.5) continue; // 木牌前留条路
  island.add(mesh(new THREE.SphereGeometry(0.13, 6, 4), mat(flowerColors[f % 4]), fx, GROUND + 0.15, fz));
}

// 小木屋
var hut = new THREE.Group();
hut.add(mesh(new THREE.BoxGeometry(2.6, 1.8, 2.2), mat(0xd9a46b), 0, 0.9, 0));
var roof = mesh(new THREE.ConeGeometry(2.3, 1.4, 4), mat(0xc0504d), 0, 2.5, 0);
roof.rotation.y = Math.PI / 4;
hut.add(roof);
hut.add(mesh(new THREE.BoxGeometry(0.7, 1.1, 0.05), mat(0x7a4f2e), 0, 0.55, 1.11));
hut.position.set(1.5, GROUND + 0.4, -3.2);
hut.rotation.y = -0.3;
island.add(hut);

// 留言板木牌（可点击）
function textTexture(text) {
  var c = document.createElement("canvas");
  c.width = 512; c.height = 256;
  var ctx = c.getContext("2d");
  ctx.fillStyle = "#c8915a"; ctx.fillRect(0, 0, 512, 256);
  ctx.strokeStyle = "#8a5a32"; ctx.lineWidth = 8;
  for (var y = 40; y < 256; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y + 6); ctx.globalAlpha = 0.25; ctx.stroke(); }
  ctx.globalAlpha = 1; ctx.lineWidth = 14; ctx.strokeRect(7, 7, 498, 242);
  ctx.fillStyle = "#4a2c14";
  ctx.font = "bold 110px 'PingFang SC','Microsoft YaHei',sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(text, 256, 132);
  var t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
var sign = new THREE.Group();
var postMat = mat(0x7a4f2e);
sign.add(mesh(new THREE.BoxGeometry(0.22, 2.6, 0.22), postMat, -1.3, 1.3, 0));
sign.add(mesh(new THREE.BoxGeometry(0.22, 2.6, 0.22), postMat, 1.3, 1.3, 0));
var boardMats = [postMat, postMat, postMat, postMat, new THREE.MeshStandardMaterial({ map: textTexture("留言板"), roughness: 0.9 }), postMat];
var signBoard = mesh(new THREE.BoxGeometry(3.2, 1.6, 0.18), boardMats, 0, 2.2, 0.05);
sign.add(signBoard);
sign.position.set(0, GROUND, 2.6);
island.add(sign);

// 两个 Muse 的角色：小miu 是橘白博美（miu.js）；lulu 还是占位小人，等参考图
function nameTexture(text, color) {
  var c = document.createElement("canvas");
  c.width = 256; c.height = 80;
  var ctx = c.getContext("2d");
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.beginPath(); ctx.roundRect(4, 4, 248, 72, 36); ctx.fill();
  ctx.fillStyle = color;
  ctx.font = "bold 44px 'PingFang SC','Microsoft YaHei',sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(text, 128, 42);
  var t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
var muses = [];
function muse(name, color, x, z, body) {
  var g = new THREE.Group();
  if (body) g.add(body);
  else placeholder(g, color);
  var label = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameTexture(name, "#" + color.toString(16).padStart(6, "0")), depthTest: false }));
  label.scale.set(2, 0.62, 1);
  label.position.y = 2.45;
  g.add(label);
  g.position.set(x, GROUND, z);
  g.rotation.y = x < 0 ? 0.5 : -0.5;
  island.add(g);
  muses.push(g);
}
function placeholder(g, color) {
  g.add(mesh(new THREE.CapsuleGeometry(0.35, 0.5, 4, 10), mat(color, { flatShading: false }), 0, 0.6, 0));
  g.add(mesh(new THREE.SphereGeometry(0.38, 16, 12), mat(0xffe0c4, { flatShading: false }), 0, 1.35, 0));
  var eyeMat = mat(0x333333);
  g.add(mesh(new THREE.SphereGeometry(0.05, 8, 6), eyeMat, -0.13, 1.4, 0.34));
  g.add(mesh(new THREE.SphereGeometry(0.05, 8, 6), eyeMat, 0.13, 1.4, 0.34));
}
var miu = createMiu();
miu.scale.setScalar(1.2); // 和 lulu 差不多高
muse("小miu", 0x5b8def, -3.3, 4.2, miu);
muse("lulu", 0xe0607e, 3.3, 4.2);

// 云
function cloud(x, y, z) {
  var g = new THREE.Group();
  var cm = mat(0xffffff, { roughness: 1 });
  [[0, 0, 0, 1.4], [1.3, -0.2, 0.2, 1], [-1.3, -0.25, 0, 1.05], [0.5, 0.5, -0.3, 0.9]].forEach(function (p) {
    var s = mesh(new THREE.IcosahedronGeometry(p[3], 1), cm, p[0], p[1], p[2]);
    s.castShadow = false;
    g.add(s);
  });
  g.position.set(x, y, z);
  scene.add(g);
  return g;
}
var clouds = [cloud(-14, 11, -12), cloud(12, 13, -16), cloud(18, 10, 6)];

// 点击木牌
var raycaster = new THREE.Raycaster();
var pointer = new THREE.Vector2();
function hitSign(ev) {
  var rect = canvas.getBoundingClientRect();
  pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  return raycaster.intersectObject(sign, true).length > 0;
}
var down = null;
canvas.addEventListener("pointerdown", function (e) { down = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener("pointerup", function (e) {
  if (!down) return;
  var moved = Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y);
  down = null;
  if (moved < 6 && hitSign(e)) openBoard(); // 拖动旋转时不算点击
});
canvas.addEventListener("pointermove", function (e) {
  if (e.pointerType === "mouse") canvas.style.cursor = hitSign(e) ? "pointer" : "";
});

var panel = document.getElementById("panel");
var frame = document.getElementById("board");
function openBoard() {
  if (!frame.src) frame.src = "board.html";
  else frame.contentWindow.location.reload();
  panel.classList.add("open");
}
document.getElementById("open-board").onclick = openBoard;
document.getElementById("close").onclick = function () { panel.classList.remove("open"); };
panel.addEventListener("click", function (e) { if (e.target === panel) panel.classList.remove("open"); });

// 尺寸
function resize() {
  var w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w < h ? 72 : 45; // 竖屏手机拉远一点
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

// 动画：木牌轻轻晃、小人轻轻跳、小miu 摇尾巴、云飘
var clock = new THREE.Clock();
renderer.setAnimationLoop(function () {
  var t = clock.getElapsedTime();
  signBoard.rotation.z = Math.sin(t * 1.2) * 0.02;
  muses.forEach(function (m, i) { m.position.y = GROUND + Math.abs(Math.sin(t * 2 + i * 1.5)) * 0.15; });
  miu.userData.tail.rotation.z = Math.sin(t * 6) * 0.12; // 摇尾巴
  clouds.forEach(function (c, i) { c.position.x += 0.004 * (i + 1); if (c.position.x > 40) c.position.x = -40; });
  water.position.y = Math.sin(t * 0.8) * 0.05;
  controls.update();
  renderer.render(scene, camera);
});
