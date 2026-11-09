import { Box, Text } from 'ink';
import type { ReactNode } from 'react';
import type { Board } from '../../view/board.js';
import { tildify } from '../../view/format.js';
import { PANEL_TITLES, PANELS, type PanelId } from '../panels.js';
import { itemsFor, selectedIndex, type UiState } from '../ui-state.js';
import { Detail } from './Detail.js';
import { GoalRow, JobRow, NeedRow, SessionRow } from './rows.js';

export type BoardViewProps = {
  board: Board;
  ui: UiState;
  width: number;
  height: number;
  now: Date;
  homeDir: string;
  logLines: string[];
};

const OVERVIEW_LIMIT: Record<PanelId, number> = { needs: 3, sessions: 6, jobs: 6, goals: 4 };
const LINES_PER_ITEM: Record<PanelId, number> = { needs: 1, sessions: 2, jobs: 2, goals: 2 };
const WIDE = 100;

function windowRange(count: number, selected: number, max: number): [number, number] {
  if (count <= max) return [0, count];
  const start = Math.max(0, Math.min(count - max, selected - Math.floor(max / 2)));
  return [start, start + max];
}

function Panel(props: { id: PanelId; p: BoardViewProps; limit: number }) {
  const { id, p, limit } = props;
  const { board, ui, now, homeDir } = p;
  const focused = ui.focus === id;
  const count = itemsFor(id, board).length;
  const sel = selectedIndex(ui, id, count);
  const [start, end] = windowRange(count, sel, limit);
  const isSel = (i: number) => focused && i === sel;
  const rows: ReactNode[] = [];

  if (id === 'needs') {
    const titles = new Map(board.sessionGroups.flatMap((g) => g.sessions.map((s) => [s.id, s.title] as const)));
    board.needs.slice(start, end).forEach((a, k) => {
      rows.push(
        <NeedRow key={a.id} item={a} selected={isSel(start + k)} now={now} sessionTitle={a.session ? titles.get(a.session) : undefined} />,
      );
    });
  } else if (id === 'sessions') {
    const flat = board.sessionGroups.flatMap((g) => g.sessions.map((s) => ({ project: g.project, s })));
    let lastProject: string | null = null;
    flat.slice(start, end).forEach(({ project, s }, k) => {
      if (project !== lastProject) {
        rows.push(
          <Text key={`p:${project}`} bold wrap="truncate-end">
            {tildify(project, homeDir)}
          </Text>,
        );
        lastProject = project;
      }
      rows.push(<SessionRow key={s.id} item={s} selected={isSel(start + k)} now={now} />);
    });
  } else if (id === 'jobs') {
    board.jobs.slice(start, end).forEach((j, k) => rows.push(<JobRow key={j.id} item={j} selected={isSel(start + k)} now={now} />));
  } else {
    board.goals.slice(start, end).forEach((g, k) => rows.push(<GoalRow key={g.id} item={g} selected={isSel(start + k)} now={now} />));
  }

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={focused ? 'cyan' : 'gray'} paddingX={1} flexGrow={1}>
      <Text bold color={focused ? 'cyan' : undefined}>
        {PANEL_TITLES[id]} ({count})
      </Text>
      {count === 0 ? <Text dimColor>(none)</Text> : rows}
      {start > 0 ? <Text dimColor>… {start} above</Text> : null}
      {end < count ? <Text dimColor>… {count - end} more</Text> : null}
    </Box>
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function Header({ p }: { p: BoardViewProps }) {
  const { board, ui, now, homeDir } = p;
  const filters = [
    ui.projectFilter ? `project ${tildify(ui.projectFilter, homeDir)}` : null,
    ui.showAll ? 'showing all' : null,
  ].filter(Boolean);
  return (
    <Box justifyContent="space-between" paddingX={1}>
      <Text wrap="truncate-end">
        <Text bold color="cyan">
          kokoro-kanban
        </Text>
        {'  '}
        {plural(board.counts.sessions, 'session')} · {plural(board.counts.running, 'job')} running ·{' '}
        <Text color={board.counts.needs ? 'yellow' : undefined}>{board.counts.needs} needs you</Text>
        {filters.length ? <Text dimColor>{`  [${filters.join(' · ')}]`}</Text> : null}
      </Text>
      <Text dimColor>{now.toTimeString().slice(0, 5)}</Text>
    </Box>
  );
}

function Tabs({ ui }: { ui: UiState }) {
  return (
    <Box paddingX={1} gap={1}>
      {PANELS.map((id, i) => (
        <Text key={id} inverse={ui.focus === id} color={ui.focus === id ? 'cyan' : undefined}>
          {` ${i + 1} ${PANEL_TITLES[id]} `}
        </Text>
      ))}
    </Box>
  );
}

function Footer({ p }: { p: BoardViewProps }) {
  const { ui, board } = p;
  const hints = ui.detail
    ? 'esc back  x resolve  a archive  q quit'
    : ui.mode === 'single'
      ? 'tab/←→ panel  j/k move  enter detail  x resolve  a archive  p project  . all  0 overview  q quit'
      : 'tab panel  j/k move  enter detail  x resolve  a archive  p project  . all  1-4 single  q quit';
  return (
    <Box flexDirection="column" paddingX={1}>
      {ui.message ? <Text color="yellow">{ui.message}</Text> : null}
      {board.errors.length ? (
        <Text color="red">{board.errors.length} file(s) failed to parse; run `kokoro doctor`</Text>
      ) : null}
      <Text dimColor wrap="truncate-end">
        {hints}
      </Text>
    </Box>
  );
}

export function BoardView(p: BoardViewProps) {
  const { ui, width, height } = p;
  let body: ReactNode;
  if (ui.detail) {
    body = <Detail board={p.board} detail={ui.detail} now={p.now} homeDir={p.homeDir} logLines={p.logLines} />;
  } else if (ui.mode === 'single') {
    const limit = Math.max(3, Math.floor((height - 8) / LINES_PER_ITEM[ui.focus]));
    body = (
      <>
        <Tabs ui={ui} />
        <Panel id={ui.focus} p={p} limit={limit} />
      </>
    );
  } else {
    const wide = width >= WIDE;
    body = (
      <>
        <Panel id="needs" p={p} limit={OVERVIEW_LIMIT.needs} />
        <Box flexDirection={wide ? 'row' : 'column'}>
          <Box width={wide ? '50%' : '100%'}>
            <Panel id="sessions" p={p} limit={OVERVIEW_LIMIT.sessions} />
          </Box>
          <Box width={wide ? '50%' : '100%'}>
            <Panel id="jobs" p={p} limit={OVERVIEW_LIMIT.jobs} />
          </Box>
        </Box>
        <Panel id="goals" p={p} limit={OVERVIEW_LIMIT.goals} />
      </>
    );
  }
  return (
    <Box flexDirection="column" width={width}>
      <Header p={p} />
      {body}
      <Footer p={p} />
    </Box>
  );
}
