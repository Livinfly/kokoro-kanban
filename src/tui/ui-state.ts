import type { Key } from 'ink';
import type { Kind } from '../model/schema.js';
import type { Board } from '../view/board.js';
import { PANELS, type PanelId } from './panels.js';

export type Selectable = { kind: Kind; id: string; store: string; finished: boolean };

export type UiState = {
  mode: 'overview' | 'single';
  focus: PanelId;
  selected: Record<PanelId, number>;
  detail: { kind: Kind; id: string } | null;
  projectFilter: string | null;
  showAll: boolean;
  message: string | null;
};

export type KeyEvent = { input: string; key: Partial<Key> };

export type Effect = { type: 'resolve' | 'archive'; kind: Kind; id: string; store: string } | { type: 'quit' };

const noSelection = (): Record<PanelId, number> => ({ needs: 0, sessions: 0, jobs: 0, goals: 0 });

export function initialUi(panel?: PanelId, projectFilter: string | null = null): UiState {
  return {
    mode: panel ? 'single' : 'overview',
    focus: panel ?? 'needs',
    selected: noSelection(),
    detail: null,
    projectFilter,
    showAll: false,
    message: null,
  };
}

export function itemsFor(panel: PanelId, board: Board): Selectable[] {
  switch (panel) {
    case 'needs':
      return board.needs.map((a) => ({ kind: 'ask', id: a.id, store: a.store, finished: a.state === 'resolved' }));
    case 'sessions':
      return board.sessionGroups.flatMap((g) =>
        g.sessions.map((s) => ({ kind: 'session' as const, id: s.id, store: s.store, finished: s.status === 'ended' })),
      );
    case 'jobs':
      return board.jobs.map((j) => ({ kind: 'job', id: j.id, store: j.store, finished: j.display !== 'running' }));
    case 'goals':
      return board.goals.map((g) => ({ kind: 'goal', id: g.id, store: g.store, finished: g.status !== 'active' }));
  }
}

export function selectedIndex(ui: UiState, panel: PanelId, count: number): number {
  return Math.max(0, Math.min(ui.selected[panel], count - 1));
}

function selectedItem(ui: UiState, board: Board): Selectable | null {
  const items = itemsFor(ui.focus, board);
  return items[selectedIndex(ui, ui.focus, items.length)] ?? null;
}

function findItem(board: Board, detail: { kind: Kind; id: string }): Selectable | null {
  for (const panel of PANELS) {
    const hit = itemsFor(panel, board).find((i) => i.kind === detail.kind && i.id === detail.id);
    if (hit) return hit;
  }
  return null;
}

function moveFocus(ui: UiState, delta: number): UiState {
  const i = PANELS.indexOf(ui.focus);
  return { ...ui, focus: PANELS[(i + delta + PANELS.length) % PANELS.length]! };
}

function moveSelection(ui: UiState, board: Board, delta: number): UiState {
  const count = itemsFor(ui.focus, board).length;
  const next = Math.max(0, Math.min(count - 1, selectedIndex(ui, ui.focus, count) + delta));
  return { ...ui, selected: { ...ui.selected, [ui.focus]: next } };
}

export function reduceKey(previous: UiState, ev: KeyEvent, board: Board): { ui: UiState; effect?: Effect } {
  const { input, key } = ev;
  const ui: UiState = { ...previous, message: null };

  if (input === 'q' || (key.ctrl && input === 'c')) return { ui, effect: { type: 'quit' } };

  if (input === 'x' || input === 'a') {
    const target = ui.detail ? findItem(board, ui.detail) : selectedItem(ui, board);
    if (input === 'x') {
      if (target?.kind === 'ask' && !target.finished) {
        return { ui: { ...ui, detail: null }, effect: { type: 'resolve', kind: 'ask', id: target.id, store: target.store } };
      }
      return { ui: { ...ui, message: 'x resolves an open ask' } };
    }
    if (target?.finished) {
      return { ui: { ...ui, detail: null }, effect: { type: 'archive', kind: target.kind, id: target.id, store: target.store } };
    }
    return { ui: { ...ui, message: 'only finished items can be archived' } };
  }

  if (ui.detail) {
    if (key.escape || key.backspace || key.return) return { ui: { ...ui, detail: null } };
    return { ui };
  }

  if (key.tab) return { ui: moveFocus(ui, key.shift ? -1 : 1) };
  if (ui.mode === 'single' && (key.leftArrow || key.rightArrow)) return { ui: moveFocus(ui, key.leftArrow ? -1 : 1) };
  if (input === 'j' || key.downArrow) return { ui: moveSelection(ui, board, 1) };
  if (input === 'k' || key.upArrow) return { ui: moveSelection(ui, board, -1) };
  if (key.return) {
    const item = selectedItem(ui, board);
    return { ui: item ? { ...ui, detail: { kind: item.kind, id: item.id } } : ui };
  }
  if (/^[1-4]$/.test(input)) return { ui: { ...ui, mode: 'single', focus: PANELS[Number(input) - 1]! } };
  if (input === '0') return { ui: { ...ui, mode: 'overview' } };
  if (input === 'p') {
    const options: (string | null)[] = [null, ...board.projects];
    const next = options[(options.indexOf(ui.projectFilter) + 1) % options.length] ?? null;
    return { ui: { ...ui, projectFilter: next, selected: noSelection() } };
  }
  if (input === '.') return { ui: { ...ui, showAll: !ui.showAll } };
  return { ui };
}
