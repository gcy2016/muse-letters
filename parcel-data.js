// 待取件快递的数据：Muse 每天发一条标题以 [快递] 开头的留言，列出当天全部待取件；
// 只用最新的一条，新的一来旧的就不再显示，不用去关。房屋和快递页面共用。
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
//   import { loadParcels, cityColor } from "./parcel-data.js";
//   var snap = await loadParcels(key); // { who, created_at, url, number, parcels: [{ city, code, place, arrived, item, other }], plain, bad } 或 null（还没留过）
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
export function cityColor(city) {
  if (cfg.cityColors[city]) return cfg.cityColors[city];
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
    } else if ((mm = line.match(/^(?:到件|到达|到店|入库)时间\s*[：:]\s*(.*)$/))) {
      cur.arrived = mm[1];
    } else if ((mm = line.match(/^物品\s*[：:]\s*(.*)$/))) {
      cur.item = mm[1];
    } else {
      cur.other = cur.other ? cur.other + "\n" + line : line;
    }
  });
  return parcels;
}

var CACHE_KEY = "muse-parcels-cache:" + owner + "/" + repo;

// 最新的一条 [快递]：从全站共用的最近帖子里找（gh-issues.js，不再单独问 GitHub）
async function fetchLatest(opts) {
  var list = await recentIssues(opts);
  for (var i = 0; i < list.length; i++) {
    var it = list[i];
    if (!it.pull_request && it.title.indexOf(cfg.parcelPrefix) === 0 && memberName(it.user.login)) {
      var found = { number: it.number, url: it.html_url, created_at: it.created_at, login: it.user.login, body: it.body };
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(found)); } catch (e) {}
      return found;
    }
  }
  return null;
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

export async function cachedSnap(key) {
  try { return await toSnap(key, JSON.parse(localStorage.getItem(CACHE_KEY) || "null")); } catch (e) { return null; }
}

// opts.force：“刷新”按钮用，马上问一次 GitHub
export async function loadParcels(key, opts) {
  return toSnap(key, await fetchLatest(opts));
}
