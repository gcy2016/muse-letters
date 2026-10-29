// 明天的天气预报：Muse 晚上发一条标题以 [天气] 开头的 issue（格式见 issue #94）。
// 来源按发帖账号分（config.js 的 weatherSources：小miu 发重庆，lulu 发武汉），每个来源只用它最新的一条。
// 岛上的天空按选中来源“明天”的天气变（主页可切换）；屋里玄关的天气小屏显示所有来源。
//   import { getWeather, skyKind, skyPlace } from "./weather-data.js";
//   var w = await getWeather();   // { places: [{ src, city, name, who, tomorrow, after, air, tip, other, date, offset, stale, published, source, url }], sources }
//   网址加 ?wx=demo 用示例数据看效果，?wx=小雨（或任一天气用词）把示例里重庆明天的天气换成这种
import { recentIssues } from "./gh-issues.js";
var cfg = window.BOARD_CONFIG;
var m = location.hostname.match(/^([^.]+)\.github\.io$/i);
var seg = location.pathname.split("/")[1];
var owner = m && seg ? m[1] : cfg.owner;
var repo = m && seg ? seg : cfg.repo;
var PREFIX = cfg.weatherPrefix || "[天气]";

// 天气用词 → 网页里的天气种类（决定画什么效果、什么图标）
export var WORDS = {
  "晴": "sun", "多云": "cloudy", "阴": "overcast",
  "小雨": "rain1", "阵雨": "rain1", "中雨": "rain2", "大雨": "rain3", "暴雨": "rain4", "雷阵雨": "thunder",
  "小雪": "snow1", "中雪": "snow2", "大雪": "snow3", "雨夹雪": "sleet",
  "雾": "fog", "霾": "haze", "沙尘": "dust",
};
// 一天里有两种天气（“小雨转阴”）时，天空按更“显眼”的那种画
var PRIORITY = ["thunder", "rain4", "snow3", "rain3", "snow2", "sleet", "rain2", "snow1", "rain1", "dust", "haze", "fog", "overcast", "cloudy", "sun"];

export function skyKind(day) {
  if (!day || !day.kinds.length) return "sun";
  return day.kinds.slice().sort(function (a, b) { return PRIORITY.indexOf(a) - PRIORITY.indexOf(b); })[0];
}

// “小雨转阴 14~18°C 降水80% 东北风2级” → { text, kinds, lo, hi, rain, wind }
export function parseDay(s) {
  s = String(s || "").trim();
  var d = { raw: s, text: "", kinds: [], lo: null, hi: null, rain: null, wind: "" }, mm;
  var head = s.split(/\s+/)[0] || "";
  if (!/\d/.test(head)) d.text = head;
  d.text.split("转").forEach(function (w) {
    var k = WORDS[w.trim()];
    if (!k) { var best = Object.keys(WORDS).filter(function (x) { return w.indexOf(x) >= 0; }).sort(function (a, b) { return b.length - a.length; })[0]; k = best && WORDS[best]; }
    if (k) d.kinds.push(k);
  });
  if ((mm = s.match(/(-?\d+)\s*(?:°C?|℃)?\s*[~～]\s*(-?\d+)\s*(?:°C?|℃)?/))) { d.lo = +mm[1]; d.hi = +mm[2]; }
  if ((mm = s.match(/降水(?:概率)?\s*(\d+)\s*%/))) d.rain = +mm[1];
  if ((mm = s.match(/([东南西北]+风\s*\d+(?:-\d+)?\s*级|微风)/))) d.wind = mm[1].replace(/\s+/g, "");
  return d;
}

// 整条正文 → { date, published, source, places: [{ name, who, tomorrow, after, air, tip, other }], other }
export function parseWeather(body) {
  var w = { date: "", published: "", source: "", places: [], other: "" }, cur = null;
  String(body || "").replace(/\r\n/g, "\n").split("\n").forEach(function (raw) {
    var line = raw.trim(), mm;
    if (!line || /留言$/.test(line) || /^署名[：:]/.test(line) || /^```/.test(line)) return;
    if ((mm = line.match(/^预报日期\s*[：:]\s*(.*)$/))) w.date = mm[1];
    else if ((mm = line.match(/^(?:发布|更新)时间\s*[：:]\s*(.*)$/))) w.published = mm[1];
    else if ((mm = line.match(/^来源\s*[：:]\s*(.*)$/))) w.source = mm[1];
    else if ((mm = line.match(/^[【\[]\s*([^】\]]*?)\s*[】\]]\s*(.*)$/))) w.places.push(cur = { name: mm[1], who: mm[2], tomorrow: null, after: null, air: "", tip: "", other: "" });
    else if (!cur) w.other = w.other ? w.other + "\n" + line : line;
    else if ((mm = line.match(/^明天\s*[：:]\s*(.*)$/))) cur.tomorrow = parseDay(mm[1]);
    else if ((mm = line.match(/^后天\s*[：:]\s*(.*)$/))) cur.after = parseDay(mm[1]);
    else if ((mm = line.match(/^空气\s*[：:]\s*(.*)$/))) cur.air = mm[1];
    else if ((mm = line.match(/^提醒\s*[：:]\s*(.*)$/))) cur.tip = mm[1];
    else cur.other = cur.other ? cur.other + "\n" + line : line;
  });
  // 按北京时间算预报日期离今天几天（offset：1 明天、0 今天、负数是更早）；预报日期已经过去（早于北京时间今天）才算过期
  var okDate = !!w.date && /^\d{4}-\d{1,2}-\d{1,2}$/.test(w.date);
  w.offset = okDate ? dayDiff(normDate(w.date), beijingYmd(0)) : null;
  w.stale = w.offset !== null && w.offset < 0;
  return w;
}
function pad(n) { return (n < 10 ? "0" : "") + n; }
function normDate(s) { var p = s.split("-"); return p[0] + "-" + pad(+p[1]) + "-" + pad(+p[2]); }
// 北京时间的日期（YYYY-MM-DD），不看手机或电脑自己的时区；plusDays 往后推几天
export function beijingYmd(plusDays) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() + (plusDays || 0) * 86400000));
}
function dayDiff(a, b) { return Math.round((Date.parse(a + "T00:00:00Z") - Date.parse(b + "T00:00:00Z")) / 86400000); }

// 示例（?wx=demo），和 issue #94 里的格式一样，每个来源一条
var SAMPLE = {
  cq: ["预报日期：" + tomorrowYmd(), "发布时间：（示例数据）", "来源：示例", "【重庆】噜噜小兵",
    "明天：小雨转阴 14~18°C 降水80% 东北风2级", "后天：多云 13~19°C 降水20%", "空气：良", "提醒：出门带伞，早晚加件外套"].join("\n"),
  wh: ["预报日期：" + tomorrowYmd(), "发布时间：（示例数据）", "来源：示例", "【武汉】噜噜大王",
    "明天：晴 13~22°C 降水0% 北风3级", "后天：小雨 12~17°C 降水70%", "空气：轻度污染", "提醒：空气一般，少开窗"].join("\n"),
};
function tomorrowYmd() { return beijingYmd(1); }
export function sampleWeather(word) {
  var w = merge(sources().map(function (src) { return SAMPLE[src.id] ? { body: SAMPLE[src.id], url: "" } : null; }));
  w.sample = true;
  if (word && word !== "demo" && WORDS[word] && w.places[0]) {
    w.places[0].tomorrow = parseDay(word + " " + (word.indexOf("雪") >= 0 ? "-3~2°C 降水70%" : "12~18°C 降水60%") + " 北风3级");
  }
  return w;
}

export function sources() { return cfg.weatherSources || []; }

// 每个来源最新的一条 → 合在一起：places 按来源顺序排，每个地点带上它那条的预报日期、过期与否、链接
function merge(found) {
  var w = { places: [], sources: [] };
  sources().forEach(function (src, i) {
    var it = found[i], snap = it ? parseWeather(it.body) : null;
    w.sources.push({ id: src.id, city: src.city, who: src.who, has: !!(snap && snap.places.length), url: it ? it.url : "" });
    if (!snap) return;
    snap.places.forEach(function (p) {
      w.places.push(Object.assign(p, { src: src.id, city: src.city, date: snap.date, stale: snap.stale, offset: snap.offset, published: snap.published, source: snap.source, url: it.url, note: snap.other }));
    });
  });
  return w;
}
// 天空用哪个地点：选中来源的第一个地点；它还没数据就用第一个有数据的
export function skyPlace(w, srcId) {
  if (!w || !w.places.length) return null;
  return w.places.filter(function (p) { return p.src === srcId; })[0] || w.places[0];
}

var CACHE_KEY = "muse-weather-cache2:" + owner + "/" + repo;
// 先给缓存里的（打开就有东西看），再去 GitHub 拿最新的
export function cachedWeather() {
  try { var c = JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); return c ? merge(c) : null; } catch (e) { return null; }
}
// 每个来源最新的一条 [天气]：从全站共用的最近帖子里找（gh-issues.js，不再单独问 GitHub，也不往后翻页）
export async function loadWeather() {
  var src = sources(), found = src.map(function () { return null; });
  (await recentIssues()).forEach(function (it) {
    if (it.pull_request || it.title.indexOf(PREFIX) !== 0) return;
    var i = src.findIndex(function (s2) { return s2.login.toLowerCase() === String(it.user.login).toLowerCase(); });
    if (i >= 0 && !found[i]) found[i] = { number: it.number, url: it.html_url, created_at: it.created_at, body: it.body };
  });
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(found)); } catch (e) {}
  return merge(found);
}

// 页面统一用这个：?wx= 用示例，否则读 GitHub（失败时退回缓存）
export function getWeather() {
  var wx = new URLSearchParams(location.search).get("wx");
  if (wx) return Promise.resolve(sampleWeather(wx));
  return loadWeather().catch(function (e) {
    var c = cachedWeather();
    if (c) return Object.assign(c, { offline: true });
    throw e;
  });
}
