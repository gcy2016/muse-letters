// 带骨骼的角色（小miu、lulu 的精细模型，tools/rig_avatar.py 绑的骨）：会走、会跳、会眨眼。
// 动作都是代码实时摆骨头算出来的，不是预录的动画，所以步数、次数随便定。
//
//   import { loadPet } from "./pet.js";
//   var pet = await loadPet("miu", { height: 0.72, canStand: function (x, z) { return true; } });
//   scene.add(pet.root);               // pet.root.position / rotation.y 决定站在哪、朝哪
//   pet.update(dt);                    // 每帧调用（dt 秒）
//   pet.play("走2步 跳2下 眨眼2次");    // 按顺序做一串动作，返回 Promise；也可传 [["walk", 2], ["jump", 2]]
//   pet.stop();                        // 停下手上的动作
//   pet.setFree(true);                 // 自由活动：没事时自己隔一会儿随便做点什么
//
// 动作名（中文 / 英文都认）：走 walk、跑 run、跳 jump、眨眼 blink、眨左眼 winkL、眨右眼 winkR、摇尾巴 wag、
// 转头 look、点头 nod、转身 turn、伸懒腰 stretch、扑 pounce（前腿抬起扑一下）、躲 dodge（往后一跳又回来）、
// 凑近 boop（探头碰鼻子）、歇 rest（发会儿呆，数字是秒）
// 跟别的角色互动时用（只能用数组写）：["face", 1, { x, z }] 转向那个点；["approach", 1, { x, z, stop }] 小跑到离那个点 stop 米
// 两只一起玩（打闹、碰鼻子、追着玩、一起跳）见 pet-together.js
import * as THREE from "three";
import { GLTFLoader } from "./lib/GLTFLoader.js";
import { MeshoptDecoder } from "./lib/meshopt_decoder.module.js";
import { fetchGlb } from "./glb-fetch.js";

export var PET_URLS = {
  miu: new URL("./assets/miu-avatar/miu.glb", import.meta.url).href,
  lulu: new URL("./assets/lulu-avatar/lulu.glb", import.meta.url).href,
};
// 两只按同一个比例缩放（猫狗差不多大）：模型里小miu 高 0.93，缩到 opts.height
var MODEL_HEIGHT = 0.93;

// 每只的小差别：步子大小（模型单位）、尾巴怎么摇
var STYLE = {
  miu: { stride: 0.1, stepTime: 0.28, tailAxis: "y", tailAmp: 0.35 },
  lulu: { stride: 0.11, stepTime: 0.32, tailAxis: "z", tailAmp: 0.3 },
};

var NAMES = {
  "走": "walk", "跳": "jump", "眨眼": "blink", "眨左眼": "winkL", "眨右眼": "winkR", "摇尾巴": "wag", "摇尾": "wag",
  "转头": "look", "看看": "look", "点头": "nod", "转身": "turn", "伸懒腰": "stretch", "歇": "rest", "发呆": "rest",
  "跑": "run", "扑": "pounce", "躲": "dodge", "凑近": "boop", "碰鼻子": "boop",
};
var DEFAULT_COUNT = { walk: 2, run: 3, jump: 1, blink: 1, winkL: 1, winkR: 1, wag: 3, look: 1, nod: 2, turn: 1, stretch: 1, rest: 1.5, pounce: 1, dodge: 1, boop: 1 };

// "走2步 跳两下 眨眼" → [["walk",2],["jump",2],["blink",1]]
var CN_NUM = { "一": 1, "两": 2, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10, "半": 0.5 };
export function parseProgram(text) {
  if (Array.isArray(text)) return text;
  var steps = [];
  String(text).split(/[\s,，、;；。]+/).forEach(function (part) {
    if (!part) return;
    var m = part.match(/^([a-zA-Z]+|[^\d一两二三四五六七八九十半]+?)(\d+(?:\.\d+)?|[一两二三四五六七八九十半])?[步下次圈秒个遍]*$/);
    if (!m) return;
    var key = m[1].replace(/[步下次圈秒个遍]/g, "");
    var name = NAMES[key] || (DEFAULT_COUNT[key] !== undefined ? key : null);
    if (!name) return;
    var n = m[2] === undefined ? DEFAULT_COUNT[name] : CN_NUM[m[2]] || +m[2];
    steps.push([name, n]);
  });
  return steps;
}

// opts.onProgress(已下载字节, 总字节)：可选，显示下载进度用（按 GLB 文件头里的真实大小算）
export function loadPet(who, opts) {
  opts = opts || {};
  var loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  var url = opts.url || PET_URLS[who];
  var got = opts.onProgress
    ? fetchGlb(url, opts.onProgress).then(function (buf) { return loader.parseAsync(buf, url.replace(/[^/]*$/, "")); })
    : loader.loadAsync(url);
  return got.then(function (gltf) { return makePet(who, gltf.scene, opts); });
}

function makePet(who, model, opts) {
  var style = STYLE[who] || STYLE.miu;
  var root = new THREE.Group();
  root.name = who;
  var scale = (opts.height || 0.72) / MODEL_HEIGHT;
  model.scale.setScalar(scale);
  root.add(model);

  var bones = {}, mesh = null;
  model.traverse(function (o) {
    if (o.isBone) bones[o.name] = o;
    if (o.isSkinnedMesh) { mesh = o; o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; }
  });
  var rest = {};
  Object.keys(bones).forEach(function (k) { rest[k] = bones[k].position.clone(); });
  var morph = mesh.morphTargetDictionary || {};
  var tails = ["tail0", "tail1", "tail2", "tail3"].map(function (k) { return bones[k]; }).filter(Boolean);
  var LEGS = { FL: 1, FR: -1, HL: -1, HR: 1 }; // 对角两条腿一组：FL+HR 一起、FR+HL 一起

  var canStand = opts.canStand || function () { return true; };
  var queue = [], current = null, free = false, idleTimer = 2, blinkTimer = 2 + Math.random() * 3, time = 0;
  var resolveAll = null;

  // ---------- 每帧的姿势：先回到站姿，再叠呼吸、自动眨眼，最后叠当前动作 ----------
  var pose;
  function resetPose() {
    Object.keys(bones).forEach(function (k) { bones[k].rotation.set(0, 0, 0); bones[k].position.copy(rest[k]); });
    pose = { lift: 0, fwd: 0, blinkL: 0, blinkR: 0 }; // fwd：整个身子往前（负数往后）挪多少米，动作做完回原位
  }
  function legSwing(name, angle, bend) {
    // angle > 0 往前迈；bend 膝盖弯（往后折），脚掌跟着放平
    bones[name + "_upper"].rotation.x -= angle;
    bones[name + "_lower"].rotation.x += bend;
    bones[name + "_paw"].rotation.x += angle - bend;
  }
  function breathe(t) {
    var b = Math.sin(t * 2.2);
    bones.chest.rotation.x += b * 0.015;
    bones.head.rotation.x -= b * 0.01;
    tails.forEach(function (bn, i) { bn.rotation[style.tailAxis === "y" ? "y" : "z"] += Math.sin(t * 1.3 - i * 0.6) * 0.06; });
  }

  // ---------- 动作：每个动作是 { dur, apply(u 0~1, dt, 已用秒数) }，开始时可以先检查能不能做 ----------
  var ACTIONS = {
    walk: function (n, turned, speed) {
      var stepLen = style.stride * scale, dur = n * style.stepTime / (speed || 1);
      var dir = new THREE.Vector3();
      return {
        dur: dur,
        start: function () {
          // 走不了 n 步就少走几步；一步都走不了先转身（转过一次还不行就算了）
          dir.set(Math.sin(root.rotation.y), 0, Math.cos(root.rotation.y));
          var fit = n;
          while (fit > 0) {
            var end = root.position.clone().addScaledVector(dir, stepLen * fit);
            if (canStand(end.x, end.z)) break;
            fit--;
          }
          if (fit === n) return;
          if (fit > 0) return [["walk", fit, true, speed]];
          return turned ? [] : [["turn", 1], ["walk", n, true, speed]];
        },
        apply: function (u, dt) {
          var ph = u * n * Math.PI;                 // 每一步走半个周期
          var s = Math.sin(ph), c = Math.cos(ph);
          var fade = Math.min(1, u * n * 2, (1 - u) * n * 2);   // 起步、收步时腿摆小一点
          Object.keys(LEGS).forEach(function (k) {
            var a = LEGS[k] * s * 0.45 * fade;
            legSwing(k, a, Math.max(0, LEGS[k] * c) * 0.5 * fade);
          });
          pose.lift += Math.abs(s) * 0.012 * scale * fade;
          bones.hips.rotation.z += s * 0.04 * fade;
          bones.head.rotation.x += Math.abs(c) * 0.04 * fade;
          tails.forEach(function (bn, i) { bn.rotation.y += Math.sin(ph * 2 - i * 0.7) * 0.12; });
          dir.set(Math.sin(root.rotation.y), 0, Math.cos(root.rotation.y));
          var next = root.position.clone().addScaledVector(dir, stepLen * n * dt / dur);
          if (canStand(next.x, next.z)) root.position.copy(next);
        },
      };
    },
    run: function (n, turned) { return ACTIONS.walk(n, turned, 1.8); },
    // 转向某个点（target = { x, z }，房子坐标），原地踏几步转过去，走最近的那边
    face: function (n, target) {
      var from = 0, delta = 0, dur = 0.5;
      return {
        dur: dur,
        start: function () {
          from = root.rotation.y;
          var to = Math.atan2(target.x - root.position.x, target.z - root.position.z);
          delta = ((to - from) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
          dur = Math.max(0.25, Math.abs(delta) * 0.35);
          this.dur = dur;
        },
        apply: function (u) {
          root.rotation.y = from + delta * u * u * (3 - 2 * u);
          var ph = u * 3 * Math.PI;
          Object.keys(LEGS).forEach(function (k) { legSwing(k, LEGS[k] * Math.sin(ph) * 0.2, Math.max(0, LEGS[k] * Math.cos(ph)) * 0.3); });
        },
      };
    },
    // 小跑到离 target 点 stop 米的地方（先转过去再跑；被家具、墙挡住就跑到挡住为止）
    approach: function (n, target) {
      return {
        dur: 0,
        start: function () {
          var dist = Math.hypot(target.x - root.position.x, target.z - root.position.z) - (target.stop || 0.4);
          var steps = Math.floor(dist / (style.stride * scale));
          return steps > 0 ? [["face", 1, target], ["run", steps, true]] : [["face", 1, target]];
        },
        apply: function () {},
      };
    },
    // 扑：后腿蹲住、前腿抬起来往前扑一下再落回来（打闹用）
    pounce: function (n) {
      return {
        dur: 1.0 * n,
        apply: function (u) {
          var k = (u * n) % 1, up = 0, lunge = 0;
          if (k < 0.3) up = Math.sin(k / 0.3 * Math.PI / 2);
          else if (k < 0.7) { up = 1; lunge = Math.sin((k - 0.3) / 0.4 * Math.PI); }
          else up = Math.cos((k - 0.7) / 0.3 * Math.PI / 2);
          bones.chest.rotation.x -= 0.45 * up;
          bones.head.rotation.x += 0.3 * up;
          legSwing("FL", 0.9 * up + 0.35 * lunge * Math.sin(k * 40), 0.7 * up);
          legSwing("FR", 0.9 * up - 0.35 * lunge * Math.sin(k * 40), 0.7 * up);
          legSwing("HL", -0.25 * up, 0.45 * up); legSwing("HR", -0.25 * up, 0.45 * up);
          pose.lift += 0.05 * scale * up;
          pose.fwd += 0.1 * scale * lunge;
          tails.forEach(function (bn, i) { bn.rotation.x += 0.2 * up * (i + 1) / tails.length; });
        },
      };
    },
    // 躲：往后一跳，再跳回原地（打闹时被扑的那只）
    dodge: function (n) {
      return {
        dur: 0.8 * n,
        apply: function (u) {
          var k = (u * n) % 1, a = Math.sin(k * Math.PI);
          pose.fwd -= 0.14 * scale * a;
          pose.lift += 0.09 * scale * Math.abs(Math.sin(k * Math.PI * 2));
          Object.keys(LEGS).forEach(function (L) { legSwing(L, (L[0] === "F" ? -0.3 : 0.3) * a, 0.4 * a); });
          bones.head.rotation.y += 0.25 * a;
          if (k > 0.1 && k < 0.4) pose.blinkL = pose.blinkR = Math.sin((k - 0.1) / 0.3 * Math.PI) * 0.8;
        },
      };
    },
    // 凑近：探头往前，眯着眼碰一下鼻子
    boop: function (n) {
      return {
        dur: 1.8 * n,
        apply: function (u) {
          var k = (u * n) % 1, a = Math.sin(Math.min(1, k * 1.4) * Math.PI);
          pose.fwd += 0.06 * scale * a;
          bones.chest.rotation.x += 0.08 * a;
          bones.head.rotation.x += 0.12 * a;
          legSwing("FL", 0.15 * a, 0); legSwing("FR", 0.15 * a, 0);
          if (k > 0.3 && k < 0.65) pose.blinkL = pose.blinkR = Math.sin((k - 0.3) / 0.35 * Math.PI);
        },
      };
    },
    turn: function (n) {
      var from = 0, dur = 0.9 * Math.abs(n); // n 是转几个半圈，负数往另一边转
      return {
        dur: dur,
        start: function () { from = root.rotation.y; },
        apply: function (u) {
          var e = u * u * (3 - 2 * u);
          root.rotation.y = from + Math.PI * n * e;
          var ph = u * 4 * Math.PI;                // 原地踏步转过来
          Object.keys(LEGS).forEach(function (k) { legSwing(k, LEGS[k] * Math.sin(ph) * 0.25, Math.max(0, LEGS[k] * Math.cos(ph)) * 0.35); });
        },
      };
    },
    jump: function (n) {
      var one = 0.85, h = 0.32 * scale;
      return {
        dur: one * n,
        apply: function (u) {
          var k = (u * n) % 1;                      // 这一跳进行到哪
          if (k < 0.22) {                           // 蹲下蓄力
            var d = Math.sin(k / 0.22 * Math.PI / 2);
            pose.lift -= 0.05 * scale * d;
            Object.keys(LEGS).forEach(function (L) { legSwing(L, L[0] === "F" ? -0.25 * d : 0.3 * d, 0.6 * d); });
            bones.head.rotation.x += 0.12 * d;
            tails.forEach(function (bn) { bn.rotation.x -= 0.15 * d; });
          } else if (k < 0.82) {                    // 腾空：抛物线
            var a = (k - 0.22) / 0.6;
            pose.lift += 4 * h * a * (1 - a);
            var tuck = Math.sin(a * Math.PI);
            Object.keys(LEGS).forEach(function (L) { legSwing(L, L[0] === "F" ? 0.5 * tuck : -0.45 * tuck, 0.5 * tuck); });
            bones.head.rotation.x -= 0.1 * tuck;
            tails.forEach(function (bn, i) { bn.rotation.x += 0.25 * tuck * (i + 1) / tails.length; });
          } else {                                  // 落地缓一下
            var b = Math.sin((k - 0.82) / 0.18 * Math.PI);
            pose.lift -= 0.035 * scale * b;
            Object.keys(LEGS).forEach(function (L) { legSwing(L, 0, 0.45 * b); });
          }
        },
      };
    },
    blink: function (n, which) {
      var one = 0.42;
      return {
        dur: one * n,
        apply: function (u) {
          var k = (u * n) % 1;
          var c = k < 0.45 ? Math.sin(k / 0.45 * Math.PI) : 0;  // 闭上再睁开，后半段停一下
          if (which !== "R") pose.blinkL = Math.max(pose.blinkL, c);
          if (which !== "L") pose.blinkR = Math.max(pose.blinkR, c);
        },
      };
    },
    winkL: function (n) { var a = ACTIONS.blink(n, "L"); a.dur *= 1.4; return a; },
    winkR: function (n) { var a = ACTIONS.blink(n, "R"); a.dur *= 1.4; return a; },
    wag: function (n) {
      return {
        dur: 0.36 * n,
        apply: function (u) {
          var w = Math.sin(u * n * Math.PI * 2) * Math.min(1, u * n * 3, (1 - u) * n * 3);
          tails.forEach(function (bn, i) { bn.rotation[style.tailAxis] += w * style.tailAmp * (0.6 + i * 0.25); });
          bones.hips.rotation.y -= w * 0.05;
        },
      };
    },
    look: function (n) {
      return {
        dur: 2.2 * n,
        apply: function (u) {
          var k = (u * n) % 1;
          var a = k < 0.5 ? Math.sin(k * 2 * Math.PI) * 0.55 : -Math.sin((k - 0.5) * 2 * Math.PI) * 0.55; // 先看左再看右
          bones.head.rotation.y += a;
          bones.head.rotation.z -= a * 0.15;
          bones.chest.rotation.y += a * 0.15;
        },
      };
    },
    nod: function (n) {
      return { dur: 0.6 * n, apply: function (u) { bones.head.rotation.x += Math.max(0, Math.sin(u * n * Math.PI * 2)) * 0.3; } };
    },
    stretch: function () {
      return {
        dur: 2.4,
        apply: function (u) {
          var a = Math.sin(Math.min(1, u * 1.25) * Math.PI);   // 前腿往前伸、屁股撅起来
          legSwing("FL", 0.55 * a, 0); legSwing("FR", 0.55 * a, 0);
          bones.chest.rotation.x += 0.28 * a;
          bones.head.rotation.x -= 0.25 * a;
          pose.lift -= 0.02 * scale * a;
          tails.forEach(function (bn) { bn.rotation.x -= 0.15 * a; });
          if (u > 0.55 && u < 0.75) pose.blinkL = pose.blinkR = Math.sin((u - 0.55) / 0.2 * Math.PI); // 舒服得眯一下眼
        },
      };
    },
    rest: function (n) { return { dur: n, apply: function () {} }; },
  };

  function begin(step) {
    var name = step[0], n = step[1] === undefined ? DEFAULT_COUNT[name] : step[1];
    var make = ACTIONS[name];
    if (!make) return false;
    var a = make(n, step[2], step[3]);
    var replace = a.start && a.start();
    if (replace) { queue = replace.concat(queue); return false; }
    current = { name: name, a: a, t: 0 };
    return true;
  }

  function update(dt) {
    dt = Math.min(dt, 0.1);
    time += dt;
    resetPose();
    breathe(time);
    if (!current) {
      while (queue.length && !begin(queue.shift())) {}
      if (!current && resolveAll) { var r = resolveAll; resolveAll = null; r(); }
    }
    if (current) {
      current.t += dt;
      var u = Math.min(1, current.t / current.a.dur);
      current.a.apply(u, dt, current.t);
      if (u >= 1) current = null;
    } else if (free) {
      idleTimer -= dt;
      if (idleTimer <= 0) { queue.push(randomStep()); idleTimer = 2.5 + Math.random() * 4; }
    }
    // 自动眨眼（正在做眨眼动作时不叠）
    blinkTimer -= dt;
    if (blinkTimer < 0.16) { var c = Math.sin(Math.max(0, blinkTimer) / 0.16 * Math.PI); pose.blinkL = Math.max(pose.blinkL, c); pose.blinkR = Math.max(pose.blinkR, c); }
    if (blinkTimer <= 0) blinkTimer = 2.5 + Math.random() * 4;
    bones.root.position.y = rest.root.y + pose.lift / scale;
    model.position.z = pose.fwd; // 往前扑、往后躲：整个模型沿朝向挪一点，动作做完自己回到 0
    if (morph.blinkL !== undefined) mesh.morphTargetInfluences[morph.blinkL] = pose.blinkL;
    if (morph.blinkR !== undefined) mesh.morphTargetInfluences[morph.blinkR] = pose.blinkR;
  }

  function randomStep() {
    var pool = [["walk", 2 + Math.floor(Math.random() * 3)], ["walk", 3], ["jump", 1], ["wag", 4], ["look", 1], ["blink", 2], ["nod", 2], ["stretch", 1], ["turn", 0.5], ["rest", 2]];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function play(program) {
    queue = queue.concat(parseProgram(program));
    return new Promise(function (res) {
      var prev = resolveAll;
      resolveAll = function () { if (prev) prev(); res(); };
    });
  }
  // 停下：手上的、排着的都不做了，之前 play 返回的 Promise 也一起结束（等着它的人不会一直卡住）
  function stop() {
    queue = []; current = null;
    if (resolveAll) { var r = resolveAll; resolveAll = null; r(); }
  }

  return {
    who: who, root: root, bones: bones, mesh: mesh,
    update: update, play: play, stop: stop,
    setFree: function (on) { free = !!on; idleTimer = 1; },
    get busy() { return !!current || queue.length > 0; },
    get free() { return free; },
  };
}
