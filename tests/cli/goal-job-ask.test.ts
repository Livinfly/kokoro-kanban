import { readFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { describe, expect, it } from 'vitest';
import type { Ask, Goal, Job, Session } from '../../src/model/schema.js';
import { entityPath, progressPath } from '../../src/store/paths.js';
import { cli, readJson } from './harness.js';

const T1 = new Date('2026-11-09T08:00:00.000Z');
const T2 = new Date('2026-11-09T08:10:00.000Z');

async function withSession() {
  const k = cli();
  const sid = await k.ok(['session', 'start', '--agent', 'codex', '--title', 's'], { now: T1 });
  const session = () => readJson<Session>(entityPath(k.sb.home, 'session', sid));
  return { ...k, sid, session };
}

describe('kokoro goal', () => {
  it('add creates an active goal with todo steps and touches the session', async () => {
    const k = await withSession();
    const gid = await k.ok(['goal', 'add', '--session', k.sid, '--title', '微调', '--step', '下载', '--step', '训练'], {
      now: T2,
    });
    expect(gid).toMatch(/^g-[0-9a-z]{4}$/);
    const g = readJson<Goal>(entityPath(k.sb.home, 'goal', gid));
    expect(g).toMatchObject({
      session: k.sid,
      status: 'active',
      project: k.sb.work,
      steps: [
        { text: '下载', status: 'todo' },
        { text: '训练', status: 'todo' },
      ],
    });
    expect(k.session().updated_at).toBe(T2.toISOString());
  });

  it('add with an unknown session fails', async () => {
    const r = await cli().run(['goal', 'add', '--session', 's-none', '--title', 't']);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/session s-none not found/);
  });

  it('step sets statuses by 1-based index and appends steps', async () => {
    const k = await withSession();
    const gid = await k.ok(['goal', 'add', '--session', k.sid, '--title', 't', '--step', 'a', '--step', 'b']);
    await k.ok(['goal', 'step', gid, '--set', '1=done', '--set', '2=doing', '--add', 'c'], { now: T2 });
    const g = readJson<Goal>(entityPath(k.sb.home, 'goal', gid));
    expect(g.steps.map((s) => `${s.text}:${s.status}`)).toEqual(['a:done', 'b:doing', 'c:todo']);
    expect(k.session().updated_at).toBe(T2.toISOString());
  });

  it('step rejects out-of-range indexes, bad statuses and empty calls', async () => {
    const k = await withSession();
    const gid = await k.ok(['goal', 'add', '--title', 't', '--step', 'a']);
    for (const args of [['--set', '3=done'], ['--set', '1=finished'], ['--set', 'x'], []]) {
      const r = await k.run(['goal', 'step', gid, ...args]);
      expect(r.code, args.join(' ')).toBe(1);
    }
  });

  it('done and drop set the status', async () => {
    const k = await withSession();
    const a = await k.ok(['goal', 'add', '--title', 'a']);
    const b = await k.ok(['goal', 'add', '--title', 'b']);
    await k.ok(['goal', 'done', a]);
    await k.ok(['goal', 'drop', b]);
    expect(readJson<Goal>(entityPath(k.sb.home, 'goal', a)).status).toBe('done');
    expect(readJson<Goal>(entityPath(k.sb.home, 'goal', b)).status).toBe('dropped');
  });
});

describe('kokoro job', () => {
  it('start records host and pid; --json includes progress_file and log', async () => {
    const k = await withSession();
    const out = await k.ok(['job', 'start', '--session', k.sid, '--title', '下载', '--pid', '123', '--json']);
    const job = JSON.parse(out) as Job & { progress_file: string };
    expect(job).toMatchObject({ state: 'running', pid: 123, host: hostname(), session: k.sid, log: null });
    expect(job.progress_file).toBe(progressPath(k.sb.home, job.id));
  });

  it('start resolves --log relative to cwd', async () => {
    const k = cli();
    const id = await k.ok(['job', 'start', '--title', 't', '--log', 'out.log']);
    expect(readJson<Job>(entityPath(k.sb.home, 'job', id)).log).toBe(`${k.sb.work}/out.log`);
  });

  it('progress appends one line with a timestamp', async () => {
    const k = cli();
    const id = await k.ok(['job', 'start', '--title', 't']);
    await k.ok(['job', 'progress', id, '--pct', '40', '--msg', '一半了'], { now: T2 });
    await k.ok(['job', 'progress', id, '--done', '3', '--total', '9', '--unit', 'files']);
    const lines = readFileSync(progressPath(k.sb.home, id), 'utf8').trim().split('\n');
    expect(JSON.parse(lines[0]!)).toEqual({ pct: 40, msg: '一半了', at: T2.toISOString() });
    expect(JSON.parse(lines[1]!)).toMatchObject({ done: 3, total: 9, unit: 'files' });
  });

  it('progress rejects empty updates and non-numbers', async () => {
    const k = cli();
    const id = await k.ok(['job', 'start', '--title', 't']);
    expect((await k.run(['job', 'progress', id])).code).toBe(1);
    expect((await k.run(['job', 'progress', id, '--pct', 'lots'])).code).toBe(1);
  });

  it('end records state, exit code and message', async () => {
    const k = cli();
    const id = await k.ok(['job', 'start', '--title', 't']);
    await k.ok(['job', 'end', id, '--state', 'failed', '--exit-code', '2', '--msg', 'boom'], { now: T2 });
    expect(readJson<Job>(entityPath(k.sb.home, 'job', id))).toMatchObject({
      state: 'failed',
      exit_code: 2,
      message: 'boom',
      ended_at: T2.toISOString(),
    });
  });
});

describe('kokoro ask', () => {
  it('add creates an open ask, joining unquoted words', async () => {
    const k = await withSession();
    const id = await k.ok(['ask', 'add', '--session', k.sid, '--kind', 'approval', '现在', '开始训练吗？'], { now: T2 });
    expect(id).toMatch(/^a-[0-9a-z]{4}$/);
    expect(readJson<Ask>(entityPath(k.sb.home, 'ask', id))).toMatchObject({
      kind: 'approval',
      text: '现在 开始训练吗？',
      state: 'open',
      session: k.sid,
    });
    expect(k.session().updated_at).toBe(T2.toISOString());
  });

  it('add rejects an unknown kind', async () => {
    const r = await cli().run(['ask', 'add', '--kind', 'urgent', 'x']);
    expect(r.code).toBe(1);
  });

  it('resolve marks it resolved', async () => {
    const k = cli();
    const id = await k.ok(['ask', 'add', '--kind', 'question', 'x']);
    await k.ok(['ask', 'resolve', id]);
    const a = readJson<Ask>(entityPath(k.sb.home, 'ask', id));
    expect(a.state).toBe('resolved');
    expect(a.resolved_at).not.toBeNull();
  });
});
