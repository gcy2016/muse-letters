# 噜噜、噜妹（站着的小河马）模型来源

- 噜噜小兵用腾讯混元 3D 生成（两条腿站姿版），2026-11-05 由小miu 传到 file-storage 的草稿 Release `lulu-lumei-standing-glb-20261105`（原始 GLB 和参考图都在那里，每个约 30 MB）。
- Claude 在原始模型上减面（5 万面 → 约 2 万面）、把贴着身子的胳膊和身子切开、绑骨、加眨眼，流程和参数见 `tools/rig_hippo.py` 开头。
- `lulu.glb`、`lumei.glb`：网页用的（贴图缩小、压缩过），动作在 `hippo.js` 里实时算。
- `source/lulu.blend`、`source/lumei.blend`：Blender 文件（骨架、权重、眨眼变形、两段示范动画 walk / wave，贴图已打包），在 Blender 里打开就能播放。
- 已知小毛病：胳膊原来和身子是长在一起的，切开后补了面；把手举得很高时，腋下身子侧面能看到补过的地方和一点细缝，离远了看不出来。
- 使用条款以腾讯混元 3D 的用户协议为准。
