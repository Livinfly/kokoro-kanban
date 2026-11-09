import { hostname } from 'node:os';
import path from 'node:path';
import { Option } from 'commander';
import type { Job } from '../../model/schema.js';
import { appendJsonLine } from '../../store/fsutil.js';
import { progressPath } from '../../store/paths.js';
import { action, type App, type CliContext, KokoroError } from '../context.js';
import { parseInteger, parseNumber } from '../parse.js';

type StartOpts = { session?: string; title: string; pid?: number; log?: string; command?: string };
type ProgressOpts = { pct?: number; done?: number; total?: number; unit?: string; msg?: string };
type EndOpts = { state: Job['state']; exitCode?: number; msg?: string };

export function createJob(
  ctx: CliContext,
  opts: { session: string | null; title: string; command: string | null; pid: number | null; log: string | null },
): Job {
  const session = opts.session ? ctx.touchSession(opts.session) : null;
  const now = ctx.now();
  const job: Job = {
    v: 1,
    id: ctx.allocateId('job'),
    session: session?.id ?? null,
    title: opts.title,
    project: ctx.projectFor(session?.project ?? null),
    command: opts.command,
    host: hostname(),
    pid: opts.pid,
    child_pid: null,
    state: 'running',
    exit_code: null,
    message: null,
    log: opts.log,
    started_at: now,
    updated_at: now,
    ended_at: null,
  };
  ctx.save(ctx.target.dir, 'job', job);
  return job;
}

export function registerJob(app: App): void {
  const job = app.program.command('job').description('report background job progress manually');

  job
    .command('start')
    .description('register a job started outside `kokoro run`')
    .option('--session <sid>', 'owning session')
    .requiredOption('--title <title>', 'what the job does')
    .option('--pid <n>', 'process id to watch for liveness', parseInteger)
    .option('--log <path>', 'log file to show in the board')
    .option('--command <cmd>', 'command line, for display')
    .action(
      action(app, (ctx, opts: StartOpts) => {
        const created = createJob(ctx, {
          session: opts.session ?? null,
          title: opts.title,
          command: opts.command ?? null,
          pid: opts.pid ?? null,
          log: opts.log ? path.resolve(ctx.io.cwd, opts.log) : null,
        });
        ctx.out(created.id, { ...created, progress_file: progressPath(ctx.target.dir, created.id) });
      }),
    );

  job
    .command('progress <jid>')
    .description('append a progress update (last value of each field wins)')
    .option('--pct <n>', 'percent complete, 0-100', parseNumber)
    .option('--done <n>', 'units done', parseNumber)
    .option('--total <n>', 'units in total', parseNumber)
    .option('--unit <name>', 'unit name, e.g. files, GB, epoch')
    .option('--msg <text>', 'one status line')
    .action(
      action(app, (ctx, jid: string, opts: ProgressOpts) => {
        const line = Object.fromEntries(
          Object.entries({ pct: opts.pct, done: opts.done, total: opts.total, unit: opts.unit, msg: opts.msg }).filter(
            ([, v]) => v !== undefined,
          ),
        );
        if (!Object.keys(line).length) throw new KokoroError('nothing to report; pass --pct, --done, --total, --unit or --msg');
        const { store } = ctx.find('job', jid);
        const entry = { ...line, at: ctx.now() };
        appendJsonLine(progressPath(store, jid), entry);
        ctx.out(jid, entry);
      }),
    );

  job
    .command('end <jid>')
    .description('record how the job finished')
    .addOption(new Option('--state <state>', 'final state').choices(['done', 'failed', 'cancelled']).makeOptionMandatory())
    .option('--exit-code <n>', 'process exit code', parseInteger)
    .option('--msg <text>', 'final message')
    .action(
      action(app, (ctx, jid: string, opts: EndOpts) => {
        const { store, entity } = ctx.find('job', jid);
        const now = ctx.now();
        const next: Job = {
          ...entity,
          state: opts.state,
          exit_code: opts.exitCode ?? entity.exit_code,
          message: opts.msg ?? entity.message,
          updated_at: now,
          ended_at: now,
        };
        ctx.save(store, 'job', next);
        ctx.out(next.id, next);
      }),
    );
}
