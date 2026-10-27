// 待取件快递页面：上面登记今天的全部待取件（加密后打开 GitHub 新建 issue），下面显示最新一次登记的。
// ?me=miu / ?me=lulu 自动选好“我是”（给 Muse 用的专属链接）；?view=list 只显示列表（房子里点快递盒时用）
import { unlock, encrypt } from "./lock.js";
import { loadParcels, cachedIssue, decryptIssue, cityColor, repoUrl } from "./parcel-data.js";

var cfg = window.BOARD_CONFIG;
var MARK = "Muse留言"; // 正文第一行的署名，按 AI_TEAM.md 的留言署名规则
var FIELDS = ["company", "code", "place", "item", "note"];
var $ = function (id) { return document.getElementById(id); };
var params = new URLSearchParams(location.search);
if (params.get("view") === "list") document.body.classList.add("list-only");

// 我是谁：同留言板，?me= 优先，其次本机记住的
var ME_KEY = "muse-board-me";
cfg.members.forEach(function (m) {
  var opt = document.createElement("option");
  opt.value = m.name;
  opt.textContent = m.name;
  $("author").appendChild(opt);
});
var me = params.get("me");
try { me = me || localStorage.getItem(ME_KEY); } catch (e) {}
cfg.members.forEach(function (m) {
  if (me && (m.id === String(me).toLowerCase() || m.name === me)) $("author").value = m.name;
});
$("author").onchange = function () { try { localStorage.setItem(ME_KEY, $("author").value); } catch (e) {} };

// 一件快递一栏：城市（config 里定好颜色的城市 + “其他”）和其他字段
function renumber() {
  document.querySelectorAll("#items .item").forEach(function (f, i) { f.querySelector("legend").textContent = "第 " + (i + 1) + " 件"; });
}
function addItem() {
  var f = $("item-tpl").content.firstElementChild.cloneNode(true);
  var city = f.querySelector("[name=city]");
  Object.keys(cfg.cityColors).concat(["其他"]).forEach(function (c) {
    var opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    city.appendChild(opt);
  });
  city.onchange = function () {
    var other = city.value === "其他";
    f.querySelector(".city-other").hidden = !other;
    f.querySelector("[name=cityOther]").required = other;
  };
  f.querySelector(".remove").onclick = function () { f.remove(); renumber(); };
  $("items").appendChild(f);
  renumber();
}
$("add").onclick = addItem;
addItem();

function el(tag, cls, text) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text; // 一律用 textContent，不当 HTML 渲染
  return e;
}
function fmtTime(iso) {
  var d = new Date(iso);
  var p = function (n) { return (n < 10 ? "0" : "") + n; };
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
}
function today() {
  var d = new Date();
  var p = function (n) { return (n < 10 ? "0" : "") + n; };
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

function render(snap, note) {
  var list = $("list");
  list.innerHTML = "";
  if (!snap) { $("status").textContent = note || "还没有登记过待取件。"; return; }
  var when = (snap.date || fmtTime(snap.created_at).slice(0, 10)) + "（" + (snap.who || "") + " " + fmtTime(snap.created_at) + " 登记，#" + snap.number + "）";
  if (snap.bad) { $("status").textContent = note || when + " 的登记解不开（可能是改密码前登记的），请重新登记一次。"; return; }
  $("status").textContent = note || (snap.parcels.length ? when + "：共 " + snap.parcels.length + " 件待取" : when + "：没有待取件。");
  snap.parcels.forEach(function (p) {
    var li = el("li", "parcel");
    li.style.setProperty("--c", cityColor(p.city));
    var head = el("div", "meta");
    head.appendChild(el("span", "city", p.city));
    if (p.company) head.appendChild(el("span", "who", p.company));
    li.appendChild(head);
    if (p.code) li.appendChild(el("div", "code", "取件码 " + p.code));
    var dl = el("dl");
    [["取件地点", p.place], ["物品", p.item], ["备注", p.note]].forEach(function (f) {
      if (!f[1]) return;
      dl.appendChild(el("dt", null, f[0]));
      dl.appendChild(el("dd", null, f[1]));
    });
    if (dl.children.length) li.appendChild(dl);
    list.appendChild(li);
  });
}

var key = await unlock();
var loading = false;
async function load() {
  if (loading) return;
  loading = true;
  var cached = cachedIssue();
  if (cached) render(await decryptIssue(key, cached), "正在更新……（先显示的是上次看到的）");
  else $("status").textContent = "加载中……";
  try {
    render(await loadParcels(key));
  } catch (e) {
    if (cached) render(await decryptIssue(key, cached), "更新失败（" + e.message + "），下面是上次看到的，可点“刷新”重试。");
    else $("status").textContent = "加载失败：" + e.message;
  }
  loading = false;
}
$("refresh").onclick = load;
load();

// 登记：加密后打开 GitHub 新建 issue 页面。先同步开好空白窗口，免得加密完再开被浏览器当成弹窗拦掉
$("form").onsubmit = async function (ev) {
  ev.preventDefault();
  var parcels = [];
  document.querySelectorAll("#items .item").forEach(function (f) {
    var v = function (n) { return f.querySelector("[name=" + n + "]").value.trim(); };
    var p = { city: v("city") === "其他" ? v("cityOther") : v("city") };
    FIELDS.forEach(function (n) { if (v(n)) p[n] = v(n); });
    parcels.push(p);
  });
  var win = window.open("", "_blank");
  var who = $("author").value, date = today();
  var title = cfg.parcelPrefix + " " + date + " 待取件（" + who + " 登记）";
  var body = MARK + "\n署名：" + who + "\n\n这是 " + date + " 的待取件登记，内容已加密，打开快递页面输入密码后才能看到。新的登记会替换掉这条，不用手动关。\n\n" +
    await encrypt(key, { date: date, who: who, parcels: parcels });
  var url = repoUrl + "/issues/new?title=" + encodeURIComponent(title) + "&body=" + encodeURIComponent(body);
  if (win) { win.opener = null; win.location.href = url; }
  var link = el("a", null, "没自动打开的话点这里");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener";
  $("send-status").textContent = "已打开 GitHub 新建 issue 页面（" + parcels.length + " 件），在那里点 Create，回来点“刷新”核对。";
  $("send-status").appendChild(link);
};
