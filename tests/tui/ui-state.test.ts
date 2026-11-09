import { describe, expect, it } from 'vitest';
import { initialUi, itemsFor, type KeyEvent, reduceKey, type UiState } from '../../src/tui/ui-state.js';
import { sampleBoard } from './board-fixture.js';

const board = sampleBoard();
const press = (input: string, key: KeyEvent['key'] = {}): KeyEvent => ({ input, key });

function run(ui: UiState, ...events: KeyEvent[]): UiState {
  return events.reduce((acc, ev) => reduceKey(acc, ev, board).ui, ui);
}

describe('reduceKey navigation', () => {
  it('tab cycles focus through the four panels, shift+tab goes back', () => {
    const tab = press('', { tab: true });
    expect(run(initialUi(), tab).focus).toBe('sessions');
    expect(run(initialUi(), tab, tab, tab, tab).focus).toBe('needs');
    expect(run(initialUi(), press('', { tab: true, shift: true })).focus).toBe('goals');
  });

  it('number keys enter single-panel mode and 0 returns to overview', () => {
    const single = run(initialUi(), press('2'));
    expect(single).toMatchObject({ mode: 'single', focus: 'sessions' });
    expect(run(single, press('0')).mode).toBe('overview');
  });

  it('left and right switch panels only in single mode', () => {
    const single = run(initialUi(), press('2'), press('', { rightArrow: true }));
    expect(single.focus).toBe('jobs');
    expect(run(single, press('', { leftArrow: true })).focus).toBe('sessions');
    expect(run(initialUi(), press('', { rightArrow: true })).focus).toBe('needs');
  });

  it('j and k move within bounds', () => {
    const ui = run(initialUi('sessions'), press('j'), press('j'), press('j'), press('j'));
    expect(ui.selected.sessions).toBe(itemsFor('sessions', board).length - 1);
    expect(run(ui, press('k')).selected.sessions).toBe(itemsFor('sessions', board).length - 2);
    expect(run(initialUi('sessions'), press('k')).selected.sessions).toBe(0);
  });

  it('enter opens the selected item and esc closes it', () => {
    const open = run(initialUi('jobs'), press('', { return: true }));
    expect(open.detail).toEqual({ kind: 'job', id: board.jobs[0]!.id });
    expect(run(open, press('', { escape: true })).detail).toBeNull();
  });
});

describe('reduceKey actions', () => {
  it('x on an open ask yields a resolve effect', () => {
    const { effect } = reduceKey(initialUi('needs'), press('x'), board);
    expect(effect).toEqual({ type: 'resolve', kind: 'ask', id: 'a-9d0e', store: '/store' });
  });

  it('a on a running job does nothing but explain', () => {
    const { ui, effect } = reduceKey(initialUi('jobs'), press('a'), board);
    expect(effect).toBeUndefined();
    expect(ui.message).toMatch(/finished/);
  });

  it('a on a finished job yields an archive effect', () => {
    const lastJob = itemsFor('jobs', board).length - 1;
    const ui = { ...initialUi('jobs'), selected: { ...initialUi().selected, jobs: lastJob } };
    expect(reduceKey(ui, press('a'), board).effect).toMatchObject({ type: 'archive', kind: 'job', id: 'j-77aa' });
  });

  it('p cycles through all projects and back to none', () => {
    const seen = [initialUi()];
    for (let i = 0; i <= board.projects.length; i++) seen.push(run(seen.at(-1)!, press('p')));
    expect(seen.map((u) => u.projectFilter)).toEqual([null, ...board.projects, null]);
  });

  it('. toggles showing everything', () => {
    expect(run(initialUi(), press('.')).showAll).toBe(true);
    expect(run(initialUi(), press('.'), press('.')).showAll).toBe(false);
  });

  it('q quits', () => {
    expect(reduceKey(initialUi(), press('q'), board).effect).toEqual({ type: 'quit' });
  });

  it('any key clears a previous message', () => {
    const withMessage = { ...initialUi(), message: 'old' };
    expect(run(withMessage, press('j')).message).toBeNull();
  });
});
