// 噜噜、噜妹（站着的小河马，两条腿走路）：岛上的两个小角色。模型是混元 3D 生成的，绑骨见 tools/rig_hippo.py。
// 和 pet.js（小miu、lulu，四条腿）一样，动作都是代码实时摆骨头算出来的，不是预录的动画。
//
//   import { loadHippo } from "./hippo.js";
//   var h = await loadHippo("lulu", { scale: 0.8, roam: { center: [x, z], radius: r }, avoid: function (x, z) { return false; } });
//   scene.add(h.root);                 // h.root.position / rotation.y 决定站在哪、朝哪（脸朝 +z 时 rotation.y = 0）
//   h.update(dt);                      // 每帧调用（dt 秒）
//   h.play("挥手 跳2下 眨眼");          // 按顺序做一串动作，返回 Promise；也可传 [["wave", 1], ["jump", 2]]
//   opts.still = true：静静站着只眨眼（不喘气、不晃）
//   h.stop();  h.setFree(true);        // 停下；自由活动（没事时自己在 roam 范围里走走、做点小动作）
//
// 动作名（中文 / 英文都认）：走 walk（数字是步数）、跳 jump、挥手 wave、点头 nod、转头 look、转身 turn（数字是圈数，负数往右转）、
// 跳舞 dance、转圈 spin、摇尾巴 wag、眨眼 blink、歇 rest（秒）
// 只能用数组写的：["goto", 1, { x, z }] 走到那个点（岛上坐标）；["face", 1, { x, z }] 转向那个点
import * as THREE from "three";
import { GLTFLoader } from "./lib/GLTFLoader.js";
import { MeshoptDecoder } from "./lib/meshopt_decoder.module.js";

export var HIPPO_URLS = {
  lulu: new URL("./assets/hippo/lulu.glb", import.meta.url).href,
  lumei: new URL("./assets/hippo/lumei.glb", import.meta.url).href,
};
// 每只的小差别：步子大小（米，按模型原大小）、走一步几秒
// wave：挥手时大臂往外抬多少、往前伸多少、小臂再往上弯多少（弧度）。噜噜（2026-11 的新模型）头大，手举太高会钻到脑袋后面
var STYLE = {
  lulu: { stride: 0.16, stepTime: 0.36, wave: { up: 1.35, fwd: 0.75, bend: 0.75 } },
  lumei: { stride: 0.14, stepTime: 0.32 },
};
var NAMES = {
  "走": "walk", "跳": "jump", "挥手": "wave", "招手": "wave", "点头": "nod", "转头": "look", "看看": "look", "转身": "turn",
  "跳舞": "dance", "转圈": "spin", "摇尾巴": "wag", "眨眼": "blink", "歇": "rest", "发呆": "rest",
};
var DEFAULT_COUNT = { walk: 4, jump: 1, wave: 1, nod: 2, look: 1, turn: 0.5, dance: 1, spin: 1, wag: 3, blink: 1, rest: 1.5 };
var CN_NUM = { "一": 1, "两": 2, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10, "半": 0.5 };
export function parseProgram(text) {
  if (Array.isArray(text)) return text;
  var steps = [];
  String(text).split(/[\s,，、;；。]+/).forEach(function (part) {
    if (!part) return;
    var m = part.match(/^([a-zA-Z]+|[^\d一两二三四五六七八九十半-]+?)(-?\d+(?:\.\d+)?|[一两二三四五六七八九十半])?[步下次圈秒个遍]*$/);
    if (!m) return;
    var key = m[1].replace(/[步下次圈秒个遍]/g, "");
    var name = NAMES[key] || (DEFAULT_COUNT[key] !== undefined ? key : null);
    if (!name) return;
    steps.push([name, m[2] === undefined ? DEFAULT_COUNT[name] : CN_NUM[m[2]] || +m[2]]);
  });
  return steps;
}

export function loadHippo(who, opts) {
  opts = opts || {};
  var loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  return loader.loadAsync(opts.url || HIPPO_URLS[who]).then(function (gltf) { return makeHippo(who, gltf.scene, opts); });
}

// 世界方向的轴（模型自己的坐标：x = 角色的左边，y = 上，z = 脸朝的前方）
var X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
function smooth(u) { u = Math.min(1, Math.max(0, u)); return u * u * (3 - 2 * u); }
function bump(u, a, b) { return u <= a || u >= b ? 0 : Math.sin((u - a) / (b - a) * Math.PI); } // a~b 之间起落一次
function wrapAngle(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }

function makeHippo(who, model, opts) {
  var style = STYLE[who] || STYLE.lulu;
  var scale = opts.scale || 0.8;
  var root = new THREE.Group();
  root.name = "hippo-" + who;
  model.scale.setScalar(scale);
  root.add(model);

  var bones = {}, mesh = null;
  model.traverse(function (o) {
    if (o.isBone) bones[o.name] = o;
    if (o.isSkinnedMesh || (o.isMesh && !mesh)) { mesh = o; o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; }
  });
  // Blender 里的骨头各有各的朝向。转动统一按“模型的世界方向轴”算：记下每根骨头静止时的朝向，换算到它自己的坐标里
  model.updateMatrixWorld(true);
  var rest = {}, restWorld = {}, add = {}, tmp = new THREE.Quaternion(), inv = new THREE.Quaternion();
  Object.keys(bones).forEach(function (k) {
    rest[k] = bones[k].quaternion.clone();
    restWorld[k] = bones[k].getWorldQuaternion(new THREE.Quaternion());
    add[k] = new THREE.Quaternion();
  });
  // rot("armR_upper", Z, -1)：这根骨头绕模型的 z 轴转 -1 弧度（叠在之前的转动上）；子骨头跟着转
  function rot(name, axis, angle) {
    if (!bones[name] || !angle) return;
    add[name].premultiply(tmp.setFromAxisAngle(axis, angle));
  }
  function applyBones() {
    Object.keys(bones).forEach(function (k) {
      inv.copy(restWorld[k]).invert();
      bones[k].quaternion.copy(rest[k]).multiply(inv.multiply(add[k]).multiply(restWorld[k]));
    });
  }
  var morph = mesh.morphTargetDictionary || {};

  var queue = [], current = null, free = false, idleTimer = 1.5 + Math.random() * 2, blinkTimer = 1 + Math.random() * 3, time = 0;
  var resolveAll = null;
  var pose;
  function resetPose() {
    Object.keys(add).forEach(function (k) { add[k].identity(); });
    pose = { lift: 0, blinkL: 0, blinkR: 0 };
  }
  // 腿：swing > 0 往前迈；bend 膝盖弯（小腿往后折）；脚掌跟着放平
  function leg(side, swing, bend) {
    rot("leg" + side + "_upper", X, -swing);
    rot("leg" + side + "_lower", X, bend);
    rot("leg" + side + "_foot", X, swing - bend);
  }
  // 胳膊：fwd > 0 往前摆；out > 0 往外侧抬（两边对称）
  function arm(side, fwd, out) {
    rot("arm" + side + "_upper", X, -fwd);
    rot("arm" + side + "_upper", Z, side === "L" ? out : -out);
  }
  function breathe(t) {
    var b = Math.sin(t * 2.2);
    rot("chest", X, b * 0.012);
    rot("head", X, -b * 0.01);
    arm("L", 0, 0.03 + b * 0.015); arm("R", 0, 0.03 + b * 0.015);
    rot("tail0", Y, Math.sin(t * 1.4) * 0.15);
  }
  function inRoam(x, z, margin) {
    if (!opts.roam) return true;
    var c = opts.roam.center;
    return Math.hypot(x - c[0], z - c[1]) <= opts.roam.radius - (margin || 0);
  }
  function blocked(x, z) { return !inRoam(x, z) || (opts.avoid && opts.avoid(x, z)); }
  function heading() { return root.rotation.y; }

  // 走路的一步：phase 0~1 是一步（左右脚轮流）
  function stepPose(ph, k) {
    var s = Math.sin(ph * Math.PI);
    var a = 0.42 * k;
    leg("L", s * a, Math.max(0, -s) * 0.5 * k);
    leg("R", -s * a, Math.max(0, s) * 0.5 * k);
    arm("L", -s * 0.45 * k, 0.08 * k); arm("R", s * 0.45 * k, 0.08 * k);
    rot("hips", Y, s * 0.08 * k);
    rot("chest", Y, -s * 0.1 * k);
    rot("hips", Z, s * 0.05 * k);          // 小河马走路左右晃
    rot("head", Z, -s * 0.04 * k);
    pose.lift += Math.abs(Math.cos(ph * Math.PI)) * 0.012 * scale * k;
  }

  // ---------- 动作：{ dur, start?(), apply(u 0~1, dt, 已用秒数) }；start 返回数组时改做那一串 ----------
  var ACTIONS = {
    walk: function (n) {
      var stepLen = style.stride * scale, dur = n * style.stepTime, dir = new THREE.Vector3(), from = new THREE.Vector3();
      return {
        dur: dur,
        start: function () {
          var h = heading(), d = n * stepLen;
          var ex = root.position.x + Math.sin(h) * d, ez = root.position.z + Math.cos(h) * d;
          if (blocked(ex, ez)) return [["goto", 1, randomSpot()]]; // 前面走不过去：换个能去的地方走
          dir.set(Math.sin(h), 0, Math.cos(h)); from.copy(root.position);
        },
        apply: function (u, dt, t) {
          var k = Math.min(1, t / 0.15, (dur - t) / 0.15);
          stepPose(t / style.stepTime, Math.max(0, k));
          root.position.copy(from).addScaledVector(dir, n * stepLen * u);
        },
      };
    },
    // 走到 { x, z }：先转过去，再走过去（步数按距离算）
    goto: function (n, p) {
      return {
        dur: 0.01,
        start: function () {
          if (!p) return [];
          var dx = p.x - root.position.x, dz = p.z - root.position.z, d = Math.hypot(dx, dz);
          var steps = Math.round(d / (style.stride * scale));
          if (steps < 1) return [];
          return [["face", 1, p], ["walk", steps]];
        },
        apply: function () {},
      };
    },
    face: function (n, p) {
      var from = 0, delta = 0;
      var a = {
        dur: 0.5,
        start: function () {
          if (!p) return [];
          from = heading();
          delta = wrapAngle(Math.atan2(p.x - root.position.x, p.z - root.position.z) - from);
          a.dur = Math.max(0.15, Math.abs(delta) / 3.5);
        },
        apply: function (u, dt, t) {
          root.rotation.y = from + delta * smooth(u);
          stepPose(t / style.stepTime, 0.5 * Math.min(1, Math.abs(delta) * 2)); // 原地小碎步
        },
      };
      return a;
    },
    turn: function (n) {
      var from = 0, delta = (n || 0.5) * Math.PI * 2;
      return {
        dur: Math.max(0.4, Math.abs(delta) / 3.5),
        start: function () { from = heading(); },
        apply: function (u, dt, t) { root.rotation.y = from + delta * smooth(u); stepPose(t / style.stepTime, 0.5); },
      };
    },
    jump: function (n) {
      var one = 0.9;
      return {
        dur: n * one,
        apply: function (u, dt, t) {
          var v = (t % one) / one;
          var crouch = bump(v, 0, 0.3) + bump(v, 0.72, 1) * 0.8;
          var air = bump(v, 0.25, 0.78);
          leg("L", 0.35 * crouch, 0.7 * crouch); leg("R", 0.35 * crouch, 0.7 * crouch);
          rot("hips", X, 0.15 * crouch);
          pose.lift += air * 0.22 * scale - crouch * 0.03 * scale;
          arm("L", 0.15 * air, 0.85 * air); arm("R", 0.15 * air, 0.85 * air); // 跳起来两只手张开
          rot("head", X, -0.15 * air);
          rot("tail0", X, -0.5 * air);
        },
      };
    },
    // 挥手：右手举起来，小臂左右摇
    wave: function (n) {
      var dur = 1.2 + n * 1.0;
      return {
        dur: dur,
        apply: function (u, dt, t) {
          var e = Math.min(1, t / 0.35, (dur - t) / 0.35);
          e = smooth(e);
          var w = style.wave || { up: 2.3, fwd: 0.25, bend: 0.2 };
          rot("armR_upper", Z, -w.up * e);
          rot("armR_upper", X, -w.fwd * e);
          rot("armR_lower", Z, Math.sin(t * 11) * 0.45 * e - w.bend * e);
          rot("head", Z, -0.12 * e);
          rot("chest", Z, 0.05 * e);
          if (t > 0.3 && t < 0.55) pose.blinkL = pose.blinkR = Math.sin((t - 0.3) / 0.25 * Math.PI) * 0.8; // 笑眯眯
        },
      };
    },
    nod: function (n) {
      return { dur: 0.55 * n, apply: function (u) { rot("head", X, Math.max(0, Math.sin(u * n * Math.PI * 2)) * 0.32); } };
    },
    look: function (n) {
      return {
        dur: 2.4 * n,
        apply: function (u) {
          var v = (u * n) % 1;
          var a = v < 0.5 ? bump(v, 0, 0.5) : -bump(v, 0.5, 1);
          rot("head", Y, a * 0.65);
          rot("head", Z, -a * 0.08);
          rot("chest", Y, a * 0.15);
        },
      };
    },
    // 跳舞：左右扭、两手轮流举、小蹦
    dance: function (n) {
      var dur = 3.2 * n;
      return {
        dur: dur,
        apply: function (u, dt, t) {
          var e = Math.min(1, t / 0.3, (dur - t) / 0.3);
          var s = Math.sin(t * Math.PI * 2 / 0.8);
          rot("hips", Z, s * 0.12 * e);
          rot("chest", Z, -s * 0.1 * e);
          rot("head", Z, s * 0.12 * e);
          arm("L", 0.15 * e, (0.6 + s * 0.4) * e);
          arm("R", 0.15 * e, (0.6 - s * 0.4) * e);
          leg("L", 0, Math.max(0, s) * 0.4 * e);
          leg("R", 0, Math.max(0, -s) * 0.4 * e);
          rot("tail0", Y, s * 0.6 * e);
          pose.lift += Math.abs(Math.cos(t * Math.PI * 2 / 0.8)) * 0.03 * scale * e;
        },
      };
    },
    spin: function (n) {
      var from = 0, dur = 1.1 * n;
      return {
        dur: dur,
        start: function () { from = heading(); },
        apply: function (u, dt, t) {
          root.rotation.y = from + Math.PI * 2 * n * smooth(u);
          pose.lift += bump(u, 0, 1) * 0.06 * scale;
          arm("L", 0, 0.9 * bump(u, 0, 1)); arm("R", 0, 0.9 * bump(u, 0, 1));
          stepPose(t / (style.stepTime * 0.6), 0.6);
        },
      };
    },
    wag: function (n) {
      return {
        dur: 0.5 * n,
        apply: function (u) {
          var w = Math.sin(u * n * Math.PI * 2) * bump(u, 0, 1);
          rot("tail0", Y, w * 0.9); rot("tail1", Y, w * 0.7);
          rot("hips", Z, w * 0.05);
        },
      };
    },
    blink: function (n) {
      return { dur: 0.35 * n, apply: function (u) { var b = Math.abs(Math.sin(u * n * Math.PI)); pose.blinkL = pose.blinkR = Math.max(pose.blinkL, b); } };
    },
    rest: function (n) { return { dur: n, apply: function () {} }; },
  };

  function randomSpot() {
    var c = opts.roam ? opts.roam.center : [root.position.x, root.position.z];
    var r = opts.roam ? opts.roam.radius * 0.9 : 1.5;
    for (var i = 0; i < 20; i++) {
      var a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r;
      var x = c[0] + Math.cos(a) * d, z = c[1] + Math.sin(a) * d;
      if (!blocked(x, z) && Math.hypot(x - root.position.x, z - root.position.z) > 0.4) return { x: x, z: z };
    }
    return { x: c[0], z: c[1] };
  }

  function begin(step) {
    var name = step[0], n = step[1] === undefined ? DEFAULT_COUNT[name] : step[1];
    var make = ACTIONS[name];
    if (!make) return false;
    var a = make(n, step[2]);
    var replace = a.start && a.start();
    if (replace) { queue = replace.concat(queue); return false; }
    current = { a: a, t: 0 };
    return true;
  }

  function update(dt) {
    dt = Math.min(dt, 0.1);
    time += dt;
    resetPose();
    if (!opts.still) breathe(time); // still：只眨眼，身子不动（胳膊和身子还没切干净，先不让它动）
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
      if (idleTimer <= 0) { queue = queue.concat(randomSteps()); idleTimer = 2 + Math.random() * 4; }
    }
    blinkTimer -= dt;
    if (blinkTimer < 0.16) { var c = Math.sin(Math.max(0, blinkTimer) / 0.16 * Math.PI); pose.blinkL = Math.max(pose.blinkL, c); pose.blinkR = Math.max(pose.blinkR, c); }
    if (blinkTimer <= 0) blinkTimer = 2.5 + Math.random() * 4;
    applyBones();
    model.position.y = pose.lift;
    if (morph.blinkL !== undefined) mesh.morphTargetInfluences[morph.blinkL] = Math.min(1, pose.blinkL);
    if (morph.blinkR !== undefined) mesh.morphTargetInfluences[morph.blinkR] = Math.min(1, pose.blinkR);
  }

  // 自由活动：多半是溜达到别处，偶尔原地做个小动作
  function randomSteps() {
    var r = Math.random();
    if (r < 0.45) return [["goto", 1, randomSpot()]];
    var pool = [[["wave", 1]], [["look", 1]], [["nod", 2]], [["dance", 1]], [["jump", 1]], [["spin", 1]], [["wag", 4]], [["rest", 2]]];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function play(program) {
    queue = queue.concat(parseProgram(program));
    return new Promise(function (res) {
      var prev = resolveAll;
      resolveAll = function () { if (prev) prev(); res(); };
    });
  }
  function stop() {
    queue = []; current = null;
    if (resolveAll) { var r = resolveAll; resolveAll = null; r(); }
  }

  resetPose(); applyBones();
  return {
    who: who, root: root, bones: bones, mesh: mesh,
    update: update, play: play, stop: stop,
    setFree: function (on) { free = !!on; idleTimer = 1; },
    get busy() { return !!current || queue.length > 0; },
    get free() { return free; },
  };
}
