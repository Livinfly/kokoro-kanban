import { Box, Text } from 'ink';
import type { Session, Step } from '../../model/schema.js';
import type { AskView, GoalView, JobDisplay, JobView, SessionView } from '../../view/board.js';
import { age, bar, progressText } from '../../view/format.js';
import { goalSummaryText, jobStateText, jobTimeText } from '../../view/text.js';

export const SESSION_ICON: Record<Session['status'], { icon: string; color: string }> = {
  working: { icon: '●', color: 'green' },
  waiting: { icon: '◐', color: 'yellow' },
  idle: { icon: '○', color: 'gray' },
  ended: { icon: '✓', color: 'gray' },
};

export const JOB_ICON: Record<JobDisplay, { icon: string; color: string }> = {
  running: { icon: '▶', color: 'green' },
  done: { icon: '✓', color: 'green' },
  failed: { icon: '✗', color: 'red' },
  cancelled: { icon: '⊘', color: 'gray' },
  lost: { icon: '?', color: 'magenta' },
};

export const STEP_MARK: Record<Step['status'], string> = { todo: '[ ]', doing: '[~]', done: '[x]', blocked: '[!]' };

type RowProps<T> = { item: T; selected: boolean; now: Date };

export function NeedRow({ item: a, selected, now, sessionTitle }: RowProps<AskView> & { sessionTitle?: string }) {
  const owner = a.session ? ` · ${a.session}${sessionTitle ? ` ${sessionTitle}` : ''}` : '';
  return (
    <Text wrap="truncate-end" inverse={selected}>
      <Text color="yellow">▶ </Text>
      {a.id} <Text color="magenta">{a.kind}</Text> {a.text}
      <Text dimColor>
        {owner} · {age(a.created_at, now)}
      </Text>
    </Text>
  );
}

export function SessionRow({ item: s, selected, now }: RowProps<SessionView>) {
  const { icon, color } = SESSION_ICON[s.status];
  return (
    <Box flexDirection="column">
      <Text wrap="truncate-end" inverse={selected}>
        <Text color={color}>{icon}</Text> {s.id} {s.agent} <Text color={color}>{s.status}</Text>{' '}
        <Text dimColor>{age(s.updated_at, now)}</Text>
        {s.stale ? <Text color="yellow"> stale</Text> : null} {s.title}
      </Text>
      {s.summary ? (
        <Text wrap="truncate-end" dimColor>
          {'    '}
          {s.summary}
        </Text>
      ) : null}
    </Box>
  );
}

export function JobRow({ item: j, selected, now }: RowProps<JobView>) {
  const { icon, color } = JOB_ICON[j.display];
  const pct = j.display === 'running' ? j.progress.pct : null;
  const status = pct !== null ? `${bar(pct, 10)} ${Math.round(pct)}%` : jobStateText(j);
  const counters = j.progress.done !== null && j.progress.total !== null ? progressText({ ...j.progress, pct: null }) : null;
  const details = [counters, j.progress.msg ?? j.message, j.session ? `[${j.session}]` : null].filter(Boolean);
  return (
    <Box flexDirection="column">
      <Text wrap="truncate-end" inverse={selected}>
        <Text color={color}>{icon}</Text> {j.id} {j.title} <Text color={color}>{status}</Text>{' '}
        <Text dimColor>{jobTimeText(j, now)}</Text>
        {j.stale ? <Text color="yellow"> stale</Text> : null}
      </Text>
      {details.length ? (
        <Text wrap="truncate-end" dimColor>
          {'    '}
          {details.join(' · ')}
        </Text>
      ) : null}
    </Box>
  );
}

export function GoalRow({ item: g, selected }: RowProps<GoalView>) {
  const steps = g.steps.map((s) => `${STEP_MARK[s.status]} ${s.text}`).join('  ');
  return (
    <Box flexDirection="column">
      <Text wrap="truncate-end" inverse={selected}>
        <Text bold>{g.id}</Text> {g.title}
        {g.session ? <Text dimColor> ({g.session})</Text> : null} <Text color="cyan">{goalSummaryText(g)}</Text>
      </Text>
      {steps ? (
        <Text wrap="truncate-end" dimColor>
          {'    '}
          {steps}
        </Text>
      ) : null}
    </Box>
  );
}
