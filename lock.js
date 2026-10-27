// 大门锁：输对密码才能进门（房屋、快递页面都用它）。
// 只是页面上的门：仓库是公开的，issue 里的内容别人直接去 GitHub 还是能看到。
//   import { unlock } from "./lock.js";
//   await unlock(); // 没解锁过就弹出密码框，解锁过（本机记住了）直接通过
// 改密码：node tools/make_lock.mjs 新密码，把输出的几行换进 config.js 的 lock。

var cfg = window.BOARD_CONFIG.lock;
var STORE = "muse-lock:" + cfg.salt;
var enc = new TextEncoder();

function b64(buf) { return btoa(String.fromCharCode.apply(null, new Uint8Array(buf))); }
function unb64(s) { return Uint8Array.from(atob(s), function (c) { return c.charCodeAt(0); }); }

// 密码 → PBKDF2 → SHA-256，和 config 里的 check 比对（config 里不存明文密码）
async function derive(password) {
  var base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits({ name: "PBKDF2", salt: enc.encode(cfg.salt), iterations: cfg.iterations, hash: "SHA-256" }, base, 256);
}
async function matches(bits) {
  return b64(await crypto.subtle.digest("SHA-256", bits)) === cfg.check;
}

var pending = null;
export function unlock() {
  return pending || (pending = (async function () {
    try {
      var saved = localStorage.getItem(STORE);
      if (saved && await matches(unb64(saved))) return;
    } catch (e) {}
    await askPassword();
  })());
}

function askPassword() {
  var style = document.createElement("style");
  style.textContent =
    "#lock{position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;background:#f4efe8;font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif}" +
    "#lock form{width:260px;max-width:calc(100% - 32px);padding:24px;border-radius:16px;background:#fff;box-shadow:0 6px 30px rgba(0,0,0,.12);text-align:center;color:#5a4636}" +
    "#lock h1{margin:0 0 4px;font-size:22px}#lock p{margin:0 0 16px;font-size:14px;color:#8a7d74}" +
    "#lock input{width:100%;box-sizing:border-box;padding:10px;font-size:20px;letter-spacing:6px;text-align:center;border:1px solid #eadfd6;border-radius:10px;background:#fdf6f0;color:#2b2420}" +
    "#lock button{margin-top:12px;width:100%;padding:10px;border:none;border-radius:10px;background:#e0607e;color:#fff;font-size:16px;cursor:pointer}" +
    "#lock .err{min-height:20px;margin:8px 0 0;color:#d9534f}";
  document.head.appendChild(style);
  var box = document.createElement("div");
  box.id = "lock";
  box.innerHTML = "<form><h1>🔒 大门锁</h1><p>输入密码开门</p>" +
    "<input id='lock-pw' type='password' inputmode='numeric' autocomplete='current-password' aria-label='密码' required>" +
    "<button id='lock-open' type='submit'>开门</button><p class='err' id='lock-err'></p></form>";
  document.body.appendChild(box);
  var input = box.querySelector("input"), err = box.querySelector(".err");
  input.focus();
  return new Promise(function (resolve) {
    box.querySelector("form").onsubmit = async function (ev) {
      ev.preventDefault();
      err.textContent = "";
      var bits = await derive(input.value.trim());
      if (!await matches(bits)) { err.textContent = "密码不对"; input.select(); return; }
      try { localStorage.setItem(STORE, b64(bits)); } catch (e) {}
      box.remove();
      style.remove();
      resolve(bits);
    };
  });
}
