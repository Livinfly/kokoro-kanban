import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import type { Command } from 'commander';
import type { DeriveCtx } from '../model/derive.js';
import { newId } from '../model/ids.js';
import type { EntityOf, Kind, Session } from '../model/schema.js';
import { locateEntity } from '../store/locate.js';
import { entityPath, homeStore, resolveWriteStore, type Env, type StoreTarget } from '../store/paths.js';
import { registerStore } from '../store/registry.js';
import { writeEntity } from '../store/repo.js';
import { deriveCtxFor } from '../view/load.js';

export type IO = {
  cwd: string;
  env: Env;
  stdout: (s: string) => void;
  stderr: (s: string) => void;
  now?: () => Date;
  isTTY?: boolean;
};

export class KokoroError extends Error {
  constructor(
    message: string,
    readonly exitCode = 1,
  ) {
    super(message);
  }
}

export type App = {
  program: Command;
  io: IO;
  setExit: (code: number) => void;
};

export type GlobalOptions = { store?: string; json?: boolean };

export class CliContext {
  readonly io: IO;
  readonly home: string;
  readonly target: StoreTarget;
  readonly json: boolean;

  constructor(
    private readonly app: App,
    globals: GlobalOptions,
  ) {
    this.io = app.io;
    this.home = homeStore(this.io.env);
    this.target = resolveWriteStore({ flag: globals.store, env: this.io.env, cwd: this.io.cwd });
    this.json = Boolean(globals.json);
  }

  nowDate(): Date {
    return this.io.now?.() ?? new Date();
  }

  now(): string {
    return this.nowDate().toISOString();
  }

  homeDir(): string {
    return this.io.env.HOME ?? homedir();
  }

  setExit(code: number): void {
    this.app.setExit(code);
  }

  out(text: string, data?: unknown): void {
    if (this.json && data !== undefined) this.io.stdout(`${JSON.stringify(data, null, 2)}\n`);
    else this.io.stdout(`${text}\n`);
  }

  projectFor(sessionProject: string | null): string {
    if (this.target.kind === 'project' && this.target.projectRoot) return this.target.projectRoot;
    return sessionProject ?? this.io.cwd;
  }

  allocateId(kind: Kind): string {
    return newId(kind, (id) => existsSync(entityPath(this.target.dir, kind, id)));
  }

  save<K extends Kind>(store: string, kind: K, entity: EntityOf<K>): void {
    writeEntity(store, kind, entity);
    if (store !== this.home) registerStore(this.home, store);
  }

  locate<K extends Kind>(kind: K, id: string): { store: string; entity: EntityOf<K> } | null {
    return locateEntity(kind, id, this.target.dir, this.home);
  }

  find<K extends Kind>(kind: K, id: string): { store: string; entity: EntityOf<K> } {
    const found = this.locate(kind, id);
    if (!found) throw new KokoroError(`${kind} ${id} not found; run \`kokoro status\` to list ids`);
    return found;
  }

  touchSession(id: string): Session {
    const { store, entity } = this.find('session', id);
    const next = { ...entity, updated_at: this.now() };
    this.save(store, 'session', next);
    return next;
  }

  touchSessionIfExists(id: string | null): void {
    if (id && this.locate('session', id)) this.touchSession(id);
  }

  deriveCtx(): DeriveCtx {
    return deriveCtxFor(this.home, this.nowDate());
  }
}

export function action<A extends unknown[]>(
  app: App,
  fn: (ctx: CliContext, ...args: A) => void | Promise<void>,
): (...args: unknown[]) => Promise<void> {
  return async (...args: unknown[]) => {
    const cmd = args[args.length - 1] as Command;
    const ctx = new CliContext(app, cmd.optsWithGlobals<GlobalOptions>());
    await fn(ctx, ...(args.slice(0, -1) as A));
  };
}
