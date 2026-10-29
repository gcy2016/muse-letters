// 天气牌：画天气图标、做 3D 的天气牌（屋里玄关墙上挂着的；stand 立在地上的样式留着备用），以及点开后的详情。
//   import { makeWeatherBoard, weatherDetail, iconURL } from "./weather-board.js";
//   var board = makeWeatherBoard({ stand: true });  // stand：带两根柱子立在地上；不带就是挂墙的小屏
//   board.group 放进场景；board.draw(weather)；board.draw(null, "还没有预报") 显示一句话
//   panel.append(weatherDetail(weather));           // 弹窗里的详情（DOM）
import * as THREE from "three";
import { skyKind } from "./weather-data.js";

// ---------- 图标（画在 2D 画布上，s 是图标边长） ----------
function cloud(g, x, y, s, color) {
  g.fillStyle = color;
  g.beginPath();
  g.arc(x - s * 0.18, y + s * 0.04, s * 0.17, 0, Math.PI * 2);
  g.arc(x + s * 0.02, y - s * 0.08, s * 0.22, 0, Math.PI * 2);
  g.arc(x + s * 0.22, y + s * 0.04, s * 0.16, 0, Math.PI * 2);
  g.fill();
  g.fillRect(x - s * 0.18, y + s * 0.02, s * 0.4, s * 0.19);
}
function sun(g, x, y, r, color) {
  g.strokeStyle = g.fillStyle = color || "#ffc23d";
  g.lineWidth = r * 0.22; g.lineCap = "round";
  for (var i = 0; i < 8; i++) {
    var a = i * Math.PI / 4;
    g.beginPath(); g.moveTo(x + Math.cos(a) * r * 1.35, y + Math.sin(a) * r * 1.35); g.lineTo(x + Math.cos(a) * r * 1.75, y + Math.sin(a) * r * 1.75); g.stroke();
  }
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
}
function drops(g, x, y, s, n, color) {
  g.strokeStyle = color; g.lineWidth = s * 0.05; g.lineCap = "round";
  for (var i = 0; i < n; i++) {
    var dx = x + (i - (n - 1) / 2) * s * 0.16, dy = y + (i % 2) * s * 0.08;
    g.beginPath(); g.moveTo(dx, dy); g.lineTo(dx - s * 0.05, dy + s * 0.14); g.stroke();
  }
}
function flakes(g, x, y, s, n) {
  g.strokeStyle = "#ffffff"; g.lineWidth = s * 0.03;
  for (var i = 0; i < n; i++) {
    var cx = x + (i - (n - 1) / 2) * s * 0.17, cy = y + (i % 2) * s * 0.09, r = s * 0.055;
    for (var k = 0; k < 3; k++) {
      var a = k * Math.PI / 3;
      g.beginPath(); g.moveTo(cx - Math.cos(a) * r, cy - Math.sin(a) * r); g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); g.stroke();
    }
  }
}
export function drawIcon(g, kind, x, y, s) {
  g.save();
  var rainN = { rain1: 2, rain2: 3, rain3: 4, rain4: 5 }[kind];
  var snowN = { snow1: 2, snow2: 3, snow3: 4 }[kind];
  if (kind === "sun") sun(g, x, y, s * 0.2);
  else if (kind === "cloudy") { sun(g, x - s * 0.12, y - s * 0.1, s * 0.15); cloud(g, x + s * 0.06, y + s * 0.06, s * 0.9, "#ffffff"); }
  else if (kind === "overcast") { cloud(g, x - s * 0.08, y - s * 0.08, s * 0.7, "#c9d0d8"); cloud(g, x + s * 0.06, y + s * 0.04, s * 0.95, "#e8ecf0"); }
  else if (rainN) { cloud(g, x, y - s * 0.12, s, "#d6dde5"); drops(g, x, y + s * 0.18, s, rainN, "#5aa9ff"); }
  else if (kind === "thunder") {
    cloud(g, x, y - s * 0.12, s, "#9aa6b2"); drops(g, x - s * 0.1, y + s * 0.18, s, 2, "#5aa9ff");
    g.fillStyle = "#ffd23d"; g.beginPath();
    g.moveTo(x + s * 0.1, y + s * 0.05); g.lineTo(x + s * 0.0, y + s * 0.24); g.lineTo(x + s * 0.08, y + s * 0.24); g.lineTo(x + s * 0.02, y + s * 0.42);
    g.lineTo(x + s * 0.2, y + s * 0.18); g.lineTo(x + s * 0.11, y + s * 0.18); g.lineTo(x + s * 0.18, y + s * 0.05); g.closePath(); g.fill();
  } else if (snowN) { cloud(g, x, y - s * 0.12, s, "#dfe6ee"); flakes(g, x, y + s * 0.22, s, snowN); }
  else if (kind === "sleet") { cloud(g, x, y - s * 0.12, s, "#d6dde5"); drops(g, x - s * 0.1, y + s * 0.2, s, 2, "#5aa9ff"); flakes(g, x + s * 0.16, y + s * 0.22, s, 1); }
  else if (kind === "fog" || kind === "haze" || kind === "dust") {
    var c = kind === "fog" ? "#ffffff" : kind === "haze" ? "#d8c9a0" : "#d9a35f";
    if (kind !== "fog") sun(g, x, y - s * 0.12, s * 0.13, kind === "haze" ? "#e8d49a" : "#e6b47a");
    g.strokeStyle = c; g.lineWidth = s * 0.07; g.lineCap = "round";
    [-0.02, 0.13, 0.28].forEach(function (dy, i) { g.beginPath(); g.moveTo(x - s * 0.3 + i * s * 0.06, y + dy * s); g.lineTo(x + s * 0.3 - i * s * 0.04, y + dy * s); g.stroke(); });
  } else { g.fillStyle = "#ffffff"; g.font = "bold " + Math.round(s * 0.5) + "px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("?", x, y); }
  g.restore();
}
// 图标做成图片地址（弹窗里用）；背景是浅蓝圆角，白云才看得清
var urls = {};
export function iconURL(kind) {
  if (urls[kind]) return urls[kind];
  var c = document.createElement("canvas");
  c.width = c.height = 128;
  var g = c.getContext("2d");
  g.fillStyle = "#7fb6e8"; roundRect(g, 0, 0, 128, 128, 24); g.fill();
  drawIcon(g, kind, 64, 66, 112);
  return (urls[kind] = c.toDataURL());
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function temp(d) { return d && d.lo !== null ? d.lo + "~" + d.hi + "°" : ""; }
// 预报日期离北京时间今天几天 → 叫法；没写日期的按明天算，更早的只显示日期
function dayName(offset) { return offset === null || offset === undefined ? "明天" : ({ 0: "今天", 1: "明天", 2: "后天" })[offset] || ""; }
function dateLabel(date, offset) {
  var p = (date || "").split("-"), day = dayName(offset);
  return p.length === 3 ? (day ? day + " " : "") + (+p[1]) + "/" + (+p[2]) : day;
}

// ---------- 3D 天气牌 ----------
var W = 1024, H = 640;
export function makeWeatherBoard(opts) {
  opts = opts || {};
  var canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  var g = canvas.getContext("2d");
  var tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  var group = new THREE.Group();
  group.name = "weather_board";
  var w = opts.width || 1.3, h = w * H / W;
  var wood = new THREE.MeshStandardMaterial({ color: 0xc8915a, roughness: 0.85 });
  var frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, h + 0.1, 0.06), wood);
  var screen = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.55, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }));
  screen.position.z = 0.031;
  var face = new THREE.Group();
  face.add(frame, screen);
  group.add(face);
  if (opts.stand) {
    face.position.y = (opts.height || 1.35);
    [-1, 1].forEach(function (s) {
      var post = new THREE.Mesh(new THREE.BoxGeometry(0.09, face.position.y + h / 2, 0.09), new THREE.MeshStandardMaterial({ color: 0x7a4f2e, roughness: 0.9 }));
      post.position.set(s * (w / 2 + 0.02), (face.position.y + h / 2) / 2, -0.06);
      group.add(post);
    });
    var roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.06, 0.32), new THREE.MeshStandardMaterial({ color: 0xe5836f, roughness: 0.85 }));
    roof.position.set(0, face.position.y + h / 2 + 0.1, 0);
    group.add(roof);
  }
  group.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  function draw(wx, message) {
    var bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#5f9fdc"); bg.addColorStop(1, "#8cc4ef");
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.fillStyle = "#ffffff"; g.textBaseline = "middle";
    if (!wx || !wx.places.length) {
      g.textAlign = "center";
      g.font = "bold 84px 'PingFang SC','Microsoft YaHei',sans-serif";
      g.fillText("明天的天气", W / 2, H / 2 - 60);
      g.font = "52px 'PingFang SC','Microsoft YaHei',sans-serif";
      g.fillText(message || "还没有预报", W / 2, H / 2 + 50);
      tex.needsUpdate = true;
      return;
    }
    g.textAlign = "left";
    g.font = "bold 60px 'PingFang SC','Microsoft YaHei',sans-serif";
    var fresh = wx.places.filter(function (p) { return !p.stale; })[0] || wx.places[0];
    g.fillText(dateLabel(fresh.date, fresh.offset), 40, 62);
    if (wx.sample) {
      g.textAlign = "right"; g.font = "42px 'PingFang SC','Microsoft YaHei',sans-serif";
      g.fillStyle = "#e8f3ff"; g.fillText("示例数据", W - 40, 62); g.fillStyle = "#ffffff";
    }
    var places = wx.places.slice(0, 2), n = places.length, colW = W / n;
    places.forEach(function (p, i) {
      var cx = colW * i + colW / 2, d = p.tomorrow;
      var size = n === 1 ? 300 : 250;
      drawIcon(g, skyKind(d), cx, 270, size);
      g.textAlign = "center";
      g.font = "bold " + (n === 1 ? 92 : 80) + "px 'PingFang SC','Microsoft YaHei',sans-serif";
      fitText(g, temp(d) || (d && d.text) || "—", cx, 455, colW - 40, n === 1 ? 92 : 80, "bold ");
      g.font = "48px 'PingFang SC','Microsoft YaHei',sans-serif";
      var sub = [p.name, d && d.rain !== null ? "降水" + d.rain + "%" : ""].filter(Boolean).join(" · ");
      fitText(g, sub, cx, 545, colW - 40, 48);
      if (p.stale) { g.fillStyle = "#ffe08a"; g.font = "40px 'PingFang SC','Microsoft YaHei',sans-serif"; g.fillText("预报已过期", cx, 600); g.fillStyle = "#ffffff"; }
      if (n > 1 && i > 0) { g.fillStyle = "rgba(255,255,255,0.35)"; g.fillRect(colW * i - 2, 120, 4, H - 160); g.fillStyle = "#ffffff"; }
    });
    tex.needsUpdate = true;
  }
  draw(null, "加载中…");
  return { group: group, draw: draw };
}

// 一行字放不下就把字号缩小，不挤出格子（地点名可能写得很长，比如“重庆·两江新区”）
function fitText(g, text, x, y, maxW, size, weight) {
  var px = size;
  do { g.font = (weight || "") + px + "px 'PingFang SC','Microsoft YaHei',sans-serif"; px -= 2; } while (g.measureText(text).width > maxW && px > 20);
  g.fillText(text, x, y);
}

// ---------- 弹窗详情 ----------
function mk(tag, attrs, kids) {
  var e = Object.assign(document.createElement(tag), attrs || {});
  (kids || []).forEach(function (k) { if (k) e.append(k); });
  return e;
}
function dayRow(label, d, big) {
  if (!d) return null;
  var info = [d.text, temp(d), d.rain !== null ? "降水 " + d.rain + "%" : "", d.wind].filter(Boolean).join("　");
  return mk("div", { className: "wx-day" + (big ? " big" : "") }, [
    mk("img", { src: iconURL(skyKind(d)), alt: d.text || "" }),
    mk("div", {}, [mk("b", { textContent: label }), mk("div", { textContent: info || d.raw })]),
  ]);
}
export function weatherDetail(wx, error) {
  var box = mk("div", { className: "wx" });
  if (!wx || !wx.places.length) {
    box.append(mk("p", { textContent: error ? "天气没加载出来：" + error : "还没有天气预报。" }));
    return box;
  }
  var head = wx.places.filter(function (p) { return !p.stale; })[0] || wx.places[0], name = dayName(head.offset);
  box.append(mk("h3", { textContent: name ? name + "的天气" : "天气预报" }));
  if (wx.offline) box.append(mk("p", { className: "wx-warn", textContent: "没连上 GitHub，显示的是上次读到的。" }));
  wx.places.forEach(function (p) {
    var card = mk("div", { className: "wx-place" }, [mk("h4", { textContent: p.name + (p.who ? "　" + p.who : "") + (p.date ? "　" + p.date : "") })]);
    if (p.stale) card.append(mk("div", { className: "wx-warn", textContent: "预报已过期，还没有新的预报。" }));
    var off = p.offset === null || p.offset === undefined ? 1 : p.offset;
    card.append(dayRow(dayName(off) || "当天", p.tomorrow, true) || mk("div", { textContent: "（没有预报）" }));
    var after = dayRow(dayName(off + 1) || "次日", p.after);
    if (after) card.append(after);
    if (p.air) card.append(mk("div", { className: "wx-line", textContent: "空气：" + p.air }));
    if (p.tip) card.append(mk("div", { className: "wx-tip", textContent: p.tip }));
    if (p.other) card.append(mk("div", { className: "wx-line", textContent: p.other }));
    if (p.note) card.append(mk("div", { className: "wx-line", textContent: p.note }));
    var foot = [p.published ? "发布：" + p.published : "", p.source ? "来源：" + p.source : ""].filter(Boolean).join("　");
    if (foot) card.append(mk("div", { className: "wx-foot", textContent: foot }));
    box.append(card);
  });
  (wx.sources || []).forEach(function (s) {
    if (!s.has) box.append(mk("p", { className: "wx-foot", textContent: s.city + "还没有预报（由 " + s.who + " 提供）。" }));
  });
  if (wx.sample) box.append(mk("p", { className: "wx-foot", textContent: "（示例数据）" }));
  return box;
}
// 弹窗样式（岛上、屋里共用）
export var WEATHER_CSS =
  ".wx{padding:56px 18px 18px;color:#3d3027;overflow:auto;height:100%;box-sizing:border-box}" +
  ".wx h3{margin:0 0 10px;font-size:20px}.wx h4{margin:0 0 8px;font-size:17px}" +
  ".wx-place{background:#fff;border-radius:14px;padding:14px;margin:0 0 12px;box-shadow:0 1px 6px rgba(0,0,0,.08)}" +
  ".wx-day{display:flex;gap:12px;align-items:center;margin:6px 0}.wx-day img{width:48px;height:48px}.wx-day.big img{width:72px;height:72px}" +
  ".wx-day.big b{font-size:17px}.wx-line{color:#6b5a4e;font-size:14px;margin-top:4px;white-space:pre-wrap}" +
  ".wx-tip{margin-top:8px;padding:8px 10px;background:#fff4d6;border-radius:10px;font-size:15px}" +
  ".wx-warn{color:#c2770c}.wx-foot{color:#8a7d74;font-size:13px}";
