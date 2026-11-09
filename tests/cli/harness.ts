import { readFileSync } from 'node:fs';
import { main } from '../../src/cli/main.js';
import { type Sandbox, sandbox } from '../helpers.js';

export type CliResult = { code: number; stdout: string; stderr: string };

export type RunOptions = { cwd?: string; env?: Record<string, string | undefined>; now?: Date };

export function cli(sb: Sandbox = sandbox()) {
  const run = async (argv: string[], opts: RunOptions = {}): Promise<CliResult> => {
    let stdout = '';
    let stderr = '';
    const code = await main(argv, {
      cwd: opts.cwd ?? sb.work,
      env: { ...sb.env, ...opts.env },
      stdout: (s) => {
        stdout += s;
      },
      stderr: (s) => {
        stderr += s;
      },
      now: opts.now ? () => opts.now! : undefined,
    });
    return { code, stdout, stderr };
  };
  const ok = async (argv: string[], opts?: RunOptions): Promise<string> => {
    const r = await run(argv, opts);
    if (r.code !== 0) throw new Error(`kokoro ${argv.join(' ')} exited ${r.code}: ${r.stderr}`);
    return r.stdout.trim();
  };
  return { sb, run, ok };
}

export function readJson<T = Record<string, unknown>>(file: string): T {
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}
