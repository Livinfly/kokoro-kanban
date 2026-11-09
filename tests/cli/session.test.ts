import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Session } from '../../src/model/schema.js';
import { entityPath } from '../../src/store/paths.js';
import { readRegistry } from '../../src/store/registry.js';
import { cli, readJson } from './harness.js';

describe('kokoro session', () => {
  it('start creates a working session in the global store', async () => {
    const k = cli();
    const id = await k.ok(['session', 'start', '--agent', 'codex', '--title', '重构登录']);
    expect(id).toMatch(/^s-[0-9a-z]{4}$/);
    const s = readJson<Session>(entityPath(k.sb.home, 'session', id));
    expect(s).toMatchObject({ v: 1, agent: 'codex', title: '重构登录', status: 'working', project: k.sb.work });
  });

  it('rejects an unknown agent with the allowed values', async () => {
    const r = await cli().run(['session', 'start', '--agent', 'bogus', '--title', 't']);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/codex, claude, cursor, other/);
  });

  it('start --id creates, then resumes an ended session without error', async () => {
    const k = cli();
    expect(await k.ok(['session', 'start', '--agent', 'claude', '--title', 't', '--id', 'my.sess'])).toBe('my.sess');
    await k.ok(['session', 'end', 'my.sess']);
    await k.ok(['session', 'start', '--agent', 'claude', '--title', 't2', '--id', 'my.sess']);
    const s = readJson<Session>(entityPath(k.sb.home, 'session', 'my.sess'));
    expect(s).toMatchObject({ status: 'working', ended_at: null, title: 't2' });
  });

  it('rejects an invalid custom id', async () => {
    const r = await cli().run(['session', 'start', '--agent', 'codex', '--title', 't', '--id', 'a/b']);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/invalid session id/);
  });

  it('update changes status, summary and updated_at', async () => {
    const k = cli();
    const t1 = new Date('2026-11-09T08:00:00.000Z');
    const t2 = new Date('2026-11-09T08:05:00.000Z');
    const id = await k.ok(['session', 'start', '--agent', 'codex', '--title', 't'], { now: t1 });
    await k.ok(['session', 'update', id, '--status', 'waiting', '--summary', '等你确认'], { now: t2 });
    const s = readJson<Session>(entityPath(k.sb.home, 'session', id));
    expect(s).toMatchObject({ status: 'waiting', summary: '等你确认', updated_at: t2.toISOString() });
  });

  it('update on an unknown id fails with a hint', async () => {
    const r = await cli().run(['session', 'update', 's-none', '--status', 'idle']);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/session s-none not found/);
    expect(r.stderr).toMatch(/kokoro status/);
  });

  it('end marks the session ended', async () => {
    const k = cli();
    const id = await k.ok(['session', 'start', '--agent', 'codex', '--title', 't']);
    await k.ok(['session', 'end', id, '--summary', 'done']);
    const s = readJson<Session>(entityPath(k.sb.home, 'session', id));
    expect(s.status).toBe('ended');
    expect(s.ended_at).not.toBeNull();
    expect(s.summary).toBe('done');
  });

  it('--json prints the entity', async () => {
    const out = await cli().ok(['session', 'start', '--agent', 'codex', '--title', 't', '--json']);
    expect(JSON.parse(out)).toMatchObject({ title: 't', status: 'working' });
  });
});

describe('store selection', () => {
  it('init creates a project store, registers it, and later writes go there', async () => {
    const k = cli();
    const out = await k.ok(['init']);
    const store = path.join(k.sb.work, '.kokoro-kanban');
    expect(out).toBe(store);
    expect(existsSync(path.join(store, 'sessions'))).toBe(true);
    expect(readRegistry(k.sb.home)).toEqual([store]);

    const sub = path.join(k.sb.work, 'src', 'deep');
    mkdirSync(sub, { recursive: true });
    const id = await k.ok(['session', 'start', '--agent', 'codex', '--title', 't'], { cwd: sub });
    const s = readJson<Session>(entityPath(store, 'session', id));
    expect(s.project).toBe(k.sb.work);
  });

  it('init refuses to turn the global store into a project store', async () => {
    const k = cli();
    const r = await k.run(['init'], { cwd: path.dirname(k.sb.home) });
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/global store/);
  });

  it('--store and KOKORO_STORE override resolution', async () => {
    const k = cli();
    const envStore = path.join(k.sb.root, 'env', '.kokoro-kanban');
    const flagStore = path.join(k.sb.root, 'flag', '.kokoro-kanban');
    const a = await k.ok(['session', 'start', '--agent', 'codex', '--title', 't'], { env: { KOKORO_STORE: envStore } });
    expect(existsSync(entityPath(envStore, 'session', a))).toBe(true);
    const b = await k.ok(['--store', flagStore, 'session', 'start', '--agent', 'codex', '--title', 't'], {
      env: { KOKORO_STORE: envStore },
    });
    expect(existsSync(entityPath(flagStore, 'session', b))).toBe(true);
  });

  it('still writes to a project store when the global registry is not writable', async () => {
    const k = cli();
    await k.ok(['init']);
    const blocked = path.join(k.sb.root, 'not-a-dir');
    writeFileSync(blocked, '');
    const r = await k.run(['session', 'start', '--agent', 'cursor', '--title', 't'], {
      env: { KOKORO_HOME: path.join(blocked, '.kokoro-kanban') },
    });
    expect(r.code).toBe(0);
    expect(r.stderr).toMatch(/could not register/);
    expect(existsSync(entityPath(path.join(k.sb.work, '.kokoro-kanban'), 'session', r.stdout.trim()))).toBe(true);
  });

  it('updates find an entity in another known store', async () => {
    const k = cli();
    await k.ok(['init']);
    const id = await k.ok(['session', 'start', '--agent', 'codex', '--title', 't']);
    await k.ok(['session', 'update', id, '--summary', 'from elsewhere'], { cwd: k.sb.root });
    const s = readJson<Session>(entityPath(path.join(k.sb.work, '.kokoro-kanban'), 'session', id));
    expect(s.summary).toBe('from elsewhere');
  });
});
