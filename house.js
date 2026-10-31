// 房屋模型：加载 assets/house/house.glb（tools/build_house.py 生成），给互动空间用。
// 模型单位是米，地面 y=0，房子前门朝 +z，房子中心大致在原点。不管以后互动空间做成什么样，都按下面的接口用：
//
//   import { loadHouse, addHouseLights } from "./house.js";
//   var house = await loadHouse();     // 可传 loadHouse(null, function (p) { 进度 0~1 })
//   scene.add(house.root);
//   house.update(camera);              // 每帧调用：挡住视线的墙自动藏起来（像娃娃屋那样剖开看）
//   house.setView({ room: "living" }); // 只看一个房间；{ room: null } 回到全屋；{ walls: "full" | "low" } 内墙全高 / 矮墙
//   house.rooms.living                 // { id, label, level, elev, x0, x1, z0, z1, center }：level 第几层（0 是一楼），elev 这层地面离地多高
//   house.levels                       // [{ level, elev, label, rooms: [房间 id] }]：有哪几层，从下往上；rooms 从后往前、从左往右排
//   house.setView({ level: 1 })        // 只看到第几层（上面的楼层藏起来，像掀开楼板看）；{ level: null } 全部显示。看某个房间时自动按那个房间的楼层
//   house.spots.sofa                   // { id, label, room, level, position, rotationY }：角色站在这里、朝这个方向
//   house.colliders                    // [{ x0, z0, x1, z1, level, kind, name }]：墙和家具在地面上的占地（分楼层），以后操控角色走路时挡路用
//   house.levelAt(y)                   // 高度 y（房子坐标）在第几层；house.roomAt(x, z, level) 某层上 (x, z) 在哪个房间
//   house.pick(raycaster)              // 点到了什么：{ id: "computer" | "board" | "door" | "tv" | "sofa" | "bed", object, point } 或 null
//   house.setView({ exterior: true })  // 从外面看：盖上屋顶、墙全部立起来（放进小岛等外部场景时用）；false 回到剖开看
//   house.setDoor(true)                // 入户门开 / 关（会慢慢转过去）；house.doorOpen 是当前目标状态
//   house.doorPosition                 // 入户门外侧台阶上的一点（房子坐标），镜头对准门用
//   house.addItem(obj, { auto: true, interact }) // 往房子里加东西（房子坐标，先摆好位置和朝向）：按位置自动算房间、找贴着的墙，
//                                      // 跟着房间显示/隐藏、墙被削矮时一起藏；interact 是点它时 pick 返回的 id。也可以直接给 { room, wall }。
//                                      // 显示物件的位置统一写在 layout.js（布置表）里
import * as THREE from "three";
import { GLTFLoader } from "./lib/GLTFLoader.js";
import { RoomEnvironment } from "./lib/RoomEnvironment.js";
import { MeshoptDecoder } from "./lib/meshopt_decoder.module.js";
import { fetchGlb } from "./glb-fetch.js";

export var HOUSE_URL = new URL("./assets/house/house.glb", import.meta.url).href;
var LOW_WALL = 1.0;   // 矮墙模式下内墙的高度
var STUB_WALL = 0.12; // 挡住视线的墙只留这么高的墙脚（门照样立着）

// onProgress(比例 0~1, 已下载字节, 总字节)：模型约 1 MB，网慢时用来显示进度（按 GLB 文件头里的真实大小算，最高 100%）
export function loadHouse(url, onProgress) {
  var loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  url = url || HOUSE_URL;
  return fetchGlb(url, function (loaded, total) {
    if (onProgress && total) onProgress(Math.min(1, loaded / total), loaded, total);
  }).then(function (buf) {
    return loader.parseAsync(buf, url.replace(/[^/]*$/, ""));
  }).then(function (gltf) { return makeHouse(gltf.scene); });
}

export function makeHouse(root) { // 已经加载好的场景（gltf.scene）直接造房子，测试用
  root.name = "house";
  var rooms = {}, spots = {}, walls = [], items = [], floors = [], interactables = {}, bases = [], roof = null;
  var wallById = {};

  root.traverse(function (o) {
    var d = o.userData;
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
    if (d.kind === "room") {
      // 楼层：模型里没写 level / elev 的（只有一层时）当一楼
      var elev = d.elev || 0;
      rooms[d.id] = { id: d.id, label: d.label, level: d.level || 0, elev: elev, x0: d.x0, x1: d.x1, z0: d.z0, z1: d.z1, center: new THREE.Vector3((d.x0 + d.x1) / 2, elev, (d.z0 + d.z1) / 2) };
    } else if (d.kind === "spot") {
      spots[d.id] = { id: d.id, label: d.label, room: d.room, level: 0, position: o.position.clone(), rotationY: o.rotation.y };
    } else if (d.kind === "wall") {
      var w = { node: o, id: o.name.replace(/^wall_/, ""), axis: d.axis, c: d.c, roomA: d.roomA, roomB: d.roomB, exterior: !!d.exterior, pieces: [] };
      o.children.forEach(function (p) { w.pieces.push({ node: p, part: p.userData.part, h: p.userData.h || 1 }); });
      walls.push(w);
      wallById[w.id] = w;
    } else if (d.kind === "furniture") {
      items.push({ node: o, room: d.room, wallmount: d.wallmount || null, solid: !!d.solid });
      if (d.interact) interactables[d.interact] = o;
    } else if (d.kind === "floor") {
      floors.push({ node: o, room: d.room });
    } else if (d.kind === "base") {
      o.userData.level = d.level || 0; // 底座、楼板：楼上的楼板写 level
      bases.push(o);
    } else if (d.kind === "roof") {
      roof = o;
    }
  });

  // 楼层：每层有哪些房间；墙、家具、地板、位置点按所属房间定在哪层（墙看它两边的房间，取高的那层）
  var levels = [];
  Object.keys(rooms).forEach(function (id) {
    var r = rooms[id], lv = levels.filter(function (l) { return l.level === r.level; })[0];
    if (!lv) levels.push(lv = { level: r.level, elev: r.elev, label: r.level + 1 + "楼", rooms: [] });
    lv.rooms.push(id);
  });
  if (!levels.length) levels.push({ level: 0, elev: 0, label: "1楼", rooms: [] });
  levels.sort(function (a, b) { return a.level - b.level; });
  // 每层的房间按位置排（从后往前、从左往右），房间按钮就按这个顺序
  levels.forEach(function (l) {
    l.rooms.sort(function (a, b) { var A = rooms[a], B = rooms[b]; return Math.abs(A.z0 - B.z0) > 0.5 ? A.z0 - B.z0 : A.x0 - B.x0; });
  });
  function levelOfRoom(id) { return rooms[id] ? rooms[id].level : 0; }
  // 高度 y 在第几层：地面不高于 y 的最高那层
  function levelAt(y) {
    var found = levels[0].level;
    levels.forEach(function (l) { if (l.elev <= y + 0.05) found = l.level; });
    return found;
  }
  walls.forEach(function (w) { w.level = Math.max(levelOfRoom(w.roomA), levelOfRoom(w.roomB)); });
  items.forEach(function (it) { it.level = levelOfRoom(it.room); });
  floors.forEach(function (f) { f.level = levelOfRoom(f.room); });
  Object.keys(spots).forEach(function (id) { spots[id].level = levelOfRoom(spots[id].room); });

  // 电脑屏幕换成亮着的桌面（以后点开就是入口界面）
  if (interactables.computer) {
    interactables.computer.traverse(function (o) {
      if (o.isMesh && o.material && /glass/.test(o.material.name)) {
        o.material = o.geometry.attributes.uv
          ? new THREE.MeshStandardMaterial({ map: screenTexture(), emissive: 0xffffff, emissiveMap: screenTexture(), emissiveIntensity: 0.8, roughness: 0.4 })
          : new THREE.MeshStandardMaterial({ color: 0x9ad0f5, emissive: 0x7fbff0, emissiveIntensity: 0.6, roughness: 0.4 });
      }
    });
  }

  // 入户门：门扇（名字以 door 开头的几个零件）挂到合页上，能开能关。门扇宽约 0.83，合页在门的左边（从外面看）
  var doorHinge = null, doorAngle = 0, doorPosition = new THREE.Vector3();
  if (interactables.door) {
    root.updateMatrixWorld(true);
    var leaves = [];
    interactables.door.traverse(function (o) { if (/^door/.test(o.name) && !/^door/.test(o.parent.name)) leaves.push(o); });
    doorHinge = new THREE.Group();
    doorHinge.name = "door_hinge";
    doorHinge.position.set(-0.415, 0, 0);
    interactables.door.add(doorHinge);
    doorHinge.updateMatrixWorld(true);
    leaves.forEach(function (o) { doorHinge.attach(o); });
    interactables.door.getWorldPosition(doorPosition);
    doorPosition.z += 0.6; // 门外台阶上
  }
  var view = { room: null, level: null, walls: "low", exterior: false };
  var doorOpen = false;
  function setDoor(open) { api.doorOpen = doorOpen = !!open; }

  // 只看一个房间时，房间底下单独垫一块底座（全屋底座先藏起来）
  var baseMat = new THREE.MeshStandardMaterial({ color: 0xc48552, roughness: 0.9 });
  bases[0] && bases[0].traverse(function (o) { if (o.isMesh) baseMat = o.material; });
  var roomBases = {};
  Object.keys(rooms).forEach(function (id) {
    var r = rooms[id];
    var m = new THREE.Mesh(new THREE.BoxGeometry(r.x1 - r.x0, 0.2, r.z1 - r.z0), baseMat);
    m.position.set((r.x0 + r.x1) / 2, r.elev - 0.145, (r.z0 + r.z1) / 2);
    m.receiveShadow = true;
    m.visible = false;
    root.add(m);
    roomBases[id] = m;
  });

  // 碰撞框：家具（solid）和墙（门洞不算）在地面上的占地
  root.updateMatrixWorld(true);
  var colliders = [];
  var box = new THREE.Box3();
  function addCollider(obj, kind, level) {
    box.setFromObject(obj);
    var floorY = (levels.filter(function (l) { return l.level === level; })[0] || levels[0]).elev;
    if (box.isEmpty() || box.max.y < floorY + 0.05) return;
    colliders.push({ x0: box.min.x, z0: box.min.z, x1: box.max.x, z1: box.max.z, level: level, kind: kind, name: obj.name });
  }
  items.forEach(function (it) { if (it.solid) addCollider(it.node, "furniture", it.level); });
  walls.forEach(function (w) {
    w.pieces.forEach(function (p) { if (p.part === "full" || p.part === "below" || p.part === "fixed" && p.node.isMesh) addCollider(p.node, "wall", w.level); });
  });

  var dir = new THREE.Vector3();
  var center = new THREE.Vector3();
  var inv = new THREE.Matrix4();

  function setView(opts) {
    if ("room" in opts) view.room = opts.room && rooms[opts.room] ? opts.room : null;
    if ("level" in opts) view.level = levels.some(function (l) { return l.level === opts.level; }) ? opts.level : null;
    if (opts.walls) view.walls = opts.walls;
    if ("exterior" in opts) view.exterior = !!opts.exterior;
  }

  // 按相机方向决定每面墙：全高 / 变矮（矮墙模式下的内墙）/ 只留墙脚（挡住视线的墙）/ 不显示（别的房间、上面的楼层）
  // 有楼层时：看某个房间只显示这一间；看某一层时这层照上面的规则剖开，上面的楼层整层藏起来，下面的楼层照原样立着（被这层的楼板挡着）
  function update(camera) {
    // 门慢慢转到目标角度（往屋里开）
    if (doorHinge) {
      doorAngle += ((doorOpen ? 1.65 : 0) - doorAngle) * 0.12;
      doorHinge.rotation.y = doorAngle;
    }
    if (roof) roof.visible = view.exterior;
    if (view.exterior) { showAll(); return; }
    var R = view.room;
    var L = R ? rooms[R].level : view.level; // 看到第几层；null 是全部楼层
    inv.copy(root.matrixWorld).invert();
    dir.copy(camera.position).applyMatrix4(inv); // 相机在房子坐标里的位置
    center.copy(R ? rooms[R].center : new THREE.Vector3());
    dir.sub(center).setY(0).normalize();
    walls.forEach(function (w) {
      var n = w.axis === "x" ? dir.z : dir.x; // 墙的法线（指向 roomB 一侧）和视线方向的点积
      var show = true, height = 0; // height：0 表示全高
      if (R) {
        if (w.roomA !== R && w.roomB !== R) show = false;
        else if ((w.roomB === R ? n : -n) < -0.2) height = STUB_WALL;
      } else if (L !== null && w.level !== L) {
        show = w.level < L;
      } else if (w.exterior) {
        if ((w.roomA === "" ? -n : n) > 0.2) height = STUB_WALL;
      } else if (view.walls === "low") {
        height = LOW_WALL;
      }
      var fixed = w.pieces.some(function (p) { return p.part === "fixed"; }); // 方案 B 原来的墙带挂画，不能压矮，只能整面藏
      if (fixed && height) show = false;
      w.node.visible = show;
      w.cut = show && height > 0;
      w.shown = show;
      w.pieces.forEach(function (p) {
        if (p.part === "full" || p.part === "below") p.node.scale.y = height ? Math.min(1, height / p.h) : 1;
        else if (p.part === "above" || p.part === "window" || p.part === "frame") p.node.visible = !height;
      });
    });
    items.forEach(function (it) {
      var vis = R ? it.room === R : L === null || it.level <= L;
      if (vis && it.wallmount) { var w = wallById[it.wallmount]; vis = w ? w.shown && !w.cut : true; }
      it.node.visible = vis;
    });
    floors.forEach(function (f) { f.node.visible = R ? f.room === R : L === null || f.level <= L; });
    bases.forEach(function (b) { b.visible = !R && (L === null || b.userData.level <= L); });
    Object.keys(roomBases).forEach(function (id) { roomBases[id].visible = id === R; });
  }

  // 从外面看：所有墙全高、门窗都在，家具都留着（从门口和窗户能看到一点）
  function showAll() {
    walls.forEach(function (w) {
      w.node.visible = true; w.cut = false; w.shown = true;
      w.pieces.forEach(function (p) {
        if (p.part === "full" || p.part === "below") p.node.scale.y = 1;
        else if (p.part === "above" || p.part === "window" || p.part === "frame") p.node.visible = true;
      });
    });
    items.forEach(function (it) { it.node.visible = true; });
    floors.forEach(function (f) { f.node.visible = true; });
    bases.forEach(function (b) { b.visible = true; });
    Object.keys(roomBases).forEach(function (id) { roomBases[id].visible = false; });
  }

  function isShown(o) {
    for (; o; o = o.parent) if (!o.visible) return false;
    return true;
  }
  function pick(raycaster) {
    var hits = raycaster.intersectObject(root, true);
    for (var i = 0; i < hits.length; i++) {
      if (!isShown(hits[i].object)) continue;
      for (var o = hits[i].object; o && o !== root; o = o.parent) {
        if (o.userData.interact) return { id: o.userData.interact, object: o, point: hits[i].point };
      }
      return null; // 先碰到的是墙或别的家具
    }
    return null;
  }

  // level 不传时哪层都算（先找到的那个）
  function roomAt(x, z, level) {
    for (var id in rooms) {
      var r = rooms[id];
      if (level != null && r.level !== level) continue;
      if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return id;
    }
    return null;
  }

  var bounds = new THREE.Box3().setFromObject(root);
  // 每面墙占的地方（房子坐标），自动找“物件贴着哪面墙”用
  walls.forEach(function (w) { w.box = new THREE.Box3().setFromObject(w.node); });
  // 物件贴着的墙：墙在物件背后、离得很近（挂墙的东西正面朝外），物件的位置落在这面墙的范围里
  function wallBehind(pos, facing) {
    var nx = Math.sin(facing), nz = Math.cos(facing), best = null, bestD = 0.35;
    walls.forEach(function (w) {
      var along = w.axis === "x" ? nz : nx;          // 墙的法线方向上，物件朝向的分量
      if (Math.abs(along) < 0.7) return;              // 物件没正对这面墙
      var d = (w.axis === "x" ? pos.z : pos.x) - w.c; // 物件在墙的哪一侧、多远
      if (d * along <= 0 || Math.abs(d) > bestD) return;
      var a = w.axis === "x" ? pos.x : pos.z, lo = w.axis === "x" ? w.box.min.x : w.box.min.z, hi = w.axis === "x" ? w.box.max.x : w.box.max.z;
      if (a < lo - 0.05 || a > hi + 0.05 || pos.y > w.box.max.y + 0.1 || pos.y < w.box.min.y - 0.1) return; // 别的楼层的墙不算
      best = w; bestD = Math.abs(d);
    });
    return best;
  }
  // 往房子里加东西。opts.auto：按位置自动算房间（物件正前方 0.3 米落在哪个房间，楼层按物件的高度 y）和贴着的墙；也可以直接给 room、wall
  // opts.floor：放在地上的（靠墙根的快递盒），不算挂在墙上，墙剖开削矮时不跟着藏
  function addItem(obj, opts) {
    opts = opts || {};
    var room = opts.room || "", wall = opts.wall || null;
    if (opts.auto) {
      var f = obj.rotation.y, p = obj.position;
      var w = wallBehind(p, f);
      if (w && !opts.floor) wall = w.id;
      var lv = levelAt(p.y);
      room = roomAt(p.x + Math.sin(f) * 0.3, p.z + Math.cos(f) * 0.3, lv) || roomAt(p.x, p.z, lv) || "";
    }
    if (opts.interact) { obj.userData.interact = opts.interact; interactables[opts.interact] = obj; }
    obj.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    root.add(obj);
    items.push({ node: obj, room: room, level: room ? levelOfRoom(room) : levelAt(obj.position.y), wallmount: wall, solid: false });
    return { room: room, wall: wall };
  }

  var api = { root: root, addItem: addItem, rooms: rooms, levels: levels, spots: spots, colliders: colliders, interactables: interactables, walls: walls, bounds: bounds,
    view: view, setView: setView, update: update, pick: pick, roomAt: roomAt, levelAt: levelAt, setDoor: setDoor, doorOpen: false, doorPosition: doorPosition };
  return api;
}

function screenTexture() {
  if (screenTexture.t) return screenTexture.t;
  var c = document.createElement("canvas");
  c.width = 320; c.height = 200;
  var ctx = c.getContext("2d");
  var g = ctx.createLinearGradient(0, 0, 320, 200);
  g.addColorStop(0, "#9ad0f5"); g.addColorStop(1, "#f6b7cf");
  ctx.fillStyle = g; ctx.fillRect(0, 0, 320, 200);
  ["#ffffff", "#ffe08a", "#b9f0d4", "#ffc2b3"].forEach(function (col, i) {
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.roundRect(28 + i * 70, 120, 46, 46, 10); ctx.fill();
  });
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 40px 'PingFang SC','Microsoft YaHei',sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Muse", 160, 78);
  var t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = false;
  screenTexture.t = t;
  return t;
}

// 一套看着舒服的灯光（可选）：柔和的环境光 + 一盏带阴影的“太阳”。互动空间有自己的灯光就不用调这个
export function addHouseLights(scene, renderer) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  var pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  var hemi = new THREE.HemisphereLight(0xffffff, 0xd9c7b0, 0.25);
  scene.add(hemi);
  var sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
  sun.position.set(-5, 12, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.normalBias = 0.03;
  sun.shadow.bias = -0.0005;
  var sc = sun.shadow.camera;
  sc.left = sc.bottom = -9; sc.right = sc.top = 9; sc.near = 1; sc.far = 40;
  scene.add(sun);
  return { hemi: hemi, sun: sun };
}
