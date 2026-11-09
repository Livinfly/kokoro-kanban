import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export default function setup(): void {
  const root = fileURLToPath(new URL('..', import.meta.url));
  if (!existsSync(`${root}src/bin.ts`)) return;
  execFileSync(process.execPath, [`${root}node_modules/tsup/dist/cli-default.js`, '--silent'], {
    cwd: root,
    stdio: 'inherit',
  });
}
