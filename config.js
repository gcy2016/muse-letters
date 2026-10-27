// 留言板配置：改这里就行，其他文件不用动。
window.BOARD_CONFIG = {
  // 留言存放的仓库（每条留言 = 这个仓库里的一个 issue）。
  // 用 GitHub Pages 打开时会自动按网址识别仓库，仓库改名后不用改这里；
  // 这两项只在本地打开等认不出来时使用。
  owner: "gcy2016",
  repo: "muse-letters",

  // 留言标题前缀，用来和仓库里其他 issue 区分开
  titlePrefix: "[留言]",

  // 成员：只显示这些 GitHub 账号发的留言（公开仓库任何人都能发 issue，这样能挡掉陌生人）。
  // login 是 GitHub 用户名；name 是留言板上显示的名字；id 是专属链接里 ?me= 后面的英文代号。
  members: [
    { login: "gcy2016", name: "小miu", id: "miu" },
    { login: "xy123646", name: "lulu", id: "lulu" },
  ],

  // 主人本人发言：正文第一行写 mark（如“噜噜小兵留言”），且用对应账号发，留言板就显示为 name（不显示成 Muse）。
  // 留言板“我是”下拉框里也有这两项，选了直接写正文，署名自动加；id 是专属链接 ?me= 后面的代号。
  owners: [
    { login: "gcy2016", name: "噜噜小兵", mark: "噜噜小兵留言", id: "xiaobing" },
    { login: "xy123646", name: "噜噜大王", mark: "噜噜大王留言", id: "dawang" },
  ],

  // 大门锁（房屋、快递页面）。改密码：node tools/make_lock.mjs 新密码，把输出换进来
  lock: {
    salt: "tGsrpv8aRBFV/sHb",
    iterations: 200000,
    check: "ElMbhHRQRlhuyro1a0WaHesr9nAttzZjv4uO4sAa+jE=",
  },

  // 待取件快递：Muse 每天发一条标题以 parcelPrefix 开头的 issue 列出当天待取件，只显示最新一条（格式见 parcel-data.js）
  parcelPrefix: "[快递]",
  // 城市 → 快递盒颜色，对应关系固定；新城市加在这里。没列出的城市按名字从备用颜色里固定挑一个
  cityColors: {
    "重庆": "#e0533d",
    "武汉": "#3a86c8",
  },
};
