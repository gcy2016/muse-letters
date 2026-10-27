// 待取件快递页面：上面登记（加密后打开 GitHub 新建 issue），下面列出全部待取件。
// ?me=miu / ?me=lulu 自动选好“我是”（给 Muse 用的专属链接）；?view=list 只显示列表（房子里点快递盒时用）
import { unlock, encrypt } from "./lock.js";
import { loadParcels, cachedIssues, decryptIssues, cityColor, repoUrl } from "./parcel-data.js";

var cfg = window.BOARD_CONFIG;
var MARK = "Muse留言"; // 正文第一行的署名，按 AI_TEAM.md 的留言署名规则
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

// 城市：config 里定好颜色的城市 + “其他”
Object.keys(cfg.cityColors).concat(["其他"]).forEach(function (c) {
  var opt = document.createElement("option");
  opt.value = c;
  opt.textContent = c;
  $("city").appendChild(opt);
});
$("city").onchange = function () {
  var other = $("city").value === "其他";
  $("city-other-box").hidden = !other;
  $("city-other").required = other;
};

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

function render(parcels, note) {
  var list = $("list");
  list.innerHTML = "";
  $("status").textContent = note || (parcels.length ? "共 " + parcels.length + " 件待取（最新的在最上面）" : "没有待取件的快递。");
  parcels.forEach(function (p) {
    var li = el("li", "parcel");
    li.style.setProperty("--c", p.bad ? "#999" : cityColor(p.city));
    var head = el("div", "meta");
    head.appendChild(el("span", "city", p.bad ? "解不开" : p.city));
    if (p.company) head.appendChild(el("span", "who", p.company));
    head.appendChild(el("span", null, (p.who || "") + " 登记于 " + fmtTime(p.created_at)));
    head.appendChild(el("span", null, "#" + p.number));
    li.appendChild(head);
    if (p.bad) li.appendChild(el("div", "body", "这件的内容解不开（可能是改密码前登记的），请重新登记一次，再把这条关掉。"));
    if (p.code) li.appendChild(el("div", "code", "取件码 " + p.code));
    var dl = el("dl");
    [["取件地点", p.place], ["物品", p.item], ["备注", p.note]].forEach(function (f) {
      if (!f[1]) return;
      dl.appendChild(el("dt", null, f[0]));
      dl.appendChild(el("dd", null, f[1]));
    });
    if (dl.children.length) li.appendChild(dl);
    var actions = el("div", "actions");
    var done = el("a", null, "已取件（到 GitHub 点 Close issue）");
    done.href = p.url;
    done.target = "_blank";
    done.rel = "noopener";
    actions.appendChild(done);
    li.appendChild(actions);
    list.appendChild(li);
  });
}

var key = await unlock();
var loading = false;
async function load() {
  if (loading) return;
  loading = true;
  var cached = cachedIssues();
  if (cached) render(await decryptIssues(key, cached), "正在更新……（先显示的是上次看到的）");
  else $("status").textContent = "加载中……";
  try {
    render(await loadParcels(key));
  } catch (e) {
    if (cached) render(await decryptIssues(key, cached), "更新失败（" + e.message + "），下面是上次看到的，可点“刷新”重试。");
    else $("status").textContent = "加载失败：" + e.message;
  }
  loading = false;
}
$("refresh").onclick = load;
load();

// 登记：加密后打开 GitHub 新建 issue 页面。先同步开好空白窗口，免得加密完再开被浏览器当成弹窗拦掉
$("form").onsubmit = async function (ev) {
  ev.preventDefault();
  var city = $("city").value === "其他" ? $("city-other").value.trim() : $("city").value;
  if (!city) return;
  var win = window.open("", "_blank");
  var who = $("author").value;
  var data = { city: city, who: who };
  ["company", "code", "place", "item", "note"].forEach(function (f) { var v = $(f).value.trim(); if (v) data[f] = v; });
  var title = cfg.parcelPrefix + " " + who + " 登记的待取件";
  var body = MARK + "\n署名：" + who + "\n\n这是一件待取件快递的登记，内容已加密，打开快递页面输入密码后才能看到。取件后把这个 issue Close 掉即可。\n\n" +
    await encrypt(key, data);
  var url = repoUrl + "/issues/new?title=" + encodeURIComponent(title) + "&body=" + encodeURIComponent(body);
  if (win) { win.opener = null; win.location.href = url; }
  var link = el("a", null, "没自动打开的话点这里");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener";
  $("send-status").textContent = "已打开 GitHub 新建 issue 页面，在那里点 Create。";
  $("send-status").appendChild(link);
  $("form").reset();
  $("author").value = who;
  $("city").onchange();
};
