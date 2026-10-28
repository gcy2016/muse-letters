// 两只一起玩：打闹、碰鼻子、追着玩、一起跳。用 pet.js 的小动作（转向、小跑、扑、躲、凑近……）一段段排出来，
// 两只的动作分段对齐（Promise.all 等两边都做完再进下一段）。玩的时候先关掉自由活动，玩完恢复原来的设置。
//   import { together, TOGETHER } from "./pet-together.js";
//   together(pets[0], pets[1], "fight");   // a 是发起的那只（跑过去找 b）；返回 Promise，玩完了才 resolve
//   stopTogether();                        // 中途不玩了（比如点了单只的动作按钮）：后面的段落不再排
//   TOGETHER：[{ id, label }]，面板上的按钮用
export var TOGETHER = [
  { id: "fight", label: "打闹" },
  { id: "boop", label: "碰鼻子" },
  { id: "chase", label: "追着玩" },
  { id: "jump", label: "一起跳" },
];

function at(p, stop) { return { x: p.root.position.x, z: p.root.position.z, stop: stop }; }
var cancelled = false;
function both(a, progA, b, progB) {
  if (cancelled) return Promise.reject(new Error("cancelled"));
  return Promise.all([a.play(progA), b.play(progB)]);
}

// a 跑到 b 跟前（中心相距 stop 米），然后两只面对面
async function meet(a, b, stop) {
  await both(a, [["approach", 1, at(b, stop)]], b, [["face", 1, at(a)]]);
  await both(a, [["face", 1, at(b)]], b, [["face", 1, at(a)]]);
}

var PLAYS = {
  // 打闹：你扑我躲、我扑你躲，来回三回合，最后一起摇尾巴
  fight: async function (a, b) {
    await meet(a, b, 0.5);
    var pair = [a, b];
    for (var i = 0; i < 3; i++) {
      var x = pair[i % 2], y = pair[(i + 1) % 2];
      await both(x, [["pounce", 1]], y, [["rest", 0.2], ["dodge", 1]]);
    }
    await both(a, [["wag", 4], ["blink", 1]], b, [["jump", 1], ["wag", 4]]);
  },
  // 碰鼻子：凑过去探头碰一下，眯眼、摇尾巴
  boop: async function (a, b) {
    await meet(a, b, 0.5);
    await both(a, [["boop", 1]], b, [["boop", 1]]);
    await both(a, [["wag", 4], ["nod", 1]], b, [["blink", 2], ["wag", 4]]);
  },
  // 追着玩：b 转身跑开，a 追上去，追上了 b 回头蹦一下；来回两次
  chase: async function (a, b) {
    await meet(a, b, 0.55);
    for (var i = 0; i < 2; i++) {
      await both(b, [["turn", Math.random() < 0.5 ? 0.6 : -0.6], ["run", 8]], a, [["rest", 0.6]]);
      await both(a, [["approach", 1, at(b, 0.5)]], b, [["rest", 0.3]]);
      await both(a, [["face", 1, at(b)]], b, [["face", 1, at(a)], ["jump", 1]]);
    }
    await both(a, [["wag", 4]], b, [["wag", 4]]);
  },
  // 一起跳：面对面同时跳两下
  jump: async function (a, b) {
    await meet(a, b, 0.6);
    await both(a, [["jump", 2]], b, [["jump", 2]]);
    await both(a, [["wag", 3]], b, [["wag", 3]]);
  },
};

// 正在玩的那一局：pets 是哪两只，done 在这一局彻底结束（自由活动也恢复了）后 resolve
var round = null;
export function stopTogether() {
  if (!round) return Promise.resolve();
  cancelled = true;
  round.pets.forEach(function (p) { p.stop(); }); // 手上的动作也停，等着的那一段马上结束
  return round.done;
}
export async function together(a, b, kind) {
  if (!PLAYS[kind]) return;
  await stopTogether();
  cancelled = false;
  var freeA = a.free, freeB = b.free, finish;
  round = { pets: [a, b], done: new Promise(function (r) { finish = r; }) };
  a.setFree(false); b.setFree(false);
  a.stop(); b.stop();
  try { await PLAYS[kind](a, b); }
  catch (e) { if (e.message !== "cancelled") throw e; }
  finally {
    a.setFree(freeA); b.setFree(freeB);
    round = null;
    finish();
  }
}
