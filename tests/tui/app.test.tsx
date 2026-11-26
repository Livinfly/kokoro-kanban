import { existsSync, mkdirSync, rmdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { render } from 'ink-testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import { archiveDir, logPath, progressPath } from '../../src/store/paths.js';
import { registerStore } from '../../src/store/registry.js';
import { readEntity, writeEntity } from '../../src/store/repo.js';
import { App } from '../../src/tui/App.js';
import { makeAsk, makeGoal, makeJob, makeSession } from '../fixtures.js';
import { sandbox } from '../helpers.js';

const instances: { unmount: () => void }[] = [];
afterEach(() => {
  while (instances.length) instances.pop()!.unmount();
});

async function until(check: () => boolean, label = 'condition', timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

function mount(home: string) {
  const app = render(<App home={home} homeDir="/nowhere" cwd="/" here={false} />);
  instances.push(app);
  return app;
}

describe('App', () => {
  it('picks up a new session file without restarting', async () => {
    const sb = sandbox();
    const app = mount(sb.home);
    await until(() => (app.lastFrame() ?? '').includes('Sessions (0)'));
    await new Promise((r) => setTimeout(r, 200));
    writeEntity(sb.home, 'session', makeSession({ id: 's-live', title: '热加载测试', updated_at: new Date().toISOString() }));
    await until(() => (app.lastFrame() ?? '').includes('热加载测试'));
  });

  it('resolves an ask with x', async () => {
    const sb = sandbox();
    writeEntity(sb.home, 'ask', makeAsk({ id: 'a-0001', text: '要确认吗', created_at: new Date().toISOString() }));
    const app = mount(sb.home);
    await until(() => (app.lastFrame() ?? '').includes('要确认吗'), 'initial frame');
    app.stdin.write('x');
    await until(() => readEntity(sb.home, 'ask', 'a-0001')?.state === 'resolved', 'ask file resolved');
    await until(() => (app.lastFrame() ?? '').includes('Needs you (0)'), 'frame refreshed');
  });

  it('archives done jobs and goals in the project filter with A, including hidden ones', async () => {
    const sb = sandbox();
    const projectStore = path.join(sb.work, '.kokoro-kanban');
    const now = new Date().toISOString();
    const old = new Date(Date.now() - 48 * 3_600_000).toISOString();
    writeEntity(projectStore, 'job', makeJob({ id: 'j-old', title: 'Old done job', state: 'done', ended_at: old }));
    writeFileSync(progressPath(projectStore, 'j-old'), '{"pct":100}\n');
    writeFileSync(logPath(projectStore, 'j-old'), 'finished\n');
    registerStore(sb.home, projectStore);
    writeEntity(sb.home, 'goal', makeGoal({ id: 'g-done', title: 'Done goal', status: 'done', updated_at: now }));
    writeEntity(sb.home, 'job', makeJob({ id: 'j-failed', state: 'failed', ended_at: now }));
    writeEntity(sb.home, 'job', makeJob({ id: 'j-running' }));
    writeEntity(sb.home, 'goal', makeGoal({ id: 'g-dropped', status: 'dropped', updated_at: now }));
    writeEntity(sb.home, 'job', makeJob({ id: 'j-other', project: '/work/other', state: 'done', ended_at: now }));

    const app = mount(sb.home);
    await until(() => (app.lastFrame() ?? '').includes('A archive done'));
    app.stdin.write('p');
    await until(() => (app.lastFrame() ?? '').includes('project /work/app'));
    expect(app.lastFrame()).not.toContain('Old done job');
    app.stdin.write('A');
    await until(() => (app.lastFrame() ?? '').includes('archived 2 done items'));

    expect(readEntity(projectStore, 'job', 'j-old')).toBeNull();
    for (const name of ['j-old.json', 'j-old.progress.jsonl', 'j-old.log']) {
      expect(existsSync(path.join(archiveDir(projectStore, 'job'), name))).toBe(true);
    }
    expect(readEntity(sb.home, 'goal', 'g-done')).toBeNull();
    expect(existsSync(path.join(archiveDir(sb.home, 'goal'), 'g-done.json'))).toBe(true);
    expect(readEntity(sb.home, 'job', 'j-failed')?.state).toBe('failed');
    expect(readEntity(sb.home, 'job', 'j-running')?.state).toBe('running');
    expect(readEntity(sb.home, 'job', 'j-other')?.state).toBe('done');
    expect(readEntity(sb.home, 'goal', 'g-dropped')?.status).toBe('dropped');
    expect(app.lastFrame()).not.toContain('Done goal');

    app.stdin.write('A');
    await until(() => (app.lastFrame() ?? '').includes('no done jobs or goals to archive'));
  });

  it('continues archiving after an item fails and lets A retry it', async () => {
    const sb = sandbox();
    const now = new Date().toISOString();
    writeEntity(sb.home, 'job', makeJob({ id: 'j-blocked', state: 'done', ended_at: now }));
    writeFileSync(logPath(sb.home, 'j-blocked'), 'finished\n');
    const blocked = path.join(archiveDir(sb.home, 'job'), 'j-blocked.log');
    mkdirSync(blocked, { recursive: true });
    writeEntity(sb.home, 'goal', makeGoal({ id: 'g-done', status: 'done', updated_at: now }));

    const app = mount(sb.home);
    await until(() => (app.lastFrame() ?? '').includes('j-blocked'));
    app.stdin.write('A');
    await until(() => (app.lastFrame() ?? '').includes('archived 1 done item · failed: j-blocked'));
    expect(readEntity(sb.home, 'job', 'j-blocked')?.state).toBe('done');
    expect(readEntity(sb.home, 'goal', 'g-done')).toBeNull();

    rmdirSync(blocked);
    app.stdin.write('A');
    await until(() => (app.lastFrame() ?? '').includes('Jobs (0)'));
    expect(readEntity(sb.home, 'job', 'j-blocked')).toBeNull();
    expect(existsSync(blocked)).toBe(true);
  });

  it('switches to single-panel mode with a number key', async () => {
    const sb = sandbox();
    writeEntity(sb.home, 'session', makeSession({ id: 's-0001', title: '单面板', updated_at: new Date().toISOString() }));
    const app = mount(sb.home);
    await until(() => (app.lastFrame() ?? '').includes('单面板'));
    app.stdin.write('3');
    await until(() => !(app.lastFrame() ?? '').includes('单面板'));
  });
});
