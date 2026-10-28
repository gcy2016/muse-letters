// 噜噜之家里的旅行相册（本仓库 album/，网址 https://gcy2016.github.io/muse-letters/album/）：
//   - 客厅电视：随机放一张相册里的照片，进屋换一张，之后每 10 分钟换一张；
//   - 客厅墙上的地图挂画：相册首页“地图”原样（点亮的省份），相册里点亮了新地方，这里跟着变（进屋读一次，之后每 10 分钟重读）。
// 只读，不改相册里的任何东西。照片和地图只在浏览器里显示，不经过本仓库。
// 用的是相册网页自己的代码（album/js/…）：解开访问凭据、读云端、算点亮、画地图。改相册代码时，下面用到的函数名、用法别改坏。
// 登录：相册页面在这台设备上勾过“记住此设备”，这里直接能用；没勾过，点电视或地图输一次相册密码，记住（只给这里用，不影响相册页面）。
//   import { startTravelAlbum } from "./travel-album.js";
//   var album = startTravelAlbum(house);
//   album.state        // "loading" | "locked"（要输密码）| "ok" | "empty"（相册里还没照片）| "error"
//   album.photo        // 电视上这张：{ url, date, place, caption }
//   album.map          // 地图：{ svg（大图用的 SVG 文字）, lit, total } 或 null（还没读到）
//   album.login(密码)  // 输密码；密码不对会 reject，错误信息可以直接显示
//   album.next()       // 电视马上换一张
//   album.retry()      // 出错后重来
import * as THREE from "three";
import { HOUSE as HOUSE_LAYOUT, placeInHouse } from "./layout.js";

var ALBUM = new URL("./album/", import.meta.url).href; // 旅行相册网页
var INTERVAL = 10 * 60 * 1000;
var KEY = "muse-tv"; // 存在相册的 IndexedDB 里，相册自己不用这个名字
var TV_W = 1024, TV_H = 576;   // 电视屏幕 16:9
var MAP_W = 1600, MAP_H = 1100; // 地图挂画
// 地图挂画的位置、大小在 layout.js（布置表）的 travelMap
var POSTER = HOUSE_LAYOUT.travelMap;

export function startTravelAlbum(house) {
  var album = { state: "loading", photo: null, map: null, error: "", albumUrl: ALBUM, mapUrl: ALBUM + "#/map",
    login: login, next: next, retry: function () { boot(); } };
  var tv = makeScreen(findScreen(house.root), TV_W, TV_H);
  var poster = makePoster(house);

  var mods = null, modsSync = null, store = null, data = null, names = {}, timer = null;
  function set(state, error) {
    album.state = state;
    album.error = error || "";
    if (state === "ok") return;
    var lines = state === "locked" ? ["旅行相册", "点我，输入相册密码"] : state === "empty" ? ["旅行相册里", "还没有照片"] :
      state === "error" ? ["没加载出来", album.error] : ["旅行相册", "加载中…"];
    drawText(tv, lines);
    if (!album.map) drawText(poster, state === "locked" ? ["旅行地图", "点我，输入相册密码"] : [lines[0] === "旅行相册" ? "旅行地图" : lines[0], lines[1]]);
  }

  // 相册网页的模块、区域数据和腾讯云 SDK
  function loadModules() {
    if (mods) return mods;
    mods = Promise.all([
      import(ALBUM + "js/config.js"), import(ALBUM + "js/crypto.js"), import(ALBUM + "js/store-cos.js"), import(ALBUM + "js/album.js"),
      import(ALBUM + "js/region-names.js"), import(ALBUM + "js/regions.js"), import(ALBUM + "js/views.js"),
      script("vendor/cos-js-sdk-v5.min.js", "COS"), script("data/region-map-anon.js", "REGION_MAP_ANON"),
      fetch(ALBUM + "css/app.css").then(function (r) { return r.ok ? r.text() : ""; }).catch(function () { return ""; }),
    ]).then(function (m) {
      return modsSync = { config: m[0].CONFIG, crypto: m[1], CosStore: m[2].CosStore, album: m[3], NAMES_KEY: m[4].NAMES_KEY,
        regions: m[5].buildRegions(globalVar("REGION_MAP_ANON")), views: m[6], mapCss: mapStyle(m[9]) };
    });
    mods.catch(function () { mods = null; });
    return mods;
  }
  function script(path, global) {
    return new Promise(function (resolve, reject) {
      if (globalVar(global)) return resolve();
      var s = document.createElement("script");
      s.src = ALBUM + path;
      s.onload = resolve; s.onerror = function () { reject(new Error("相册网页打不开")); };
      document.head.appendChild(s);
    });
  }

  // 先找记住的钥匙：这里自己记的，或者相册页面“记住此设备”记的
  function boot() {
    set("loading");
    loadModules().then(function (m) {
      var blob = m.config.encryptedCredentials;
      return m.crypto.blobFingerprint(blob).then(function (fp) {
        return Promise.all([idbGet(KEY), idbGet("auth")]).then(function (saved) {
          return saved.reduce(function (p, rec) {
            return p.then(function (secret) {
              if (secret || !rec || !rec.key || rec.fp !== fp) return secret;
              return m.crypto.decryptWithKey(blob, rec.key).catch(function () { return null; });
            });
          }, Promise.resolve(null));
        });
      }).then(function (secret) { return secret ? start(m, secret) : set("locked"); });
    }).catch(function (e) { set("error", e.message || "网络不通"); });
  }

  function login(password) {
    return loadModules().then(function (m) {
      var blob = m.config.encryptedCredentials;
      return m.crypto.decryptSecret(blob, password).then(function (r) {
        return m.crypto.blobFingerprint(blob).then(function (fp) {
          return idbSet(KEY, { fp: fp, key: r.key }).then(function () { return start(m, r.secret); });
        });
      });
    });
  }

  function start(m, secret) {
    store = new m.CosStore({ bucket: m.config.bucket, region: m.config.region, secretId: secret.secretId, secretKey: secret.secretKey });
    clearInterval(timer);
    timer = setInterval(refresh, INTERVAL);
    return refresh();
  }
  // 重读相册（照片列表、点亮状态），画地图，电视换一张
  function refresh() {
    return mods.then(function (m) {
      return Promise.all([store.getJSON("album.json"), store.getJSON(m.NAMES_KEY).catch(function () { return null; })]).then(function (r) {
        data = r[0] && r[0].data || { photos: {}, nodes: {} };
        names = (r[1] && r[1].data && r[1].data.names) || {};
        drawMap(m);
        return next();
      });
    }).catch(function (e) { set("error", e.message || "网络不通"); });
  }

  // ---------- 电视 ----------
  // 随机挑一张（尽量不和上一张一样）
  function next() {
    if (!store || !data) return Promise.resolve();
    var ids = Object.keys(data.photos || {});
    if (!ids.length) { set("empty"); return Promise.resolve(); }
    var id = ids[Math.floor(Math.random() * ids.length)];
    if (ids.length > 1 && album.photo && album.photo.id === id) id = ids[(ids.indexOf(id) + 1) % ids.length];
    var p = data.photos[id];
    return store.urlFor("photos/" + id + ".jpg").then(loadImage).then(function (img) {
      drawFit(tv, img, "#111");
      album.photo = { id: id, url: img.src, date: photoDate(p), place: placeOf(p), caption: p.caption || "" };
      set("ok");
    }).catch(function (e) { set("error", e.message || "照片没加载出来"); });
  }
  function photoDate(p) {
    var t = p.exif && p.exif.takenAt;
    if (t) return String(t).slice(0, 10).replace(/[:]/g, "-");
    return p.uploadedAt ? new Date(p.uploadedAt).toISOString().slice(0, 10) : "";
  }
  // 区域：A03-C01 这样的编号，一级和二级各有简称；读不到简称就不写
  function placeOf(p) {
    var r = null;
    try { r = p.box ? modsSync.album.regionOfNode(data, p.box) : null; } catch (e) { r = null; }
    if (!r) return "";
    var l1 = r.split("-")[0];
    return [names[l1], r !== l1 ? names[r] : null].filter(Boolean).join(" · ");
  }
  // ---------- 地图 ----------
  // 用相册的 mapView 画（和相册“地图”页一模一样），取出里面的 SVG，配上相册的样式，转成图片贴到挂画上
  function drawMap(m) {
    var app = {
      regions: m.regions, store: store,
      lit: m.album.computeLit(data, m.regions),
      litView: Object.assign({}, data, { regionLit: Object.assign({}, data.regionLit) }),
      litDate: function (id) { return m.album.litDateOf(this.litView, this.regions, id); },
      litAt: function (id) { var r = this.litView.regionLit[id]; return (r && r.at) || 0; },
      regionName: function (id) { return names[id] || id; },
      render: function () { grab(); },
    };
    m.views.resetViews && m.views.resetViews();
    function grab() {
      var page = m.views.mapView(app);
      var svg = page && page.querySelector && page.querySelector("svg.china-map");
      if (!svg) return; // 地图还在读，读完 mapView 会调 render() 再来
      var level1 = m.regions.level1;
      var lit = level1.filter(function (id) { return app.lit.has(id); }).length;
      var text = svgText(svg, m.mapCss);
      album.map = { svg: text, lit: lit, total: level1.length };
      svgImage(text).then(function (img) { drawPoster(poster, img, lit, level1.length); });
    }
    grab();
  }

  drawText(tv, ["旅行相册", "加载中…"]);
  drawText(poster, ["旅行地图", "加载中…"]);
  placeInHouse(house, poster.group, POSTER, "map");
  boot();
  return album;
}

// 页面里的全局变量（相册的区域数据用 const 声明，不在 window 上，只能按名字取）
function globalVar(name) {
  return new Function("return typeof " + name + " === 'undefined' ? undefined : " + name)();
}

// 电视屏幕：方案 B 客厅里电视那块屏幕（材质名带 television_screen）
function findScreen(root) {
  var found = null;
  root.traverse(function (o) {
    if (!found && o.isMesh && [].concat(o.material).some(function (m) { return m && /television_screen/.test(m.name); })) found = o;
  });
  return found;
}

// 一块画布 + 贴图，换到 mesh 上（电视屏幕、挂画）
function makeScreen(mesh, w, h, glb) {
  var canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  var texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  if (mesh) {
    texture.flipY = false; // 模型里的屏幕：和 glTF 的贴图坐标一致
    // 模型压缩（gltfpack）把贴图坐标缩小了，靠原贴图上的缩放补回来；换贴图时照搬，不然只显示一角
    var old = [].concat(mesh.material)[0].map;
    if (old) { texture.offset.copy(old.offset); texture.repeat.copy(old.repeat); texture.rotation = old.rotation; texture.center.copy(old.center); }
    mesh.material = new THREE.MeshStandardMaterial({ map: texture, emissive: 0xffffff, emissiveMap: texture, emissiveIntensity: 0.9, roughness: 0.35 });
  }
  return { canvas: canvas, ctx: canvas.getContext("2d"), texture: texture, w: w, h: h };
}

// 地图挂画：木框 + 画面，正面朝 +z（挂在哪、朝哪边见 layout.js 的 travelMap）
function makePoster() {
  var s = makeScreen(null, MAP_W, MAP_H);
  var g = new THREE.Group();
  g.name = "travel_map_poster";
  var ph = POSTER.width * MAP_H / MAP_W;
  var frame = new THREE.Mesh(new THREE.BoxGeometry(POSTER.width + 0.1, ph + 0.1, 0.04), new THREE.MeshStandardMaterial({ color: 0xe3ac6c, roughness: 0.8 }));
  frame.position.z = 0.02;
  var pic = new THREE.Mesh(new THREE.PlaneGeometry(POSTER.width, ph), new THREE.MeshStandardMaterial({ map: s.texture, roughness: 0.9 }));
  pic.position.z = 0.041; // 正面朝 +z，挂到墙上朝哪边由布置表的 facing 决定
  g.add(frame, pic);
  s.group = g;
  return s;
}

function drawText(s, lines) {
  var ctx = s.ctx, W = s.w, H = s.h;
  var g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#3d4a6b"); g.addColorStop(1, "#6b4a6b");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = "bold " + Math.round(H / 8) + "px 'PingFang SC','Microsoft YaHei',sans-serif";
  ctx.fillText(lines[0], W / 2, H / 2 - H / 11);
  ctx.font = Math.round(H / 14) + "px 'PingFang SC','Microsoft YaHei',sans-serif";
  ctx.fillText(lines[1] || "", W / 2, H / 2 + H / 11);
  s.texture.needsUpdate = true;
}

// 图片按比例放进画布，两边留底色
function drawFit(s, img, bg, top) {
  var ctx = s.ctx, W = s.w, H = s.h - (top || 0);
  ctx.fillStyle = bg; ctx.fillRect(0, top || 0, s.w, H);
  var k = Math.min(W / img.width, H / img.height);
  var w = img.width * k, h = img.height * k;
  ctx.drawImage(img, (W - w) / 2, (top || 0) + (H - h) / 2, w, h);
  s.texture.needsUpdate = true;
}

// 挂画：上面一行标题，下面是地图（底色和相册地图页一样）
function drawPoster(s, img, lit, total) {
  var ctx = s.ctx, top = 150;
  ctx.fillStyle = "#e6edf8"; ctx.fillRect(0, 0, s.w, top);
  ctx.fillStyle = "#1f2937"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.font = "bold 76px 'PingFang SC','Microsoft YaHei',sans-serif";
  ctx.fillText("我们的足迹", 60, top / 2 + 10);
  ctx.fillStyle = "#2f7cf6"; ctx.textAlign = "right";
  ctx.font = "48px 'PingFang SC','Microsoft YaHei',sans-serif";
  ctx.fillText("已点亮 " + lit + "/" + total, s.w - 60, top / 2 + 10);
  drawFit(s, img, "#e6edf8", top);
}

// 相册 css 里地图用到的规则和颜色变量，塞进 SVG 自己的 <style>（SVG 转成图片时读不到外面的样式）
function mapStyle(css) {
  var vars = (css.match(/:root\s*\{[^}]*\}/) || [""])[0].replace(":root", "svg");
  var rules = (css.match(/[^{}]*\.china-map[^{}]*\{[^}]*\}/g) || []).join("\n");
  return vars + "\n" + rules + "\n.china-map{background:#e6edf8}";
}
function svgText(svg, css) {
  var c = svg.cloneNode(true);
  var vb = (c.getAttribute("viewBox") || "0 0 100 100").split(/\s+/).map(Number);
  c.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  c.setAttribute("width", 1600);
  c.setAttribute("height", Math.round(1600 * vb[3] / vb[2]));
  var st = document.createElementNS("http://www.w3.org/2000/svg", "style");
  st.textContent = css;
  c.insertBefore(st, c.firstChild);
  return new XMLSerializer().serializeToString(c);
}
function svgImage(text) {
  return loadImage(URL.createObjectURL(new Blob([text], { type: "image/svg+xml" })), true);
}

function loadImage(url, local) {
  return new Promise(function (resolve, reject) {
    var img = new Image();
    if (!local) img.crossOrigin = "anonymous"; // 要画进 3D 贴图，必须走跨域许可（相册存储桶允许本网站）
    img.onload = function () { resolve(img); };
    img.onerror = function () { reject(new Error("照片没加载出来")); };
    img.src = url;
  });
}

// 相册网页用的 IndexedDB（同一个网站下共用）：库 travel-album-auth，表 kv
function idb(mode, fn) {
  return new Promise(function (resolve, reject) {
    var req = indexedDB.open("travel-album-auth", 1);
    req.onupgradeneeded = function () { req.result.createObjectStore("kv"); };
    req.onerror = function () { reject(req.error); };
    req.onsuccess = function () {
      var t = req.result.transaction("kv", mode);
      var r = fn(t.objectStore("kv"));
      t.oncomplete = function () { resolve(r && r.result); };
      t.onerror = function () { reject(t.error); };
    };
  });
}
function idbGet(k) { return idb("readonly", function (s) { return s.get(k); }).catch(function () { return null; }); }
function idbSet(k, v) { return idb("readwrite", function (s) { return s.put(v, k); }).catch(function () { return null; }); }
