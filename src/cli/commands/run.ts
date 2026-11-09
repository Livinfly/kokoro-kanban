import { displayCommand, execJob, spawnDetachedExec } from '../../runner/run.js';
import { logPath } from '../../store/paths.js';
import { action, type App } from '../context.js';
import { createJob } from './job.js';

type RunOpts = { session?: string; title?: string; detach?: boolean };

export function registerRun(app: App): void {
  app.program
    .command('run <cmd...>')
    .description('run a command as a tracked job (put -- before the command)')
    .option('--session <sid>', 'owning session')
    .option('--title <title>', 'what the job does (defaults to the command)')
    .option('--detach', 'run in the background and print the job id right away')
    .addHelpText(
      'after',
      '\nThe command gets KOKORO_JOB, KOKORO_STORE and KOKORO_PROGRESS_FILE in its environment.\n' +
        'Example:\n  $ kokoro run --session s-7f3a --title "download model" --detach -- hf download org/model',
    )
    .action(
      action(app, async (ctx, argv: string[], opts: RunOpts) => {
        const store = ctx.target.dir;
        const command = displayCommand(argv);
        const created = createJob(ctx, {
          session: opts.session ?? null,
          title: opts.title ?? command.slice(0, 80),
          command,
          pid: null,
          log: null,
        });
        const job = { ...created, log: logPath(store, created.id) };
        ctx.save(store, 'job', job);

        if (opts.detach) {
          spawnDetachedExec({ store, jobId: job.id, argv, env: ctx.io.env, cwd: ctx.io.cwd });
          ctx.out(job.id, job);
          return;
        }
        ctx.setExit(await execJob({ store, jobId: job.id, argv, tee: true, env: ctx.io.env }));
      }),
    );

  app.program
    .command('__exec-job <jid> <cmd...>', { hidden: true })
    .action(
      action(app, async (ctx, jid: string, argv: string[]) => {
        ctx.setExit(await execJob({ store: ctx.target.dir, jobId: jid, argv, tee: false, env: ctx.io.env }));
      }),
    );
}
