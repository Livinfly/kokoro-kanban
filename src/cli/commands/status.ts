import { StoreIndex } from '../../store/index.js';
import { knownStores } from '../../store/locate.js';
import { currentProject } from '../../store/paths.js';
import type { Board } from '../../view/board.js';
import { boardFrom } from '../../view/load.js';
import { renderText } from '../../view/text.js';
import { action, type App, type CliContext } from '../context.js';

export function loadBoard(ctx: CliContext, opts: { here?: boolean; showAll?: boolean } = {}): Board {
  const { stores } = knownStores(ctx.home);
  if (!stores.includes(ctx.target.dir)) stores.push(ctx.target.dir);
  const index = new StoreIndex(stores);
  index.loadAll();
  return boardFrom(index, {
    home: ctx.home,
    now: ctx.nowDate(),
    projectFilter: opts.here ? currentProject(ctx.io.cwd, ctx.home) : null,
    showAll: Boolean(opts.showAll),
  });
}

export function statusText(ctx: CliContext, opts: { here?: boolean }): { text: string; board: Board } {
  const board = loadBoard(ctx, opts);
  return { text: renderText(board, { now: ctx.nowDate(), homeDir: ctx.homeDir() }), board };
}

export function registerStatus(app: App): void {
  app.program
    .command('status')
    .description('print a plain-text snapshot of all stores')
    .option('--here', 'only the current project')
    .action(
      action(app, (ctx, opts: { here?: boolean }) => {
        const { text, board } = statusText(ctx, opts);
        ctx.out(text, board);
      }),
    );
}
