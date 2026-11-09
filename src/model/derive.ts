import type { Progress } from './progress.js';
import type { Ask, Entity, Goal, Job, Kind, Session } from './schema.js';

export type DeriveCtx = {
  now: Date;
  host: string;
  isAlive: (pid: number) => boolean;
  staleAfterMs: number;
};

function olderThan(iso: string, ctx: DeriveCtx): boolean {
  return ctx.now.getTime() - Date.parse(iso) > ctx.staleAfterMs;
}

export function sessionStale(s: Session, ctx: DeriveCtx): boolean {
  return s.status === 'working' && olderThan(s.updated_at, ctx);
}

export function jobLastUpdate(j: Job, p: Progress): string {
  if (p.at && Date.parse(p.at) > Date.parse(j.updated_at)) return p.at;
  return j.updated_at;
}

export function jobLost(j: Job, ctx: DeriveCtx): boolean {
  return j.state === 'running' && j.pid !== null && j.host === ctx.host && !ctx.isAlive(j.pid);
}

export function jobStale(j: Job, p: Progress, ctx: DeriveCtx): boolean {
  return j.state === 'running' && j.pid === null && olderThan(jobLastUpdate(j, p), ctx);
}

export function isFinished(kind: Kind, entity: Entity, ctx: DeriveCtx): boolean {
  switch (kind) {
    case 'session':
      return (entity as Session).status === 'ended';
    case 'job': {
      const job = entity as Job;
      return job.state !== 'running' || jobLost(job, ctx);
    }
    case 'goal':
      return (entity as Goal).status !== 'active';
    case 'ask':
      return (entity as Ask).state === 'resolved';
  }
}

export function finishedAt(kind: Kind, entity: Entity): string | null {
  switch (kind) {
    case 'session':
      return (entity as Session).ended_at;
    case 'job':
      return (entity as Job).ended_at;
    case 'goal':
      return (entity as Goal).updated_at;
    case 'ask':
      return (entity as Ask).resolved_at;
  }
}

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}
