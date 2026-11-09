import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { registerStore } from '../../src/store/registry.js';
import { cli } from './harness.js';

describe('kokoro status', () => {
  it('shows sessions grouped by tildified project', async () => {
    const k = cli();
    const proj = path.join(k.sb.env.HOME!, 'proj');
    mkdirSync(proj, { recursive: true });
    await k.ok(['session', 'start', '--agent', 'codex', '--title', '重构登录', '--summary', '改 middleware'], {
      cwd: proj,
    });
    const out = await k.ok(['status']);
    expect(out).toContain('SESSIONS');
    expect(out).toContain('~/proj');
    expect(out).toContain('重构登录');
    expect(out).toContain('改 middleware');
    expect(out).toContain('NEEDS YOU (0)');
  });

  it('--json returns the board', async () => {
    const k = cli();
    await k.ok(['session', 'start', '--agent', 'codex', '--title', 't']);
    const board = JSON.parse(await k.ok(['status', '--json']));
    expect(board.sessionGroups[0].sessions[0].title).toBe('t');
    expect(board.counts).toEqual({ sessions: 1, running: 0, needs: 0 });
  });

  it('--here keeps only the current project', async () => {
    const k = cli();
    const other = path.join(k.sb.root, 'other');
    mkdirSync(other);
    await k.ok(['session', 'start', '--agent', 'codex', '--title', 'mine']);
    await k.ok(['session', 'start', '--agent', 'codex', '--title', 'theirs'], { cwd: other });
    const out = await k.ok(['status', '--here']);
    expect(out).toContain('mine');
    expect(out).not.toContain('theirs');
  });
});

describe('kokoro board without a terminal', () => {
  it('prints the status snapshot instead of hanging, also as the default command', async () => {
    const k = cli();
    await k.ok(['session', 'start', '--agent', 'codex', '--title', '无终端']);
    for (const argv of [['board'], []]) {
      const r = await k.run(argv);
      expect(r.code).toBe(0);
      expect(r.stdout).toContain('无终端');
      expect(r.stderr).toMatch(/not a terminal/);
    }
  });

  it('rejects an unknown panel', async () => {
    const r = await cli().run(['board', '--panel', 'nope']);
    expect(r.code).toBe(1);
  });
});

describe('kokoro doctor', () => {
  it('prints ok for a clean setup', async () => {
    const k = cli();
    await k.ok(['session', 'start', '--agent', 'codex', '--title', 't']);
    const r = await k.run(['doctor']);
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe('ok');
  });

  it('reports malformed files and missing stores', async () => {
    const k = cli();
    mkdirSync(path.join(k.sb.home, 'goals'), { recursive: true });
    const bad = path.join(k.sb.home, 'goals', 'g-bad1.json');
    writeFileSync(bad, '{"v": 1}');
    const gone = path.join(k.sb.root, 'gone', '.kokoro-kanban');
    registerStore(k.sb.home, gone);
    const r = await k.run(['doctor']);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain(bad);
    expect(r.stdout).toContain(gone);
  });
});
