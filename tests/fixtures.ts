import type { Ask, Goal, Job, Session } from '../src/model/schema.js';

export const T0 = '2026-11-09T08:00:00.000Z';

export function minutesAfter(iso: string, minutes: number): string {
  return new Date(Date.parse(iso) + minutes * 60_000).toISOString();
}

export function makeSession(over: Partial<Session> = {}): Session {
  return {
    v: 1,
    id: 's-0001',
    agent: 'codex',
    title: 'session',
    project: '/work/app',
    status: 'working',
    summary: null,
    started_at: T0,
    updated_at: T0,
    ended_at: null,
    ...over,
  };
}

export function makeJob(over: Partial<Job> = {}): Job {
  return {
    v: 1,
    id: 'j-0001',
    session: null,
    title: 'job',
    project: '/work/app',
    command: null,
    host: 'this-host',
    pid: null,
    child_pid: null,
    state: 'running',
    exit_code: null,
    message: null,
    log: null,
    started_at: T0,
    updated_at: T0,
    ended_at: null,
    ...over,
  };
}

export function makeGoal(over: Partial<Goal> = {}): Goal {
  return {
    v: 1,
    id: 'g-0001',
    session: null,
    title: 'goal',
    project: '/work/app',
    status: 'active',
    steps: [],
    created_at: T0,
    updated_at: T0,
    ...over,
  };
}

export function makeAsk(over: Partial<Ask> = {}): Ask {
  return {
    v: 1,
    id: 'a-0001',
    session: null,
    project: '/work/app',
    kind: 'question',
    text: 'what now?',
    state: 'open',
    created_at: T0,
    resolved_at: null,
    ...over,
  };
}
