// 玄关的快递盒：有几件待取件就摆几个一样大的纸箱，在入户门内右侧空地摞起来：
// 一摞最多 PER_STACK 个，摞满了在旁边另起一摞，最多 STACKS.length 摞（再多只在列表里显示）。
// 箱子颜色按城市（parcel-data.js 的 cityColor），侧面贴白色面单写城市名。
//   import { makeParcelBoxes } from "./parcel-boxes.js";
//   var g = makeParcelBoxes(parcels); scene.add(g); // g.userData.boxes 是每个箱子，点中箱子时 object.userData.parcel 为真
import * as THREE from "three";
import { cityColor } from "./parcel-data.js";

// 每摞的位置（three.js 坐标，单位米）：门和右边置物架、前墙之间的空地；箱子尺寸
var STACKS = [[0.56, 3.13], [0.9, 3.13], [0.56, 2.8]];
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
  return (labels[city] = new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 }));
}

// 每个箱子摆歪一点的角度按 issue 编号固定（刷新后不会变）
function rand(n, k) {
  var x = Math.sin(n * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function makeBox(p) {
  var w = W, d = D, h = H;
  var city = p.bad ? "?" : p.city;
  var g = new THREE.Group();
  var body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), boxMat(p.bad ? "#b9a28a" : cityColor(p.city)));
  body.position.y = h / 2;
  g.add(body);
  var strip = new THREE.Mesh(new THREE.BoxGeometry(0.05, h + 0.004, d + 0.004), tape); // 胶带：从顶面绕到前后两面
  strip.position.y = h / 2;
  g.add(strip);
  var lw = Math.min(w * 0.38, 0.1);
  var label = new THREE.Mesh(new THREE.PlaneGeometry(lw * 1.6, lw), labelMat(city)); // 面单贴在前面（朝 -z，对着屋里）
  label.position.set(-w * 0.22, h * 0.5, -d / 2 - 0.002);
  label.rotation.y = Math.PI;
  g.add(label);
  var top = new THREE.Mesh(label.geometry, label.material); // 顶面也贴一张，从上往下看也认得出城市
  top.position.set(w * 0.25 + 0.005, h + 0.004, 0);
  top.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
  g.add(top);
  g.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.userData.parcel = true; } });
  g.userData = { parcel: true, number: p.number };
  return g;
}

export function makeParcelBoxes(parcels) {
  var group = new THREE.Group();
  group.name = "parcels";
  var boxes = [];
  parcels.slice(0, STACKS.length * PER_STACK).forEach(function (p, i) {
    var b = makeBox(p), s = STACKS[Math.floor(i / PER_STACK)];
    b.position.set(s[0], (i % PER_STACK) * H, s[1]);
    b.rotation.y = (rand(p.number, 4) - 0.5) * 0.16; // 稍微歪一点，不至于像一根柱子
    group.add(b);
    boxes.push(b);
  });
  group.userData.boxes = boxes;
  return group;
}
