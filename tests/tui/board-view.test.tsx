import { renderToString } from 'ink';
import { describe, expect, it } from 'vitest';
import { BoardView } from '../../src/tui/components/BoardView.js';
import { initialUi, type UiState } from '../../src/tui/ui-state.js';
import { NOW, sampleBoard } from './board-fixture.js';

function view(ui: UiState, columns = 120, logLines: string[] = []): string {
  return renderToString(
    <BoardView board={sampleBoard()} ui={ui} width={columns} height={40} now={NOW} homeDir="/home/me" logLines={logLines} />,
    { columns },
  );
}

const lineOf = (text: string, needle: string) => text.split('\n').findIndex((l) => l.includes(needle));

describe('BoardView overview', () => {
  it('shows all four panels with their content', () => {
    const out = view(initialUi());
    for (const title of ['Needs you', 'Sessions', 'Jobs', 'Goals / Next']) expect(out).toContain(title);
    expect(out).toContain('要不要删掉旧的 session 表？');
    expect(out).toContain('~/work/app');
    expect(out).toContain('下载模型');
    expect(out).toContain('78%');
    expect(out).toContain('迁移 middleware');
  });

  it('marks lost jobs and stale sessions', () => {
    const out = view(initialUi());
    expect(out).toMatch(/j-8812.*lost/);
    expect(out).toMatch(/s-old1.*stale/);
  });

  it('puts sessions and jobs side by side when wide and stacks them when narrow', () => {
    const wide = view(initialUi(), 120);
    expect(lineOf(wide, 'Sessions (')).toBe(lineOf(wide, 'Jobs ('));
    const narrow = view(initialUi(), 80);
    expect(lineOf(narrow, 'Sessions (')).toBeLessThan(lineOf(narrow, 'Jobs ('));
  });
});

describe('BoardView single panel', () => {
  it('renders only the focused panel', () => {
    const out = view({ ...initialUi('jobs') });
    expect(out).toContain('下载模型');
    expect(out).not.toContain('改 middleware');
    expect(out).not.toContain('要不要删掉旧的 session 表？');
  });
});

describe('BoardView detail', () => {
  it('shows job fields and the log tail', () => {
    const out = view({ ...initialUi(), detail: { kind: 'job', id: 'j-2c91' } }, 120, ['line one', 'line two']);
    expect(out).toContain('下载模型');
    expect(out).toContain('shard 3/4');
    expect(out).toContain('line two');
  });

  it('shows a session with its goals and asks', () => {
    const out = view({ ...initialUi(), detail: { kind: 'session', id: 's-7f3a' } });
    expect(out).toContain('重构登录');
    expect(out).toContain('登录重构');
    expect(out).toContain('要不要删掉旧的 session 表？');
  });

  it('explains when the item is gone', () => {
    expect(view({ ...initialUi(), detail: { kind: 'goal', id: 'g-gone' } })).toMatch(/no longer on the board/);
  });
});
