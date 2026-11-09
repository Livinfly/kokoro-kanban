import { Command, CommanderError } from 'commander';
import pkg from '../../package.json' with { type: 'json' };
import { registerDoctor } from './commands/doctor.js';
import { registerInit } from './commands/init.js';
import { registerSession } from './commands/session.js';
import { registerStatus } from './commands/status.js';
import { type App, type IO, KokoroError } from './context.js';

export async function main(argv: string[], io: IO): Promise<number> {
  let exitCode = 0;
  const program = new Command('kokoro')
    .description(
      'A local kanban for agent sessions. Agents report progress with these\ncommands; `kokoro board` shows everything live.',
    )
    .version(pkg.version, '-V, --version')
    .option('--store <dir>', 'write to this store instead of auto-resolving')
    .option('--json', 'machine-readable output')
    .exitOverride()
    .configureOutput({ writeOut: io.stdout, writeErr: io.stderr });

  const app: App = {
    program,
    io,
    setExit: (code) => {
      exitCode = code;
    },
  };
  registerSession(app);
  registerInit(app);
  registerStatus(app);
  registerDoctor(app);

  try {
    await program.parseAsync(argv, { from: 'user' });
    return exitCode;
  } catch (err) {
    if (err instanceof CommanderError) return err.exitCode;
    io.stderr(`kokoro: ${err instanceof Error ? err.message : String(err)}\n`);
    return err instanceof KokoroError ? err.exitCode : 1;
  }
}
