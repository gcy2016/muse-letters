// 噜噜岛：岛上是噜噜之家（house.js），从外面看盖着屋顶。右下角常驻“留言板”按钮（board-ui.js，有新留言亮红点）；
// 点房子的门进屋（house.html，从玄关开始看）。门锁：这个浏览器开过锁，门就开着；没开过，点门先输密码。
// 小岛单位是米，和房子一样。小miu 和 lulu 先只待在房子里。
// 天气：岛上的天空提前变成明天的天气（weather-fx.js），数据见 weather-data.js；天气牌只在屋里玄关（house.html）
// ?from=house：从屋里出来，镜头停在门口；?wx=小雨 用示例数据看某种天气的效果（?wx=demo 示例原样）
import * as THREE from "three";
import { OrbitControls } from "./lib/OrbitControls.js";
import { loadHouse } from "./house.js";
import { RoomEnvironment } from "./lib/RoomEnvironment.js";
import { isUnlocked, unlock } from "./lock.js";
import { getWeather, skyKind, skyPlace, sources as weatherSources } from "./weather-data.js";
import { makeWeatherFx } from "./weather-fx.js";
import { ISLAND as ISLAND_LAYOUT, arrange } from "./layout.js";
import { mountBoardButton } from "./board-ui.js";

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
var hemi = new THREE.HemisphereLight(0xffffff, 0x6aa0b0, 1.0);
scene.add(hemi);
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
// 按布置表（layout.js 的 ISLAND）摆：挂在房子上的写相对房子的坐标（房子挪了跟着走），其余是岛上的坐标（y 从草地算起）
function islandPlace(obj, spec) {
  arrange(obj, spec);
  obj.position.add(spec.onHouse ? HOUSE_POS : new THREE.Vector3(0, GROUND, 0));
  return obj;
}

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

// 岛上的两块名牌：牌面用 GPT 画的图（assets/island/，白底已抠掉）
//   “噜噜岛”：小路左边的立牌，两根木柱绑绳、底下压石头；“噜噜之家”：挂在门左边的墙上；门右边的墙上挂一盏煤油灯。
//   门两边各留出 0.8 米左右的空墙，过年贴对联用（门框外沿 x≈-0.64 和 0.34，墙面在 z=1）
var texLoader = new THREE.TextureLoader();
function cutout(url, w, h, z, opts) {
  var t = texLoader.load(url);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  // 自发光一点：背光、阴天时牌子也不发暗
  var m = new THREE.MeshStandardMaterial(Object.assign({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.3, alphaTest: 0.5, roughness: 0.8 }, opts));
  var p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  p.position.z = z;
  p.castShadow = true;
  return p;
}
// 同一张图叠几层木色的片，看起来有厚度（侧面和背面是木头）
function thickBoard(url, w, h, depth, layers) {
  var g = new THREE.Group();
  g.add(cutout(url, w, h, depth / 2));
  var wood = cutout(url, w, h, 0, { color: 0xb07a3c, emissive: 0x000000, emissiveMap: null, side: THREE.DoubleSide });
  for (var i = 1; i <= layers; i++) {
    var l = wood.clone();
    l.position.z = depth / 2 - (depth * i) / layers;
    g.add(l);
  }
  return g;
}

// “噜噜岛”立牌：牌面 3.4 米宽，上沿离地 3.1 米。两根柱子的位置对着图上柱子的位置（图宽的 23% 和 81% 处）
var nameSign = new THREE.Group();
(function () {
  var W = 3.4, H = W * 441 / 787, top = 3.1;
  var board = thickBoard("assets/island/island-sign.webp", W, H, 0.1, 5);
  board.position.y = top - H / 2;
  nameSign.add(board);
  var post = mat(0xc98f4e), rope = mat(0xf0e2bf), stone = mat(0x8f8a84), grass = mat(0x5fae4a);
  [0.23, 0.81].forEach(function (f, i) {
    var x = (f - 0.5) * W;
    nameSign.add(mesh(new THREE.BoxGeometry(0.17, top - 0.2, 0.15), post, x, (top - 0.2) / 2, -0.11));
    [0.32, 0.42].forEach(function (y) { nameSign.add(mesh(new THREE.CylinderGeometry(0.125, 0.125, 0.08, 10), rope, x, y, -0.11)); }); // 绑绳
    // 柱脚压几块石头、长几簇草
    [[-0.2, 0.05, 0.28], [0.18, 0.12, 0.24], [0.02, -0.25, 0.2]].forEach(function (r, k) {
      var st = mesh(new THREE.DodecahedronGeometry(r[2], 0), stone, x + r[0], r[2] * 0.45, -0.11 + r[1]);
      st.rotation.set(k, i + k * 2, 0);
      nameSign.add(st);
    });
    [[-0.35, 0.12], [0.3, -0.05], [0.12, 0.3]].forEach(function (q, k) {
      var gr = mesh(new THREE.ConeGeometry(0.07, 0.3, 4), grass, x + q[0], 0.15, -0.11 + q[1]);
      gr.rotation.z = (k - 1) * 0.3;
      nameSign.add(gr);
    });
  });
})();
islandPlace(nameSign, ISLAND_LAYOUT.nameSign); // 位置在 layout.js（布置表）
island.add(nameSign);

// “噜噜之家”门牌：挂在门左边的墙上，和窗户差不多高；右边离门框 0.85 米，留着贴对联
var homeSign = thickBoard("assets/island/home-plaque.webp", 1.1, 1.1 * 381 / 571, 0.04, 2);
islandPlace(homeSign, ISLAND_LAYOUT.homeSign);
island.add(homeSign);

// 煤油灯：挂在门右边的墙上，铁架子伸出来吊一盏玻璃灯，灯罩里暖黄的光；左边离门框 0.85 米，同样留着贴对联
var lamp = new THREE.Group();
(function () {
  var iron = mat(0x3b342e, { roughness: 0.6 }), brass = mat(0xc8954a, { roughness: 0.5, metalness: 0.3 });
  lamp.add(mesh(new THREE.BoxGeometry(0.12, 0.24, 0.03), iron, 0, 0.1, 0));             // 墙上的底板
  lamp.add(mesh(new THREE.BoxGeometry(0.035, 0.035, 0.26), iron, 0, 0.2, 0.13));        // 伸出来的横杆
  var brace = mesh(new THREE.BoxGeometry(0.025, 0.2, 0.025), iron, 0, 0.1, 0.07);         // 斜撑
  brace.rotation.x = 0.75;
  lamp.add(brace);
  var hang = new THREE.Group();
  hang.position.set(0, 0.2, 0.24);
  lamp.add(hang);
  var ring = mesh(new THREE.TorusGeometry(0.035, 0.008, 6, 12), iron, 0, -0.04, 0);
  hang.add(ring);
  hang.add(mesh(new THREE.ConeGeometry(0.1, 0.09, 6), iron, 0, -0.11, 0));              // 灯帽
  hang.add(mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.02, 6), brass, 0, -0.16, 0));
  var glass = mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.17, 6), new THREE.MeshStandardMaterial({ color: 0xffe6a0, emissive: 0xffb84a, emissiveIntensity: 1.6, roughness: 0.3, flatShading: true }), 0, -0.255, 0);
  glass.castShadow = false;
  hang.add(glass);
  [0, 1, 2, 3, 4, 5].forEach(function (k) {                                              // 灯罩外的铁条
    var a = (k / 6) * Math.PI * 2 + Math.PI / 6;
    hang.add(mesh(new THREE.BoxGeometry(0.012, 0.18, 0.012), iron, Math.cos(a) * 0.072, -0.255, Math.sin(a) * 0.072));
  });
  hang.add(mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.05, 6), brass, 0, -0.365, 0)); // 油壶底座
  var glow = new THREE.PointLight(0xffb45a, 1.2, 3.5, 2);
  glow.position.set(0, -0.26, 0.05);
  hang.add(glow);
})();
islandPlace(lamp, ISLAND_LAYOUT.lamp);
island.add(lamp);

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

// 天气：天空提前变成明天的天气；半小时重读一次。天空一次只显示一个城市（右上角按钮切换，选择记在本机）
// 房子单独打了环境光（见下面加载房子的地方），天暗下来时房子也跟着暗
var houseEnv = 0.6, houseMats = [];
function setHouseEnv() { houseMats.forEach(function (m) { m.envMapIntensity = houseEnv; }); }
var fx = makeWeatherFx(scene, { hemi: hemi, sun: sun, clouds: clouds, makeCloud: cloud, radius: 24,
  onChange: function (kind, look) { houseEnv = 0.6 * Math.min(1, (look.hemi + look.sun * 0.3) / 1.54); setHouseEnv(); } });
var weather = null;
var SKY_KEY = "muse-weather-sky";
var skySrc = (function () { try { return localStorage.getItem(SKY_KEY); } catch (e) { return null; } })() || (weatherSources()[0] || {}).id;
var wxParam = params.get("wx");
if (wxParam && wxParam !== "demo") skySrc = (weatherSources()[0] || {}).id; // ?wx=小雨 预览：示例里换的是第一个城市，天空临时显示它（不改记住的选择）
var skyBar = document.getElementById("sky");
weatherSources().forEach(function (src) {
  var b = document.createElement("button");
  b.type = "button"; b.textContent = src.city; b.dataset.id = src.id;
  b.onclick = function () {
    skySrc = src.id;
    try { localStorage.setItem(SKY_KEY, skySrc); } catch (e) {}
    showSky();
  };
  skyBar.appendChild(b);
});
if (weatherSources().length < 2) skyBar.style.display = "none";
function showSky() {
  var p = skyPlace(weather, skySrc);
  fx.set(p ? skyKind(p.tomorrow) : "sun");
  [].forEach.call(skyBar.querySelectorAll("button"), function (b) {
    var has = !!(weather && weather.places.some(function (q) { return q.src === b.dataset.id; }));
    b.classList.toggle("on", b.dataset.id === skySrc);
    b.title = has ? "" : "还没有预报";
    b.classList.toggle("empty", !has);
  });
}
function refreshWeather() {
  getWeather().then(function (w) {
    weather = w;
    showSky();
  }).catch(function (e) { console.warn("天气加载失败：", e.message); });
}
refreshWeather();
setInterval(refreshWeather, 30 * 60 * 1000);

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
var house = null, doorHotspot = null;
hint.textContent = "房子加载中…";
loadHouse(null, function (p) { hint.textContent = "房子加载中… " + Math.round(p * 100) + "%"; }).then(function (h) {
  house = h;
  house.root.position.copy(HOUSE_POS);
  house.setView({ exterior: true });
  // 房子的材质要有环境光才是原来的颜色（房屋页面也是这样打光的），只加在房子上，小岛本身不变
  var env = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(renderer), 0.04).texture;
  house.root.traverse(function (o) {
    if (o.isMesh) [].concat(o.material).forEach(function (m) { if (m.isMeshStandardMaterial && !m.envMap) { m.envMap = env; houseMats.push(m); } });
  });
  setHouseEnv();
  // 门口的点击区（看不见）：门开着时门扇转进屋里了，点门洞也要算点门
  doorHotspot = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.2, 0.6), new THREE.MeshBasicMaterial({ visible: false }));
  doorHotspot.position.set(house.doorPosition.x, 1.1, house.doorPosition.z - 0.6);
  house.root.add(doorHotspot);
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

// 右下角常驻的留言板按钮
mountBoardButton();

// 点击：门
var raycaster = new THREE.Raycaster();
var pointer = new THREE.Vector2();
function hit(ev) {
  var rect = canvas.getBoundingClientRect();
  pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  if (!doorHotspot) return null;
  return raycaster.intersectObject(doorHotspot).length ? "door" : null; // 房子从外面只认门
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

// 动画：云飘、海面起伏、雨雪，门慢慢转
var clock = new THREE.Clock(), lastT = 0;
renderer.setAnimationLoop(function () {
  var t = clock.getElapsedTime();
  fx.update(t - lastT); lastT = t;
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
