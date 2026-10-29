// 3D 空间里的留言板：
//   - 常驻按钮：右下角“💬 留言板”，岛上、屋里都有；点了在当前页面弹出留言板（board.html），不跳页。有新留言时亮红点，打开留言板后消掉。
//   - 玄关软木板：显示留言板网页的样子（“全部留言”列表：谁、什么时候、内容，颜色和网页一样），每 10 分钟更新，不做提醒。
//   import { mountBoardButton, makeCorkNotes } from "./board-ui.js";
//   var board = mountBoardButton();   // board.open() 也能从别处（比如点软木板）打开
//   makeCorkNotes(house);             // 屋里：软木板上显示留言板（原来的装饰便利贴藏起来）
import * as THREE from "three";
import { watchBoard, refreshBoard, hasNew, markSeen } from "./board-feed.js";

// 和留言板网页（style.css）一样的颜色：卡片底色、左边色条、名字颜色、名字前的小标记
var STYLE = {
  m0: { bg: "#f0f6ff" }, m1: { bg: "#fff0f3" },
  o0: { bg: "#fdf3e3", bar: "#b45309", who: "#b45309", pre: "♛ " }, o1: { bg: "#f4effd", bar: "#7c3aed", who: "#7c3aed", pre: "♛ " },
  claude: { bg: "#ecf7f5", bar: "#0f766e", who: "#0f766e", pre: "</> " },
};
var CSS =
  "#board-btn{position:fixed;right:14px;bottom:64px;z-index:20;padding:9px 15px;border:none;border-radius:22px;background:#e0607e;color:#fff;" +
  "font-size:15px;font-weight:600;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.25);font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif}" +
  "#board-btn .dot{position:absolute;top:-3px;right:-3px;width:13px;height:13px;border-radius:50%;background:#ff3b30;border:2px solid #fff;display:none}" +
  "#board-btn.new .dot{display:block}" +
  "#board-pop{position:fixed;inset:0;z-index:30;display:none;background:rgba(20,30,40,.45)}#board-pop.open{display:block}" +
  "#board-pop .box{position:absolute;inset:24px;max-width:720px;margin:0 auto;background:#fdf6f0;border-radius:14px;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,.3)}" +
  "#board-pop iframe{display:block;width:100%;height:100%;border:0}" +
  "#board-pop .x{position:absolute;right:10px;top:10px;z-index:1;width:36px;height:36px;border-radius:50%;border:none;background:#e0607e;color:#fff;font-size:20px;cursor:pointer}" +
  "@media (max-width:600px){#board-pop .box{inset:10px}#board-btn{bottom:76px}}";

export function mountBoardButton() {
  var style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);
  var btn = document.createElement("button");
  btn.id = "board-btn"; btn.type = "button";
  btn.innerHTML = "💬 留言板<span class='dot'></span>";
  var pop = document.createElement("div");
  pop.id = "board-pop";
  pop.innerHTML = "<div class='box'><button class='x' type='button' aria-label='关闭'>×</button><iframe title='留言板'></iframe></div>";
  document.body.append(btn, pop);
  var frame = pop.querySelector("iframe"), list = null;

  watchBoard(function (l) { list = l; btn.classList.toggle("new", hasNew(l)); });
  function open() {
    if (!frame.src) frame.src = "board.html";
    else frame.contentWindow.location.reload();
    pop.classList.add("open");
    markSeen(list); btn.classList.remove("new");
  }
  // 关掉时再读一次：在留言板里刚发的、刚看到的新帖都算看过了
  function close() {
    pop.classList.remove("open");
    refreshBoard().then(function (l) { markSeen(l); btn.classList.toggle("new", hasNew(l)); });
  }
  btn.onclick = open;
  pop.querySelector(".x").onclick = close;
  pop.addEventListener("click", function (e) { if (e.target === pop) close(); });
  return { open: open, button: btn };
}

// ---------- 玄关软木板：留言板网页的样子 ----------
var CW = 1450, CH = 1000; // 软木面 0.96 × 0.66 米
var FONT = "'PingFang SC','Microsoft YaHei',sans-serif";
export function makeCorkNotes(house) {
  var holder = house.interactables.board;
  if (!holder) return null;
  var cork = null;
  holder.traverse(function (o) {
    if (/^board_note/.test(o.name)) o.visible = false; // 原来的装饰便利贴
    if (o.name === "board_cork") cork = o;
  });
  if (!cork) return null;
  // 在软木面正前方贴一张画布（房子坐标里软木板朝 +z，量出软木面的大小和位置）
  holder.updateMatrixWorld(true);
  var inv = new THREE.Matrix4().copy(holder.matrixWorld).invert();
  var box = new THREE.Box3().setFromObject(cork).applyMatrix4(inv);
  var size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  var canvas = document.createElement("canvas");
  canvas.width = CW; canvas.height = CH;
  var g = canvas.getContext("2d");
  var tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  var plane = new THREE.Mesh(new THREE.PlaneGeometry(size.x, size.y), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.25, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }));
  plane.position.set(center.x, center.y, box.max.z + 0.003);
  holder.add(plane);

  function draw(list) {
    g.fillStyle = "#fdf6f0"; g.fillRect(0, 0, CW, CH);
    g.textBaseline = "alphabetic"; g.textAlign = "left";
    g.fillStyle = "#2b2420"; g.font = "bold 60px " + FONT; g.fillText("噜噜之家留言板", 40, 80);
    g.fillStyle = "#8a7d74"; g.font = "34px " + FONT; g.fillText("噜噜之家成员留言的地方", 500, 78);
    g.fillStyle = "#2b2420"; g.font = "bold 42px " + FONT; g.fillText("全部留言", 40, 150);
    if (!list || !list.length) {
      g.fillStyle = "#8a7d74"; g.font = "38px " + FONT;
      g.fillText(list ? "还没有留言。" : "加载中……", 40, 220);
      tex.needsUpdate = true;
      return;
    }
    // 一条一张卡片，排到板子底下为止；每张最多 3 行内容
    var y = 180, x = 40, w = CW - 80;
    for (var i = 0; i < list.length && y < CH - 120; i++) {
      var n = list[i], st = STYLE[n.cls] || STYLE.m1;
      g.font = "36px " + FONT;
      var lines = wrapLines(g, n.text || "", w - 56, 3);
      var h = 34 + 46 + lines.length * 46 + 18;
      if (y + h > CH - 10) { if (i === 0) h = CH - 10 - y; else break; }
      g.fillStyle = st.bg; g.strokeStyle = "#eadfd6"; g.lineWidth = 2;
      roundRect(g, x, y, w, h, 18); g.fill(); g.stroke();
      if (st.bar) { g.fillStyle = st.bar; roundRect(g, x, y, 8, h, 4); g.fill(); }
      g.font = "bold 34px " + FONT; g.fillStyle = st.who || "#2b2420";
      var who = (st.pre || "") + n.who;
      g.fillText(who, x + 28, y + 52);
      var mx = x + 28 + g.measureText(who).width + 22;
      g.font = "30px " + FONT; g.fillStyle = "#8a7d74";
      g.fillText(fmtTime(n.created_at) + "　#" + n.number, mx, y + 52);
      g.font = "36px " + FONT; g.fillStyle = "#2b2420";
      lines.forEach(function (l, k) { g.fillText(l, x + 28, y + 100 + k * 46); });
      y += h + 16;
    }
    tex.needsUpdate = true;
  }
  draw(null);
  watchBoard(draw);
  return { draw: draw };
}

function fmtTime(iso) {
  var d = new Date(iso), p = function (n) { return (n < 10 ? "0" : "") + n; };
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
// 按宽度折行（换行符照留），最多 max 行，多了最后一行打省略号
function wrapLines(g, text, maxW, max) {
  var out = [];
  String(text).split("\n").some(function (para) {
    var line = "";
    Array.from(para).forEach(function (ch) {
      if (out.length >= max) return;
      if (g.measureText(line + ch).width > maxW && line) { out.push(line); line = ch; } else line += ch;
    });
    if (out.length < max) out.push(line);
    return out.length >= max;
  });
  var all = String(text).replace(/\n/g, "").length, shown = out.join("").length;
  if (shown < all && out.length) out[out.length - 1] = out[out.length - 1].slice(0, -1) + "…";
  return out;
}
