import { homedir } from 'node:os';
import path from 'node:path';
import { KIND_DIR, type Kind } from '../model/schema.js';
import { isDir } from './fsutil.js';

export const STORE_DIRNAME = '.kokoro-kanban';

export type Env = Record<string, string | undefined>;

export type StoreTarget = {
  dir: string;
  kind: 'global' | 'project';
  projectRoot: string | null;
};

export function homeStore(env: Env): string {
  if (env.KOKORO_HOME) return path.resolve(env.KOKORO_HOME);
  return path.join(env.HOME ?? homedir(), STORE_DIRNAME);
}

export function findProjectStore(cwd: string, home: string): string | null {
  let dir = path.resolve(cwd);
  for (;;) {
    const candidate = path.join(dir, STORE_DIRNAME);
    if (candidate !== home && isDir(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function currentProject(cwd: string, home: string): string {
  const store = findProjectStore(cwd, home);
  return store ? path.dirname(store) : path.resolve(cwd);
}

export function targetFor(dir: string, home: string): StoreTarget {
  return dir === home
    ? { dir, kind: 'global', projectRoot: null }
    : { dir, kind: 'project', projectRoot: path.dirname(dir) };
}

export function resolveWriteStore(opts: { flag?: string; env: Env; cwd: string }): StoreTarget {
  const home = homeStore(opts.env);
  const explicit = opts.flag ?? opts.env.KOKORO_STORE;
  const dir = explicit ? path.resolve(opts.cwd, explicit) : (findProjectStore(opts.cwd, home) ?? home);
  return targetFor(dir, home);
}

export function entityPath(store: string, kind: Kind, id: string): string {
  return path.join(store, KIND_DIR[kind], `${id}.json`);
}

export function progressPath(store: string, jobId: string): string {
  return path.join(store, KIND_DIR.job, `${jobId}.progress.jsonl`);
}

export function logPath(store: string, jobId: string): string {
  return path.join(store, KIND_DIR.job, `${jobId}.log`);
}

export function archiveDir(store: string, kind: Kind): string {
  return path.join(store, 'archive', KIND_DIR[kind]);
}
