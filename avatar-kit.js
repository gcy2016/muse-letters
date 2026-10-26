// 角色模型的公共零件：毛团、光滑小部件、精细 GLB 模型替换。小miu（miu.js）和 lulu（lulu.js）共用。
import * as THREE from "three";
import { GLTFLoader } from "./lib/GLTFLoader.js";

// 毛团：带起伏的球（用带索引的球体，法线能平滑过渡），顶点颜色由 colorAt 决定
// colorAt(x, y, z) 收到的是模型坐标，返回 THREE.Color（会被复制，可以复用同一个对象）
export function fluff(rx, ry, rz, pos, colorAt, bump, detail) {
  var geo = detail === 2 ? new THREE.SphereGeometry(1, 18, 12) : new THREE.SphereGeometry(1, 36, 24);
  var p = geo.attributes.position;
  var colors = new Float32Array(p.count * 3);
  var v = new THREE.Vector3();
  var amp = bump === undefined ? 0.09 : bump;
  for (var i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    // 按方向算起伏，重合的顶点结果相同，不会裂缝
    var n = Math.sin(v.x * 9.1 + v.y * 3.3) * Math.sin(v.y * 8.3 - v.z * 2.7) * Math.sin(v.z * 7.7 + v.x * 4.1);
    var s = 1 + amp * n;
    v.set(v.x * rx * s, v.y * ry * s, v.z * rz * s);
    p.setXYZ(i, v.x, v.y, v.z);
    var c = colorAt(v.x + pos[0], v.y + pos[1], v.z + pos[2]);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  var m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  m.position.set(pos[0], pos[1], pos[2]);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function smooth(geo, color, x, y, z, opts) {
  var m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial(Object.assign({ color: color, roughness: 0.5 }, opts || {})));
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

export function clamp01(x) { return Math.max(0, Math.min(1, x)); }

// 返回角色：先放代码模型 simple，glbUrl 不为空时加载精细模型，加载完自动换掉
// simple.userData.animate(t) 是小动作（摇尾巴等），t 为秒；GLB 没拆出尾巴，换上后小动作先停
export function withGlb(name, simple, glbUrl, rotateY, height) {
  var root = new THREE.Group();
  root.name = name;
  root.add(simple);
  root.userData.animate = simple.userData.animate || function () {};
  if (glbUrl) {
    new GLTFLoader().load(glbUrl, function (gltf) {
      var model = gltf.scene;
      model.rotation.y = rotateY;
      model.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      // 统一成高 height、脚踩 y=0、居中
      var box = new THREE.Box3().setFromObject(model);
      var size = box.getSize(new THREE.Vector3());
      model.scale.setScalar(height / size.y);
      box.setFromObject(model);
      var center = box.getCenter(new THREE.Vector3());
      model.position.set(-center.x, -box.min.y, -center.z);
      root.remove(simple);
      root.add(model);
      root.userData.animate = function () {};
    }, undefined, function (err) { console.warn(name + " 模型加载失败，继续用代码模型", err); });
  }
  return root;
}
