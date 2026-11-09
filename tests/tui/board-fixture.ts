import { foldProgress } from '../../src/model/progress.js';
import type { Snapshot } from '../../src/store/index.js';
import { type Board, buildBoard } from '../../src/view/board.js';
import { makeAsk, makeGoal, makeJob, makeSession, minutesAfter, T0 } from '../fixtures.js';

export const NOW = new Date(minutesAfter(T0, 45));
export const STORE = '/store';

export function sampleBoard(over: { projectFilter?: string | null; showAll?: boolean } = {}): Board {
  const snap: Snapshot = {
    sessions: [
      makeSession({ id: 's-7f3a', title: '重构登录', project: '/home/me/work/app', summary: '改 middleware', updated_at: minutesAfter(T0, 43) }),
      makeSession({ id: 's-1b2c', agent: 'claude', title: '微调模型', project: '/home/me/thesis', status: 'waiting', updated_at: minutesAfter(T0, 40) }),
      makeSession({ id: 's-old1', title: '老会话', project: '/home/me/thesis', updated_at: T0 }),
    ].map((s) => ({ ...s, store: STORE })),
    jobs: [
      { ...makeJob({ id: 'j-2c91', title: '下载模型', session: 's-1b2c', pid: 100 }), progress: foldProgress([JSON.stringify({ pct: 78, done: 1.2, total: 1.6, unit: 'GB', msg: 'shard 3/4' })]) },
      { ...makeJob({ id: 'j-8812', title: '爬数据', pid: 200 }), progress: foldProgress([]) },
      { ...makeJob({ id: 'j-77aa', title: '构建', state: 'failed', exit_code: 1, ended_at: minutesAfter(T0, 30) }), progress: foldProgress([]) },
    ].map((j) => ({ ...j, store: STORE })),
    goals: [
      makeGoal({
        id: 'g-1b2c',
        title: '登录重构',
        session: 's-7f3a',
        steps: [
          { text: '梳理现状', status: 'done' },
          { text: '迁移 middleware', status: 'doing' },
          { text: '补测试', status: 'todo' },
        ],
      }),
    ].map((g) => ({ ...g, store: STORE })),
    asks: [
      makeAsk({ id: 'a-9d0e', kind: 'approval', session: 's-7f3a', text: '要不要删掉旧的 session 表？', created_at: minutesAfter(T0, 40) }),
    ].map((a) => ({ ...a, store: STORE })),
    errors: [],
  };
  return buildBoard(snap, {
    ctx: { now: NOW, host: 'this-host', isAlive: (pid) => pid === 100, staleAfterMs: 30 * 60_000 },
    hideFinishedAfterMs: 24 * 3_600_000,
    showAll: over.showAll ?? false,
    projectFilter: over.projectFilter ?? null,
  });
}
