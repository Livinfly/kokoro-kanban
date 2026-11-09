# kokoro-kanban

[English](README.md) | 简体中文

```
 kokoro-kanban  2 sessions · 1 job running · 1 needs you                                 19:52
╭──────────────────────────────────────────────────────────────────────────────────────────────╮
│ Needs you (1)                                                                                │
│ ▶ a-9d0e approval 要不要删掉旧的 session 表？ · s-7f3a 重构登录 · 5m                         │
╰──────────────────────────────────────────────────────────────────────────────────────────────╯
╭──────────────────────────────────────────────╮╭──────────────────────────────────────────────╮
│ Sessions (2)                                 ││ Jobs (2)                                     │
│ ~/work/app                                   ││ ▶ j-2c91 下载模型 ████████░░ 78% for 12m     │
│ ● s-7f3a codex working 2m 重构登录           ││     1.2/1.6 GB · shard 3/4 · [s-1b2c]        │
│     改 middleware                            ││ ✗ j-77aa 构建 failed (exit 1) 15m ago        │
│ ~/thesis                                     ││                                              │
│ ◐ s-1b2c claude waiting 5m 微调模型          ││                                              │
╰──────────────────────────────────────────────╯╰──────────────────────────────────────────────╯
╭──────────────────────────────────────────────────────────────────────────────────────────────╮
│ Goals / Next (1)                                                                             │
│ g-1b2c 登录重构 (s-7f3a) 1/3 done · doing: 迁移 middleware · next: 补测试                    │
│     [x] 梳理现状  [~] 迁移 middleware  [ ] 补测试                                            │
╰──────────────────────────────────────────────────────────────────────────────────────────────╯
```

给 agent 会话用的本地执行看板。同时开着多个 Codex / Claude Code / Cursor 会话、后台还挂着下载和训练时，不用再挨个去对话里问“进度怎么样”：agent 按 skill 的约定调用 `kokoro` 命令上报，`kokoro board` 在终端里实时展示所有会话。

它是旁观者：不启动、不接管 agent，也不往对话里注入内容。数据全部是本地文件。

## 安装

需要 Node 22.22 或更高版本。

```bash
npm install
npm run build
npm link            # 提供 kokoro 和 kokoro-kanban 两个命令
```

给 agent 装上 skill：

```bash
kokoro skill install --target codex    # 复制到 ~/.codex/skills/kokoro-kanban/SKILL.md
kokoro skill install --target claude   # ~/.claude/skills/kokoro-kanban/SKILL.md
kokoro skill install --target cursor   # ~/.cursor/skills/kokoro-kanban/SKILL.md
```

然后在一个终端里开着看板：

```bash
kokoro                          # 等同于 kokoro board
kokoro board --here             # 只看当前项目
kokoro board --panel jobs       # 只看 Jobs 面板，适合放在 tmux 小窗格
```

## 四类数据

| 实体 | ID | 用途 |
|---|---|---|
| session | `s-xxxx` 或 agent 自己的会话 ID | 一个 agent 会话：在做什么、状态、最后更新时间 |
| goal | `g-xxxx` | 当前执行计划：目标和有序步骤，显示“正在做 / 下一步” |
| job | `j-xxxx` | 后台作业或下载：进度、耗时、退出码，进程死掉会显示 lost |
| ask | `a-xxxx` | 需要你介入的事项：提问、卡住、待批准、待审阅 |

## agent 怎么上报

skill（`skills/kokoro-kanban/SKILL.md`）里写了完整约定。核心是用宿主提供的会话 ID，agent 不需要记 ID：

| 宿主 | 环境变量 |
|---|---|
| Codex | `$CODEX_THREAD_ID` |
| Claude Code | `$CLAUDE_CODE_SESSION_ID` |
| Cursor | `$CURSOR_CONVERSATION_ID` |

```bash
kokoro session start --id "$CODEX_THREAD_ID" --agent codex --title "微调分类模型"
kokoro goal add --session "$CODEX_THREAD_ID" --title "微调" --step "下载数据" --step "训练" --step "评估"
kokoro goal step g-1b2c --set 1=doing
kokoro run --session "$CODEX_THREAD_ID" --title "下载数据集" --detach -- hf download org/dataset
kokoro ask add --session "$CODEX_THREAD_ID" --kind approval "训练要占 GPU 两小时，现在开始吗？"
kokoro ask resolve a-4d2f
kokoro session end "$CODEX_THREAD_ID" --summary "准确率 91%"
```

### 后台作业

`kokoro run [--detach] -- <cmd>` 会记录 pid、日志、耗时和退出码；包装进程被杀掉后，看板把作业显示为 lost。被包装的命令会拿到三个环境变量，可以自己上报进度：

```bash
kokoro job progress "$KOKORO_JOB" --done 3 --total 10 --unit files --msg "第 3 批"
echo '{"pct": 30, "msg": "epoch 1/3"}' >> "$KOKORO_PROGRESS_FILE"   # 也可以直接追加 JSON 行
```

第三方工具（`hf download`、curl 等）的输出目前只进日志，不解析成进度。

## 数据存在哪里

写入时按以下顺序选择存储目录：

1. `--store <dir>`
2. `$KOKORO_STORE`
3. 从当前目录往上找到的最近一个 `.kokoro-kanban/`（用 `kokoro init` 创建）
4. 全局 `~/.kokoro-kanban/`（可用 `$KOKORO_HOME` 修改）

项目存储会登记到全局的 `stores.json`，看板同时读取全局存储和所有登记过的项目存储，按项目分组。

```
.kokoro-kanban/
  sessions/<id>.json   goals/<id>.json   asks/<id>.json
  jobs/<id>.json   jobs/<id>.progress.jsonl   jobs/<id>.log
  archive/...          归档后的条目
  config.json          仅全局：{ "staleAfterMinutes": 30, "hideFinishedAfterHours": 24 }
  stores.json          仅全局：登记的项目存储
```

所有 JSON 先写临时文件再 rename，进度文件只追加。文件格式就是协议，脚本也可以直接写。

### 在沙箱里运行的 agent

Codex、Cursor 等默认只允许写工作区，写 `~/.kokoro-kanban` 会被拒绝。两种办法：

- 在项目里执行一次 `kokoro init`（自己在终端里执行，这样能登记到全局），之后 agent 的写入都落在工作区内的 `.kokoro-kanban/`。
- 把 `~/.kokoro-kanban` 加进 agent 沙箱的可写路径（例如 Codex 的 `sandbox_workspace_write.writable_roots`）。

## 看板按键

| 按键 | 作用 |
|---|---|
| `tab` / `shift+tab` | 切换面板 |
| `j` / `k`、方向键 | 移动选中项 |
| `enter` / `esc` | 打开 / 关闭详情（job 详情里有日志最后 30 行） |
| `1`–`4` / `0` | 单面板模式 / 回到总览；单面板下 `←` `→` 切换面板 |
| `x` | 关闭选中的事项 |
| `a` | 归档已结束的条目 |
| `p` | 按项目筛选 |
| `.` | 显示 / 隐藏结束超过 24 小时的条目 |
| `q` | 退出 |

不在终端里执行 `kokoro`（例如 agent 误调用）时，会直接打印 `kokoro status` 的内容，不会卡住。

## 其他命令

```bash
kokoro status [--here] [--json]   # 纯文本快照，agent 回答“进度怎么样”时用
kokoro archive <id>...            # 归档已结束的条目
kokoro doctor                     # 列出解析失败的文件和失效的项目存储
kokoro <command> -h               # 每个命令的参数说明
```

## 开发

```bash
npm test            # vitest，会先用 tsup 构建 dist/ 供进程级测试使用
npm run typecheck
npm run dev -- status
```

设计文档在 `docs/superpowers/specs/`，实现计划在 `docs/superpowers/plans/`。
