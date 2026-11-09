# kokoro-kanban 设计文档（v1）

日期：2026-11-09
状态：已确认设计，待审阅

## 1. 背景与目标

同时开着一个或多个 agent 会话（Codex、Claude Code、Cursor 等）时，经常有多个任务并行，其中一些被放到后台跑（下载、训练、长时间构建）。现在想知道进度，只能挨个去对话里问 agent；“接下来要推进什么”也散落在各个对话里。

kokoro-kanban 是一个本地命令行程序：

- agent 按照 skill 的约定，调用 `kokoro` 子命令把会话状态、后台作业进度、目标与下一步、需要人介入的事项写进本地文件；
- `kokoro board` 是一个终端看板（TUI），监听这些文件并热加载展示；
- 它是旁观者，不启动、不接管 agent，也不往 agent 对话里注入内容。

### 成功标准

1. 在两个不同 agent 的会话里装好 skill 后，agent 会在不需要人逐条指挥的情况下创建 session、goal、job、ask；看板在文件写入后 1 秒内显示变化。
2. 用 `kokoro run --detach` 启动的下载作业能在看板上看到进度、耗时和最终退出码；包装进程被 `kill -9` 后，看板把它显示为 lost。
3. `kokoro status` 能给出和看板一致的纯文本快照，agent 可以用它回答“进度怎么样”。
4. 同一个看板能同时展示全局存储和多个项目存储里的内容，并按项目分组。

## 2. 现有工具调研

| 类别 | 代表 | 数据来源 | 与本项目的差别 |
|---|---|---|---|
| 会话监视器 | [tmuxcc](https://github.com/nyanko3141592/tmuxcc)、[baton](https://github.com/yoshihiko555/baton)、[agenthud](https://github.com/neochoon/agenthud)、[captain-miao](https://github.com/dreuseff/dreuseff-captain-miao)、[claude-deck](https://github.com/pomesaka/claude-deck) | 被动读取 tmux 屏幕或 agent 的 JSONL 日志 | 只知道 agent 在跑还是在等人，不知道任务语义上的进度和下一步 |
| 编排器 | vibe-kanban、claude-squad、[agtx](https://github.com/fynnfluegge/agtx)、[TaskYou](https://taskyou.dev/) | 由看板启动 agent，管理 worktree | 需要接管 agent 生命周期，太重 |
| agent 写入的看板 | [Backlog.md](https://github.com/MrLesk/Backlog.md)、[agents-board](https://github.com/fmilioni/agents-board)、[TaskLoom](https://taskloom.app/)、[Dispatch](https://dispatch.foo/) | agent 通过 CLI 或 MCP 写任务 | 最接近。Backlog.md 面向单仓库的项目 backlog，不覆盖后台作业；agents-board 依赖 Postgres 和 Web；TaskLoom、Dispatch 是在线服务 |

借鉴的文件协议：

- [agent-status](https://github.com/julsemaan/agent-status)：每个实例一个 JSON 文件、原子写入、读端按更新时间判定 stale。
- [dsh-task-progress](https://cdn.jsdelivr.net/npm/dsh-task-progress@0.3.0/docs/PROTOCOL.md)：每个任务一个只追加的 JSONL，同一字段以最后一行为准，容忍坏行。

agent 自带能力：Claude Code 的 `/tasks` 和 `claude agents` 只覆盖当前会话，完成项很快消失；Codex 没有后台进程进度面板（[openai/codex#10685](https://github.com/openai/codex/issues/10685)）。Codex 本地的 `~/.codex/goals_1.sqlite` 存有 `/goal` 的目标和状态，可作为以后的被动数据源。

kokoro-kanban 的定位：不接管 agent，由 agent 主动上报，本地文件存储，跨会话、跨项目，覆盖后台作业。

## 3. 架构

采用“CLI 写入 + 文件存储 + TUI 监听”的方案，没有常驻进程。

```
agent ──(skill 约定)──> kokoro <子命令> ──原子写入──> .kokoro-kanban/ 文件
脚本 ──────────────────> 追加进度 JSONL ──────────┘          │
                                                           chokidar 监听
                                                              ▼
                                                   kokoro board（Ink TUI）
                                                   kokoro status（纯文本）
```

文件格式是公开协议：脚本可以不经过 CLI，直接向作业的进度 JSONL 追加一行。以后做插件时，MCP 只是同一套存储上的一层封装。

## 4. 数据模型

所有实体文件都是 JSON，带 `"v": 1`。时间戳统一用 UTC 的 ISO 8601 字符串。ID 是类型前缀加 4 位小写 base36 随机字符（如 `s-7f3a`），创建时检查冲突并重新生成。

所有实体都带 `project`（绝对路径）：

- 写入项目存储时，`project` 是该存储所在的项目目录。
- 写入全局存储时，指定了 `--session` 就继承该 session 的 `project`，否则取当前工作目录。

### 4.1 Session（`s-`）

一个 agent 会话。

| 字段 | 说明 |
|---|---|
| `id`、`agent`、`title`、`project` | `agent` 取值为 `codex`、`claude`、`cursor`、`other` |
| `status` | `working`、`waiting`、`idle`、`ended` |
| `summary` | 一句话描述当前在做什么，可为空 |
| `started_at`、`updated_at`、`ended_at` | `ended_at` 在结束前为 `null` |

### 4.2 Job（`j-`）

后台作业或下载。

| 字段 | 说明 |
|---|---|
| `id`、`session`、`title`、`project` | `session` 可为 `null`（脚本直接创建时） |
| `command` | 被包装的命令行，手动创建时可为 `null` |
| `host` | 创建时的主机名 |
| `pid` | 用于存活检查的进程号：`kokoro run` 时是包装进程，手动创建时来自 `--pid`，可为 `null` |
| `child_pid` | 仅 `kokoro run` 时有，被包装命令的进程号 |
| `state` | `running`、`done`、`failed`、`cancelled` |
| `exit_code`、`message` | 结束时写入，`message` 是最后一条说明 |
| `log` | 日志文件路径，`kokoro run` 时为 `jobs/<id>.log` |
| `started_at`、`updated_at`、`ended_at` | |

进度单独存在 `jobs/<id>.progress.jsonl`，每行是：

```json
{"pct": 78, "done": 1.2, "total": 1.6, "unit": "GB", "msg": "downloading shard 3/4", "at": "2026-11-09T08:42:10Z"}
```

所有字段都可选。读取端从前往后合并，同一字段以最后一行为准；没有 `pct` 但有 `done` 和 `total` 时，用两者推算；`pct` 限制在 0 到 100；没有 `at` 时用文件的修改时间。坏行跳过，只读取文件最后 256KB。

### 4.3 Goal（`g-`）

一个正在推进的目标，带有序的步骤列表。“接下来要做什么”就是各目标中未完成的步骤。

| 字段 | 说明 |
|---|---|
| `id`、`session`、`title`、`project` | |
| `status` | `active`、`done`、`dropped` |
| `steps` | 数组，每项是 `{"text": "...", "status": "todo" \| "doing" \| "done" \| "blocked"}` |
| `created_at`、`updated_at` | |

CLI 中用从 1 开始的序号引用步骤。

### 4.4 Ask（`a-`）

需要人介入的事项。v1 只负责提醒，人看到后去对应会话里回答。

| 字段 | 说明 |
|---|---|
| `id`、`session`、`project` | |
| `kind` | `question`、`blocked`、`approval`、`review` |
| `text` | 正文 |
| `state` | `open`、`resolved` |
| `created_at`、`resolved_at` | |

### 4.5 读取端推算的状态

这些状态只在读取时计算，从不写入文件：

- **stale**：`status` 为 `working` 的 session 超过 `staleAfterMinutes`（默认 30）没有更新；或 `state` 为 `running`、`pid` 为空的 job 的最近更新时间超过同一阈值。界面只标暗并显示距上次更新多久，不判定它已经结束。`waiting` 和 `idle` 的 session 只显示时长，不标 stale。
- **lost**：`state` 为 `running` 的 job，其 `host` 等于本机主机名、`pid` 不为空，而且该进程已不存在。`pid` 为空或 `host` 不是本机的 job 不做存活检查。
- **job 的最近更新时间**：取 job 文件的 `updated_at` 和最后一行进度的 `at` 中较晚的一个。

## 5. 存储

### 5.1 目录布局

```
.kokoro-kanban/
  config.json                  可选，仅全局存储读取
  stores.json                  仅全局存储有：已登记的项目存储列表
  sessions/<id>.json
  goals/<id>.json
  asks/<id>.json
  jobs/<id>.json
  jobs/<id>.progress.jsonl
  jobs/<id>.log
  archive/sessions|goals|asks|jobs/...   归档后的文件，结构与上面相同
```

`config.json` 的字段（都可选）：

```json
{ "staleAfterMinutes": 30, "hideFinishedAfterHours": 24 }
```

`stores.json`：

```json
{ "stores": ["/Users/jayeluo/work/app/.kokoro-kanban"] }
```

### 5.2 写入规则

- 实体 JSON 一律先写同目录下随机命名的临时文件，再 rename 覆盖，保证读端不会读到半个文件。
- 更新是“读取、修改、原子写回”，同一文件以最后一次写入为准。
- 进度 JSONL 只追加，每次一行。
- 归档时把实体文件（job 还包括进度和日志文件）移到 `archive/` 下对应目录。只有已结束的实体可以归档：`ended` 的 session、非 `running` 或已 lost 的 job、`done` 或 `dropped` 的 goal、`resolved` 的 ask。

### 5.3 写入时选择哪个存储

按优先级：

1. `--store <dir>` 参数
2. `KOKORO_STORE` 环境变量
3. 从当前目录向上查找到的最近一个 `.kokoro-kanban/` 目录（全局目录本身除外）
4. 全局存储：`KOKORO_HOME` 环境变量指定的目录，默认 `~/.kokoro-kanban/`，不存在时自动创建

在项目里执行一次 `kokoro init`，这个项目就改用本地存储；不执行就默认写全局。写入项目存储时，自动把它登记到全局的 `stores.json`。

### 5.4 读取时看哪些存储

`kokoro board` 和 `kokoro status` 默认读取全局存储加上 `stores.json` 里登记的所有项目存储，按 `project` 分组。加 `--here` 时只显示 `project` 等于当前项目的内容。当前项目的判定：向上找到项目存储就用它所在的目录，否则用当前工作目录。登记过但已不存在的目录静默跳过。

## 6. 命令行接口

通用约定：

- 写入命令校验参数后原子写入，新建实体时在 stdout 打印 ID。
- 出错时退出码非零，stderr 打印一句可以照着修正的提示；ID 不存在时提示可以先执行 `kokoro status` 查看。
- 所有命令支持 `--json` 输出。
- 除 `board` 外的命令都不加载 Ink 和 React，以保证启动快。
- 可执行文件名为 `kokoro`，同时提供别名 `kokoro-kanban`。

```
kokoro session start --agent <codex|claude|cursor|other> --title "<标题>" [--id <自定义ID>] [--summary "..."]
kokoro session update <sid> [--status working|waiting|idle] [--summary "..."] [--title "..."]
kokoro session end <sid> [--summary "..."]

kokoro goal add [--session <sid>] --title "<标题>" [--step "<步骤>"]...
kokoro goal step <gid> --add "<步骤>"
kokoro goal step <gid> --set <序号>=<todo|doing|done|blocked>
kokoro goal done <gid>
kokoro goal drop <gid>

kokoro job start [--session <sid>] --title "<标题>" [--pid <N>] [--log <path>] [--command "<命令>"]
kokoro job progress <jid> [--pct <N>] [--done <N>] [--total <N>] [--unit <单位>] [--msg "..."]
kokoro job end <jid> --state done|failed|cancelled [--exit-code <N>] [--msg "..."]
kokoro run [--session <sid>] --title "<标题>" [--detach] -- <cmd> [args...]

kokoro ask add [--session <sid>] --kind question|blocked|approval|review "<正文>"
kokoro ask resolve <aid>

kokoro archive <id>...
kokoro status [--here] [--json]
kokoro doctor
kokoro init
kokoro skill install --target codex|claude|cursor
kokoro [board] [--here] [--panel needs|sessions|jobs|goals]
```

补充说明：

- `kokoro -h` 是英文帮助：commander 生成的命令列表之后，追加 “Store resolution” 一段（写入时的存储解析顺序）和 “Typical agent flow” 一段（从 `session start` 到 `session end` 的五条示例命令）。命令组的参数在下一层查看，如 `kokoro job progress -h`。
- `job start` 打印 job ID；加 `--json` 时返回 `{"id", "progress_file", "log"}`，方便不经过 `kokoro run` 启动的进程直接追加进度行。
- `session start --id` 用于 agent 想用自己的会话 ID 的情况，ID 须匹配 `[A-Za-z0-9._-]{1,64}`；ID 已存在时视为恢复，把 `status` 设为 `working`、`ended_at` 清空，不报错。
- 除 `session end` 外，任何带 `--session` 的写入命令都会顺带刷新该 session 的 `updated_at`；agent 主动执行的 `goal step/done/drop` 和 `ask resolve` 也会刷新所属 session。`job progress` 和 `job end` 不刷新，因为它们通常来自后台脚本，不代表 agent 本身在活动。
- `ask add` 的正文是可变参数，未加引号的多个词会用空格拼起来；`run --title` 可省略，默认取命令行前 80 个字符。
- 写入项目存储后登记到全局 `stores.json` 失败时（常见于 agent 沙箱不允许写 `~/.kokoro-kanban`），只在 stderr 警告一次，写入本身照常完成。
- 不在终端里执行 `kokoro` / `kokoro board` 时（stdin 或 stdout 不是 TTY），在 stderr 提示一句，然后打印 `kokoro status` 的内容并退出，避免 agent 误调用时卡住。
- `kokoro doctor` 列出解析失败的文件（路径和原因）以及登记了但已不存在的项目存储。
- `kokoro skill install` 把 `skills/kokoro-kanban/SKILL.md` 复制到 `~/.codex/skills/kokoro-kanban/`、`~/.claude/skills/kokoro-kanban/` 或 `~/.cursor/skills/kokoro-kanban/`。

## 7. `kokoro run` 包装器

1. 创建 job，写入 `command`、`host`、`pid`（包装进程自身）、`started_at`，`state` 为 `running`。
2. 启动子进程，把 `child_pid` 写回 job。子进程的 stdout 和 stderr 同时写入 `jobs/<id>.log` 和包装进程自己的 stdout/stderr。
3. 给子进程注入环境变量 `KOKORO_JOB`（job ID）、`KOKORO_STORE`（存储目录）、`KOKORO_PROGRESS_FILE`（进度 JSONL 路径），脚本可以调用 `kokoro job progress "$KOKORO_JOB" --pct 30`，也可以直接追加一行 JSON。
4. 子进程退出后写入 `exit_code`、`ended_at`，退出码为 0 时 `state` 为 `done`，否则为 `failed`；被信号杀死时 `exit_code` 为 `null`，`message` 记录信号名，`state` 为 `failed`。
5. 包装进程收到 SIGINT 或 SIGTERM 时，先转发给子进程，等它退出后把 `state` 记为 `cancelled`。
6. 包装进程的退出码与子进程一致。
7. `--detach`：前台进程先创建 job，再以分离模式（新进程组，stdio 不继承）启动一个负责执行该 job 的后台包装进程，`pid` 记录这个后台包装进程，然后立刻打印 job ID 并返回 0。此时子进程输出只写日志文件。

第一版不解析命令输出里的进度。

## 8. Skill

位置：`skills/kokoro-kanban/SKILL.md`。同一份文件适用于 Codex、Claude Code、Cursor。约定如下：

- 会话开始时执行 `kokoro session start --id "$SID"`，之后所有命令都带 `--session "$SID"`，agent 不需要记 ID，恢复会话时也不会产生重复卡片。`$SID` 取宿主注入的环境变量：Codex 是 `CODEX_THREAD_ID`（0.95.0 起），Claude Code 是 `CLAUDE_CODE_SESSION_ID`，Cursor 是 `CURSOR_CONVERSATION_ID`。都没有时不传 `--id`，记住返回的 `s-xxxx`。
- 确定目标或计划变化时，执行 `goal add` 或 `goal step`；开始做某一步时把它设为 `doing`，做完设为 `done`。
- 预计超过约 1 分钟的命令（下载、训练、构建、完整测试）用 `kokoro run` 包装，需要后台运行时加 `--detach`，之后可以读日志文件查看输出。
- 卡住或需要人做决定时执行 `kokoro ask add`；人在对话里答复后执行 `kokoro ask resolve`。
- 等待人输入时把 session 状态设为 `waiting`；会话完成时执行 `session end`。
- 只在状态发生变化时上报，不要为了心跳反复执行命令。
- 人问“进度怎么样”时，可以执行 `kokoro status` 来回答。

## 9. TUI（`kokoro board`）

### 9.1 总览布局

```
 kokoro-kanban   3 sessions · 2 jobs running · 1 needs you            14:32
┌ Needs you (1) ─────────────────────────────────────────────────────────┐
│ ▶ a-9d0e approval  s-7f3a 重构登录  要不要删掉旧的 session 表？     5m │
└────────────────────────────────────────────────────────────────────────┘
┌ Sessions ─────────────────────────┐┌ Jobs ──────────────────────────────┐
│ ~/work/app                        ││ j-2c91 下载模型   ████████░░  78%  │
│  ● s-7f3a codex  working   2m     ││        1.2/1.6 GB · 12m · s-1b2c   │
│    正在改 auth middleware          ││ j-4e5f 跑测试     running     3m   │
│  ◐ s-1b2c claude waiting   8m     ││ ✗ j-77aa 构建     failed exit 1    │
│ ~/school/thesis                   ││ ? j-8812 爬数据   lost        1h   │
│  ○ s-c3d4 cursor idle     41m 旧  ││                                    │
└───────────────────────────────────┘└────────────────────────────────────┘
┌ Goals / Next ──────────────────────────────────────────────────────────┐
│ g-1b2c 登录重构 (s-7f3a)  doing: 迁移 middleware · next: 补测试        │
│   [x] 梳理现状  [~] 迁移 middleware  [ ] 补测试  [!] 等确认表结构      │
└────────────────────────────────────────────────────────────────────────┘
 tab 切面板  j/k 移动  enter 详情  x 关闭事项  a 归档  p 项目  . 全部  1-4 单面板  q 退出
```

终端宽度小于 100 列时改为单列，四个面板自上而下排列。

### 9.2 单面板模式

- 按 `1`、`2`、`3`、`4` 分别把 Needs you、Sessions、Jobs、Goals 放大为全屏显示，按 `0` 回到总览。
- 单面板模式下，`tab` 或左右方向键切换到上一个或下一个面板。
- `--panel <名称>` 让看板直接以单面板模式启动。

### 9.3 按键

| 按键 | 作用 |
|---|---|
| `tab` / `shift+tab` | 总览模式下切换焦点面板 |
| `j` / `k` 或上下方向键 | 在当前面板内移动选中项 |
| `enter` | 打开详情；`esc` 返回 |
| `x` | 关闭选中的 ask |
| `a` | 归档选中的已结束实体 |
| `p` | 在“全部项目”和各个项目之间循环筛选 |
| `.` | 切换是否显示结束超过 `hideFinishedAfterHours` 的条目 |
| `1`–`4` / `0` | 进入单面板模式 / 回到总览 |
| `q` / `ctrl+c` | 退出 |

详情视图：

- **job**：基本信息，以及日志文件最后 30 行，日志变化时跟随刷新。
- **ask**：全文。
- **session**：名下的 goals、jobs、asks。
- **goal**：所有步骤。

默认隐藏结束超过 `hideFinishedAfterHours`（默认 24 小时）的条目：`ended` 的 session 和非 `running` 的 job 按 `ended_at` 计，`done` 或 `dropped` 的 goal 按 `updated_at` 计，`resolved` 的 ask 按 `resolved_at` 计。

### 9.4 热加载

- 用 chokidar 监听所有被读取的存储目录（不含 `archive/`）；同一文件的变更做 100ms 防抖，只重新读取变化的文件。
- `stores.json` 变化时重新计算监听目录。
- 每 2 秒重新计算与时间相关的状态：相对时间、stale、lost（存活检查用 `process.kill(pid, 0)`）。
- 文件监听报错时（如文件描述符耗尽、沙箱限制），改为每 2 秒全量重新读取一次所有存储，保证看板不会悄悄停止更新。

## 10. 错误处理

| 情况 | 处理 |
|---|---|
| 实体文件解析失败或不符合 schema | 跳过；看板底栏显示失败文件数；`kokoro doctor` 列出详情 |
| 进度 JSONL 有坏行 | 跳过该行 |
| 登记的项目存储已不存在 | 读取时静默跳过；`kokoro doctor` 报告 |
| 写入命令的 ID 不存在或参数不合法 | 退出码 1，stderr 给出提示 |
| 存储目录不可写 | 退出码 1，提示具体路径 |
| ask 文件被 agent 和 TUI 同时修改 | 以最后一次写入为准，接受这个低概率情况 |
| `kokoro run` 的命令不存在 | 记为 `failed`，`message` 写明原因，退出码 127 |

## 11. 技术栈与代码结构

TypeScript，Node 22.22+，ESM。依赖：commander 15、zod 4、ink 8、react 19、chokidar 6。开发依赖：typescript、tsup、tsx、vitest、ink-testing-library。v1 通过 `npm link` 在本地安装。

```
src/model/    类型、zod schema、推算状态（纯函数）
src/store/    存储解析、原子读写、注册表、文件监听、快照加载
src/cli/      commander 命令定义，每类实体一个文件
src/runner/   kokoro run：启动子进程、日志双写、记录退出、detach
src/tui/      Ink 应用、各个面板、按键处理
skills/kokoro-kanban/SKILL.md
```

`kokoro status` 和 `kokoro board` 共用 `src/store` 里的快照加载和 `src/model` 里的推算逻辑，保证两边显示一致。

## 12. 测试

使用 vitest。

- **model**：进度行合并、stale 和 lost 推算、步骤状态变更、ID 格式。
- **store**：在临时目录中设置 `KOKORO_HOME`，测原子写入、存储解析优先级、`stores.json` 登记、归档、坏文件跳过。
- **CLI**：对临时存储执行构建产物，检查生成的文件、stdout 和退出码。
- **run**：成功、失败、命令不存在、通过环境变量上报进度、SIGTERM 记为 cancelled、`--detach` 立刻返回、包装进程被 `kill -9` 后读取端显示 lost。
- **TUI**：用 ink-testing-library 以 fixture 渲染各面板和单面板模式；热加载测试向存储写入文件并断言画面更新。

## 13. 不在本次范围内（后续方向）

- 在看板里直接回复，并让回复进入 agent 对话（通过 Claude Code、Codex 的 hooks 自动注入，或 tmux send-keys）
- 打包成 Codex、Claude Code 插件，提供 MCP 接口
- 被动数据源：读取 `~/.codex/goals_1.sqlite`、agent 的会话 JSONL
- 第三方工具的进度接入（如 `hf download`、curl、pip）。v1 只把输出写进日志。不采用“取输出最后一行的百分比”这种通用解析，因为这类工具常常同时显示多条进度条（总进度和每个文件各一条），会读到错误的数字。可选思路，按可靠程度从低到高：
  - 按工具写解析器（`kokoro run --adapter <工具>`）：信息最细，但工具升级后容易失效。
  - 探测外部状态：定期统计目标目录大小或文件数，除以事先查到的总量（hf 可通过 API 查到文件大小）。与输出格式无关，倾向作为下载类任务的主方案。
  - 库级别回调：Python 脚本调用 `snapshot_download` 等 API 时，传入自定义 tqdm 类把进度转给 kokoro，只适用于调用库的场景。
- 输出标记行：脚本打印 `::kokoro done=2 total=3` 这样的行，由 `kokoro run` 识别后写入进度文件
- Web 和 GUI 界面
- 跨机器同步
