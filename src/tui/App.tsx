import { useApp, useInput, useWindowSize } from 'ink';
import { useMemo, useState } from 'react';
import { readTail } from '../store/fsutil.js';
import { currentProject } from '../store/paths.js';
import { archiveEntity, readEntity, writeEntity } from '../store/repo.js';
import { BoardView } from './components/BoardView.js';
import type { PanelId } from './panels.js';
import { type Effect, initialUi, reduceKey } from './ui-state.js';
import { useBoard } from './useBoard.js';

export type AppProps = { home: string; homeDir: string; cwd: string; here: boolean; panel?: PanelId };

const LOG_LINES = 30;
const LOG_TAIL_BYTES = 64 * 1024;

function applyEffect(effect: Exclude<Effect, { type: 'quit' }>): void {
  if (effect.type === 'archive') {
    archiveEntity(effect.store, effect.kind, effect.id);
    return;
  }
  const ask = readEntity(effect.store, 'ask', effect.id);
  if (ask) writeEntity(effect.store, 'ask', { ...ask, state: 'resolved', resolved_at: new Date().toISOString() });
}

export function App({ home, homeDir, cwd, here, panel }: AppProps) {
  const [ui, setUi] = useState(() => initialUi(panel, here ? currentProject(cwd, home) : null));
  const { board, now, version } = useBoard({ home, projectFilter: ui.projectFilter, showAll: ui.showAll });
  const { columns, rows } = useWindowSize();
  const { exit } = useApp();

  useInput((input, key) => {
    const { ui: next, effect } = reduceKey(ui, { input, key }, board);
    if (effect?.type === 'quit') {
      exit();
      return;
    }
    if (effect) {
      try {
        applyEffect(effect);
      } catch (err) {
        setUi({ ...next, message: `failed: ${(err as Error).message}` });
        return;
      }
    }
    setUi(next);
  });

  const detail = ui.detail;
  const logLines = useMemo(() => {
    if (detail?.kind !== 'job') return [];
    const log = board.jobs.find((j) => j.id === detail.id)?.log;
    if (!log) return [];
    const lines = readTail(log, LOG_TAIL_BYTES).replace(/\r/g, '\n').split('\n');
    return lines.filter((l, i) => l !== '' || i < lines.length - 1).slice(-LOG_LINES);
  }, [detail, board, version, now]);

  return <BoardView board={board} ui={ui} width={columns} height={rows} now={now} homeDir={homeDir} logLines={logLines} />;
}
