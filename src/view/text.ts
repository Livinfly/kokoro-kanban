import type { Board, GoalView, JobView } from './board.js';
import { age, progressText, tildify } from './format.js';

export type TextOptions = { now: Date; homeDir: string };

export function jobStateText(j: JobView): string {
  if (j.display === 'running') {
    const p = progressText(j.progress);
    return p ? `running ${p}` : 'running';
  }
  if (j.display === 'failed' && j.exit_code !== null) return `failed (exit ${j.exit_code})`;
  return j.display;
}

export function jobTimeText(j: JobView, now: Date): string {
  if (j.display === 'running') return `for ${age(j.started_at, now)}`;
  if (j.display === 'lost') return `last seen ${age(j.lastUpdate, now)} ago`;
  return `${age(j.ended_at ?? j.updated_at, now)} ago`;
}

export function goalSummaryText(g: GoalView): string {
  const parts = [`${g.doneCount}/${g.steps.length} done`];
  if (g.status !== 'active') parts.unshift(g.status);
  if (g.doing) parts.push(`doing: ${g.doing}`);
  if (g.next) parts.push(`next: ${g.next}`);
  if (g.blocked) parts.push(`${g.blocked} blocked`);
  return parts.join(' · ');
}

const tag = (session: string | null) => (session ? `  [${session}]` : '');

export function renderText(board: Board, opts: TextOptions): string {
  const { now } = opts;
  const lines: string[] = [];
  const none = () => lines.push('  (none)');

  lines.push(`NEEDS YOU (${board.needs.length})`);
  if (!board.needs.length) none();
  for (const a of board.needs) {
    lines.push(`  ${a.id}  ${a.kind}${tag(a.session)}  ${age(a.created_at, now)}  ${a.text}`);
  }

  lines.push('', `SESSIONS (${board.counts.sessions} active)`);
  if (!board.sessionGroups.length) none();
  for (const group of board.sessionGroups) {
    lines.push(`  ${tildify(group.project, opts.homeDir)}`);
    for (const s of group.sessions) {
      const status = s.stale ? `${s.status} (stale)` : s.status;
      const summary = s.summary ? ` — ${s.summary}` : '';
      lines.push(`    ${s.id}  ${s.agent}  ${status}  ${age(s.updated_at, now)}  ${s.title}${summary}`);
    }
  }

  lines.push('', `JOBS (${board.counts.running} running)`);
  if (!board.jobs.length) none();
  for (const j of board.jobs) {
    const msg = j.progress.msg ?? j.message;
    lines.push(
      `  ${j.id}  ${jobStateText(j)}  ${jobTimeText(j, now)}  ${j.title}${tag(j.session)}${msg ? `  ${msg}` : ''}`,
    );
  }

  lines.push('', `GOALS (${board.goals.filter((g) => g.status === 'active').length} active)`);
  if (!board.goals.length) none();
  for (const g of board.goals) {
    lines.push(`  ${g.id}  ${g.title}${tag(g.session)}  ${goalSummaryText(g)}`);
  }

  if (board.errors.length) {
    lines.push('', `${board.errors.length} file(s) failed to parse; run \`kokoro doctor\``);
  }
  return lines.join('\n');
}
