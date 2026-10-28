// 日历：Muse 读主人手机日历，每天发一条标题以 [日历] 开头的留言，里面是“日程”和“提醒”两部分。
// 内容在日历页面（calendar.html）用大门锁密码加密后才发出，开锁后用同一个密码解开（同快递）。
// 来源按发帖账号分（config.js 的 calendarSources：小miu 发噜噜小兵的日历；以后 lulu 发噜噜大王的），每个来源只用最新一条。
// 解开后的文字格式（日期写 2026-11-03，时间可不写；事项照日历里写的原样抄）：
//   【日程】
//   2026-11-03 14:00 迎接噜噜大王的到来
//   2026-11-08 一起去看电影
//   【提醒】
//   2026-11-20 噜噜大王的生日
//
//   import { loadCalendars, cachedCalendars, upcoming } from "./calendar-data.js";
//   var cals = await loadCalendars(key); // [{ src, owner, who, has, created_at, url, number, events, reminders, bad, plain }]，按 calendarSources 的顺序
//   upcoming(cal) → { events: 今天及以后的日程（按时间排）, reminders: [{ text, date, days }]（今天及以后，按天数排） }
import { decrypt } from "./lock.js";
import { recentIssues } from "./gh-issues.js";

var cfg = window.BOARD_CONFIG;
var m = location.hostname.match(/^([^.]+)\.github\.io$/i);
var seg = location.pathname.split("/")[1];
export var owner = m && seg ? m[1] : cfg.owner;
export var repo = m && seg ? seg : cfg.repo;
export var repoUrl = "https://github.com/" + owner + "/" + repo;
var PREFIX = cfg.calendarPrefix || "[日历]";

export function sources() { return cfg.calendarSources || []; }

function pad(n) { return (n < 10 ? "0" : "") + n; }
function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

// 一行“日期 [时间] 事项” → { date: Date（当天 0 点）, time: "14:00" 或 "", text }；认不出日期返回 null
// 日期可写 2026-11-03、2026/11/3、2026年11月3日；不写年（11月3日、11-03）时按今年，已经过了就算明年
export function parseLine(line, now) {
  now = now || new Date();
  var s = line.trim(), y, mo, d, mm;
  if ((mm = s.match(/^(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?/))) { y = +mm[1]; mo = +mm[2]; d = +mm[3]; }
  else if ((mm = s.match(/^(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?/))) {
    mo = +mm[1]; d = +mm[2]; y = now.getFullYear();
    if (new Date(y, mo - 1, d) < startOfDay(now)) y += 1;
  } else return null;
  var date = new Date(y, mo - 1, d);
  if (date.getMonth() !== mo - 1) return null;
  s = s.slice(mm[0].length).replace(/^[\s,，、:：]+/, "");
  s = s.replace(/^[（(]?周[一二三四五六日天][）)]?\s*/, "").replace(/^[（(]?星期[一二三四五六日天][）)]?\s*/, "");
  var time = "";
  if ((mm = s.match(/^(\d{1,2})[:：](\d{2})(?:\s*[-~～至到]\s*(\d{1,2})[:：](\d{2}))?/))) {
    time = pad(+mm[1]) + ":" + mm[2] + (mm[3] ? "-" + pad(+mm[3]) + ":" + mm[4] : "");
    s = s.slice(mm[0].length).replace(/^[\s,，、:：]+/, "");
  } else if ((mm = s.match(/^全天\s*/))) {
    s = s.slice(mm[0].length);
  }
  return { date: date, time: time, text: s.trim() };
}

// 整段文字 → { events, reminders, other }；认不出日期的行放 other，照样显示
export function parseCalendar(text, now) {
  var cal = { events: [], reminders: [], other: [] }, part = null;
  String(text || "").replace(/\r\n/g, "\n").split("\n").forEach(function (raw) {
    var line = raw.trim().replace(/^[-*•·]\s*/, ""), mm;
    if (!line || /留言$/.test(line) || /^署名[：:]/.test(line)) return;
    if ((mm = line.match(/^[【\[]\s*([^】\]]*?)\s*[】\]]$/))) {
      part = /提醒|倒计时/.test(mm[1]) ? "reminders" : /日程|行程/.test(mm[1]) ? "events" : null;
      return;
    }
    var it = part ? parseLine(line, now) : null;
    if (it) cal[part].push(it);
    else cal.other.push(line);
  });
  return cal;
}

// 距离那天还有几天（今天 = 0）
export function daysUntil(date, now) {
  return Math.round((startOfDay(date) - startOfDay(now || new Date())) / 86400000);
}
// 倒计时的说法：“距离噜噜大王的生日还有 23 天”；事项本身写了“距离”就不重复
export function countdownText(r, now) {
  var n = daysUntil(r.date, now), what = r.text.replace(/^距离?\s*/, "").replace(/还有.*$/, "");
  return n === 0 ? "今天就是" + what : "距离" + what + "还有 " + n + " 天";
}

// 只留今天及以后的：日程按日期时间排，提醒按剩余天数排
export function upcoming(cal, now) {
  now = now || new Date();
  var today = startOfDay(now);
  return {
    events: (cal.events || []).filter(function (e) { return e.date >= today; })
      .sort(function (a, b) { return a.date - b.date || a.time.localeCompare(b.time); }),
    reminders: (cal.reminders || []).filter(function (r) { return r.date >= today; })
      .map(function (r) { return Object.assign({ days: daysUntil(r.date, now) }, r); })
      .sort(function (a, b) { return a.days - b.days; }),
  };
}

var WEEK = "日一二三四五六";
export function dayLabel(date, now) {
  var n = daysUntil(date, now);
  var s = (date.getMonth() + 1) + "月" + date.getDate() + "日 周" + WEEK[date.getDay()];
  return n === 0 ? "今天 " + s : n === 1 ? "明天 " + s : s;
}

// 一条 issue → 日历（解密）；没加密的（直接在 GitHub 手写的）也照样解析，标上 plain
async function toCal(key, src, it) {
  var cal = { src: src.id, owner: src.owner, who: src.who, has: !!it, events: [], reminders: [], other: [] };
  if (!it) return cal;
  Object.assign(cal, { number: it.number, url: it.url, created_at: it.created_at });
  var line = String(it.body || "").split(/\r?\n/).filter(function (l) { return /^ENC1\./.test(l.trim()); })[0];
  if (!line) return Object.assign(cal, parseCalendar(it.body), { plain: true });
  var data = await decrypt(key, line);
  if (!data || typeof data.text !== "string") return Object.assign(cal, { bad: true });
  return Object.assign(cal, parseCalendar(data.text));
}

var CACHE_KEY = "muse-calendar-cache:" + owner + "/" + repo;
export async function cachedCalendars(key) {
  try {
    var found = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    if (!found) return null;
    return Promise.all(sources().map(function (src, i) { return toCal(key, src, found[i]); }));
  } catch (e) { return null; }
}

// 每个来源最新的一条 [日历]：从全站共用的最近帖子里找（gh-issues.js，不再单独问 GitHub）。opts.force：“刷新”按钮用
export async function loadCalendars(key, opts) {
  var src = sources(), found = src.map(function () { return null; });
  (await recentIssues(opts)).forEach(function (it) {
    if (it.pull_request || it.title.indexOf(PREFIX) !== 0) return;
    var i = src.findIndex(function (s2) { return s2.login.toLowerCase() === String(it.user.login).toLowerCase(); });
    if (i >= 0 && !found[i]) found[i] = { number: it.number, url: it.html_url, created_at: it.created_at, body: it.body };
  });
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(found)); } catch (e) {}
  return Promise.all(src.map(function (s2, i) { return toCal(key, s2, found[i]); }));
}
