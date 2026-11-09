import { readdirSync } from 'node:fs';
import path from 'node:path';
import { foldProgress, type Progress } from '../model/progress.js';
import { KIND_DIR, KINDS, type Ask, type Entity, type Goal, type Job, type Kind, type Session } from '../model/schema.js';
import { mtimeIso, readTail } from './fsutil.js';
import { progressPath } from './paths.js';
import { isEntityFileName, loadEntityFile } from './repo.js';

export type Loaded<T> = T & { store: string };
export type LoadedJob = Loaded<Job> & { progress: Progress };
export type LoadError = { path: string; reason: string };

export type Snapshot = {
  sessions: Loaded<Session>[];
  jobs: LoadedJob[];
  goals: Loaded<Goal>[];
  asks: Loaded<Ask>[];
  errors: LoadError[];
};

export const PROGRESS_TAIL_BYTES = 256 * 1024;

type Classified = { store: string; kind: Kind; id: string; type: 'entity' | 'progress' };

const DIR_KIND = new Map<string, Kind>(KINDS.map((kind) => [KIND_DIR[kind], kind]));

export class StoreIndex {
  private entities = new Map<string, { kind: Kind; entity: Loaded<Entity> }>();
  private progress = new Map<string, Progress>();
  private errors = new Map<string, string>();

  constructor(public stores: string[]) {}

  loadAll(): void {
    this.entities.clear();
    this.progress.clear();
    this.errors.clear();
    for (const store of this.stores) {
      for (const kind of KINDS) {
        let names: string[];
        try {
          names = readdirSync(path.join(store, KIND_DIR[kind]));
        } catch {
          continue;
        }
        for (const name of names) {
          if (isEntityFileName(name)) this.loadEntity(store, kind, path.join(store, KIND_DIR[kind], name));
        }
      }
    }
  }

  refreshPath(file: string): boolean {
    const c = this.classify(file);
    if (!c) return false;
    if (c.type === 'progress') {
      this.progress.delete(progressPath(c.store, c.id));
      return true;
    }
    this.entities.delete(file);
    this.errors.delete(file);
    this.loadEntity(c.store, c.kind, file);
    return true;
  }

  snapshot(): Snapshot {
    const snap: Snapshot = { sessions: [], jobs: [], goals: [], asks: [], errors: [] };
    for (const { kind, entity } of this.entities.values()) {
      if (kind === 'session') snap.sessions.push(entity as Loaded<Session>);
      else if (kind === 'goal') snap.goals.push(entity as Loaded<Goal>);
      else if (kind === 'ask') snap.asks.push(entity as Loaded<Ask>);
      else {
        const job = entity as Loaded<Job>;
        snap.jobs.push({ ...job, progress: this.progressFor(job.store, job.id) });
      }
    }
    for (const [p, reason] of this.errors) snap.errors.push({ path: p, reason });
    return snap;
  }

  private loadEntity(store: string, kind: Kind, file: string): void {
    const result = loadEntityFile(kind, file);
    if (result.ok) {
      this.entities.set(file, { kind, entity: { ...result.value, store } });
    } else if (!result.reason.includes('ENOENT')) {
      this.errors.set(file, result.reason);
    }
  }

  private progressFor(store: string, jobId: string): Progress {
    const file = progressPath(store, jobId);
    let p = this.progress.get(file);
    if (!p) {
      p = foldProgress(readTail(file, PROGRESS_TAIL_BYTES).split('\n'), mtimeIso(file));
      this.progress.set(file, p);
    }
    return p;
  }

  private classify(file: string): Classified | null {
    const store = this.stores.find((s) => file.startsWith(s + path.sep));
    if (!store) return null;
    const parts = path.relative(store, file).split(path.sep);
    if (parts.length !== 2) return null;
    const [dir, name] = parts as [string, string];
    const kind = DIR_KIND.get(dir);
    if (!kind || name.startsWith('.')) return null;
    if (kind === 'job' && name.endsWith('.progress.jsonl')) {
      return { store, kind, id: name.slice(0, -'.progress.jsonl'.length), type: 'progress' };
    }
    if (!isEntityFileName(name)) return null;
    return { store, kind, id: name.slice(0, -'.json'.length), type: 'entity' };
  }
}
