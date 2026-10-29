// 布置表：噜噜岛和噜噜之家里所有“显示物件”（挂画、小屏、快递盒、牌子……）摆在哪。搬家、换位置只改这个文件。
//
// 坐标单位是米。pos: [x, y, z]，y 是离地高度（挂墙的东西写中心的高度）。facing：正面朝哪边，"+x" "-x" "+z" "-z"，或角度（弧度）。
// 房子里（HOUSE）用房子自己的坐标：x 向右、z 向前门那边（前门在 z≈3.5），客厅在左后、厨房在右后、玄关在前门里。
//   挂墙的东西不用写是哪面墙：程序按位置找它贴着的那面墙，墙被剖开削矮时一起藏起来；属于哪个房间也按位置自动算。
//   改了户型（tools/build_house.py）以后，看看这里的位置还在不在墙上、在不在原来的房间里。
// 岛上（ISLAND）：挂在房子上的东西写相对房子的坐标（onHouse: true），房子在岛上挪位置时跟着走；其余是岛上的坐标。
//
// 不在这里的：电视画面、玄关留言板跟着模型里的家具走（在 tools/build_house.py 里挪家具，它们自动跟着）。

export var HOUSE = {
  // 客厅电视上方的合影（加密照片，见 PHOTO_SLOTS）：盖住方案 B 原来那幅山水画（宽 0.92、高 0.56、中心离地 1.9）
  photoLiving: { pos: [-4.80, 1.95, -2.0], facing: "+x", width: 0.98 },
  // 客厅和书房之间那面墙（客厅一侧）上的旅行地图挂画
  travelMap: { pos: [-2.6, 1.55, -0.012], facing: "-z", width: 2.0 },
  // 玄关后墙（通往厨房那面）上的两块小屏：门洞右边天气、左边日历；顶边和门洞门楣顶（2.17 米）对齐
  weather: { pos: [0.8, 1.93, 0.15], facing: "+z", width: 0.62 },
  calendar: { pos: [-1.1, 1.93, 0.15], facing: "+z", width: 0.62 },
  // 快递盒：玄关后墙（天气、日历那面）墙根，按谁提供的分两摞（config.js 的 parcelSources，按发帖账号分；颜色才按城市）。
  // pos 是第一摞的位置，摞满了往左（-x）、往前（+z）另起一摞。floor：放在地上，墙剖开削矮时不跟着藏
  parcels: {
    mine: { pos: [-0.93, 0, 0.26], facing: "+z", floor: true }, // 小miu 提供的（噜噜小兵的）：日历下面
    hers: { pos: [0.96, 0, 0.26], facing: "+z", floor: true },  // lulu 提供的（噜噜大王的）：天气下面
  },
};

export var ISLAND = {
  // “噜噜岛”立牌：靠岛边、小路起点左边
  nameSign: { pos: [-4, 0, 11.8], facing: 0.25 },
  // “噜噜之家”门牌：门左边的墙上，和窗户差不多高（右边离门框留出贴对联的位置）
  homeSign: { onHouse: true, pos: [-2.06, 1.65, 3.53], facing: "+z" },
  // 煤油灯：门右边的墙上
  lamp: { onHouse: true, pos: [1.2, 1.70, 3.5], facing: "+z", scale: 1.4 },
};

// 要挂进屋里的加密照片（photo-lock.html 用大门锁密码加密，文件放 assets/house/photos/）
export var PHOTO_SLOTS = {
  living: { label: "客厅电视上方的相框", file: "assets/house/photos/photo-living.enc", spot: "photoLiving" },
};

// 朝向 → 绕竖直轴转的角度（物件做的时候正面朝 +z）
export function facingAngle(f) {
  if (typeof f === "number") return f;
  return { "+z": 0, "+x": Math.PI / 2, "-z": Math.PI, "-x": -Math.PI / 2 }[f] || 0;
}

// 按布置表摆好一个物件：设位置、朝向、缩放
export function arrange(obj, spec) {
  obj.position.set(spec.pos[0], spec.pos[1], spec.pos[2]);
  obj.rotation.y = facingAngle(spec.facing);
  if (spec.scale) obj.scale.setScalar(spec.scale);
  return obj;
}

// 房子里：摆好并交给房子管（跟着房间、墙显示隐藏；interact 是点它时的 id）
export function placeInHouse(house, obj, spec, interact) {
  arrange(obj, spec);
  house.addItem(obj, { auto: true, floor: spec.floor, interact: interact });
  return obj;
}
