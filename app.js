(function () {
  var cfg = window.BOARD_CONFIG;
  // 在 <owner>.github.io/<repo>/ 上打开时，按网址识别仓库（仓库改名后自动跟着变）
  var m = location.hostname.match(/^([^.]+)\.github\.io$/i);
  var seg = location.pathname.split("/")[1];
  if (m && seg) { cfg.owner = m[1]; cfg.repo = seg; }
  var MARK = "Muse留言"; // 正文第一行的署名，按 AI_TEAM.md 的留言署名规则
  var repoUrl = "https://github.com/" + cfg.owner + "/" + cfg.repo;
  var members = cfg.members.filter(function (m) { return m.login; });

  var $ = function (id) { return document.getElementById(id); };

  function memberOf(login) {
    for (var i = 0; i < members.length; i++) {
      if (members[i].login.toLowerCase() === String(login).toLowerCase()) return i;
    }
    return -1;
  }

  // 下拉框：选“我是谁”
  members.forEach(function (m) {
    var opt = document.createElement("option");
    opt.value = m.name;
    opt.textContent = m.name + "（GitHub：" + m.login + "）";
    $("author").appendChild(opt);
  });

  // 身份：网址里带 ?me=名字 时直接选好（给 Muse 用的专属链接），并记在本机，下次自动选
  var ME_KEY = "muse-board-me";
  var me = new URLSearchParams(location.search).get("me");
  try { me = me || localStorage.getItem(ME_KEY); } catch (e) {}
  members.forEach(function (m) {
    if (me && (m.id === String(me).toLowerCase() || m.name === me)) $("author").value = m.name;
  });
  $("author").onchange = function () { try { localStorage.setItem(ME_KEY, $("author").value); } catch (e) {} };
  if (me) try { localStorage.setItem(ME_KEY, $("author").value); } catch (e) {}

  // 去掉正文开头的“Muse留言”署名行和“署名：”行，只留内容
  function parseBody(body) {
    var lines = String(body || "").replace(/\r\n/g, "\n").split("\n");
    var name = "";
    if (lines[0] && lines[0].trim() === MARK) lines.shift();
    if (lines[0] && /^署名[：:]/.test(lines[0])) name = lines.shift().replace(/^署名[：:]\s*/, "").trim();
    while (lines.length && !lines[0].trim()) lines.shift();
    return { name: name, text: lines.join("\n").trim() };
  }

  function fmtTime(iso) {
    var d = new Date(iso);
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text; // 一律用 textContent，不把留言当 HTML 渲染
    return e;
  }

  // 只留渲染要用的字段，缓存小一点
  function slim(it) {
    return {
      number: it.number, title: it.title, body: it.body, created_at: it.created_at,
      html_url: it.html_url, comments: it.comments, user: { login: it.user.login },
      pull_request: it.pull_request ? true : undefined,
    };
  }

  function render(issues, note) {
    var list = $("list");
    list.innerHTML = "";
    var msgs = issues.filter(function (it) {
      return !it.pull_request &&
        it.title.indexOf(cfg.titlePrefix) === 0 &&
        memberOf(it.user.login) >= 0;
    });
    if (!msgs.length) {
      $("status").textContent = note || "还没有留言，来写第一条吧。";
      return;
    }
    $("status").textContent = note || "共 " + msgs.length + " 条留言（最新的在最上面）";
    msgs.forEach(function (it) {
      var idx = memberOf(it.user.login);
      var parsed = parseBody(it.body);
      var who = members[idx].name; // 按账号显示名字，改名后旧留言也跟着变

      var li = el("li", "msg m" + idx);
      var meta = el("div", "meta");
      meta.appendChild(el("span", "who", who));
      meta.appendChild(el("span", null, fmtTime(it.created_at)));
      meta.appendChild(el("span", null, "#" + it.number));
      li.appendChild(meta);
      li.appendChild(el("div", "body", parsed.text));

      var actions = el("div", "actions");
      var reply = el("button", null, "回复");
      reply.type = "button";
      reply.onclick = function () {
        var quote = parsed.text.split("\n").slice(0, 3).map(function (l) { return "> " + l; }).join("\n");
        $("content").value = "回复 #" + it.number + "（" + who + "）：\n" + quote + "\n\n";
        $("content").focus();
        $("compose").scrollIntoView({ behavior: "smooth" });
      };
      actions.appendChild(reply);
      var link = el("a", null, it.comments ? "在 GitHub 上看（" + it.comments + " 条评论）" : "在 GitHub 上看");
      link.href = it.html_url;
      link.target = "_blank";
      link.rel = "noopener";
      actions.appendChild(link);
      li.appendChild(actions);
      list.appendChild(li);
    });
  }

  // 加载策略（国内连 GitHub 接口常要几十秒，数据本身很小）：
  // 1. 先用本机缓存的上次列表立刻显示，再在后台拉新的；
  // 2. 不加防缓存参数，用 cache:"no-cache" 让浏览器带 ETag 去问，没变化时只回 304，不重复下载，也不占每小时 60 次额度；
  // 3. 每次只拉最近 PER_PAGE 条，更早的点“加载更早的留言”再拉。
  var PER_PAGE = 30;
  var CACHE_KEY = "muse-board-cache:" + cfg.owner + "/" + cfg.repo;
  var issues = [];
  var page = 0;
  var loading = false;
  var diag = "";

  function readCache() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); } catch (e) { return null; }
  }
  function writeCache(list) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), issues: list })); } catch (e) {}
  }

  // performance.now() 从打开页面那一刻算起
  function secs(ms) { return (ms / 1000).toFixed(1) + " 秒"; }

  function fetchPage(n) {
    var start = performance.now();
    var url = "https://api.github.com/repos/" + cfg.owner + "/" + cfg.repo +
      "/issues?state=open&sort=created&direction=desc&per_page=" + PER_PAGE + "&page=" + n;
    return fetch(url, { headers: { Accept: "application/vnd.github+json" }, cache: "no-cache" })
      .then(function (r) {
        // 诊断信息：接口用时、剩余访问次数，显示在列表下方，方便排查加载慢
        var left = r.headers.get("X-RateLimit-Remaining");
        diag = "诊断：页面打开到发出请求 " + secs(start) + "，接口用时 " + secs(performance.now() - start) +
          "，HTTP " + r.status + (left != null ? "，本小时剩余访问次数 " + left : "");
        $("diag").textContent = diag;
        if (!r.ok) throw new Error("GitHub 返回 " + r.status + (r.status === 403 ? "（可能是访问太频繁，过一会儿再刷新）" : ""));
        return r.json();
      })
      .then(function (list) { return list.map(slim); });
  }

  function setMore(show) {
    $("more").hidden = !show;
    $("more").disabled = false;
    $("more").textContent = "加载更早的留言";
  }

  function load() {
    if (loading) return;
    loading = true;
    var cached = readCache();
    var hasCache = cached && cached.issues && cached.issues.length;
    if (hasCache) render(cached.issues, "正在更新……（先显示的是上次看到的留言）");
    else $("status").textContent = "加载中……";
    var slow = setTimeout(function () {
      if (loading && !hasCache) $("status").textContent = "加载中……（连 GitHub 比较慢，请稍等）";
    }, 5000);

    fetchPage(1)
      .then(function (list) {
        issues = list;
        page = 1;
        writeCache(list);
        render(issues);
        setMore(list.length === PER_PAGE);
      })
      .catch(function (e) {
        if (hasCache) render(cached.issues, "更新失败（" + e.message + "），下面是上次看到的留言，可点“刷新”重试。");
        else $("status").textContent = "加载失败：" + e.message;
      })
      .then(function () { clearTimeout(slow); loading = false; });
  }

  function loadMore() {
    if (loading) return;
    loading = true;
    $("more").disabled = true;
    $("more").textContent = "加载中……";
    fetchPage(page + 1)
      .then(function (list) {
        var seen = {};
        issues.forEach(function (it) { seen[it.number] = true; });
        issues = issues.concat(list.filter(function (it) { return !seen[it.number]; }));
        page += 1;
        render(issues);
        setMore(list.length === PER_PAGE);
      })
      .catch(function (e) {
        setMore(true);
        $("more").textContent = "加载失败，点这里重试（" + e.message + "）";
      })
      .then(function () { loading = false; });
  }

  // 发送：打开 GitHub 新建 issue 页面，标题和正文都预先填好
  $("form").onsubmit = function (ev) {
    ev.preventDefault();
    var name = $("author").value;
    var text = $("content").value.trim();
    if (!text) return;
    var summary = text.replace(/\s+/g, " ").slice(0, 20);
    var title = cfg.titlePrefix + " " + name + "：" + summary;
    var body = MARK + "\n署名：" + name + "\n\n" + text;
    var url = repoUrl + "/issues/new?title=" + encodeURIComponent(title) + "&body=" + encodeURIComponent(body);
    window.open(url, "_blank", "noopener");
  };

  $("refresh").onclick = load;
  $("more").onclick = loadMore;
  load();
})();
