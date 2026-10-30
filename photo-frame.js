// 挂墙的相框：外圈木框、里面一圈白色卡纸、再里面是照片。照片是用大门锁密码加密的文件（photo-lock.html 生成）。
//   import { loadLockedPhoto, makePhotoFrame } from "./photo-frame.js";
//   var img = await loadLockedPhoto("assets/house/photos/photo-living.enc", key); // 还没有这个文件、或解不开时返回 null
//   var img = await loadPhoto("assets/house/photos/lulu-cat.jpg");                // 不用加密的明文照片
//   var frame = makePhotoFrame(img, 0.98);  // 宽 0.98 米，高按照片比例；正面朝 +z，原点在相框中心
import * as THREE from "three";
import { decryptBytes } from "./lock.js";

export async function loadLockedPhoto(url, key) {
  var r = await fetch(url, { cache: "no-cache" });
  if (!r.ok) return null; // 还没放照片：先保持原样
  var bytes = await decryptBytes(key, await r.arrayBuffer());
  if (!bytes) { console.warn("照片解不开（大门锁密码改过？）：", url); return null; }
  return toImage(new Blob([bytes], { type: "image/jpeg" }));
}

export async function loadPhoto(url) {
  var r = await fetch(url, { cache: "no-cache" });
  if (!r.ok) return null;
  return toImage(await r.blob());
}

function toImage(blob) {
  return createImageBitmap ? createImageBitmap(blob) : new Promise(function (ok, bad) {
    var img = new Image(); img.onload = function () { ok(img); }; img.onerror = bad; img.src = URL.createObjectURL(blob);
  });
}

var FRAME = 0.055, MAT = 0.075, DEPTH = 0.045; // 木框宽、卡纸边宽、相框厚（米）；卡纸边宽是 0.98 米宽相框（客厅那幅）的，别的大小按比例
export function makePhotoFrame(img, width) {
  var g = new THREE.Group();
  g.name = "photo_frame";
  var mat = MAT * width / 0.98; // 卡纸边按相框宽度等比例收窄或放宽
  var pw = width - 2 * (FRAME + mat), ph = pw * img.height / img.width; // 照片露出来的大小
  var h = ph + 2 * (FRAME + mat);
  var wood = new THREE.MeshStandardMaterial({ color: 0xb98454, roughness: 0.6 });
  var matPaper = new THREE.MeshStandardMaterial({ color: 0xfbf8f2, roughness: 0.95 });
  // 木框：四条边，比卡纸凸出一点
  [[0, (h - FRAME) / 2, width, FRAME], [0, -(h - FRAME) / 2, width, FRAME],
   [-(width - FRAME) / 2, 0, FRAME, h - 2 * FRAME], [(width - FRAME) / 2, 0, FRAME, h - 2 * FRAME]].forEach(function (b) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(b[2], b[3], DEPTH), wood);
    m.position.set(b[0], b[1], DEPTH / 2);
    g.add(m);
  });
  // 卡纸（整块垫底）和照片
  var paper = new THREE.Mesh(new THREE.BoxGeometry(width - 2 * FRAME, h - 2 * FRAME, 0.01), matPaper);
  paper.position.z = 0.012;
  g.add(paper);
  // 先画到 canvas 上再做贴图：ImageBitmap 直接做贴图时 WebGL 不按 flipY 翻转，照片会倒过来
  var cv = document.createElement("canvas");
  cv.width = img.width; cv.height = img.height;
  cv.getContext("2d").drawImage(img, 0, 0);
  if (img.close) img.close();
  var tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  var photo = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }));
  photo.position.z = 0.0185;
  g.add(photo);
  // 玻璃：很淡的一层反光
  var glass = new THREE.Mesh(new THREE.PlaneGeometry(width - 2 * FRAME, h - 2 * FRAME), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.06, roughness: 0.05, metalness: 0.2 }));
  glass.position.z = DEPTH - 0.004;
  g.add(glass);
  g.userData.size = { width: width, height: h };
  return g;
}
