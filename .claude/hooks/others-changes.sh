#!/bin/bash
# 给 Claude 完整版看：别人（Claude 小号、D老师、Muse、用户本人）改过、而完整版之后还没再动过的文件。
# 新对话开始时自动运行（.claude/settings.json 的 SessionStart），也可以手动运行：bash .claude/hooks/others-changes.sh
# 完整版的提交作者邮箱是 noreply@anthropic.com，其他作者都算「别人」。从新往旧看最近 60 天的提交：
# 别人改的某个文件，如果之后完整版又提交过这个文件，就当完整版已经看过了，不再列出。
cd "$(dirname "$0")/../.." 2>/dev/null || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0
git log --no-merges --since="60 days ago" --date=short --name-only \
  --format=$'\x01%ae\x02%h %ad %an：%s' HEAD 2>/dev/null | python3 -c '
import sys, os
seen, out = set(), []
for block in sys.stdin.read().split("\x01")[1:]:
    head, _, rest = block.partition("\n")
    email, _, title = head.partition("\x02")
    files = [f for f in rest.split("\n") if f.strip()]
    if email == "noreply@anthropic.com":
        seen.update(files)
        continue
    new = [f for f in files if f not in seen]
    if new:
        out.append("- " + title + "".join("\n    " + f for f in new[:15]) + ("\n    ……共 %d 个文件" % len(new) if len(new) > 15 else ""))
if out:
    print("【%s：别人改过、Claude 完整版之后还没再动过的文件（最近 60 天）。改这些文件前先看清别人改了什么，别覆盖掉】" % os.path.basename(os.getcwd()))
    print("\n".join(out[:40]))
'
exit 0
