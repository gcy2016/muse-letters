// 下载 GLB 模型并报准确的进度。
// 不用浏览器给的总大小：GitHub Pages 会压缩传输，浏览器报的总大小是压缩后的，已下载却按解压后算，进度会超过 100%。
// GLB 文件开头 12 个字节里写着整个文件的真实大小，边下边读，拿它当总数。
//   import { fetchGlb } from "./glb-fetch.js";
//   var buffer = await fetchGlb(url, function (loaded, total) { ... }); // total 读到文件头之前是 0
export async function fetchGlb(url, onProgress) {
  var r = await fetch(url);
  if (!r.ok) throw new Error("模型下载失败（" + r.status + "）：" + url);
  if (!r.body || !r.body.getReader) { // 不支持边下边读的浏览器：直接整个拿
    var all = await r.arrayBuffer();
    if (onProgress) onProgress(all.byteLength, all.byteLength);
    return all;
  }
  var reader = r.body.getReader(), chunks = [], loaded = 0, total = 0;
  for (;;) {
    var step = await reader.read();
    if (step.done) break;
    chunks.push(step.value);
    loaded += step.value.byteLength;
    if (!total && loaded >= 12) total = glbLength(chunks);
    if (onProgress) onProgress(loaded, total);
  }
  var out = new Uint8Array(loaded), at = 0;
  chunks.forEach(function (c) { out.set(c, at); at += c.byteLength; });
  if (onProgress) onProgress(loaded, loaded);
  return out.buffer;
}

// 文件头：4 字节 "glTF"、4 字节版本、4 字节总长度（小端）
function glbLength(chunks) {
  var head = new Uint8Array(12), at = 0;
  for (var i = 0; i < chunks.length && at < 12; i++) {
    var n = Math.min(12 - at, chunks[i].byteLength);
    head.set(chunks[i].subarray(0, n), at); at += n;
  }
  var v = new DataView(head.buffer);
  return v.getUint32(0, true) === 0x46546c67 ? v.getUint32(8, true) : 0;
}

// 几个文件一起下时合成一个总进度（0~1）：每个文件读到大小之前按 0 算
export function progressGroup(n, onProgress) {
  var loaded = new Array(n).fill(0), total = new Array(n).fill(0);
  return function (i) {
    return function (l, t) {
      loaded[i] = l; total[i] = t;
      var T = total.reduce(function (a, b) { return a + b; }, 0);
      var known = total.filter(Boolean).length;
      // 有的文件还没读到大小时，按已知的平均大小估一下，免得一开始就冲到很高
      if (known < n && known) T += (T / known) * (n - known);
      var L = loaded.reduce(function (a, b) { return a + b; }, 0);
      if (T) onProgress(Math.min(1, L / T));
    };
  };
}
