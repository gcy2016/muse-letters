// 待取件快递的数据：Muse 每天把当天全部待取件登记成一条（标题以 [快递] 开头的 issue，内容加密），
// 只用最新的一条，新的一来旧的就不再显示，取完件不用去关。房屋和快递页面共用。
//   import { loadParcels, cityColor } from "./parcel-data.js";
//   var snap = await loadParcels(key); // { date, who, created_at, url, parcels: [{ city, company, code, place, item, note }], bad } 或 null（还没登记过）
import { decrypt } from "./lock.js";

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

var CACHE_KEY = "muse-parcels-cache:" + owner + "/" + repo;

// 找最新的一条 [快递]（issue 默认按创建时间从新到旧，一般第一页就有；最多翻 3 页）。ETag 和缓存的思路同留言板
async function fetchLatest() {
  for (var page = 1; page <= 3; page++) {
    var r = await fetch("https://api.github.com/repos/" + owner + "/" + repo + "/issues?state=open&sort=created&direction=desc&per_page=100&page=" + page,
      { headers: { Accept: "application/vnd.github+json" }, cache: "no-cache" });
    if (!r.ok) throw new Error("GitHub 返回 " + r.status + (r.status === 403 ? "（可能是访问太频繁，过一会儿再刷新）" : ""));
    var list = await r.json();
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      if (!it.pull_request && it.title.indexOf(cfg.parcelPrefix) === 0 && memberName(it.user.login)) {
        var found = { number: it.number, url: it.html_url, created_at: it.created_at, login: it.user.login, body: it.body };
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(found)); } catch (e) {}
        return found;
      }
    }
    if (list.length < 100) break;
  }
  try { localStorage.removeItem(CACHE_KEY); } catch (e) {}
  return null;
}

export function cachedIssue() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); } catch (e) { return null; }
}

// 解密：正文里 ENC1. 开头的那一行；解不开（改过密码）时 bad 为真
export async function decryptIssue(key, it) {
  if (!it) return null;
  var line = String(it.body || "").split(/\r?\n/).filter(function (l) { return /^ENC1\./.test(l.trim()); })[0];
  var data = line ? await decrypt(key, line) : null;
  var snap = data && Array.isArray(data.parcels) ? data : { parcels: [], bad: true };
  return Object.assign({}, snap, { number: it.number, url: it.url, created_at: it.created_at, who: snap.who || memberName(it.login) });
}

export async function loadParcels(key) {
  return decryptIssue(key, await fetchLatest());
}
