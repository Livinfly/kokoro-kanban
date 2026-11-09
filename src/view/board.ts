import {
  type DeriveCtx,
  finishedAt,
  isFinished,
  jobLastUpdate,
  jobLost,
  jobStale,
  sessionStale,
} from '../model/derive.js';
import type { Ask, Entity, Goal, Kind, Session } from '../model/schema.js';
import type { Loaded, LoadedJob, LoadError, Snapshot } from '../store/index.js';

export type BoardOptions = {
  ctx: DeriveCtx;
  hideFinishedAfterMs: number;
  showAll: boolean;
  projectFilter: string | null;
};

export type SessionView = Loaded<Session> & { stale: boolean };
export type JobDisplay = 'running' | 'done' | 'failed' | 'cancelled' | 'lost';
export type JobView = LoadedJob & { display: JobDisplay; stale: boolean; lastUpdate: string };
export type GoalView = Loaded<Goal> & { doneCount: number; doing: string | null; next: string | null; blocked: number };
export type AskView = Loaded<Ask>;

export type Board = {
  needs: AskView[];
  sessionGroups: { project: string; sessions: SessionView[] }[];
  jobs: JobView[];
  goals: GoalView[];
  asks: AskView[];
  projects: string[];
  counts: { sessions: number; running: number; needs: number };
  errors: LoadError[];
};

export function matchesProject(project: string, filter: string | null): boolean {
  return filter === null || project === filter || project.startsWith(`${filter}/`);
}

const desc = (a: string | null, b: string | null) => Date.parse(b ?? '') - Date.parse(a ?? '') || 0;

export function buildBoard(snap: Snapshot, opts: BoardOptions): Board {
  const { ctx } = opts;
  const keep = (kind: Kind, e: Entity & { project: string }) => {
    if (!matchesProject(e.project, opts.projectFilter)) return false;
    if (opts.showAll || !isFinished(kind, e, ctx)) return true;
    const at = finishedAt(kind, e);
    return at === null || ctx.now.getTime() - Date.parse(at) <= opts.hideFinishedAfterMs;
  };

  const sessions: SessionView[] = snap.sessions
    .filter((s) => keep('session', s))
    .map((s) => ({ ...s, stale: sessionStale(s, ctx) }));
  const byProject = new Map<string, SessionView[]>();
  for (const s of sessions) byProject.set(s.project, [...(byProject.get(s.project) ?? []), s]);
  const sessionGroups = [...byProject.entries()]
    .map(([project, list]) => ({
      project,
      sessions: list.sort((a, b) => {
        const endedA = a.status === 'ended';
        const endedB = b.status === 'ended';
        if (endedA !== endedB) return endedA ? 1 : -1;
        return endedA ? desc(a.ended_at, b.ended_at) : desc(a.updated_at, b.updated_at);
      }),
      latest: Math.max(...list.map((s) => Date.parse(s.updated_at))),
    }))
    .sort((a, b) => b.latest - a.latest)
    .map(({ project, sessions: list }) => ({ project, sessions: list }));

  const rank: Record<JobDisplay, number> = { running: 0, lost: 1, done: 2, failed: 2, cancelled: 2 };
  const jobs: JobView[] = snap.jobs
    .filter((j) => keep('job', j))
    .map((j) => ({
      ...j,
      display: jobLost(j, ctx) ? ('lost' as const) : j.state,
      stale: jobStale(j, j.progress, ctx),
      lastUpdate: jobLastUpdate(j, j.progress),
    }))
    .sort(
      (a, b) =>
        rank[a.display] - rank[b.display] ||
        (rank[a.display] === 2 ? desc(a.ended_at, b.ended_at) : desc(a.started_at, b.started_at)),
    );

  const goals: GoalView[] = snap.goals
    .filter((g) => keep('goal', g))
    .map((g) => ({
      ...g,
      doneCount: g.steps.filter((s) => s.status === 'done').length,
      doing: g.steps.find((s) => s.status === 'doing')?.text ?? null,
      next: g.steps.find((s) => s.status === 'todo')?.text ?? null,
      blocked: g.steps.filter((s) => s.status === 'blocked').length,
    }))
    .sort((a, b) => {
      const activeA = a.status === 'active';
      const activeB = b.status === 'active';
      if (activeA !== activeB) return activeA ? -1 : 1;
      return desc(a.updated_at, b.updated_at);
    });

  const asks = snap.asks.filter((a) => keep('ask', a)).sort((a, b) => desc(a.created_at, b.created_at));
  const needs = asks.filter((a) => a.state === 'open');

  const projects = [
    ...new Set([...snap.sessions, ...snap.jobs, ...snap.goals, ...snap.asks].map((e) => e.project)),
  ].sort();

  return {
    needs,
    sessionGroups,
    jobs,
    goals,
    asks,
    projects,
    counts: {
      sessions: sessions.filter((s) => s.status !== 'ended').length,
      running: jobs.filter((j) => j.display === 'running').length,
      needs: needs.length,
    },
    errors: snap.errors,
  };
}
