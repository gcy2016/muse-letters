// 待取件快递页面：上面 Muse 粘贴当天待取件的留言内容，加密后打开 GitHub 新建 issue；下面显示最新一条（开锁后解密）。
// ?me=miu / ?me=lulu 时署名用对应的名字；?view=list 只显示列表（房子里点快递盒时用）
import { unlock, encrypt } from "./lock.js";
import { loadParcels, cachedSnap, cityColor, repoUrl } from "./parcel-data.js";

var cfg = window.BOARD_CONFIG;
var MARK = "Muse留言"; // 正文第一行的署名，按 AI_TEAM.md 的留言署名规则
var TEMPLATE = "【重庆】\n取件码：\n取件地址：\n物品：\n";
var $ = function (id) { return document.getElementById(id); };
var params = new URLSearchParams(location.search);
if (params.get("view") === "list") document.body.classList.add("list-only");
var me = String(params.get("me") || "").toLowerCase();
var who = (cfg.members.filter(function (m) { return m.id === me; })[0] || cfg.members[0]).name;
$("content").value = TEMPLATE;

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
  if (snap.bad) { $("status").textContent = note || when + "：这条解不开（可能是改密码前留的），请重新留言一次。"; return; }
  $("status").textContent = note || (snap.parcels.length ? when + "：共 " + snap.parcels.length + " 件待取" : when + "：没有待取件。") +
    (snap.plain ? "（这条没加密，GitHub 上谁都看得到，下次请用上面的输入框留言）" : "");
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

var key = await unlock();
var loading = false;
async function load(force) {
  if (loading) return;
  loading = true;
  var cached = await cachedSnap(key);
  if (cached) render(cached, "正在更新……（先显示的是上次看到的）");
  else $("status").textContent = "加载中……";
  try {
    render(await loadParcels(key, { force: force }));
  } catch (e) {
    if (cached) render(cached, "更新失败（" + e.message + "），下面是上次看到的，可点“刷新”重试。");
    else $("status").textContent = "加载失败：" + e.message;
  }
  loading = false;
}
$("refresh").onclick = function () { load(true); };
load();

// 加密并留言：先同步开好空白窗口，免得加密完再开被浏览器当成弹窗拦掉
$("form").onsubmit = async function (ev) {
  ev.preventDefault();
  var text = $("content").value.trim();
  if (!text) return;
  var win = window.open("", "_blank");
  var d = new Date();
  var title = cfg.parcelPrefix + " " + d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " 待取件";
  var body = MARK + "\n署名：" + who + "\n\n这是待取件快递留言，内容已用大门锁密码加密，在快递页面开锁后才能看到。新的留言会替换掉这条，不用手动关。\n\n" +
    await encrypt(key, { text: text });
  var url = repoUrl + "/issues/new?title=" + encodeURIComponent(title) + "&body=" + encodeURIComponent(body);
  if (win) { win.opener = null; win.location.href = url; }
  var link = el("a", null, "没自动打开的话点这里");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener";
  $("send-status").textContent = "已打开 GitHub 新建 issue 页面，在那里点 Create，回来点“刷新”核对。";
  $("send-status").appendChild(link);
};
