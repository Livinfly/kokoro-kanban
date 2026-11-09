import { Option } from 'commander';
import { isCustomId } from '../../model/ids.js';
import { AGENTS, type Session } from '../../model/schema.js';
import { action, type App, KokoroError } from '../context.js';

type StartOpts = { agent: Session['agent']; title: string; id?: string; summary?: string };
type UpdateOpts = { status?: Session['status']; summary?: string; title?: string };

export function registerSession(app: App): void {
  const session = app.program.command('session').description('start / update / end an agent session');

  session
    .command('start')
    .description('register an agent session; reusing an existing --id resumes it')
    .addOption(new Option('--agent <agent>', 'which agent this is').choices(AGENTS).makeOptionMandatory())
    .requiredOption('--title <title>', 'what this session is about')
    .option('--id <id>', 'use your own session id (1-64 of A-Z a-z 0-9 . _ -)')
    .option('--summary <text>', 'one line on what you are doing now')
    .action(
      action(app, (ctx, opts: StartOpts) => {
        const now = ctx.now();
        if (opts.id !== undefined) {
          if (!isCustomId(opts.id)) {
            throw new KokoroError(`invalid session id "${opts.id}": use 1-64 of A-Z a-z 0-9 . _ -`);
          }
          const found = ctx.locate('session', opts.id);
          if (found) {
            const resumed: Session = {
              ...found.entity,
              agent: opts.agent,
              title: opts.title,
              summary: opts.summary ?? found.entity.summary,
              status: 'working',
              updated_at: now,
              ended_at: null,
            };
            ctx.save(found.store, 'session', resumed);
            ctx.out(resumed.id, resumed);
            return;
          }
        }
        const created: Session = {
          v: 1,
          id: opts.id ?? ctx.allocateId('session'),
          agent: opts.agent,
          title: opts.title,
          project: ctx.projectFor(null),
          status: 'working',
          summary: opts.summary ?? null,
          started_at: now,
          updated_at: now,
          ended_at: null,
        };
        ctx.save(ctx.target.dir, 'session', created);
        ctx.out(created.id, created);
      }),
    );

  session
    .command('update <sid>')
    .description('change status or summary (also refreshes the last-update time)')
    .addOption(new Option('--status <status>', 'current state').choices(['working', 'waiting', 'idle']))
    .option('--summary <text>', 'one line on what you are doing now')
    .option('--title <title>', 'rename the session')
    .action(
      action(app, (ctx, sid: string, opts: UpdateOpts) => {
        const { store, entity } = ctx.find('session', sid);
        const next: Session = {
          ...entity,
          status: opts.status ?? entity.status,
          summary: opts.summary ?? entity.summary,
          title: opts.title ?? entity.title,
          updated_at: ctx.now(),
          ended_at: opts.status ? null : entity.ended_at,
        };
        ctx.save(store, 'session', next);
        ctx.out(next.id, next);
      }),
    );

  session
    .command('end <sid>')
    .description('mark the session as ended')
    .option('--summary <text>', 'final one-line summary')
    .action(
      action(app, (ctx, sid: string, opts: { summary?: string }) => {
        const { store, entity } = ctx.find('session', sid);
        const now = ctx.now();
        const next: Session = {
          ...entity,
          status: 'ended',
          summary: opts.summary ?? entity.summary,
          updated_at: now,
          ended_at: now,
        };
        ctx.save(store, 'session', next);
        ctx.out(next.id, next);
      }),
    );
}
