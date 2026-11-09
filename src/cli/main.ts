import { Command, CommanderError } from 'commander';
import pkg from '../../package.json' with { type: 'json' };
import { registerArchive } from './commands/archive.js';
import { registerAsk } from './commands/ask.js';
import { registerDoctor } from './commands/doctor.js';
import { registerGoal } from './commands/goal.js';
import { registerInit } from './commands/init.js';
import { registerJob } from './commands/job.js';
import { registerRun } from './commands/run.js';
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
  registerGoal(app);
  registerJob(app);
  registerAsk(app);
  registerRun(app);
  registerArchive(app);
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
