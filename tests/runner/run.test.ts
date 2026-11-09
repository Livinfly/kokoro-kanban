import { type ChildProcess, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isAlive } from '../../src/model/derive.js';
import { foldProgress } from '../../src/model/progress.js';
import type { Job } from '../../src/model/schema.js';
import { StoreIndex } from '../../src/store/index.js';
import { logPath, progressPath } from '../../src/store/paths.js';
import { readEntity } from '../../src/store/repo.js';
import { boardFrom } from '../../src/view/load.js';
import { type Sandbox, sandbox } from '../helpers.js';

const BIN = fileURLToPath(new URL('../../dist/bin.js', import.meta.url));

type Result = { code: number | null; stdout: string; stderr: string };

function start(sb: Sandbox, args: string[]): { child: ChildProcess; done: Promise<Result> } {
  const child = spawn(process.execPath, [BIN, ...args], { cwd: sb.work, env: { ...process.env, ...sb.env } });
  let stdout = '';
  let stderr = '';
  child.stdout!.on('data', (d) => (stdout += d));
  child.stderr!.on('data', (d) => (stderr += d));
  const done = new Promise<Result>((resolve) => child.on('close', (code) => resolve({ code, stdout, stderr })));
  return { child, done };
}

const kokoro = (sb: Sandbox, args: string[]) => start(sb, args).done;

const onlyJob = (sb: Sandbox): Job => {
  const index = new StoreIndex([sb.home]);
  index.loadAll();
  const jobs = index.snapshot().jobs;
  expect(jobs).toHaveLength(1);
  return readEntity(sb.home, 'job', jobs[0]!.id)!;
};

async function waitFor<T>(probe: () => T | null | undefined | false, timeoutMs = 5000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    let value: T | null | undefined | false = null;
    try {
      value = probe();
    } catch {
      value = null;
    }
    if (value) return value;
    if (Date.now() > deadline) throw new Error('timed out waiting');
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe('kokoro run (foreground)', () => {
  it('tees output to the terminal and the log, and records success', async () => {
    const sb = sandbox();
    const r = await kokoro(sb, ['run', '--title', 'ok', '--', 'sh', '-c', 'echo hi']);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('hi');
    const job = onlyJob(sb);
    expect(job).toMatchObject({ state: 'done', exit_code: 0, title: 'ok', command: "sh -c 'echo hi'" });
    expect(job.child_pid).not.toBeNull();
    expect(readFileSync(logPath(sb.home, job.id), 'utf8')).toContain('hi');
  });

  it('mirrors a failing exit code', async () => {
    const sb = sandbox();
    const r = await kokoro(sb, ['run', '--title', 'bad', '--', 'sh', '-c', 'exit 3']);
    expect(r.code).toBe(3);
    expect(onlyJob(sb)).toMatchObject({ state: 'failed', exit_code: 3 });
  });

  it('exits 127 when the command does not exist', async () => {
    const sb = sandbox();
    const r = await kokoro(sb, ['run', '--title', 'nope', '--', 'definitely-not-a-cmd-kk']);
    expect(r.code).toBe(127);
    const job = onlyJob(sb);
    expect(job.state).toBe('failed');
    expect(job.message).toMatch(/not found/);
  });

  it('lets the child report progress through the injected environment', async () => {
    const sb = sandbox();
    const script = [
      `"${process.execPath}" "${BIN}" job progress "$KOKORO_JOB" --pct 50`,
      `echo '{"pct":75,"msg":"three quarters"}' >> "$KOKORO_PROGRESS_FILE"`,
    ].join(' && ');
    const r = await kokoro(sb, ['run', '--title', 'p', '--', 'sh', '-c', script]);
    expect(r.code, r.stderr).toBe(0);
    const job = onlyJob(sb);
    const lines = readFileSync(progressPath(sb.home, job.id), 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(foldProgress(lines)).toMatchObject({ pct: 75, msg: 'three quarters' });
  });

  it('records cancelled when the wrapper gets SIGTERM', async () => {
    const sb = sandbox();
    const { child, done } = start(sb, ['run', '--title', 'long', '--', 'sleep', '30']);
    await waitFor(() => onlyJob(sb).child_pid);
    child.kill('SIGTERM');
    const r = await done;
    expect(r.code).toBe(143);
    expect(onlyJob(sb)).toMatchObject({ state: 'cancelled' });
  });
});

describe('kokoro run --detach', () => {
  it('returns immediately and the job finishes in the background', async () => {
    const sb = sandbox();
    const t0 = Date.now();
    const r = await kokoro(sb, ['run', '--detach', '--title', 'bg', '--', 'sh', '-c', 'sleep 1; echo finished']);
    expect(Date.now() - t0).toBeLessThan(1500);
    expect(r.code).toBe(0);
    const id = r.stdout.trim();
    expect(id).toMatch(/^j-[0-9a-z]{4}$/);
    const job = await waitFor(() => {
      const j = readEntity(sb.home, 'job', id);
      return j?.state === 'done' ? j : null;
    });
    expect(job.exit_code).toBe(0);
    expect(readFileSync(logPath(sb.home, id), 'utf8')).toContain('finished');
  });

  it('shows up as lost after the background wrapper is killed', async () => {
    const sb = sandbox();
    const r = await kokoro(sb, ['run', '--detach', '--title', 'victim', '--', 'sleep', '30']);
    const id = r.stdout.trim();
    const job = await waitFor(() => {
      const j = readEntity(sb.home, 'job', id);
      return j?.pid && j.child_pid ? j : null;
    });
    try {
      process.kill(job.pid!, 'SIGKILL');
      await waitFor(() => !isAlive(job.pid!));
      const index = new StoreIndex([sb.home]);
      index.loadAll();
      const board = boardFrom(index, { home: sb.home, now: new Date(), projectFilter: null, showAll: false });
      expect(board.jobs.map((j) => j.display)).toEqual(['lost']);
    } finally {
      if (isAlive(job.child_pid!)) process.kill(job.child_pid!, 'SIGKILL');
    }
  });
});
