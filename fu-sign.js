// 大门外墙的“福”字斗方：红底金字、正贴（字不跟着菱形纸转）。
// 位置写在 layout.js 的 ISLAND.doorFu（onHouse: true，相对房子）；island.js 只负责调用和摆放。
import * as THREE from "three";

function fuTexture() {
  var S = 512;
  var c = document.createElement("canvas");
  c.width = c.height = S;
  var ctx = c.getContext("2d");
  var cx = S / 2, cy = S / 2, m = 16;

  // 菱形红纸
  ctx.beginPath();
  ctx.moveTo(cx, m);
  ctx.lineTo(S - m, cy);
  ctx.lineTo(cx, S - m);
  ctx.lineTo(m, cy);
  ctx.closePath();
  var red = ctx.createLinearGradient(0, 0, S, S);
  red.addColorStop(0, "#e03327");
  red.addColorStop(0.55, "#c01a14");
  red.addColorStop(1, "#8e0c0a");
  ctx.fillStyle = red;
  ctx.fill();

  // 金色双线边
  ctx.lineJoin = "round";
  ctx.lineWidth = 14;
  ctx.strokeStyle = "#e8b53c";
  ctx.stroke();
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(0.9, 0.9);
  ctx.translate(-cx, -cy);
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#ffe7a0";
  ctx.stroke();
  ctx.restore();

  // 金字“福”，正着写
  var gold = ctx.createLinearGradient(0, 110, 0, 410);
  gold.addColorStop(0, "#fff3b8");
  gold.addColorStop(0.42, "#f6ca4e");
  gold.addColorStop(0.72, "#e0a127");
  gold.addColorStop(1, "#b97712");
  ctx.fillStyle = gold;
  ctx.font = "bold 286px 'KaiTi','STKaiti','Kaiti SC','Microsoft YaHei',serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("福", cx, cy + 10);

  var tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function makeFuSign() {
  var g = new THREE.Group();
  var map = fuTexture();
  var paper = new THREE.Mesh(
    new THREE.PlaneGeometry(0.52, 0.52),
    new THREE.MeshStandardMaterial({ map: map, transparent: true, alphaTest: 0.02, roughness: 0.62, side: THREE.DoubleSide })
  );
  paper.castShadow = false;
  paper.receiveShadow = true;
  g.add(paper);
  return g;
}
