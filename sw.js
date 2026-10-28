// 本地缓存（Service Worker）：让手机记住下载过的东西，不用每次打开都等加载。
// GitHub Pages 只让浏览器记 10 分钟，过了就要把每个文件都去国外服务器问一遍“变了没有”，网慢时很卡；
// 微信这类内置浏览器还经常清缓存。所以这里自己存一份，本站所有文件（网页、代码、模型、图片、three.js）都一样：
//   有存的就直接用，同时在后台问一下服务器变没变（只问不下，变了才下新的）。
//   所以改完代码或模型后，第一次打开还是旧的，再打开一次就是新的。
// 只管本站的文件，GitHub 接口（留言、快递、天气）不经过这里，那些永远是最新的。
// 存的东西出问题时，把 CACHE 的版本号改一下（muse-v2…），旧的会整个清掉。
var CACHE = "muse-v1";

self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET" || req.headers.has("range")) return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(cacheFirst(e, req));
});

function cacheFirst(e, req) {
  return caches.open(CACHE).then(function (cache) {
    return cache.match(req, { ignoreSearch: true }).then(function (hit) {
      if (!hit) return fetchAndStore(cache, req);
      e.waitUntil(revalidate(cache, req, hit));
      return hit;
    });
  });
}

// 带上次的 ETag 去问：没变服务器只回 304，什么都不用下
function revalidate(cache, req, hit) {
  var etag = hit.headers.get("ETag");
  var headers = etag ? { "If-None-Match": etag } : {};
  return fetch(req.url, { headers: headers, cache: "no-store" }).then(function (res) {
    if (res.status === 200) return cache.put(req, res);
  }).catch(function () {});
}

function fetchAndStore(cache, req) {
  return fetch(req).then(function (res) {
    if (res.ok && res.type === "basic") cache.put(req, res.clone());
    return res;
  });
}
