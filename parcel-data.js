// 待取件快递的数据：Muse 每天在仓库里发一条标题以 [快递] 开头的留言，列出当天全部待取件；
// 只用最新的一条，新的一来旧的就不再显示，不用去关。房屋和快递页面共用。
// 留言正文格式（每件以【城市】开头，城市决定快递盒颜色；一件都没有就不写【】）：
//   Muse留言
//   署名：小miu
//
//   【重庆】
//   取件码：3-2-1024
//   取件地址：小区东门菜鸟驿站
//   物品：衣服
//
//   import { loadParcels, cityColor } from "./parcel-data.js";
//   var snap = await loadParcels(); // { who, created_at, url, number, parcels: [{ city, code, place, item, other }] } 或 null（还没留过）

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
      parcels.push(cur = { city: mm[1], code: "", place: "", item: "", other: mm[2] });
    } else if (!cur) {
      return; // 第一个【城市】之前的话（比如“今天没有待取件”）不算快递
    } else if ((mm = line.match(/^取件码\s*[：:]\s*(.*)$/))) {
      cur.code = mm[1];
    } else if ((mm = line.match(/^(?:取件)?(?:地址|地点)\s*[：:]\s*(.*)$/))) {
      cur.place = mm[1];
    } else if ((mm = line.match(/^物品\s*[：:]\s*(.*)$/))) {
      cur.item = mm[1];
    } else {
      cur.other = cur.other ? cur.other + "\n" + line : line;
    }
  });
  return parcels;
}

var CACHE_KEY = "muse-parcels-cache:" + owner + "/" + repo;

// 找最新的一条 [快递]（issue 按创建时间从新到旧，一般第一页就有；最多翻 3 页）。ETag 和缓存的思路同留言板
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

export function toSnap(it) {
  if (!it) return null;
  var sig = String(it.body || "").match(/^\s*署名[：:]\s*(.+)$/m);
  return { number: it.number, url: it.url, created_at: it.created_at, who: sig ? sig[1].trim() : memberName(it.login), parcels: parseParcels(it.body) };
}

export function cachedSnap() {
  try { return toSnap(JSON.parse(localStorage.getItem(CACHE_KEY) || "null")); } catch (e) { return null; }
}

export async function loadParcels() {
  return toSnap(await fetchLatest());
}
