import { spawn } from 'node:child_process';
import { closeSync, mkdirSync, openSync, writeSync } from 'node:fs';
import { constants } from 'node:os';
import path from 'node:path';
import type { Job } from '../model/schema.js';
import { logPath, progressPath, type Env } from '../store/paths.js';
import { readEntity, writeEntity } from '../store/repo.js';

export type ExecOptions = {
  store: string;
  jobId: string;
  argv: string[];
  tee: boolean;
  env: Env;
};

const FORWARDED_SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const;

export function displayCommand(argv: string[]): string {
  return argv.map((a) => (/^[\w@%+=:,./-]+$/.test(a) ? a : `'${a.replace(/'/g, `'\\''`)}'`)).join(' ');
}

function updateJob(store: string, jobId: string, change: (job: Job) => Partial<Job>): void {
  const job = readEntity(store, 'job', jobId);
  if (!job) return;
  writeEntity(store, 'job', { ...job, ...change(job), updated_at: new Date().toISOString() });
}

export function execJob(opts: ExecOptions): Promise<number> {
  const { store, jobId, argv } = opts;
  updateJob(store, jobId, () => ({ pid: process.pid }));

  const log = logPath(store, jobId);
  mkdirSync(path.dirname(log), { recursive: true });
  const logFd = openSync(log, 'a');

  const child = spawn(argv[0]!, argv.slice(1), {
    stdio: opts.tee ? ['inherit', 'pipe', 'pipe'] : ['ignore', logFd, logFd],
    env: {
      ...opts.env,
      KOKORO_JOB: jobId,
      KOKORO_STORE: store,
      KOKORO_PROGRESS_FILE: progressPath(store, jobId),
    },
  });

  if (opts.tee) {
    child.stdout!.on('data', (chunk: Buffer) => {
      process.stdout.write(chunk);
      writeSync(logFd, chunk);
    });
    child.stderr!.on('data', (chunk: Buffer) => {
      process.stderr.write(chunk);
      writeSync(logFd, chunk);
    });
  }

  let cancelled = false;
  const forward = (signal: NodeJS.Signals) => {
    cancelled = true;
    child.kill(signal);
  };
  for (const signal of FORWARDED_SIGNALS) process.on(signal, forward);

  return new Promise<number>((resolve) => {
    let settled = false;
    const finish = (fields: Partial<Job>, exitCode: number) => {
      if (settled) return;
      settled = true;
      for (const signal of FORWARDED_SIGNALS) process.off(signal, forward);
      closeSync(logFd);
      updateJob(store, jobId, () => ({ ...fields, ended_at: new Date().toISOString() }));
      resolve(exitCode);
    };

    child.on('spawn', () => updateJob(store, jobId, () => ({ child_pid: child.pid ?? null })));

    child.on('error', (err: NodeJS.ErrnoException) => {
      const missing = err.code === 'ENOENT';
      const message = missing ? `command not found: ${argv[0]}` : err.message;
      if (opts.tee) process.stderr.write(`kokoro: ${message}\n`);
      finish({ state: 'failed', exit_code: null, message }, missing ? 127 : 1);
    });

    child.on('close', (code, signal) => {
      const exitCode = code ?? 128 + (signal ? (constants.signals[signal] ?? 0) : 0);
      const state: Job['state'] = cancelled ? 'cancelled' : code === 0 ? 'done' : 'failed';
      const message = signal ? `killed by ${signal}` : null;
      finish({ state, exit_code: code, message }, exitCode);
    });
  });
}

export function spawnDetachedExec(opts: { store: string; jobId: string; argv: string[]; env: Env; cwd: string }): void {
  const self = [...process.execArgv, process.argv[1]!];
  const child = spawn(
    process.execPath,
    [...self, '--store', opts.store, '__exec-job', opts.jobId, '--', ...opts.argv],
    { detached: true, stdio: 'ignore', env: opts.env, cwd: opts.cwd },
  );
  child.unref();
}
