# kokoro-kanban v1 Implementation Plan

> **For agentic workers:** Execute task-by-task with superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax. Each task is test-first: write the listed tests, watch them fail, implement, watch them pass, commit.
>
> Deviation from the default plan format (agreed with the user, who prefers iterating directly in code): tasks specify files, exact interfaces and test cases, but implementation code is written during execution rather than duplicated here.

**Goal:** Build the `kokoro` CLI and TUI described in `docs/superpowers/specs/2026-11-09-kokoro-kanban-design.md`.

**Architecture:** Agents call `kokoro` subcommands that validate input and atomically write JSON / JSONL files into a store directory. A `StoreIndex` loads all known stores into memory and refreshes single files on change; `kokoro status` and the Ink TUI both render a `Board` view model built from that index, so they always agree.

**Tech Stack:** TypeScript (ESM), Node 22, commander, zod, ink 6 + react 19, chokidar 4; tsup, tsx, vitest, ink-testing-library.

## Global Constraints

- Node >= 22, ESM only, package name `kokoro-kanban`, bins `kokoro` and `kokoro-kanban`.
- Every entity file has `"v": 1`; timestamps are UTC ISO 8601 strings.
- IDs: kind prefix (`s-`, `j-`, `g-`, `a-`) + 4 lowercase base36 chars. Custom session IDs match `^[A-Za-z0-9._-]{1,64}$`.
- Global store: `$KOKORO_HOME` or `~/.kokoro-kanban`. Project store dir name: `.kokoro-kanban`.
- Write-store resolution: `--store` > `$KOKORO_STORE` > nearest `.kokoro-kanban/` walking up from cwd (excluding the global store) > global.
- Defaults: `staleAfterMinutes` 30, `hideFinishedAfterHours` 24.
- Non-`board` commands must not import ink/react.
- Help text and UI chrome in English.
- Errors: exit code 1, one-line `kokoro: <message>` on stderr; `kokoro run` exit code mirrors the child (127 when the command is missing, 128+N when killed by signal N).

## File Structure

```
package.json, tsconfig.json, tsup.config.ts, vitest.config.ts
src/bin.ts                    entry: calls main(process.argv.slice(2), realIO)
src/model/schema.ts           zod schemas + types for Session/Job/Goal/Ask, kinds, ProgressLine
src/model/ids.ts              newId, isCustomId, kindOfId
src/model/progress.ts         foldProgress
src/model/derive.ts           DeriveCtx, isStale, isLost, isFinished, finishedAt
src/store/fsutil.ts           writeJsonAtomic, readJsonFile, appendJsonLine, readTail
src/store/paths.ts            homeStore, findProjectStore, resolveWriteStore, entityPath, progressPath, logPath
src/store/config.ts           readConfig
src/store/registry.ts         readRegistry, registerStore
src/store/repo.ts             readEntity, writeEntity, listEntities, archiveEntity
src/store/index.ts            StoreIndex (loadAll, refreshPath, snapshot)
src/store/locate.ts           knownStores, locateEntity
src/view/board.ts             buildBoard -> Board view model
src/view/format.ts            age, tildify, progressText, statusText
src/cli/main.ts               main(argv, io), KokoroError, global options, help text
src/cli/context.ts            CliContext (io, now, store target, write helpers)
src/cli/commands/*.ts         session, goal, job, ask, run, archive, status, doctor, init, skill, board
src/runner/run.ts             runForeground, runDetached, execJob
src/tui/index.tsx             startBoard(opts)
src/tui/useBoard.ts           hook: StoreIndex + chokidar + 2s tick
src/tui/ui-state.ts           pure UI reducer (focus, selection, mode, filters)
src/tui/components/*.tsx      Header, Panels, Detail, Footer, BoardView
skills/kokoro-kanban/SKILL.md
tests/**                      vitest suites mirroring src
```

---

### Task 1: Scaffold + model

**Files:** create `package.json`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`, `src/model/{schema,ids,progress,derive}.ts`, `tests/model/*.test.ts`.

**Interfaces (produces):**
- `KINDS = ['session','job','goal','ask']`, `type Kind`, `KIND_DIR: Record<Kind,string>` (`sessions`, `jobs`, `goals`, `asks`), `KIND_PREFIX` (`s`,`j`,`g`,`a`).
- `SessionSchema`, `JobSchema`, `GoalSchema`, `AskSchema`, `SCHEMAS: Record<Kind, ZodSchema>`; types `Session`, `Job`, `Goal`, `Ask`, `Entity`.
- `newId(kind: Kind, exists: (id: string) => boolean, rand?: () => number): string`
- `isCustomId(id: string): boolean`; `kindOfId(id: string): Kind | undefined`
- `type Progress = { pct: number|null; done: number|null; total: number|null; unit: string|null; msg: string|null; at: string|null }`
- `foldProgress(lines: string[], fallbackAt?: string|null): Progress`
- `type DeriveCtx = { now: Date; host: string; isAlive: (pid: number) => boolean; staleAfterMs: number }`
- `sessionStale(s: Session, ctx): boolean`; `jobLastUpdate(j: Job, p: Progress): string`; `jobLost(j: Job, ctx): boolean`; `jobStale(j: Job, p: Progress, ctx): boolean`
- `isFinished(kind, entity, ctx): boolean`; `finishedAt(kind, entity): string | null`

**Tests:**
- [ ] ids: `newId('job', ...)` matches `/^j-[0-9a-z]{4}$/`; retries when `exists` returns true first; `isCustomId` accepts `abc-1.2_x`, rejects `a/b`, empty, 65 chars; `kindOfId('g-12ab') === 'goal'`, `kindOfId('custom') === undefined`.
- [ ] schema: a valid session parses; `status: 'bogus'` fails; job with `pid: null` parses.
- [ ] progress: later fields override earlier; `pct` derived from `done/total` (2/8 → 25); pct clamped to [0,100]; bad JSON lines and blank lines skipped; `at` falls back to `fallbackAt`; empty input → all null.
- [ ] derive: working session older than threshold is stale, waiting is never stale, ended never stale; running job on this host with dead pid is lost; other host or null pid is never lost; done job never lost; running job with null pid and old last update is stale; `isFinished` per kind (ended session, non-running or lost job, done/dropped goal, resolved ask); `finishedAt` returns `ended_at` / `updated_at` / `resolved_at`.
- [ ] Run `npx vitest run tests/model` → FAIL, implement, → PASS.
- [ ] Commit `feat(model): schemas, ids, progress fold and derived states`.

### Task 2: Store layer

**Files:** `src/store/{fsutil,paths,config,registry,repo,index,locate}.ts`, `tests/store/*.test.ts`, `tests/helpers.ts` (temp dir + env factory).

**Interfaces (produces):**
- `writeJsonAtomic(file: string, data: unknown): void` (temp name `.<base>.<random>.tmp` in same dir, then rename; mkdir -p).
- `readJsonFile(file): unknown` (throws on parse error); `appendJsonLine(file, obj): void`; `readTail(file, maxBytes): string`.
- `homeStore(env): string`; `findProjectStore(cwd, home): string | null`
- `type StoreTarget = { dir: string; kind: 'global' | 'project'; projectRoot: string | null }`
- `resolveWriteStore(opts: { flag?: string; env: Env; cwd: string }): StoreTarget`
- `entityPath(store, kind, id)`, `progressPath(store, id)`, `logPath(store, id)`
- `readConfig(home): { staleAfterMinutes: number; hideFinishedAfterHours: number }`
- `readRegistry(home): string[]`; `registerStore(home, dir): void` (idempotent)
- `readEntity<K>(store, kind, id): EntityOf<K> | null`; `writeEntity(store, kind, entity): void`; `listIds(store, kind): string[]`; `archiveEntity(store, kind, id): void` (moves entity file, and for jobs the progress + log files, into `archive/<kinddir>/`).
- `type Loaded<T> = T & { store: string }`; `type LoadError = { path: string; reason: string }`
- `class StoreIndex { constructor(stores: string[]); loadAll(): void; refreshPath(path: string): boolean; snapshot(): Snapshot; stores: string[] }`, `Snapshot = { sessions: Loaded<Session>[]; jobs: (Loaded<Job> & { progress: Progress })[]; goals: Loaded<Goal>[]; asks: Loaded<Ask>[]; errors: LoadError[] }`
- `knownStores(home): { stores: string[]; missing: string[] }` (home first, then existing registry entries)
- `locateEntity(kind, id, preferred: string, home): { store: string; entity } | null`

**Tests:**
- [ ] fsutil: atomic write leaves no temp files and content round-trips; `readTail` returns only the last N bytes.
- [ ] paths: `homeStore` honours `KOKORO_HOME`; resolution order (flag beats env beats project beats global); walking up from `a/b/c` finds `a/.kokoro-kanban`; the global store is never treated as a project store even when cwd is under it; project target has `projectRoot = dirname(dir)`.
- [ ] config: defaults when missing; overrides from `config.json`; invalid JSON → defaults.
- [ ] registry: register twice → one entry; read when missing → `[]`.
- [ ] repo: write/read round-trip; `listIds` ignores temp and non-JSON files; archive moves job + progress + log.
- [ ] index: loads entities from two stores with `store` set; malformed file appears in `errors`; `refreshPath` on a new file adds it, on a deleted file removes it, on a progress file re-folds that job's progress; temp files ignored.
- [ ] locate: finds an entity in a non-preferred store; returns null when absent.
- [ ] Run `npx vitest run tests/store` → FAIL, implement, → PASS.
- [ ] Commit `feat(store): atomic file store, resolution, registry and index`.

### Task 3: Board view model + formatting

**Files:** `src/view/{board,format}.ts`, `tests/view/*.test.ts`.

**Interfaces (produces):**
- `format.age(fromIso, now): string` → `"45s"`, `"2m"`, `"3h"`, `"2d"`; `tildify(path, home)`; `progressText(p: Progress): string | null` (`"78%"`, `"1.2/1.6 GB"`, both joined with `" · "`).
- `type BoardOptions = { ctx: DeriveCtx; hideFinishedAfterMs: number; showAll: boolean; projectFilter: string | null }`
- `type SessionView = Loaded<Session> & { stale: boolean }`; `type JobView = Loaded<Job> & { progress: Progress; display: 'running'|'done'|'failed'|'cancelled'|'lost'; stale: boolean; lastUpdate: string }`; `type GoalView = Loaded<Goal> & { doneCount: number; doing: string | null; next: string | null; blocked: number }`; `type AskView = Loaded<Ask>`
- `type Board = { needs: AskView[]; sessionGroups: { project: string; sessions: SessionView[] }[]; jobs: JobView[]; goals: GoalView[]; asks: AskView[]; projects: string[]; counts: { sessions: number; running: number; needs: number }; errors: LoadError[] }`
- `buildBoard(snap: Snapshot, opts: BoardOptions): Board`
- `matchesProject(entityProject, filter)`: equal or under `filter + '/'`.

**Tests:**
- [ ] needs = open asks only, newest first.
- [ ] sessions grouped by project, groups ordered by most recent activity, ended sessions after live ones.
- [ ] jobs: running first, then lost, then finished by `ended_at` desc; `display` is `lost` when derived lost.
- [ ] hide rules: finished entities older than `hideFinishedAfterMs` hidden unless `showAll`; recent finished ones shown.
- [ ] projectFilter keeps exact and nested projects only; `projects` lists all distinct projects regardless of filter.
- [ ] goal view: `doing` = first doing step, `next` = first todo step, counts correct.
- [ ] format: age thresholds, tildify, progressText for pct-only, done/total-only, both, nothing.
- [ ] Run → FAIL, implement, → PASS. Commit `feat(view): board view model and formatting`.

### Task 4: CLI core — main, session, init, status, doctor

**Files:** `src/cli/main.ts`, `src/cli/context.ts`, `src/cli/commands/{session,init,status,doctor}.ts`, `src/bin.ts`, `tests/cli/session.test.ts`, `tests/cli/status.test.ts`, `tests/cli/harness.ts`.

**Interfaces:**
- `type IO = { cwd: string; env: Record<string,string|undefined>; stdout: (s: string) => void; stderr: (s: string) => void; now?: () => Date }`
- `main(argv: string[], io: IO): Promise<number>` — builds a fresh commander program with `exitOverride()` and `configureOutput()`; global options `--store <dir>` and `--json`; maps `KokoroError` / commander errors to exit codes.
- `class KokoroError extends Error { exitCode: number }`
- `CliContext`: `{ io, now(): string, home, target: StoreTarget, json: boolean, out(text | object), projectFor(sessionProject?: string|null): string, touchSession(id): void, requireSession(id): Loaded<Session> }`; writing to a project store registers it.
- Test harness `runCli(argv, { home, cwd, env? }) → { code, stdout, stderr }`.

**Tests:**
- [ ] `session start --agent codex --title T` prints an `s-xxxx` id; file exists in global store with `status: working`, `project = cwd`.
- [ ] `--agent bogus` → exit 1 with a message listing allowed values.
- [ ] `session start --id my.sess` creates; running it again after `session end` resumes (`working`, `ended_at` null) without error; invalid custom id → exit 1.
- [ ] `session update <id> --status waiting --summary S` updates fields and `updated_at`; unknown id → exit 1 with hint mentioning `kokoro status`.
- [ ] `session end <id>` sets `ended`, `ended_at`.
- [ ] `init` creates `<cwd>/.kokoro-kanban` and registers it; subsequent `session start` from a subdir writes there with `project = projectRoot`; `init` inside the global store's parent when it equals home → exit 1.
- [ ] `--store <dir>` and `KOKORO_STORE` override resolution.
- [ ] `--json` on create prints the entity JSON.
- [ ] `status` lists sessions grouped by tildified project; `status --json` returns the Board; `status --here` filters.
- [ ] `doctor` prints `ok` with exit 0 on a clean store; with a malformed file prints its path and exits 1; reports missing registered stores.
- [ ] Commit `feat(cli): main program, session/init/status/doctor commands`.

### Task 5: CLI — goal, job, ask, archive

**Files:** `src/cli/commands/{goal,job,ask,archive}.ts`, `tests/cli/{goal,job,ask,archive}.test.ts`.

**Tests:**
- [ ] `goal add --session S --title T --step a --step b` → `g-xxxx` with two todo steps and session's project; touches session `updated_at`; unknown session → exit 1.
- [ ] `goal step G --set 2=doing`; `--add c`; out-of-range index or bad status → exit 1; `goal done`, `goal drop`.
- [ ] `job start --title T --pid 123` writes host + pid; `--json` output includes `progress_file` and `log`.
- [ ] `job progress J --pct 40 --msg m` appends one JSONL line with `at`; no fields → exit 1; non-numeric `--pct` → exit 1.
- [ ] `job end J --state failed --exit-code 2 --msg boom` sets fields and `ended_at`.
- [ ] `ask add --session S --kind approval "text"` → `a-xxxx` open; bad kind → exit 1; `ask resolve A` sets `resolved`.
- [ ] `archive` moves an ended session; refuses a working session with exit 1; archives a job with its progress and log files.
- [ ] Commit `feat(cli): goal, job, ask and archive commands`.

### Task 6: `kokoro run` wrapper

**Files:** `src/runner/run.ts`, `src/cli/commands/run.ts` (+ hidden `__exec-job <jid> -- <cmd...>`), `tests/runner/run.test.ts`, `tests/global-setup.ts` (builds `dist/` once with tsup for process tests).

**Interfaces:**
- `runForeground(ctx, opts: { session: string|null; title: string; argv: string[] }): Promise<number>`
- `runDetached(ctx, opts): Promise<string>` — creates the job, spawns `process.execPath <bin> __exec-job <jid> --store <dir> -- <argv>` detached with ignored stdio, prints the id.
- `execJob(store, jid, argv, { tee: boolean }): Promise<number>` — shared by both: writes own `pid` and `child_pid`, opens log, injects `KOKORO_JOB`, `KOKORO_STORE`, `KOKORO_PROGRESS_FILE`, records exit; forwards SIGINT/SIGTERM and marks `cancelled`.

**Tests (spawn `node dist/bin.js` with `KOKORO_HOME` = temp dir):**
- [ ] `run --title ok -- sh -c 'echo hi'` → exit 0, stdout contains `hi`, job `done`, `exit_code 0`, log contains `hi`.
- [ ] `run -- sh -c 'exit 3'` → exit 3, job `failed`, `exit_code 3`.
- [ ] `run -- definitely-not-a-cmd` → exit 127, job `failed`, message mentions command not found.
- [ ] child calls `kokoro job progress "$KOKORO_JOB" --pct 50` and appends to `$KOKORO_PROGRESS_FILE` → both lines present, fold gives last values.
- [ ] SIGTERM to the wrapper while child sleeps → job `cancelled`.
- [ ] `--detach -- sh -c 'sleep 1; echo done'` returns within 1.5s printing the id; job later becomes `done` with log `done`.
- [ ] `--detach -- sleep 30`, wait for `pid`, `kill -9` the wrapper → `buildBoard` shows `lost` (cleanup kills the orphaned sleep).
- [ ] Commit `feat(run): tracked job wrapper with detach and signal handling`.

### Task 7: TUI

**Files:** `src/tui/{index.tsx,useBoard.ts,ui-state.ts}`, `src/tui/components/{BoardView,Header,Panel,Detail,Footer}.tsx`, `src/cli/commands/board.ts`, `tests/tui/*.test.tsx`.

**Interfaces:**
- `type PanelId = 'needs'|'sessions'|'jobs'|'goals'`; `PANELS: PanelId[]`
- `type UiState = { mode: 'overview'|'single'; focus: PanelId; selected: Record<PanelId, number>; detail: { kind: Kind; id: string } | null; projectFilter: string|null; showAll: boolean; message: string|null }`
- `initialUi(panel?: PanelId): UiState`
- `reduceKey(ui: UiState, key: KeyEvent, board: Board): { ui: UiState; effect?: { type: 'resolve'|'archive'; kind: Kind; id: string; store: string } | { type: 'quit' } }` — handles tab/shift-tab, j/k/arrows, enter/esc, 1-4/0, left/right in single mode, p, ., x, a, q.
- `itemsFor(panel, board)`: flat selectable list per panel.
- `<BoardView board ui width now home />` pure renderer; two columns for Sessions/Jobs when width >= 100, otherwise stacked; single mode renders only the focused panel.
- `useBoard({ home, here, cwd })` → `{ board, version }`: builds `StoreIndex` over `knownStores`, chokidar watch (ignore dotfiles and `archive/`), 100ms per-path debounce, 2s tick, re-reads registry on `stores.json` change.
- `startBoard(opts)`: renders `<App>`; when stdin/stdout is not a TTY, prints `kokoro status` output instead with a one-line note (so an agent that runs `kokoro` never hangs).

**Tests:**
- [ ] ui-state: tab cycles focus; `2` enters single mode on sessions, `0` returns; right arrow in single mode moves to jobs; j/k clamp to list bounds; `x` on an open ask yields a resolve effect; `a` on a running job yields no effect and sets a message; `p` cycles through `[null, ...projects]`; `.` toggles showAll.
- [ ] BoardView renders all four panel titles in overview; single mode renders only one; narrow width stacks panels; a lost job shows `lost`; a stale session shows `stale`.
- [ ] App hot reload: render App against a temp store, write a session file, frame contains its title within 2s.
- [ ] Commit `feat(tui): live board with panels, single-panel mode and actions`.

### Task 8: Help text, skill, install, README

**Files:** `skills/kokoro-kanban/SKILL.md`, `src/cli/commands/skill.ts`, help text in `src/cli/main.ts`, `README.md`, `tests/cli/help-skill.test.ts`.

**Tests:**
- [ ] `kokoro -h` output contains `Store resolution` and `Typical agent flow`; `kokoro job progress -h` lists `--pct`.
- [ ] `skill install --target codex` with `HOME` = temp dir copies SKILL.md to `~/.codex/skills/kokoro-kanban/SKILL.md`; bad target → exit 1.
- [ ] Verify which session-ID environment variables Codex / Claude Code / Cursor expose to shell commands; document the findings in SKILL.md.
- [ ] Manual smoke: `npm run build && npm link`, run a short flow in a temp project, open `kokoro board`, check it updates live.
- [ ] Commit `feat: agent skill, skill install and help text`, then `docs: README`.
