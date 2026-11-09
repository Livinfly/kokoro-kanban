import { describe, expect, it } from 'vitest';
import type { DeriveCtx } from '../../src/model/derive.js';
import { foldProgress } from '../../src/model/progress.js';
import type { Ask, Goal, Job, Session } from '../../src/model/schema.js';
import type { Snapshot } from '../../src/store/index.js';
import { type BoardOptions, buildBoard } from '../../src/view/board.js';
import { makeAsk, makeGoal, makeJob, makeSession, minutesAfter, T0 } from '../fixtures.js';

const STORE = '/store';

function snap(parts: { sessions?: Session[]; jobs?: Job[]; goals?: Goal[]; asks?: Ask[] }): Snapshot {
  return {
    sessions: (parts.sessions ?? []).map((s) => ({ ...s, store: STORE })),
    jobs: (parts.jobs ?? []).map((j) => ({ ...j, store: STORE, progress: foldProgress([]) })),
    goals: (parts.goals ?? []).map((g) => ({ ...g, store: STORE })),
    asks: (parts.asks ?? []).map((a) => ({ ...a, store: STORE })),
    errors: [],
  };
}

function opts(over: Partial<BoardOptions> = {}, alive: number[] = []): BoardOptions {
  const ctx: DeriveCtx = {
    now: new Date(minutesAfter(T0, 60)),
    host: 'this-host',
    isAlive: (pid) => alive.includes(pid),
    staleAfterMs: 30 * 60_000,
  };
  return { ctx, hideFinishedAfterMs: 24 * 3_600_000, showAll: false, projectFilter: null, ...over };
}

describe('buildBoard', () => {
  it('lists only open asks as needs, newest first', () => {
    const board = buildBoard(
      snap({
        asks: [
          makeAsk({ id: 'a-old1', created_at: minutesAfter(T0, 1) }),
          makeAsk({ id: 'a-new1', created_at: minutesAfter(T0, 5) }),
          makeAsk({ id: 'a-done', state: 'resolved', resolved_at: minutesAfter(T0, 6) }),
        ],
      }),
      opts(),
    );
    expect(board.needs.map((a) => a.id)).toEqual(['a-new1', 'a-old1']);
    expect(board.asks.map((a) => a.id)).toContain('a-done');
    expect(board.counts.needs).toBe(2);
  });

  it('groups sessions by project, most recent group first, ended sessions last', () => {
    const board = buildBoard(
      snap({
        sessions: [
          makeSession({ id: 's-a1', project: '/a', updated_at: minutesAfter(T0, 1) }),
          makeSession({ id: 's-b1', project: '/b', updated_at: minutesAfter(T0, 9) }),
          makeSession({
            id: 's-b2',
            project: '/b',
            status: 'ended',
            updated_at: minutesAfter(T0, 10),
            ended_at: minutesAfter(T0, 10),
          }),
          makeSession({ id: 's-b3', project: '/b', updated_at: minutesAfter(T0, 5) }),
        ],
      }),
      opts(),
    );
    expect(board.sessionGroups.map((g) => g.project)).toEqual(['/b', '/a']);
    expect(board.sessionGroups[0]!.sessions.map((s) => s.id)).toEqual(['s-b1', 's-b3', 's-b2']);
    expect(board.counts.sessions).toBe(3);
  });

  it('flags stale working sessions', () => {
    const board = buildBoard(snap({ sessions: [makeSession()] }), opts());
    expect(board.sessionGroups[0]!.sessions[0]!.stale).toBe(true);
  });

  it('orders jobs running, then lost, then finished by end time', () => {
    const board = buildBoard(
      snap({
        jobs: [
          makeJob({ id: 'j-done', state: 'done', ended_at: minutesAfter(T0, 2) }),
          makeJob({ id: 'j-fail', state: 'failed', ended_at: minutesAfter(T0, 3) }),
          makeJob({ id: 'j-lost', pid: 1 }),
          makeJob({ id: 'j-run1', pid: 2 }),
        ],
      }),
      opts({}, [2]),
    );
    expect(board.jobs.map((j) => [j.id, j.display])).toEqual([
      ['j-run1', 'running'],
      ['j-lost', 'lost'],
      ['j-fail', 'failed'],
      ['j-done', 'done'],
    ]);
    expect(board.counts.running).toBe(1);
  });

  it('hides entities finished longer ago than the window unless showAll', () => {
    const longAgo = '2026-11-01T00:00:00.000Z';
    const parts = {
      sessions: [makeSession({ id: 's-old1', status: 'ended', ended_at: longAgo })],
      jobs: [makeJob({ id: 'j-old1', state: 'done', ended_at: longAgo })],
      goals: [makeGoal({ id: 'g-old1', status: 'done', updated_at: longAgo })],
      asks: [makeAsk({ id: 'a-old1', state: 'resolved', resolved_at: longAgo })],
    };
    const hidden = buildBoard(snap(parts), opts());
    expect([hidden.sessionGroups, hidden.jobs, hidden.goals, hidden.asks]).toEqual([[], [], [], []]);
    const shown = buildBoard(snap(parts), opts({ showAll: true }));
    expect(shown.jobs).toHaveLength(1);
    expect(shown.goals).toHaveLength(1);
    expect(shown.asks).toHaveLength(1);
    expect(shown.sessionGroups).toHaveLength(1);
  });

  it('filters by project including nested paths, while listing every project', () => {
    const board = buildBoard(
      snap({
        sessions: [
          makeSession({ id: 's-a1', project: '/work/app' }),
          makeSession({ id: 's-a2', project: '/work/app/sub' }),
          makeSession({ id: 's-x1', project: '/work/apple' }),
        ],
      }),
      opts({ projectFilter: '/work/app' }),
    );
    expect(board.sessionGroups.flatMap((g) => g.sessions.map((s) => s.id)).sort()).toEqual(['s-a1', 's-a2']);
    expect(board.projects).toEqual(['/work/app', '/work/app/sub', '/work/apple']);
  });

  it('summarises goal steps', () => {
    const board = buildBoard(
      snap({
        goals: [
          makeGoal({
            steps: [
              { text: 'a', status: 'done' },
              { text: 'b', status: 'doing' },
              { text: 'c', status: 'blocked' },
              { text: 'd', status: 'todo' },
              { text: 'e', status: 'todo' },
            ],
          }),
        ],
      }),
      opts(),
    );
    expect(board.goals[0]).toMatchObject({ doneCount: 1, doing: 'b', next: 'd', blocked: 1 });
  });
});
