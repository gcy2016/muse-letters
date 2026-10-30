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

  // 待取件快递：Muse 每天发一条标题以 parcelPrefix 开头的 issue 列出当天待取件（格式见 parcel-data.js）。
  // 按发帖账号分来源，每个来源只用它最新的一条：小miu（gcy2016）提供噜噜小兵的，lulu（xy123646）提供噜噜大王的。
  // id 对应 layout.js 里 parcels 的那一摞（mine 日历下面、hers 天气下面）
  parcelPrefix: "[快递]",
  parcelSources: [
    { id: "mine", login: "gcy2016", who: "小miu" },
    { id: "hers", login: "xy123646", who: "lulu" },
  ],
  // 天气：工作流 weather.yml 每天约 9、14、19 点自动查（tools/fetch_weather.py，城市坐标也写在那里，id 和下面对上），
  // 存在 weatherBranch 分支的 weather.json；weatherSwitchHour 点（北京时间）前显示今天，之后显示明天。
  // 自动查的没有那天的数据时，还认 Muse 手动发的 weatherPrefix 开头的 issue（格式见 issue #94），按发帖账号分来源：
  // 小miu（gcy2016）补重庆，lulu（xy123646）补武汉，每个来源只用它最新的一条。
  // 岛上的天空一次只显示一个城市的天气，主页右上角可以切换（id 记在本机）；天气牌上所有城市都显示。
  weatherBranch: "weather-data",
  weatherSwitchHour: 19,
  weatherPrefix: "[天气]",
  weatherSources: [
    { id: "cq", city: "重庆", login: "gcy2016", who: "小miu" },
    { id: "wh", city: "武汉", login: "xy123646", who: "lulu" },
  ],
  // 日历：Muse 读主人手机日历，发标题以 calendarPrefix 开头的 issue（日程 + 提醒，加密，格式见 calendar-data.js）。
  // 按发帖账号分来源，每个来源只用最新一条；玄关门洞左边的日历小屏只有一块，所有来源合在一起显示。
  // 以后 lulu 发噜噜大王的日历，加一行 { id: "dawang", owner: "噜噜大王", login: "xy123646", who: "lulu" } 即可。
  calendarPrefix: "[日历]",
  calendarSources: [
    { id: "xiaobing", owner: "噜噜小兵", login: "gcy2016", who: "小miu" },
  ],
  // 城市 → 快递盒颜色，对应关系固定；新城市加在这里。没列出的城市按名字从备用颜色里固定挑一个
  cityColors: {
    "重庆": "#e0533d",
    "武汉": "#3a86c8",
  },
};
