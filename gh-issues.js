// 全站共用的“最近的帖子”：留言板、天气、日历、快递都从这里拿，不再各自去问 GitHub。
// 为什么：不登录时 GitHub 接口每个网络出口每小时只给 60 次，同一个 Wi-Fi 下的几台手机共用；
// 以前打开一次房子就要问 6～10 次（每样东西各问一遍，还会往后翻页），两个人刷几下就用完了，之后全是 403。
// 现在：
//   1. 一次只问一页（最近 100 条打开的 issue），存在本机（localStorage，同一个网站的所有页面、弹窗共用）；
//   2. FRESH 时间内再要，直接用存的，不再问（房子里点开留言板、快递，用的都是刚才那份）；
//   3. 次数用完（403）时记下 GitHub 说的恢复时间，在那之前都不再问，直接用存的；
//   4. 问不到时有存的就用存的（list.offline 写着原因），一次都没问到过才报错。
//   import { recentIssues, cachedIssues } from "./gh-issues.js";
//   var list = await recentIssues();             // [{ number, title, body, created_at, html_url, comments, user: { login }, pull_request }]，最新的在前
//   var list = await recentIssues({ force: true }); // “刷新”按钮：不管 FRESH，马上问一次（次数用完时仍然不问）
var cfg = window.BOARD_CONFIG;
var m = location.hostname.match(/^([^.]+)\.github\.io$/i);
var seg = location.pathname.split("/")[1];
var owner = m && seg ? m[1] : cfg.owner;
var repo = m && seg ? seg : cfg.repo;
var KEY = "muse-issues:" + owner + "/" + repo;
var FRESH = 3 * 60 * 1000;
var API = "https://api.github.com/repos/" + owner + "/" + repo + "/issues?state=open&sort=created&direction=desc&per_page=100";

function read() { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { return null; } }
function write(c) { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} }

export function slim(it) {
  return {
    number: it.number, title: it.title, body: it.body, created_at: it.created_at, html_url: it.html_url,
    comments: it.comments, user: { login: it.user.login }, pull_request: it.pull_request ? true : undefined,
  };
}

// 存的那份（没有就是 null）；c.left 是 GitHub 说的本小时剩余次数，c.blockedUntil 是次数用完后恢复的时间
export function cachedIssues() {
  var c = read();
  return c && c.list ? withInfo(c.list.slice(), c) : null;
}
function withInfo(list, c, offline) {
  list.left = c.left;
  list.at = c.at;
  if (offline) list.offline = offline;
  return list;
}

var pending = null;
export function recentIssues(opts) {
  opts = opts || {};
  var c = read();
  var now = Date.now();
  if (c && c.list && !opts.force && now - c.at < FRESH) return Promise.resolve(withInfo(c.list.slice(), c));
  if (c && c.blockedUntil && now < c.blockedUntil) {
    var msg = "GitHub 访问次数用完了，" + new Date(c.blockedUntil).toTimeString().slice(0, 5) + " 后恢复";
    if (c.list) return Promise.resolve(withInfo(c.list.slice(), c, msg));
    return Promise.reject(new Error(msg));
  }
  if (pending) return pending;
  var headers = { Accept: "application/vnd.github+json" };
  if (c && c.etag && c.list) headers["If-None-Match"] = c.etag;
  pending = fetch(API, { headers: headers, cache: "no-store" }).then(function (r) {
    var left = r.headers.get("X-RateLimit-Remaining");
    if (r.status === 304 && c && c.list) {
      write(Object.assign(c, { at: Date.now(), left: left, blockedUntil: 0 }));
      return withInfo(c.list.slice(), c);
    }
    if (r.status === 403 || r.status === 429) {
      var reset = +r.headers.get("X-RateLimit-Reset");
      var until = reset ? reset * 1000 : Date.now() + 10 * 60 * 1000;
      write(Object.assign(c || {}, { blockedUntil: until, at: c && c.at || 0 }));
      throw new Error("GitHub 访问次数用完了，" + new Date(until).toTimeString().slice(0, 5) + " 后恢复");
    }
    if (!r.ok) throw new Error("GitHub 返回 " + r.status);
    return r.json().then(function (raw) {
      var nc = { at: Date.now(), etag: r.headers.get("ETag"), left: left, list: raw.map(slim) };
      write(nc);
      return withInfo(nc.list.slice(), nc);
    });
  }).catch(function (e) {
    var c2 = read();
    if (c2 && c2.list) return withInfo(c2.list.slice(), c2, e.message || "网络不通");
    throw e;
  }).finally(function () { pending = null; });
  return pending;
}
