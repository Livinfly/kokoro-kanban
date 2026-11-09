import { Option } from 'commander';
import { PANELS, type PanelId } from '../../tui/panels.js';
import { action, type App } from '../context.js';
import { statusText } from './status.js';

type BoardOpts = { here?: boolean; panel?: PanelId };

export function registerBoard(app: App): void {
  app.program
    .command('board', { isDefault: true })
    .description('open the live TUI board (default command)')
    .option('--here', 'only the current project')
    .addOption(new Option('--panel <name>', 'start with a single panel').choices(PANELS))
    .action(
      action(app, async (ctx, opts: BoardOpts) => {
        if (!ctx.io.isTTY) {
          ctx.io.stderr('kokoro: not a terminal, printing `kokoro status` instead of the live board\n');
          const { text, board } = statusText(ctx, { here: opts.here });
          ctx.out(text, board);
          return;
        }
        const { startBoard } = await import('../../tui/index.js');
        await startBoard({ home: ctx.home, homeDir: ctx.homeDir(), cwd: ctx.io.cwd, here: Boolean(opts.here), panel: opts.panel });
      }),
    );
}
