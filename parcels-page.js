// 待取件快递页面：显示 Muse 最新一次 [快递] 留言里的待取件。
// ?me=miu / ?me=lulu 时“留言更新待取件”按钮的署名用对应的名字；?view=list 只显示列表（房子里点快递盒时用）
import { unlock } from "./lock.js";
import { loadParcels, cachedSnap, cityColor, repoUrl } from "./parcel-data.js";

var cfg = window.BOARD_CONFIG;
var $ = function (id) { return document.getElementById(id); };
var params = new URLSearchParams(location.search);
if (params.get("view") === "list") document.body.classList.add("list-only");

function el(tag, cls, text) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text; // 一律用 textContent，不当 HTML 渲染
  return e;
}
function pad(n) { return (n < 10 ? "0" : "") + n; }
function fmtTime(iso) {
  var d = new Date(iso);
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
}

function render(snap, note) {
  var list = $("list");
  list.innerHTML = "";
  if (!snap) { $("status").textContent = note || "还没有待取件的留言。"; return; }
  var when = (snap.who || "") + " " + fmtTime(snap.created_at) + " 更新（#" + snap.number + "）";
  $("status").textContent = note || (snap.parcels.length ? when + "：共 " + snap.parcels.length + " 件待取" : when + "：没有待取件。");
  snap.parcels.forEach(function (p) {
    var li = el("li", "parcel");
    li.style.setProperty("--c", cityColor(p.city));
    if (p.city) li.appendChild(el("span", "city", p.city));
    if (p.code) li.appendChild(el("div", "code", "取件码 " + p.code));
    var dl = el("dl");
    [["取件地址", p.place], ["物品", p.item], ["其他", p.other]].forEach(function (f) {
      if (!f[1]) return;
      dl.appendChild(el("dt", null, f[0]));
      dl.appendChild(el("dd", null, f[1]));
    });
    if (dl.children.length) li.appendChild(dl);
    list.appendChild(li);
  });
}

await unlock();
var loading = false;
async function load() {
  if (loading) return;
  loading = true;
  var cached = cachedSnap();
  if (cached) render(cached, "正在更新……（先显示的是上次看到的）");
  else $("status").textContent = "加载中……";
  try {
    render(await loadParcels());
  } catch (e) {
    if (cached) render(cached, "更新失败（" + e.message + "），下面是上次看到的，可点“刷新”重试。");
    else $("status").textContent = "加载失败：" + e.message;
  }
  loading = false;
}
$("refresh").onclick = load;
load();

// 给 Muse 的按钮：打开 GitHub 新建 issue 页面，标题和格式都填好
$("post").onclick = function () {
  var me = String(params.get("me") || "").toLowerCase();
  var who = (cfg.members.filter(function (m) { return m.id === me; })[0] || cfg.members[0]).name;
  var d = new Date();
  var title = cfg.parcelPrefix + " " + d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " 待取件";
  var body = "Muse留言\n署名：" + who + "\n\n【重庆】\n取件码：\n取件地址：\n物品：\n";
  window.open(repoUrl + "/issues/new?title=" + encodeURIComponent(title) + "&body=" + encodeURIComponent(body), "_blank", "noopener");
};
