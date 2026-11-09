---
name: kokoro-kanban
description: Report what this agent session is doing to the local kokoro-kanban board - session status, goals and next steps, background jobs, and things that need the human. Use at session start, when the plan changes, before long-running commands, when blocked or needing a decision, when finishing, and when the user asks about progress.
---

# kokoro-kanban

The user watches a live terminal board (`kokoro board`) that shows every agent session, background job and open question across their projects. You keep your part of it current with the `kokoro` CLI. Each command is one small atomic write: run it, don't narrate it.

## Your session id

Use the id your host already gives you, so you never have to remember one:

| Host        | Variable                  |
| ----------- | ------------------------- |
| Codex       | `$CODEX_THREAD_ID`        |
| Claude Code | `$CLAUDE_CODE_SESSION_ID` |
| Cursor      | `$CURSOR_CONVERSATION_ID` |

Below, `$SID` stands for that variable. If none is set, run `kokoro session start` without `--id` and remember the `s-xxxx` id it prints.

## When to report

1. **Session start, or resuming a session**

   ```bash
   kokoro session start --id "$SID" --agent codex --title "<what this session is about>"
   ```

   `--agent` is one of `codex`, `claude`, `cursor`, `other`. Running it again with the same id resumes the card.

2. **You settle on a plan, or the plan changes**

   ```bash
   kokoro goal add --session "$SID" --title "<goal>" --step "<step 1>" --step "<step 2>"   # prints g-xxxx
   kokoro goal step <gid> --set 1=doing                  # starting step 1
   kokoro goal step <gid> --set 1=done --set 2=doing     # moving on
   kokoro goal step <gid> --add "<new step>"             # plan grew
   kokoro goal done <gid>                                # or: kokoro goal drop <gid>
   ```

   Step statuses: `todo`, `doing`, `done`, `blocked`. Steps are numbered from 1.

3. **Any command likely to take more than about a minute** (downloads, training, full builds, full test suites): wrap it.

   ```bash
   kokoro run --session "$SID" --title "<what it does>" -- <command> [args...]
   kokoro run --session "$SID" --title "<what it does>" --detach -- <command> [args...]   # background, prints j-xxxx
   ```

   The `--` before the command is required. With `--detach` the output goes to the job's log file (`kokoro status --json` lists it under `jobs[].log`); check on it later with `kokoro status`.

   Scripts you write can report progress, which the board turns into a progress bar:

   ```bash
   kokoro job progress "$KOKORO_JOB" --done 3 --total 10 --unit files --msg "parsing batch 3"
   echo '{"pct": 30, "msg": "epoch 1/3"}' >> "$KOKORO_PROGRESS_FILE"
   ```

   For a process started some other way: `kokoro job start --session "$SID" --title "..." --pid <pid> --log <file>`, then `kokoro job end <jid> --state done|failed|cancelled`.

4. **You are blocked, or need the human to decide, approve or review**

   ```bash
   kokoro ask add --session "$SID" --kind question "<what you need, one or two sentences>"
   kokoro session update "$SID" --status waiting     # only if you stop and wait
   ```

   Kinds: `question`, `blocked`, `approval`, `review`. After the user answers in the conversation, run `kokoro ask resolve <aid>` and `kokoro session update "$SID" --status working`.

5. **What you are doing changed in a way worth showing**

   ```bash
   kokoro session update "$SID" --summary "<what you are doing now>"
   ```

6. **The work is done**

   ```bash
   kokoro session end "$SID" --summary "<outcome>"
   ```

## When the user asks about progress

Run `kokoro status` (or `kokoro status --here` for just this project) and answer from it, including background jobs and their latest progress.

## Rules

- Report state changes only. No heartbeats, no reporting every small edit. A typical session runs 5-20 kokoro commands.
- Keep titles short. Write titles, summaries and asks in the language the user is using.
- Do not run `kokoro` or `kokoro board` with no subcommand; that is the human's TUI.
- If a kokoro command fails, read its one-line error, fix the arguments once, and carry on with the real task. Reporting must never block the work.
- Any command accepts `--json` for machine-readable output.

## Where data goes, and sandboxes

Writes go to the nearest `.kokoro-kanban/` directory above the current directory, otherwise to `~/.kokoro-kanban/`. If your sandbox denies writing to `~/.kokoro-kanban`, tell the user once and suggest either running `kokoro init` in the project (a project store lives inside the workspace) or allowing writes to `~/.kokoro-kanban`.
