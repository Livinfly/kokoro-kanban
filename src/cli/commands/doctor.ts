import { StoreIndex } from '../../store/index.js';
import { knownStores } from '../../store/locate.js';
import { action, type App } from '../context.js';

export function registerDoctor(app: App): void {
  app.program
    .command('doctor')
    .description('list unreadable files and missing stores')
    .action(
      action(app, (ctx) => {
        const { stores, missing } = knownStores(ctx.home);
        const index = new StoreIndex(stores);
        index.loadAll();
        const { errors } = index.snapshot();
        const lines = [
          ...errors.map((e) => `invalid file ${e.path}: ${e.reason}`),
          ...missing.map((dir) => `missing store ${dir} (listed in stores.json)`),
        ];
        const report = { ok: lines.length === 0, errors, missing };
        if (!report.ok) ctx.setExit(1);
        ctx.out(report.ok ? 'ok' : lines.join('\n'), report);
      }),
    );
}
