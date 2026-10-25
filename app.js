(function () {
  var cfg = window.BOARD_CONFIG;
  // 在 <owner>.github.io/<repo>/ 上打开时，按网址识别仓库（仓库改名后自动跟着变）
  var m = location.hostname.match(/^([^.]+)\.github\.io$/i);
  var seg = location.pathname.split("/")[1];
  if (m && seg) { cfg.owner = m[1]; cfg.repo = seg; }
  var MARK = "Muse留言"; // 正文第一行的署名，按 AI_TEAM.md 的留言署名规则
  var repoUrl = "https://github.com/" + cfg.owner + "/" + cfg.repo;
  var apiBase = "https://api.github.com/repos/" + cfg.owner + "/" + cfg.repo;
  var TOKEN_KEY = "muse-board-token";

  var $ = function (id) { return document.getElementById(id); };

  function allowed(login) {
    return cfg.allowedLogins.some(function (l) { return l.toLowerCase() === String(login).toLowerCase(); });
  }

  // 下拉框：选“我是谁”
  cfg.authors.forEach(function (name) {
    var opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    $("author").appendChild(opt);
  });

  // 口令（GitHub 令牌）只存在本机浏览器里
  function getToken() { try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; } }
  function setToken(t) { try { localStorage.setItem(TOKEN_KEY, t); } catch (e) {} }
  $("token").value = getToken();

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

  function render(issues) {
    var list = $("list");
    list.innerHTML = "";
    var msgs = issues.filter(function (it) {
      return !it.pull_request &&
        it.title.indexOf(cfg.titlePrefix) === 0 &&
        allowed(it.user.login);
    });
    if (!msgs.length) {
      $("status").textContent = "还没有留言，来写第一条吧。";
      return;
    }
    $("status").textContent = "共 " + msgs.length + " 条留言（最新的在最上面）";
    msgs.forEach(function (it) {
      var parsed = parseBody(it.body);
      var who = parsed.name || it.user.login;
      var idx = cfg.authors.indexOf(who);

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

  function load() {
    $("status").textContent = "加载中……";
    var url = apiBase + "/issues?state=all&sort=created&direction=desc&per_page=100&_=" + Date.now();
    fetch(url, { headers: { Accept: "application/vnd.github+json" } })
      .then(function (r) {
        if (!r.ok) throw new Error("GitHub 返回 " + r.status + (r.status === 403 ? "（可能是访问太频繁，过一会儿再刷新）" : ""));
        return r.json();
      })
      .then(render)
      .catch(function (e) { $("status").textContent = "加载失败：" + e.message; });
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
    var token = $("token").value.trim();
    if (!token) { window.open(url, "_blank", "noopener"); return; }

    // 有口令：直接用 GitHub 接口建 issue，不用跳转
    setToken(token);
    $("send").disabled = true;
    $("send").textContent = "发送中……";
    fetch(apiBase + "/issues", {
      method: "POST",
      headers: { Accept: "application/vnd.github+json", Authorization: "Bearer " + token },
      body: JSON.stringify({ title: title, body: body }),
    })
      .then(function (r) {
        if (r.status === 401) throw new Error("口令不对或已过期");
        if (r.status === 403 || r.status === 404) throw new Error("口令没有往这个仓库发留言的权限");
        if (!r.ok) throw new Error("GitHub 返回 " + r.status);
        $("content").value = "";
        load();
      })
      .catch(function (e) { alert("发送失败：" + e.message); })
      .then(function () {
        $("send").disabled = false;
        $("send").textContent = "发送留言";
      });
  };

  $("refresh").onclick = load;
  load();
})();
