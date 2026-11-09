import { isFinished } from '../../model/derive.js';
import { kindOfId } from '../../model/ids.js';
import { type Entity, type Kind, KINDS } from '../../model/schema.js';
import { archiveEntity } from '../../store/repo.js';
import { action, type App, type CliContext, KokoroError } from '../context.js';

function locateAny(ctx: CliContext, id: string): { kind: Kind; store: string; entity: Entity } {
  const known = kindOfId(id);
  for (const kind of known ? [known] : KINDS) {
    const found = ctx.locate(kind, id);
    if (found) return { kind, ...found };
  }
  throw new KokoroError(`${known ?? 'entity'} ${id} not found; run \`kokoro status\` to list ids`);
}

export function archiveIds(ctx: CliContext, ids: string[]): void {
  const derive = ctx.deriveCtx();
  const targets = ids.map((id) => locateAny(ctx, id));
  for (const t of targets) {
    if (!isFinished(t.kind, t.entity, derive)) {
      throw new KokoroError(`${t.kind} ${t.entity.id} is not finished; only ended, finished or resolved items can be archived`);
    }
  }
  for (const t of targets) archiveEntity(t.store, t.kind, t.entity.id);
}

export function registerArchive(app: App): void {
  app.program
    .command('archive <ids...>')
    .description('move finished items to archive/')
    .action(
      action(app, (ctx, ids: string[]) => {
        archiveIds(ctx, ids);
        ctx.out(ids.join('\n'), { archived: ids });
      }),
    );
}
