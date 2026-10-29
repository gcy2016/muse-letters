// 玄关的快递盒：有几件待取件就摆几个一样大的纸箱，靠墙根摞起来：
// 一摞最多 PER_STACK 个，摞满了在旁边另起一摞，最多 STACKS.length 摞（再多只在列表里显示）。正面（贴面单那面）朝 +z。
// 箱子颜色按城市（parcel-data.js 的 cityColor），侧面贴白色面单写城市名。
//   import { makeParcelBoxes } from "./parcel-boxes.js";
//   var g = makeParcelBoxes(parcels); // g.userData.boxes 是每个箱子，点中箱子时 object.userData.parcel 为真
//   g 的原点就是第一摞的位置，整组摆在哪由 layout.js（布置表）的 parcels 决定（分两摞：mine、hers）
import * as THREE from "three";
import { cityColor } from "./parcel-data.js";

// 每摞相对第一摞的位置 [右, 前]（米）：第二摞在左边，第三摞在第一摞前面（第一摞靠墙）；箱子尺寸
var STACKS = [[0, 0], [-0.34, 0], [0, 0.33]];
var PER_STACK = 5;
var W = 0.3, D = 0.24, H = 0.15;

var tape = new THREE.MeshStandardMaterial({ color: 0xe8d9b5, roughness: 0.6 });
var mats = {};
function boxMat(color) {
  return mats[color] || (mats[color] = new THREE.MeshStandardMaterial({ color: color, roughness: 0.85 }));
}
var labels = {};
function labelMat(city) {
  if (labels[city]) return labels[city];
  var c = document.createElement("canvas");
  c.width = 128; c.height = 80;
  var g = c.getContext("2d");
  g.fillStyle = "#fff";
  g.fillRect(0, 0, 128, 80);
  g.fillStyle = "#333";
  for (var i = 0; i < 3; i++) g.fillRect(10, 56 + i * 7, 60 + i * 15, 3); // 假装是条码/地址行
  g.font = "bold 36px 'PingFang SC', 'Microsoft YaHei', sans-serif";
  g.textAlign = "center";
  g.fillText(city.slice(0, 3), 64, 42);
  var t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return (labels[city] = new THREE.MeshStandardMaterial({ map: t, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }));
}

// 每个箱子摆歪一点的角度按它是第几件固定（刷新后不会变）
function rand(n, k) {
  var x = Math.sin(n * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function makeBox(p, n) {
  var w = W, d = D, h = H;
  var g = new THREE.Group();
  var body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), boxMat(cityColor(p.city)));
  body.position.y = h / 2;
  g.add(body);
  var strip = new THREE.Mesh(new THREE.BoxGeometry(0.05, h + 0.004, d + 0.004), tape); // 胶带：从顶面绕到前后两面
  strip.position.y = h / 2;
  g.add(strip);
  var lw = Math.min(w * 0.38, 0.1);
  var label = new THREE.Mesh(new THREE.PlaneGeometry(lw * 1.6, lw), labelMat(p.city)); // 面单贴在正面（朝 +z，背对墙）
  label.position.set(w * 0.22, h * 0.5, d / 2 + 0.002);
  g.add(label);
  var top = new THREE.Mesh(label.geometry, label.material); // 顶面也贴一张，从上往下看也认得出城市
  top.position.set(w * 0.25 + 0.005, h + 0.004, 0);
  top.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
  g.add(top);
  g.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.userData.parcel = true; } });
  g.userData = { parcel: true, index: n };
  return g;
}

export function makeParcelBoxes(parcels) {
  var group = new THREE.Group();
  group.name = "parcels";
  var boxes = [];
  parcels.slice(0, STACKS.length * PER_STACK).forEach(function (p, i) {
    var b = makeBox(p, i), s = STACKS[Math.floor(i / PER_STACK)];
    b.position.set(s[0], (i % PER_STACK) * H, s[1]);
    b.rotation.y = (rand(i + 1, 4) - 0.5) * 0.16; // 稍微歪一点，不至于像一根柱子
    group.add(b);
    boxes.push(b);
  });
  group.userData.boxes = boxes;
  return group;
}
