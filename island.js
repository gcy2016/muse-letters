// 噜噜岛：岛上是噜噜之家（house.js），从外面看盖着屋顶。右上角按钮打开留言板（board.html）；
// 点房子的门进屋（house.html，从玄关开始看）。门锁：这个浏览器开过锁，门就开着；没开过，点门先输密码。
// 小岛单位是米，和房子一样。小miu 和 lulu 先只待在房子里。
// ?from=house：从屋里出来，镜头停在门口
import * as THREE from "three";
import { OrbitControls } from "./lib/OrbitControls.js";
import { loadHouse } from "./house.js";
import { RoomEnvironment } from "./lib/RoomEnvironment.js";
import { isUnlocked, unlock } from "./lock.js";

var params = new URLSearchParams(location.search);
var canvas = document.getElementById("scene");
var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

var scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fd8f0);
scene.fog = new THREE.Fog(0x9fd8f0, 110, 260);

var camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
var controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 6;
controls.maxDistance = 70;
controls.maxPolarAngle = Math.PI * 0.47; // 不钻到水下

// 光
scene.add(new THREE.HemisphereLight(0xffffff, 0x6aa0b0, 1.0));
var sun = new THREE.DirectionalLight(0xfff2d6, 1.8);
sun.position.set(14, 24, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.normalBias = 0.04;
var sc = sun.shadow.camera;
sc.left = sc.bottom = -22; sc.right = sc.top = 22; sc.far = 80;
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
var water = mesh(new THREE.CircleGeometry(220, 48), mat(0x3fa7c9, { roughness: 0.4, flatShading: false }));
water.rotation.x = -Math.PI / 2;
water.castShadow = false;
scene.add(water);

// 岛：沙滩 + 草地（放得下 10×7.5 米的房子和前院）
var island = new THREE.Group();
scene.add(island);
island.add(mesh(new THREE.CylinderGeometry(17, 19.5, 1.6, 40), mat(0xf1d9a0), 0, -0.3, 0));
island.add(mesh(new THREE.CylinderGeometry(14.5, 15.5, 0.6, 36), mat(0x7cc46a), 0, 0.7, 0));
island.add(mesh(new THREE.CylinderGeometry(3.2, 4.4, 0.8, 18), mat(0x8fd27a), 9, 1.2, -7.5));
var GROUND = 1.0;

// 房子放在岛中间偏后，门朝前（+z）。房子底座高 0.25，压在草地上
var HOUSE_POS = new THREE.Vector3(0, GROUND + 0.25, -2.5);

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
  g.scale.setScalar(1.3);
  island.add(g);
}
palm(-9, -3, 4.2, 1);
palm(-7.5, -9, 3.6, -0.6);
palm(9.5, -2.5, 4, -1);
palm(11, 4.5, 3.4, -0.8);
palm(-11, 5, 3.8, 0.8);

// 石头、花、灌木
function rock(x, z, s) { island.add(mesh(new THREE.DodecahedronGeometry(s, 0), mat(0x9a9a9a), x, GROUND + s * 0.3, z)); }
rock(7.5, 7, 0.6); rock(6.8, 8, 0.35); rock(-8, 9, 0.5); rock(13, -2, 0.7); rock(-12.5, -2, 0.6);
function bush(x, z, s) { island.add(mesh(new THREE.IcosahedronGeometry(s || 0.6, 0), mat(0x4f9e45), x, GROUND + (s || 0.6) * 0.65, z)); }
bush(-4, 1.7); bush(-2.6, 1.8, 0.5); bush(3.6, 1.7); bush(4.8, 1.8, 0.5); // 门前两侧
bush(-6.2, -8.8); bush(5, -8.8); bush(-10, 1);
var flowerColors = [0xff7aa2, 0xffd166, 0xffffff, 0xc58cff];
for (var f = 0; f < 40; f++) {
  var ang = f * 2.4, r = 6 + (f % 7) * 1.1;
  var fx = Math.cos(ang) * r, fz = Math.sin(ang) * r;
  if (fz < 2.5 && fz > -8 && Math.abs(fx) < 6.2) continue; // 房子占的地方
  if (fz > 1 && Math.abs(fx + 0.15) < 1.4) continue;      // 门前小路
  island.add(mesh(new THREE.SphereGeometry(0.13, 6, 4), mat(flowerColors[f % 4]), fx, GROUND + 0.15, fz));
}
// 门前小路：一串踏脚石
var stoneMat = mat(0xe9e0cf);
for (var s = 0; s < 7; s++) {
  var st = mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.08, 9), stoneMat, -0.15 + (s % 2 ? 0.18 : -0.18), GROUND + 0.04, 2.0 + s * 1.15);
  st.rotation.y = s;
  island.add(st);
}

// 木牌的木头纹理和文字（岛名牌、门上的牌子用）
function textTexture(text, w, h, font) {
  var c = document.createElement("canvas");
  c.width = w || 512; c.height = h || 256;
  var ctx = c.getContext("2d");
  var W = c.width, H = c.height;
  ctx.fillStyle = "#c8915a"; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#8a5a32"; ctx.lineWidth = 8;
  for (var y = 40; y < H; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y + 6); ctx.globalAlpha = 0.25; ctx.stroke(); }
  ctx.globalAlpha = 1; ctx.lineWidth = 14; ctx.strokeRect(7, 7, W - 14, H - 14);
  ctx.fillStyle = "#4a2c14";
  ctx.font = "bold " + (font || 110) + "px 'PingFang SC','Microsoft YaHei',sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(text, W / 2, H / 2 + 6);
  var t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
var postMat = mat(0x7a4f2e);

// 岛名牌“噜噜岛”：立在小路起点、靠沙滩的地方，一进来就能看到
var nameSign = new THREE.Group();
nameSign.add(mesh(new THREE.BoxGeometry(0.2, 2.6, 0.2), postMat, -1.5, 1.3, 0));
nameSign.add(mesh(new THREE.BoxGeometry(0.2, 2.6, 0.2), postMat, 1.5, 1.3, 0));
nameSign.add(mesh(new THREE.BoxGeometry(3.6, 1.3, 0.16), [postMat, postMat, postMat, postMat,
  new THREE.MeshStandardMaterial({ map: textTexture("噜噜岛", 640, 232, 130), roughness: 0.9 }), postMat], 0, 2.05, 0.04));
nameSign.add(mesh(new THREE.ConeGeometry(0.22, 0.4, 4), mat(0xe5836f), -1.5, 2.8, 0)); // 柱顶小尖帽
nameSign.add(mesh(new THREE.ConeGeometry(0.22, 0.4, 4), mat(0xe5836f), 1.5, 2.8, 0));
nameSign.position.set(-3.4, GROUND, 11.5);
nameSign.rotation.y = 0.25;
island.add(nameSign);

// 房子正面大门上方的牌子“噜噜之家”（房子加载好后挂到房子上）
function housePlaque() {
  var g = new THREE.Group();
  var wood = mat(0x7a4f2e);
  g.add(mesh(new THREE.BoxGeometry(1.9, 0.56, 0.06), [wood, wood, wood, wood,
    new THREE.MeshStandardMaterial({ map: textTexture("噜噜之家", 640, 190, 120), roughness: 0.9 }), wood], 0, 0, 0.03));
  return g;
}

// 云
function cloud(x, y, z) {
  var g = new THREE.Group();
  var cm = mat(0xffffff, { roughness: 1 });
  [[0, 0, 0, 1.4], [1.3, -0.2, 0.2, 1], [-1.3, -0.25, 0, 1.05], [0.5, 0.5, -0.3, 0.9]].forEach(function (p) {
    var m = mesh(new THREE.IcosahedronGeometry(p[3], 1), cm, p[0], p[1], p[2]);
    m.castShadow = false;
    g.add(m);
  });
  g.position.set(x, y, z);
  g.scale.setScalar(1.6);
  scene.add(g);
  return g;
}
var clouds = [cloud(-20, 16, -20), cloud(16, 19, -26), cloud(26, 14, 8)];

// 镜头：一开始在岛前方，能看到房子正面和门；从屋里出来时停在门口
var hint = document.getElementById("hint");
var HINT = "拖动旋转 · 滚轮/双指缩放 · 点门进屋";
var goal = null;
function look(target, az, el, dist, instant) {
  var pos = target.clone().add(new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(dist));
  if (instant) { camera.position.copy(pos); controls.target.copy(target); goal = null; }
  else goal = { pos: pos, target: target, speed: 0.08 };
}
var doorWorld = HOUSE_POS.clone().add(new THREE.Vector3(-0.15, 1.2, 1.1)); // 门外（房子加载好后会用模型里的准确位置）
function overview(instant) {
  if (camera.aspect < 1) look(new THREE.Vector3(-1.2, 2.5, 1), 0.18, 0.4, 46, instant); // 竖屏：往左偏一点，岛名牌也装得下
  else look(new THREE.Vector3(0, 2.5, -1.5), 0.35, 0.4, 30, instant);
}
function atDoor(instant) { look(doorWorld, 0.3, 0.32, camera.aspect < 1 ? 16 : 11, instant); }

// 房子：后台加载，好了再放上去（先显示小岛，不用干等）
var house = null;
hint.textContent = "房子加载中…";
loadHouse(null, function (p) { hint.textContent = "房子加载中… " + Math.round(p * 100) + "%"; }).then(function (h) {
  house = h;
  house.root.position.copy(HOUSE_POS);
  house.setView({ exterior: true });
  // 房子的材质要有环境光才是原来的颜色（房屋页面也是这样打光的），只加在房子上，小岛本身不变
  var env = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(renderer), 0.04).texture;
  house.root.traverse(function (o) {
    if (o.isMesh) [].concat(o.material).forEach(function (m) { if (m.isMeshStandardMaterial && !m.envMap) { m.envMap = env; m.envMapIntensity = 0.6; } });
  });
  var plaque = housePlaque();
  plaque.position.set(house.doorPosition.x, 2.46, house.doorPosition.z - 0.6 + 0.09); // 前墙外表面上，门框顶（2.11 米）和墙顶之间
  house.root.add(plaque);
  scene.add(house.root);
  house.root.updateMatrixWorld(true);
  doorWorld = house.root.localToWorld(house.doorPosition.clone()).setY(HOUSE_POS.y + 1.2);
  hint.textContent = HINT;
  return isUnlocked();
}).then(function (open) {
  if (house) house.setDoor(open);
  window.READY = true;
}).catch(function (e) {
  console.warn("房子加载失败", e);
  hint.textContent = "房子没加载出来，刷新试试";
  window.READY = true;
});

// 进屋：门没开就先输密码（可以取消），门开了镜头往门里推，然后打开房屋页面的玄关
var entering = false;
function enterHouse() {
  if (entering || !house) return;
  entering = true;
  var ready = house.doorOpen ? Promise.resolve(true) : unlock({ cancelable: true }).then(function (key) {
    if (!key) return false;
    house.setDoor(true);
    return new Promise(function (r) { setTimeout(function () { r(true); }, 700); }); // 等门转开
  });
  ready.then(function (ok) {
    if (!ok) { entering = false; return; }
    var inside = doorWorld.clone().add(new THREE.Vector3(0, 0, -2.5));
    goal = { pos: doorWorld.clone().add(new THREE.Vector3(0, 0.1, 1.2)), target: inside, speed: 0.06 };
    document.getElementById("fade").classList.add("on");
    setTimeout(function () { location.href = "house.html?room=entry"; }, 650);
  });
}

// 点击：门
var raycaster = new THREE.Raycaster();
var pointer = new THREE.Vector2();
function hit(ev) {
  var rect = canvas.getBoundingClientRect();
  pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  var h = house ? house.pick(raycaster) : null;
  return h && h.id === "door" ? "door" : null; // 从外面只认门
}
var down = null;
canvas.addEventListener("pointerdown", function (e) { down = { x: e.clientX, y: e.clientY }; if (!entering) goal = null; });
canvas.addEventListener("pointerup", function (e) {
  if (!down) return;
  var moved = Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y);
  down = null;
  if (moved >= 6) return; // 拖动旋转时不算点击
  var what = hit(e);
  if (what === "door") enterHouse();
});
canvas.addEventListener("pointermove", function (e) {
  if (e.pointerType === "mouse") canvas.style.cursor = hit(e) ? "pointer" : "";
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
  camera.fov = w < h ? 60 : 45; // 竖屏手机拉远一点
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();
if (params.get("from") === "house") atDoor(true); // 屏幕比例知道了再摆镜头（竖屏要离远一点）
else overview(true);

// 浏览器“返回”回到这一页时（页面从缓存里恢复），把进门时的状态清掉
window.addEventListener("pageshow", function (e) {
  if (!e.persisted) return;
  entering = false;
  document.getElementById("fade").classList.remove("on");
  atDoor(true);
});

// 动画：云飘、海面起伏，门慢慢转
var clock = new THREE.Clock();
renderer.setAnimationLoop(function () {
  var t = clock.getElapsedTime();
  clouds.forEach(function (c, i) { c.position.x += 0.004 * (i + 1); if (c.position.x > 50) c.position.x = -50; });
  water.position.y = Math.sin(t * 0.8) * 0.05;
  if (goal) {
    camera.position.lerp(goal.pos, goal.speed);
    controls.target.lerp(goal.target, goal.speed);
    if (camera.position.distanceTo(goal.pos) < 0.02) goal = null;
  }
  controls.update();
  if (house) house.update(camera);
  renderer.render(scene, camera);
});
window.CAMERA = camera;
window.HOUSE_GET = function () { return house; };
