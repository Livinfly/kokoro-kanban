import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { KIND_DIR, KINDS } from '../../model/schema.js';
import { STORE_DIRNAME } from '../../store/paths.js';
import { registerStore } from '../../store/registry.js';
import { action, type App, KokoroError } from '../context.js';

export function registerInit(app: App): void {
  app.program
    .command('init')
    .description('create a project-local store (.kokoro-kanban/) in the current directory')
    .action(
      action(app, (ctx) => {
        const dir = path.join(path.resolve(ctx.io.cwd), STORE_DIRNAME);
        if (dir === ctx.home) {
          throw new KokoroError(`${dir} is the global store; run \`kokoro init\` inside a project directory`);
        }
        for (const kind of KINDS) mkdirSync(path.join(dir, KIND_DIR[kind]), { recursive: true });
        registerStore(ctx.home, dir);
        ctx.out(dir, { store: dir });
      }),
    );
}
