// 待取件快递的数据：Muse 每天发一条标题以 [快递] 开头的留言，列出当天全部待取件；
// 按发帖账号分来源（config.js 的 parcelSources：小miu、lulu 各管各的），每个来源只用它最新的一条，
// 新的一来旧的就不再显示，不用去关。房屋和快递页面共用。
// 内容在快递页面用大门锁密码加密后才发出（正文里 ENC1. 开头那行），开锁后用同一个密码解开。
// 解开后的文字格式（每件以【城市】开头，城市决定快递盒颜色；一件都没有就不写【】）：
//   Muse留言
//   署名：小miu
//
//   【重庆】
//   取件码：3-2-1024
//   取件地址：小区东门菜鸟驿站
//   到件时间：2026-10-29 09:30
//   物品：衣服
//
//   import { loadParcels, cityColor, arrivedAgo } from "./parcel-data.js";
//   var sets = await loadParcels(key); // [{ source, snap }]，按 parcelSources 的顺序，每个来源一项
//   // snap：{ who, created_at, url, number, parcels: [{ city, code, place, arrived, item, other }], plain, bad } 或 null（这个来源还没留过）
//   plain：这条没加密（直接在 GitHub 上手写的），照样显示；bad：解不开（多半是改密码前留的）
import { decrypt } from "./lock.js";
import { recentIssues } from "./gh-issues.js";

var cfg = window.BOARD_CONFIG;
// 在 <owner>.github.io/<repo>/ 上打开时按网址识别仓库（和留言板一样）
var m = location.hostname.match(/^([^.]+)\.github\.io$/i);
var seg = location.pathname.split("/")[1];
export var owner = m && seg ? m[1] : cfg.owner;
export var repo = m && seg ? seg : cfg.repo;
export var repoUrl = "https://github.com/" + owner + "/" + repo;

function memberName(login) {
  for (var i = 0; i < cfg.members.length; i++) {
    if (cfg.members[i].login.toLowerCase() === String(login).toLowerCase()) return cfg.members[i].name;
  }
  return null;
}

// 没在 config 里定颜色的城市：按名字从这几种里固定挑一个（同一个城市永远同一个颜色）
var SPARE = ["#3fa66b", "#e39b2d", "#8a62c9", "#d4578f", "#2fa6a6", "#7a8b3a"];
// 城市是不是列表里的某一个：写成“武汉市”“湖北武汉”“武汉·菜鸟驿站”这类也算；返回对上的那个，没对上返回 null
export function cityIn(city, list) {
  city = String(city || "").trim();
  if (list.indexOf(city) >= 0) return city;
  for (var i = 0; i < list.length; i++) if (city.indexOf(list[i]) >= 0) return list[i];
  return null;
}
export function cityColor(city) {
  city = String(city || "").trim();
  var k = cityIn(city, Object.keys(cfg.cityColors));
  if (k) return cfg.cityColors[k];
  var h = 0;
  for (var i = 0; i < city.length; i++) h = (h * 31 + city.charCodeAt(i)) >>> 0;
  return SPARE[h % SPARE.length];
}

// 按上面的格式拆出每一件；认不出的行放进 other，照样显示出来，免得漏信息
export function parseParcels(body) {
  var parcels = [], cur = null;
  String(body || "").replace(/\r\n/g, "\n").split("\n").forEach(function (raw) {
    var line = raw.trim(), mm;
    if (!line || line === "Muse留言" || /^署名[：:]/.test(line)) return;
    if ((mm = line.match(/^[【\[]\s*([^】\]]*?)\s*[】\]]\s*(.*)$/))) {
      parcels.push(cur = { city: mm[1], code: "", place: "", arrived: "", item: "", other: mm[2] });
    } else if (!cur) {
      return; // 第一个【城市】之前的话（比如“今天没有待取件”）不算快递
    } else if ((mm = line.match(/^取件码\s*[：:]\s*(.*)$/))) {
      cur.code = mm[1];
    } else if ((mm = line.match(/^(?:取件)?(?:地址|地点)\s*[：:]\s*(.*)$/))) {
      cur.place = mm[1];
    } else if ((mm = line.match(/^(?:到件|到站|到达|到店|到货|入库|入站)(?:时间)?\s*[：:]\s*(.*)$/))) {
      cur.arrived = mm[1];
    } else if ((mm = line.match(/^物品\s*[：:]\s*(.*)$/))) {
      cur.item = mm[1];
    } else {
      cur.other = cur.other ? cur.other + "\n" + line : line;
    }
  });
  return parcels;
}

// 到件时间 → “今天”“3天前”（按北京时间的日期算，不写具体日期）。
// 认“2026-10-29 09:30”“10-29”“2026/10/29”“10月29日”这些写法；没写年份的按最近一次的这一天算；认不出就原样返回
export function arrivedAgo(s) {
  s = String(s || "").trim();
  var m = s.match(/^(?:(\d{4})\s*[-/.年]\s*)?(\d{1,2})\s*[-/.月]\s*(\d{1,2})/);
  if (!m) return s;
  var today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  var t = Date.parse(today + "T00:00:00Z"), y = m[1] ? +m[1] : +today.slice(0, 4);
  var d = Date.UTC(y, +m[2] - 1, +m[3]);
  if (!m[1] && d > t) d = Date.UTC(y - 1, +m[2] - 1, +m[3]);
  var n = Math.round((t - d) / 86400000);
  if (isNaN(n)) return s;
  return n <= 0 ? "今天" : n + "天前";
}

function cacheKey(src) { return "muse-parcels-cache:" + owner + "/" + repo + ":" + src.id; }
export function sources() { return cfg.parcelSources || []; }

// 每个来源最新的一条 [快递]：从全站共用的最近帖子里找（gh-issues.js，不再单独问 GitHub）
async function fetchLatest(opts) {
  var list = await recentIssues(opts);
  return sources().map(function (src) {
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      if (!it.pull_request && it.title.indexOf(cfg.parcelPrefix) === 0 && String(it.user.login).toLowerCase() === src.login.toLowerCase()) {
        var found = { number: it.number, url: it.html_url, created_at: it.created_at, login: it.user.login, body: it.body };
        try { localStorage.setItem(cacheKey(src), JSON.stringify(found)); } catch (e) {}
        return found;
      }
    }
    return null;
  });
}

export async function toSnap(key, it) {
  if (!it) return null;
  var sig = String(it.body || "").match(/^\s*署名[：:]\s*(.+)$/m);
  var snap = { number: it.number, url: it.url, created_at: it.created_at, who: sig ? sig[1].trim() : memberName(it.login), parcels: [] };
  var line = String(it.body || "").split(/\r?\n/).filter(function (l) { return /^ENC1\./.test(l.trim()); })[0];
  if (!line) return Object.assign(snap, { plain: true, parcels: parseParcels(it.body) });
  var data = await decrypt(key, line);
  if (!data || typeof data.text !== "string") return Object.assign(snap, { bad: true });
  return Object.assign(snap, { parcels: parseParcels(data.text) });
}

// 上次看到的（本机存的），一个都没存过返回 null
export async function cachedSnap(key) {
  var any = false;
  var sets = await Promise.all(sources().map(async function (src) {
    var snap = null;
    try { snap = await toSnap(key, JSON.parse(localStorage.getItem(cacheKey(src)) || "null")); } catch (e) {}
    if (snap) any = true;
    return { source: src, snap: snap };
  }));
  return any ? sets : null;
}

// opts.force：“刷新”按钮用，马上问一次 GitHub
export async function loadParcels(key, opts) {
  var latest = await fetchLatest(opts);
  return Promise.all(sources().map(async function (src, i) { return { source: src, snap: await toSnap(key, latest[i]) }; }));
}
