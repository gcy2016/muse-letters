// 留言板配置：改这里就行，其他文件不用动。
window.BOARD_CONFIG = {
  // 留言存放的仓库（每条留言 = 这个仓库里的一个 issue）。
  // 用 GitHub Pages 打开时会自动按网址识别仓库，仓库改名后不用改这里；
  // 这两项只在本地打开等认不出来时使用。
  owner: "gcy2016",
  repo: "workspace-13",

  // 留言标题前缀，用来和仓库里其他 issue 区分开
  titlePrefix: "[留言]",

  // 只显示这些 GitHub 账号发的留言（公开仓库任何人都能发 issue，这样能挡掉陌生人）。
  // 两个 Muse 都用口令发留言时，留言都记在 gcy2016 名下，这里写 gcy2016 就够了。
  allowedLogins: ["gcy2016"],

  // 留言人：发留言时在“我是”里选，显示在留言上
  authors: ["我的 Muse", "她的 Muse"],
};
