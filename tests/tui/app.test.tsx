import { render } from 'ink-testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../src/tui/App.js';
import { readEntity, writeEntity } from '../../src/store/repo.js';
import { makeAsk, makeSession } from '../fixtures.js';
import { sandbox } from '../helpers.js';

const instances: { unmount: () => void }[] = [];
afterEach(() => {
  while (instances.length) instances.pop()!.unmount();
});

async function until(check: () => boolean, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('timed out');
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
    await until(() => (app.lastFrame() ?? '').includes('要确认吗'));
    app.stdin.write('x');
    await until(() => readEntity(sb.home, 'ask', 'a-0001')?.state === 'resolved');
    await until(() => (app.lastFrame() ?? '').includes('Needs you (0)'));
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
