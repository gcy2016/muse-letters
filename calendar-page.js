// 日历页面：上面 Muse 粘贴日程和提醒，加密后打开 GitHub 新建 issue；下面显示现在的日历（开锁后解密）。
// ?me=miu / ?me=lulu 时署名用对应的名字；?view=list 只显示日历（房子里点日历小屏时用）
import { unlock, encrypt } from "./lock.js";
import { loadCalendars, cachedCalendars, repoUrl } from "./calendar-data.js";
import { calendarDetail, CALENDAR_CSS } from "./calendar-detail.js";

var cfg = window.BOARD_CONFIG;
var MARK = "Muse留言"; // 正文第一行的署名，按 AI_TEAM.md 的留言署名规则
var EXAMPLE = "【日程】\n2026-11-03 14:00 迎接噜噜大王的到来\n\n【提醒】\n2026-11-20 噜噜大王的生日\n";
var $ = function (id) { return document.getElementById(id); };
var params = new URLSearchParams(location.search);
if (params.get("view") === "list") document.body.classList.add("list-only");
var me = String(params.get("me") || "").toLowerCase();
var member = cfg.members.filter(function (m) { return m.id === me; })[0] || cfg.members[0];
// 这个账号发的日历算谁的（config.js 的 calendarSources）
var source = (cfg.calendarSources || []).filter(function (s) { return s.login.toLowerCase() === member.login.toLowerCase(); })[0];
$("content").placeholder = "例如：\n" + EXAMPLE;
var style = document.createElement("style");
style.textContent = CALENDAR_CSS;
document.head.appendChild(style);

function pad(n) { return (n < 10 ? "0" : "") + n; }
function render(cals, note) {
  $("list").innerHTML = "";
  $("list").append(calendarDetail(cals));
  $("status").textContent = note || "";
}

var key = await unlock();
var loading = false;
async function load(force) {
  if (loading) return;
  loading = true;
  var cached = await cachedCalendars(key);
  if (cached) render(cached, "正在更新……（先显示的是上次看到的）");
  try {
    render(await loadCalendars(key, { force: force }));
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
  var title = (cfg.calendarPrefix || "[日历]") + " " + d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + (source ? source.owner + "的日历" : "日历");
  var body = MARK + "\n署名：" + member.name + "\n\n这是日历留言，内容已用大门锁密码加密，在日历页面开锁后才能看到。新的留言会替换掉这条，不用手动关。\n\n" +
    await encrypt(key, { text: text });
  var url = repoUrl + "/issues/new?title=" + encodeURIComponent(title) + "&body=" + encodeURIComponent(body);
  if (win) { win.opener = null; win.location.href = url; }
  var link = document.createElement("a");
  link.textContent = "没自动打开的话点这里";
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener";
  $("send-status").textContent = "已打开 GitHub 新建 issue 页面，在那里点 Create，回来点“刷新”核对。";
  $("send-status").appendChild(link);
};
