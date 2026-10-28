// 岛上的天气效果：天空和雾的颜色、阳光强弱、云量，下雨、下雪、打雷闪光、沙尘。
//   import { makeWeatherFx } from "./weather-fx.js";
//   var fx = makeWeatherFx(scene, { hemi, sun, clouds, makeCloud, radius });
//   fx.set("rain2");   // 天气种类见 weather-data.js 的 WORDS
//   fx.update(dt);     // 每帧调用
import * as THREE from "three";

// 每种天气的样子：bg 天空色、fog [近, 远]、hemi/sun 光的强弱、cloud 云的颜色、more 多加几朵云、rain/snow/dust 粒子数量
var LOOK = {
  sun:      { bg: 0x9fd8f0, fog: [110, 260], hemi: 1.0, sun: 1.8, cloud: 0xffffff, more: 0 },
  cloudy:   { bg: 0xa9d0e4, fog: [100, 240], hemi: 0.95, sun: 1.3, cloud: 0xffffff, more: 5 },
  overcast: { bg: 0xaab5be, fog: [60, 200], hemi: 0.85, sun: 0.6, cloud: 0xc6ccd2, more: 8 },
  rain1:    { bg: 0x9eabb5, fog: [55, 180], hemi: 0.8, sun: 0.5, cloud: 0xb9c0c7, more: 8, rain: 1500 },
  rain2:    { bg: 0x93a0aa, fog: [45, 160], hemi: 0.75, sun: 0.4, cloud: 0xa9b1b9, more: 9, rain: 3000 },
  rain3:    { bg: 0x86939d, fog: [35, 140], hemi: 0.7, sun: 0.3, cloud: 0x9aa3ab, more: 10, rain: 5000 },
  rain4:    { bg: 0x77838d, fog: [28, 120], hemi: 0.62, sun: 0.25, cloud: 0x8a939b, more: 10, rain: 7500 },
  thunder:  { bg: 0x6f7b86, fog: [30, 130], hemi: 0.6, sun: 0.25, cloud: 0x7f8891, more: 10, rain: 5000, flash: true },
  snow1:    { bg: 0xc4ced6, fog: [60, 190], hemi: 0.95, sun: 0.7, cloud: 0xdfe4e8, more: 7, snow: 1000 },
  snow2:    { bg: 0xbcc7d0, fog: [45, 160], hemi: 0.95, sun: 0.6, cloud: 0xd7dde2, more: 8, snow: 2200 },
  snow3:    { bg: 0xb4c0ca, fog: [30, 130], hemi: 0.95, sun: 0.5, cloud: 0xcfd6dc, more: 9, snow: 4000 },
  sleet:    { bg: 0xa9b5bf, fog: [45, 160], hemi: 0.85, sun: 0.5, cloud: 0xc0c8ce, more: 8, rain: 1500, snow: 900 },
  fog:      { bg: 0xd0d7dc, fog: [6, 55], hemi: 0.95, sun: 0.7, cloud: 0xe6eaed, more: 0 },
  haze:     { bg: 0xc6bfa9, fog: [14, 90], hemi: 0.9, sun: 0.9, cloud: 0xd9d2bf, more: 2 },
  dust:     { bg: 0xcfb289, fog: [10, 70], hemi: 0.9, sun: 0.9, cloud: 0xd8c2a0, more: 2, dust: 1600 },
};

export function makeWeatherFx(scene, o) {
  var R = o.radius || 24, TOP = 30;
  var MAX_RAIN = 7500, MAX_SNOW = 4000, MAX_DUST = 1600;

  // 雨：每滴一条短线，往下落、略斜
  var rainPos = new Float32Array(MAX_RAIN * 6), rainSpeed = new Float32Array(MAX_RAIN);
  for (var i = 0; i < MAX_RAIN; i++) { resetDrop(i, Math.random() * TOP); rainSpeed[i] = 18 + Math.random() * 8; }
  var rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
  var rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0xcfe3f2, transparent: true, opacity: 0.6, fog: true }));
  rain.frustumCulled = false;
  scene.add(rain);
  function resetDrop(k, y) {
    var a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * R, x = Math.cos(a) * r, z = Math.sin(a) * r;
    rainPos.set([x, y, z, x + 0.08, y + 0.7, z], k * 6);
  }

  // 雪、沙尘：小点，慢慢飘
  function points(max, color, size) {
    var pos = new Float32Array(max * 3), seed = new Float32Array(max);
    for (var k = 0; k < max; k++) { place(pos, k, Math.random() * TOP); seed[k] = Math.random() * 100; }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    var p = new THREE.Points(geo, new THREE.PointsMaterial({ color: color, size: size, map: dot(), transparent: true, opacity: 0.95, fog: true, depthWrite: false }));
    p.frustumCulled = false;
    scene.add(p);
    return { obj: p, pos: pos, seed: seed };
  }
  // 圆点贴图（不然雪花是小方块）
  var dotTex = null;
  function dot() {
    if (dotTex) return dotTex;
    var c = document.createElement("canvas");
    c.width = c.height = 32;
    var g = c.getContext("2d"), grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grd.addColorStop(0, "rgba(255,255,255,1)"); grd.addColorStop(0.6, "rgba(255,255,255,0.9)"); grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd; g.fillRect(0, 0, 32, 32);
    return (dotTex = new THREE.CanvasTexture(c));
  }
  function place(pos, k, y) {
    var a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * R;
    pos[k * 3] = Math.cos(a) * r; pos[k * 3 + 1] = y; pos[k * 3 + 2] = Math.sin(a) * r;
  }
  var snow = points(MAX_SNOW, 0xffffff, 0.22);
  var dust = points(MAX_DUST, 0xc9a06a, 0.16);

  // 多加的云（阴天、雨天云多），用小岛自己的云
  var extra = [];
  // 放在岛的后方和两侧、比镜头高的地方，不挡视线
  for (var c = 0; c < 10; c++) {
    var a = Math.PI * (1.05 + c * 0.09), r = 30 + (c % 3) * 9;
    var cl = o.makeCloud(Math.cos(a) * r * (c % 2 ? 1 : -1), 19 + (c % 3) * 3, Math.sin(a) * r);
    cl.visible = false;
    extra.push(cl);
  }

  var look = LOOK.sun, flashT = 0, nextFlash = 3, t = 0;
  var bg = new THREE.Color(), fogColor = new THREE.Color();
  function set(kind) {
    look = LOOK[kind] || LOOK.sun;
    bg.setHex(look.bg);
    scene.background.copy(bg);
    if (scene.fog) { scene.fog.color.copy(bg); scene.fog.near = look.fog[0]; scene.fog.far = look.fog[1]; }
    o.hemi.intensity = look.hemi;
    o.sun.intensity = look.sun;
    o.clouds.concat(extra).forEach(function (cl) {
      cl.traverse(function (m) { if (m.isMesh) m.material.color.setHex(look.cloud); });
    });
    extra.forEach(function (cl, k) { cl.visible = k < look.more; });
    rain.visible = !!look.rain; rainGeo.setDrawRange(0, (look.rain || 0) * 2);
    snow.obj.visible = !!look.snow; snow.obj.geometry.setDrawRange(0, look.snow || 0);
    dust.obj.visible = !!look.dust; dust.obj.geometry.setDrawRange(0, look.dust || 0);
    if (o.onChange) o.onChange(kind, look);
  }

  function update(dt) {
    dt = Math.min(dt, 0.1); t += dt;
    if (look.rain) {
      for (var k = 0; k < look.rain; k++) {
        var dy = rainSpeed[k] * dt, j = k * 6;
        rainPos[j + 1] -= dy; rainPos[j + 4] -= dy; rainPos[j] -= dy * 0.1; rainPos[j + 3] -= dy * 0.1;
        if (rainPos[j + 1] < 0.6) resetDrop(k, TOP);
      }
      rainGeo.attributes.position.needsUpdate = true;
    }
    if (look.snow) drift(snow, look.snow, 1.6, 0.6, dt);
    if (look.dust) drift(dust, look.dust, 0.4, 2.5, dt);
    extra.forEach(function (cl, k) { if (cl.visible) { cl.position.x += dt * 0.25 * (1 + (k % 3)); if (cl.position.x > 50) cl.position.x = -50; } });
    // 打雷：隔几秒闪一下
    if (look.flash) {
      nextFlash -= dt;
      if (nextFlash <= 0) { flashT = 0.35; nextFlash = 4 + Math.random() * 6; }
      if (flashT > 0) {
        flashT -= dt;
        var on = flashT > 0.22 || (flashT > 0.05 && flashT < 0.12);
        o.hemi.intensity = on ? 2.6 : look.hemi;
        scene.background.copy(bg).lerp(new THREE.Color(0xe8eef8), on ? 0.6 : 0);
      }
    }
  }
  function drift(p, n, fall, sway, dt) {
    for (var k = 0; k < n; k++) {
      var j = k * 3;
      p.pos[j + 1] -= fall * (1.2 + 0.7 * Math.sin(p.seed[k])) * dt;
      p.pos[j] += Math.sin(t * 0.8 + p.seed[k]) * sway * 0.6 * dt;
      p.pos[j + 2] += Math.cos(t * 0.6 + p.seed[k]) * sway * 0.36 * dt;
      if (p.pos[j + 1] < 0.3) place(p.pos, k, TOP);
    }
    p.obj.geometry.attributes.position.needsUpdate = true;
  }

  set("sun");
  return { set: set, update: update };
}
