// 日历小屏：挂在玄关墙上（和天气小屏一样的木框），左边“日程”、右边“倒计时”；点开看全部。
// 只有一块屏：几个人的日历（config.js 的 calendarSources）合在一起显示，有两个人的内容时每条后面标上是谁的。
//   import { makeCalendarBoard } from "./calendar-board.js";
//   var board = makeCalendarBoard({ width: 0.62 }); board.group 放进场景；board.draw(cals)（loadCalendars 的结果）；board.draw(null, "没加载出来")
// 点开后的详情在 calendar-detail.js（不依赖 three.js，日历页面也用）
import * as THREE from "three";
import { upcoming, dayLabel } from "./calendar-data.js";

var W = 1024, H = 640;
var FONT = "'PingFang SC','Microsoft YaHei',sans-serif";
var RED = "#e0605a", INK = "#3d3027", MUTED = "#8a7d74";

// 一行字放不下就缩小字号；再小也放不下就截断加“…”
function fit(g, text, x, y, maxW, size, weight) {
  var px = size;
  do { g.font = (weight || "") + px + "px " + FONT; px -= 2; } while (g.measureText(text).width > maxW && px > size * 0.7);
  if (g.measureText(text).width > maxW) {
    while (text.length > 1 && g.measureText(text + "…").width > maxW) text = text.slice(0, -1);
    text += "…";
  }
  g.fillText(text, x, y);
}

export function makeCalendarBoard(opts) {
  opts = opts || {};
  var canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  var g = canvas.getContext("2d");
  var tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  var group = new THREE.Group();
  group.name = "calendar_board";
  var w = opts.width || 0.62, h = w * H / W;
  var frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, h + 0.1, 0.06), new THREE.MeshStandardMaterial({ color: 0xc8915a, roughness: 0.85 }));
  var screen = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.55, roughness: 0.5 }));
  screen.position.z = 0.031;
  group.add(frame, screen);

  function header(title) {
    g.fillStyle = "#fffaf3"; g.fillRect(0, 0, W, H);
    g.fillStyle = RED; g.fillRect(0, 0, W, 104);
    g.fillStyle = "#ffffff"; g.textBaseline = "middle"; g.textAlign = "left";
    fit(g, title, 36, 54, 600, 56, "bold ");
    var now = new Date();
    g.textAlign = "right"; g.font = "44px " + FONT;
    g.fillText((now.getMonth() + 1) + "月" + now.getDate() + "日 周" + "日一二三四五六"[now.getDay()], W - 36, 54);
  }

  function draw(cals, message) {
    cals = cals || [];
    // 标题：只配了一个人就是“xx的日历”，几个人合在一起就是“我们的日历”
    header(cals.length === 1 ? cals[0].owner + "的日历" : "我们的日历");
    var ok = cals.filter(function (c) { return c.has && !c.bad; });
    var msg = message || (!cals.length ? "加载中…" : ok.length ? "" : cals.some(function (c) { return c.bad; }) ? "解不开，请 Muse 重新留言" : "还没有日历");
    if (msg) {
      g.fillStyle = INK; g.textAlign = "center"; g.font = "52px " + FONT;
      g.fillText(msg, W / 2, (H + 104) / 2);
      tex.needsUpdate = true;
      return;
    }
    // 几个人的合在一起排；有两个人的内容时，每条标上是谁的
    var now = new Date(), u = { events: [], reminders: [] }, tag = ok.length > 1;
    ok.forEach(function (c) {
      var one = upcoming(c, now);
      one.events.forEach(function (e) { u.events.push(Object.assign({ owner: c.owner }, e)); });
      one.reminders.forEach(function (r) { u.reminders.push(Object.assign({ owner: c.owner }, r)); });
    });
    u.events.sort(function (a, b) { return a.date - b.date || a.time.localeCompare(b.time); });
    u.reminders.sort(function (a, b) { return a.days - b.days; });
    // 中间竖线：左日程、右倒计时
    var mid = 560;
    g.fillStyle = "#eadfd6"; g.fillRect(mid, 130, 3, H - 160);
    g.textAlign = "left"; g.fillStyle = RED; g.font = "bold 40px " + FONT;
    g.fillText("日程", 36, 150);
    g.fillText("倒计时", mid + 32, 150);

    // 日程：最近的 4 条，每条两行（日期时间 / 事项）
    var y = 212;
    if (!u.events.length) { g.fillStyle = MUTED; g.font = "38px " + FONT; g.fillText("近期没有日程", 36, y); }
    u.events.slice(0, 4).forEach(function (e) {
      g.fillStyle = MUTED; fit(g, dayLabel(e.date, now) + (e.time ? " " + e.time : "") + (tag ? " · " + e.owner : ""), 36, y, mid - 60, 32);
      g.fillStyle = INK; fit(g, e.text, 36, y + 44, mid - 60, 40, "bold ");
      y += 104;
    });
    if (u.events.length > 4) { g.fillStyle = MUTED; g.font = "30px " + FONT; g.fillText("还有 " + (u.events.length - 4) + " 条，点开看", 36, H - 22); }

    // 倒计时：最近的 3 个，每个一行“距离 xx 还有” + 大数字天数
    var x0 = mid + 32, cw = W - x0 - 32;
    y = 212;
    if (!u.reminders.length) { g.fillStyle = MUTED; g.font = "38px " + FONT; g.fillText("没有提醒", x0, y); }
    u.reminders.slice(0, 3).forEach(function (r) {
      var what = r.text.replace(/^距离?\s*/, "").replace(/还有.*$/, "");
      // 两行：“距离 xx” / “还有 N 天”（今天的：“今天就是 xx” / 🎉）
      var lead = r.days === 0 ? "今天就是" : "距离";
      g.fillStyle = MUTED; g.font = "32px " + FONT; g.fillText(lead, x0, y);
      var lw = g.measureText(lead).width + 8;
      g.fillStyle = INK; fit(g, what, x0 + lw, y, cw - lw, 38, "bold ");
      if (r.days === 0) { g.font = "bold 52px " + FONT; g.fillText("🎉", x0, y + 60); }
      else {
        g.fillStyle = MUTED; g.font = "32px " + FONT; g.fillText("还有", x0, y + 64);
        var x = x0 + g.measureText("还有").width + 10;
        g.fillStyle = RED; g.font = "bold 68px " + FONT; g.fillText(String(r.days), x, y + 58);
        x += g.measureText(String(r.days)).width + 8;
        g.font = "34px " + FONT; g.fillText("天", x, y + 64);
        if (tag) { x += g.measureText("天").width + 14; g.fillStyle = MUTED; fit(g, r.owner, x, y + 64, W - 32 - x, 28); }
      }
      y += 128;
    });
    if (u.reminders.length > 3) { g.fillStyle = MUTED; g.font = "30px " + FONT; g.fillText("还有 " + (u.reminders.length - 3) + " 个，点开看", x0, H - 22); }
    tex.needsUpdate = true;
  }
  draw(null);
  return { group: group, draw: draw };
}
