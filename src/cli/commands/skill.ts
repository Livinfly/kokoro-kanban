import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Option } from 'commander';
import { action, type App, KokoroError } from '../context.js';

export const SKILL_TARGETS = { codex: '.codex', claude: '.claude', cursor: '.cursor' } as const;
type Target = keyof typeof SKILL_TARGETS;

const SKILL_REL = path.join('skills', 'kokoro-kanban', 'SKILL.md');

export function bundledSkillPath(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 5; i++) {
    const candidate = path.join(dir, SKILL_REL);
    if (existsSync(candidate)) return candidate;
    dir = path.dirname(dir);
  }
  throw new KokoroError(`could not find ${SKILL_REL} next to the kokoro installation`);
}

export function registerSkill(app: App): void {
  const skill = app.program.command('skill').description('install the agent skill (codex|claude|cursor)');

  skill
    .command('install')
    .description('copy SKILL.md into the agent skills directory')
    .addOption(
      new Option('--target <agent>', 'which agent to install for').choices(Object.keys(SKILL_TARGETS)).makeOptionMandatory(),
    )
    .action(
      action(app, (ctx, opts: { target: Target }) => {
        const dest = path.join(ctx.homeDir(), SKILL_TARGETS[opts.target], SKILL_REL);
        mkdirSync(path.dirname(dest), { recursive: true });
        copyFileSync(bundledSkillPath(), dest);
        ctx.out(dest, { installed: dest });
      }),
    );
}
