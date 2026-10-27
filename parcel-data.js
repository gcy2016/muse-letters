// 待取件快递的数据：从 GitHub 读标题以 [快递] 开头的打开的 issue，用大门锁的密钥解密。房屋和快递页面共用。
//   import { loadParcels, cityColor } from "./parcel-data.js";
//   var list = await loadParcels(key); // [{ number, url, created_at, who, city, company, code, place, item, note }]，最新的在前
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

// 拉打开的 issue（每页 100 条，最多 3 页），只留成员发的 [快递]。ETag 和缓存的思路同留言板
async function fetchIssues() {
  var out = [];
  for (var page = 1; page <= 3; page++) {
    var r = await fetch("https://api.github.com/repos/" + owner + "/" + repo + "/issues?state=open&per_page=100&page=" + page,
      { headers: { Accept: "application/vnd.github+json" }, cache: "no-cache" });
    if (!r.ok) throw new Error("GitHub 返回 " + r.status + (r.status === 403 ? "（可能是访问太频繁，过一会儿再刷新）" : ""));
    var list = await r.json();
    list.forEach(function (it) {
      if (!it.pull_request && it.title.indexOf(cfg.parcelPrefix) === 0 && memberName(it.user.login))
        out.push({ number: it.number, url: it.html_url, created_at: it.created_at, login: it.user.login, body: it.body });
    });
    if (list.length < 100) break;
  }
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(out)); } catch (e) {}
  return out;
}

export function cachedIssues() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); } catch (e) { return null; }
}

// 解密：正文里 ENC1. 开头的那一行；解不开的也留着（显示“解不开”），免得漏掉一件
export async function decryptIssues(key, issues) {
  return Promise.all(issues.map(async function (it) {
    var line = String(it.body || "").split(/\r?\n/).filter(function (l) { return /^ENC1\./.test(l.trim()); })[0];
    var data = line ? await decrypt(key, line) : null;
    var p = data || { city: "", bad: true };
    return Object.assign({}, p, { number: it.number, url: it.url, created_at: it.created_at, who: p.who || memberName(it.login) });
  }));
}

export async function loadParcels(key) {
  return decryptIssues(key, await fetchIssues());
}
