import { Option } from 'commander';
import { ASK_KINDS, type Ask } from '../../model/schema.js';
import { action, type App } from '../context.js';

type AddOpts = { session?: string; kind: Ask['kind'] };

export function registerAsk(app: App): void {
  const ask = app.program.command('ask').description('raise or resolve something that needs you');

  ask
    .command('add <text...>')
    .description('flag something that needs the human')
    .option('--session <sid>', 'owning session')
    .addOption(new Option('--kind <kind>', 'what you need').choices(ASK_KINDS).makeOptionMandatory())
    .action(
      action(app, (ctx, words: string[], opts: AddOpts) => {
        const session = opts.session ? ctx.touchSession(opts.session) : null;
        const created: Ask = {
          v: 1,
          id: ctx.allocateId('ask'),
          session: session?.id ?? null,
          project: ctx.projectFor(session?.project ?? null),
          kind: opts.kind,
          text: words.join(' '),
          state: 'open',
          created_at: ctx.now(),
          resolved_at: null,
        };
        ctx.save(ctx.target.dir, 'ask', created);
        ctx.out(created.id, created);
      }),
    );

  ask
    .command('resolve <aid>')
    .description('close an ask once it has been answered')
    .action(
      action(app, (ctx, aid: string) => {
        const { store, entity } = ctx.find('ask', aid);
        const next: Ask = { ...entity, state: 'resolved', resolved_at: ctx.now() };
        ctx.save(store, 'ask', next);
        ctx.touchSessionIfExists(next.session);
        ctx.out(next.id, next);
      }),
    );
}
