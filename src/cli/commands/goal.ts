import { STEP_STATUSES, type Goal, type Step } from '../../model/schema.js';
import { action, type App, type CliContext, KokoroError } from '../context.js';
import { collect } from '../parse.js';

type AddOpts = { session?: string; title: string; step: string[] };
type StepOpts = { add: string[]; set: string[] };

function applySet(steps: Step[], spec: string): Step[] {
  const match = /^(\d+)=(\w+)$/.exec(spec);
  if (!match) throw new KokoroError(`--set expects <n>=<status>, got "${spec}"`);
  const index = Number(match[1]);
  const status = match[2] as Step['status'];
  if (!STEP_STATUSES.includes(status)) {
    throw new KokoroError(`unknown step status "${status}"; use ${STEP_STATUSES.join(', ')}`);
  }
  if (index < 1 || index > steps.length) {
    throw new KokoroError(`step ${index} does not exist; the goal has ${steps.length} step(s)`);
  }
  return steps.map((s, i) => (i === index - 1 ? { ...s, status } : s));
}

function updateGoal(ctx: CliContext, gid: string, change: (g: Goal) => Goal): void {
  const { store, entity } = ctx.find('goal', gid);
  const next = { ...change(entity), updated_at: ctx.now() };
  ctx.save(store, 'goal', next);
  ctx.touchSessionIfExists(next.session);
  ctx.out(next.id, next);
}

export function registerGoal(app: App): void {
  const goal = app.program.command('goal').description('manage goals and their next steps');

  goal
    .command('add')
    .description('create a goal with ordered steps')
    .option('--session <sid>', 'owning session')
    .requiredOption('--title <title>', 'what you are trying to achieve')
    .option('--step <text>', 'a step (repeatable, in order)', collect, [])
    .action(
      action(app, (ctx, opts: AddOpts) => {
        const session = opts.session ? ctx.touchSession(opts.session) : null;
        const now = ctx.now();
        const created: Goal = {
          v: 1,
          id: ctx.allocateId('goal'),
          session: session?.id ?? null,
          title: opts.title,
          project: ctx.projectFor(session?.project ?? null),
          status: 'active',
          steps: opts.step.map((text) => ({ text, status: 'todo' })),
          created_at: now,
          updated_at: now,
        };
        ctx.save(ctx.target.dir, 'goal', created);
        ctx.out(created.id, created);
      }),
    );

  goal
    .command('step <gid>')
    .description('add steps or change step status by 1-based index')
    .option('--add <text>', 'append a step (repeatable)', collect, [])
    .option('--set <n=status>', `set step n to ${STEP_STATUSES.join('|')} (repeatable)`, collect, [])
    .action(
      action(app, (ctx, gid: string, opts: StepOpts) => {
        if (!opts.add.length && !opts.set.length) throw new KokoroError('nothing to change; pass --add or --set');
        updateGoal(ctx, gid, (g) => {
          let steps = g.steps;
          for (const spec of opts.set) steps = applySet(steps, spec);
          steps = [...steps, ...opts.add.map((text): Step => ({ text, status: 'todo' }))];
          return { ...g, steps };
        });
      }),
    );

  goal
    .command('done <gid>')
    .description('mark the goal as achieved')
    .action(action(app, (ctx, gid: string) => updateGoal(ctx, gid, (g) => ({ ...g, status: 'done' }))));

  goal
    .command('drop <gid>')
    .description('abandon the goal')
    .action(action(app, (ctx, gid: string) => updateGoal(ctx, gid, (g) => ({ ...g, status: 'dropped' }))));
}
