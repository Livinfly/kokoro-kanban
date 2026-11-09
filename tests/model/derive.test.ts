import { describe, expect, it } from 'vitest';
import {
  type DeriveCtx,
  finishedAt,
  isFinished,
  jobLastUpdate,
  jobLost,
  jobStale,
  sessionStale,
} from '../../src/model/derive.js';
import { foldProgress } from '../../src/model/progress.js';
import { makeAsk, makeGoal, makeJob, makeSession, minutesAfter, T0 } from '../fixtures.js';

const noProgress = foldProgress([]);

function ctx(minutesLater: number, alive: number[] = []): DeriveCtx {
  return {
    now: new Date(minutesAfter(T0, minutesLater)),
    host: 'this-host',
    isAlive: (pid) => alive.includes(pid),
    staleAfterMs: 30 * 60_000,
  };
}

describe('sessionStale', () => {
  it('marks a working session stale after the threshold', () => {
    expect(sessionStale(makeSession(), ctx(29))).toBe(false);
    expect(sessionStale(makeSession(), ctx(31))).toBe(true);
  });

  it('never marks waiting, idle or ended sessions stale', () => {
    expect(sessionStale(makeSession({ status: 'waiting' }), ctx(600))).toBe(false);
    expect(sessionStale(makeSession({ status: 'idle' }), ctx(600))).toBe(false);
    expect(sessionStale(makeSession({ status: 'ended' }), ctx(600))).toBe(false);
  });
});

describe('jobLost', () => {
  it('is lost when running on this host and the pid is gone', () => {
    expect(jobLost(makeJob({ pid: 42 }), ctx(1))).toBe(true);
    expect(jobLost(makeJob({ pid: 42 }), ctx(1, [42]))).toBe(false);
  });

  it('is never lost without a pid, on another host, or when finished', () => {
    expect(jobLost(makeJob({ pid: null }), ctx(1))).toBe(false);
    expect(jobLost(makeJob({ pid: 42, host: 'elsewhere' }), ctx(1))).toBe(false);
    expect(jobLost(makeJob({ pid: 42, state: 'done' }), ctx(1))).toBe(false);
  });
});

describe('jobLastUpdate and jobStale', () => {
  it('uses the later of the job file and the last progress line', () => {
    const p = foldProgress([JSON.stringify({ pct: 1, at: minutesAfter(T0, 10) })]);
    expect(jobLastUpdate(makeJob(), p)).toBe(minutesAfter(T0, 10));
    expect(jobLastUpdate(makeJob({ updated_at: minutesAfter(T0, 20) }), p)).toBe(minutesAfter(T0, 20));
  });

  it('marks a running job without pid stale after the threshold', () => {
    expect(jobStale(makeJob(), noProgress, ctx(31))).toBe(true);
    expect(jobStale(makeJob(), noProgress, ctx(10))).toBe(false);
  });

  it('does not mark jobs with a pid or finished jobs stale', () => {
    expect(jobStale(makeJob({ pid: 42 }), noProgress, ctx(600, [42]))).toBe(false);
    expect(jobStale(makeJob({ state: 'done' }), noProgress, ctx(600))).toBe(false);
  });
});

describe('isFinished and finishedAt', () => {
  it('classifies each kind', () => {
    const c = ctx(1);
    expect(isFinished('session', makeSession({ status: 'ended' }), c)).toBe(true);
    expect(isFinished('session', makeSession(), c)).toBe(false);
    expect(isFinished('job', makeJob({ state: 'failed' }), c)).toBe(true);
    expect(isFinished('job', makeJob({ pid: 42 }), c)).toBe(true);
    expect(isFinished('job', makeJob({ pid: 42 }), ctx(1, [42]))).toBe(false);
    expect(isFinished('goal', makeGoal({ status: 'dropped' }), c)).toBe(true);
    expect(isFinished('goal', makeGoal(), c)).toBe(false);
    expect(isFinished('ask', makeAsk({ state: 'resolved' }), c)).toBe(true);
    expect(isFinished('ask', makeAsk(), c)).toBe(false);
  });

  it('returns the relevant timestamp', () => {
    expect(finishedAt('session', makeSession({ ended_at: 'E' }))).toBe('E');
    expect(finishedAt('job', makeJob({ ended_at: 'J' }))).toBe('J');
    expect(finishedAt('goal', makeGoal({ updated_at: 'G' }))).toBe('G');
    expect(finishedAt('ask', makeAsk({ resolved_at: 'A' }))).toBe('A');
  });
});
