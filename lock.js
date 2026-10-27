// 大门锁：输对密码才能进门（房屋、快递页面都用它）。
// 仓库是公开的，issue 谁都能看，只在页面上挡一下挡不住别人直接去 GitHub 看，
// 所以快递信息用同一个密码加密后才存进 issue；页面上解锁后才解得开。
//   import { unlock, encrypt, decrypt } from "./lock.js";
//   var key = await unlock();          // 没解锁过就弹出密码框，解锁过（本机记住了）直接返回
//   var text = await encrypt(key, obj); // "ENC1.<iv>.<密文>"
//   var obj = await decrypt(key, text); // 解不开（密码改过、内容坏了）返回 null
// 改密码：node tools/make_lock.mjs 新密码，把输出的几行换进 config.js 的 lock。改密码后旧的快递留言解不开，Muse 重新留一条就好。

var cfg = window.BOARD_CONFIG.lock;
var STORE = "muse-lock:" + cfg.salt;
var enc = new TextEncoder(), dec = new TextDecoder();

function b64(buf) { return btoa(String.fromCharCode.apply(null, new Uint8Array(buf))); }
function unb64(s) { return Uint8Array.from(atob(s), function (c) { return c.charCodeAt(0); }); }

// 密码 → 256 位密钥（PBKDF2）；config 里存的 check 是这把密钥的 SHA-256，用来判断密码对不对
async function derive(password) {
  var base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits({ name: "PBKDF2", salt: enc.encode(cfg.salt), iterations: cfg.iterations, hash: "SHA-256" }, base, 256);
}
async function matches(bits) {
  return b64(await crypto.subtle.digest("SHA-256", bits)) === cfg.check;
}
function toKey(bits) {
  return crypto.subtle.importKey("raw", bits, "AES-GCM", false, ["encrypt", "decrypt"]);
}

var pending = null;
export function unlock() {
  return pending || (pending = (async function () {
    try {
      var saved = localStorage.getItem(STORE);
      if (saved && await matches(unb64(saved))) return toKey(unb64(saved));
    } catch (e) {}
    return toKey(await askPassword());
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

export async function encrypt(key, obj) {
  var iv = crypto.getRandomValues(new Uint8Array(12));
  var data = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, enc.encode(JSON.stringify(obj)));
  return "ENC1." + b64(iv) + "." + b64(data);
}

export async function decrypt(key, text) {
  var p = String(text).trim().split(".");
  if (p.length !== 3 || p[0] !== "ENC1") return null;
  try {
    var data = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(p[1]) }, key, unb64(p[2]));
    return JSON.parse(dec.decode(data));
  } catch (e) { return null; }
}
