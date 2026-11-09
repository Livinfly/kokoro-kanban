import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach } from 'vitest';

const created: string[] = [];

afterEach(() => {
  while (created.length) rmSync(created.pop()!, { recursive: true, force: true });
});

export function tempDir(prefix = 'kokoro-'): string {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), prefix)));
  created.push(dir);
  return dir;
}

export type Sandbox = { root: string; home: string; work: string; env: Record<string, string | undefined> };

export function sandbox(): Sandbox {
  const root = tempDir();
  const home = path.join(root, 'home', '.kokoro-kanban');
  const work = path.join(root, 'work');
  mkdirSync(work, { recursive: true });
  return { root, home, work, env: { KOKORO_HOME: home, HOME: path.join(root, 'home') } };
}
