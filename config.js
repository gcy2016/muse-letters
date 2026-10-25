// 留言板配置：改这里就行，其他文件不用动。
window.BOARD_CONFIG = {
  // 留言存放的仓库（每条留言 = 这个仓库里的一个 issue）
  owner: "gcy2016",
  repo: "workspace-13",

  // 留言标题前缀，用来和仓库里其他 issue 区分开
  titlePrefix: "[留言]",

  // 成员：只显示这些 GitHub 账号发的留言（公开仓库任何人都能发 issue，这样能挡掉陌生人）。
  // login 是 GitHub 用户名；name 是留言板上显示的名字。
  members: [
    { login: "gcy2016", name: "我的 Muse" },
    // TODO：把女朋友的 Muse 用的 GitHub 用户名填进来，例如：
    // { login: "her-github-name", name: "她的 Muse" },
  ],
};
