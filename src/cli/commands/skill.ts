import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Option } from 'commander';
import type { Env } from '../../store/paths.js';
import { action, type App, type CliContext, KokoroError } from '../context.js';

const SKILL_NAME = 'kokoro-kanban';
const SKILL_REL = path.join('skills', SKILL_NAME, 'SKILL.md');

type Target = 'codex' | 'claude' | 'cursor';

/** Where each agent loads user-level skills from. */
const TARGETS: Record<Target, { configVar: string | null; defaultDir: string }> = {
  codex: { configVar: null, defaultDir: '.agents' },
  claude: { configVar: 'CLAUDE_CONFIG_DIR', defaultDir: '.claude' },
  cursor: { configVar: 'CURSOR_CONFIG_DIR', defaultDir: '.cursor' },
};

export function bundledSkillPath(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 5; i++) {
    const candidate = path.join(dir, SKILL_REL);
    if (existsSync(candidate)) return candidate;
    dir = path.dirname(dir);
  }
  throw new KokoroError(`could not find ${SKILL_REL} next to the kokoro installation`);
}

function expandHome(p: string, homeDir: string): string {
  return p === '~' || p.startsWith('~/') ? path.join(homeDir, p.slice(1)) : p;
}

export function skillsDirFor(target: Target, env: Env, homeDir: string): string {
  const { configVar, defaultDir } = TARGETS[target];
  const configured = configVar ? env[configVar]?.trim() : undefined;
  const base = configured ? path.resolve(expandHome(configured, homeDir)) : path.join(homeDir, defaultDir);
  return path.join(base, 'skills');
}

function destinationFor(ctx: CliContext, opts: { target?: Target; dir?: string }): string {
  if (Boolean(opts.target) === Boolean(opts.dir)) throw new KokoroError('pass exactly one of --target or --dir');
  const skillsDir = opts.dir
    ? path.resolve(ctx.io.cwd, expandHome(opts.dir, ctx.homeDir()))
    : skillsDirFor(opts.target!, ctx.io.env, ctx.homeDir());
  return path.join(skillsDir, SKILL_NAME, 'SKILL.md');
}

export function registerSkill(app: App): void {
  const skill = app.program.command('skill').description('install the agent skill (codex|claude|cursor)');

  skill
    .command('install')
    .description('copy SKILL.md into an agent skills directory')
    .addOption(new Option('--target <agent>', 'install for this agent').choices(Object.keys(TARGETS)))
    .option('--dir <path>', 'install into this skills directory instead, e.g. .agents/skills')
    .addHelpText(
      'after',
      '\nDestinations:\n' +
        '  codex   ~/.agents/skills/kokoro-kanban/       (Codex no longer recommends $CODEX_HOME/skills)\n' +
        '  claude  $CLAUDE_CONFIG_DIR/skills/kokoro-kanban/, default ~/.claude/skills/\n' +
        '  cursor  $CURSOR_CONFIG_DIR/skills/kokoro-kanban/, default ~/.cursor/skills/\n' +
        '  --dir   <path>/kokoro-kanban/',
    )
    .action(
      action(app, (ctx, opts: { target?: Target; dir?: string }) => {
        const dest = destinationFor(ctx, opts);
        mkdirSync(path.dirname(dest), { recursive: true });
        copyFileSync(bundledSkillPath(), dest);
        ctx.out(dest, { installed: dest });
      }),
    );
}
