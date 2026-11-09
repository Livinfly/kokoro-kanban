import { Box, Text } from 'ink';
import type { ReactNode } from 'react';
import type { Board } from '../../view/board.js';
import { age, progressText, tildify } from '../../view/format.js';
import { goalSummaryText, jobStateText } from '../../view/text.js';
import type { UiState } from '../ui-state.js';
import { STEP_MARK } from './rows.js';

type DetailProps = { board: Board; detail: NonNullable<UiState['detail']>; now: Date; homeDir: string; logLines: string[] };

function Field({ label, children }: { label: string; children: ReactNode }) {
  if (children === null || children === undefined || children === '') return null;
  return (
    <Text wrap="truncate-end">
      <Text dimColor>{label.padEnd(10)}</Text>
      {children}
    </Text>
  );
}

function Frame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text bold color="cyan">
        {title}
      </Text>
      {children}
    </Box>
  );
}

const when = (iso: string | null, now: Date) => (iso ? `${age(iso, now)} ago (${iso})` : null);

export function Detail({ board, detail, now, homeDir, logLines }: DetailProps) {
  const sessions = board.sessionGroups.flatMap((g) => g.sessions);

  if (detail.kind === 'session') {
    const s = sessions.find((x) => x.id === detail.id);
    if (s) {
      const goals = board.goals.filter((g) => g.session === s.id);
      const jobs = board.jobs.filter((j) => j.session === s.id);
      const asks = board.asks.filter((a) => a.session === s.id);
      return (
        <Frame title={`${s.id}  ${s.title}`}>
          <Field label="agent">{s.agent}</Field>
          <Field label="status">{s.stale ? `${s.status} (stale)` : s.status}</Field>
          <Field label="summary">{s.summary}</Field>
          <Field label="project">{tildify(s.project, homeDir)}</Field>
          <Field label="started">{when(s.started_at, now)}</Field>
          <Field label="updated">{when(s.updated_at, now)}</Field>
          <Field label="ended">{when(s.ended_at, now)}</Field>
          <Text bold>Goals</Text>
          {goals.length ? goals.map((g) => <Text key={g.id}>  {g.id} {g.title} · {goalSummaryText(g)}</Text>) : <Text dimColor>  (none)</Text>}
          <Text bold>Jobs</Text>
          {jobs.length ? jobs.map((j) => <Text key={j.id}>  {j.id} {j.title} · {jobStateText(j)}</Text>) : <Text dimColor>  (none)</Text>}
          <Text bold>Asks</Text>
          {asks.length ? asks.map((a) => <Text key={a.id}>  {a.id} {a.kind} · {a.state} · {a.text}</Text>) : <Text dimColor>  (none)</Text>}
        </Frame>
      );
    }
  }

  if (detail.kind === 'job') {
    const j = board.jobs.find((x) => x.id === detail.id);
    if (j) {
      return (
        <Frame title={`${j.id}  ${j.title}`}>
          <Field label="state">{jobStateText(j)}</Field>
          <Field label="progress">{progressText(j.progress)}</Field>
          <Field label="message">{j.progress.msg ?? j.message}</Field>
          <Field label="command">{j.command}</Field>
          <Field label="session">{j.session}</Field>
          <Field label="project">{tildify(j.project, homeDir)}</Field>
          <Field label="process">{j.pid !== null ? `pid ${j.pid}${j.child_pid ? ` / child ${j.child_pid}` : ''} on ${j.host}` : null}</Field>
          <Field label="started">{when(j.started_at, now)}</Field>
          <Field label="updated">{when(j.lastUpdate, now)}</Field>
          <Field label="ended">{when(j.ended_at, now)}</Field>
          <Field label="log">{j.log}</Field>
          {j.log ? <Text dimColor>── log (last {logLines.length} lines) ──</Text> : null}
          {logLines.map((line, i) => (
            <Text key={i} wrap="truncate-end">
              {line}
            </Text>
          ))}
        </Frame>
      );
    }
  }

  if (detail.kind === 'goal') {
    const g = board.goals.find((x) => x.id === detail.id);
    if (g) {
      return (
        <Frame title={`${g.id}  ${g.title}`}>
          <Field label="status">{goalSummaryText(g)}</Field>
          <Field label="session">{g.session}</Field>
          <Field label="project">{tildify(g.project, homeDir)}</Field>
          <Field label="updated">{when(g.updated_at, now)}</Field>
          {g.steps.map((s, i) => (
            <Text key={i} wrap="wrap">
              {String(i + 1).padStart(2)}. {STEP_MARK[s.status]} {s.text}
            </Text>
          ))}
        </Frame>
      );
    }
  }

  if (detail.kind === 'ask') {
    const a = board.asks.find((x) => x.id === detail.id);
    if (a) {
      return (
        <Frame title={`${a.id}  ${a.kind}`}>
          <Field label="state">{a.state}</Field>
          <Field label="session">{a.session}</Field>
          <Field label="project">{tildify(a.project, homeDir)}</Field>
          <Field label="created">{when(a.created_at, now)}</Field>
          <Text wrap="wrap">{a.text}</Text>
        </Frame>
      );
    }
  }

  return (
    <Frame title={`${detail.kind} ${detail.id}`}>
      <Text dimColor>This item is no longer on the board (finished, archived or filtered out).</Text>
    </Frame>
  );
}
