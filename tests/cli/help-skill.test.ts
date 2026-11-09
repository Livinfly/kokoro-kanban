import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { cli } from './harness.js';

const SKILL = fileURLToPath(new URL('../../skills/kokoro-kanban/SKILL.md', import.meta.url));

describe('help text', () => {
  it('kokoro -h explains store resolution and the typical agent flow', async () => {
    const r = await cli().run(['-h']);
    expect(r.code).toBe(0);
    for (const word of ['Store resolution', 'Typical agent flow', 'session', 'goal', 'job', 'run', 'ask', 'board']) {
      expect(r.stdout).toContain(word);
    }
    expect(r.stdout).not.toContain('__exec-job');
  });

  it('subcommand help lists its options', async () => {
    const r = await cli().run(['job', 'progress', '-h']);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('--pct');
  });

  it('prints the version', async () => {
    expect((await cli().run(['-V'])).stdout.trim()).toBe('0.0.1');
  });
});

describe('kokoro skill install', () => {
  it('ships a skill with frontmatter and the session id variables', () => {
    const text = readFileSync(SKILL, 'utf8');
    expect(text).toMatch(/^---\nname: kokoro-kanban\ndescription: .+\n---\n/);
    for (const v of ['CODEX_THREAD_ID', 'CLAUDE_CODE_SESSION_ID', 'CURSOR_CONVERSATION_ID']) expect(text).toContain(v);
  });

  it.each([
    ['codex', '.agents'],
    ['claude', '.claude'],
    ['cursor', '.cursor'],
  ])('copies SKILL.md for %s into its default user skills directory', async (target, dir) => {
    const k = cli();
    const out = await k.ok(['skill', 'install', '--target', target]);
    const dest = path.join(k.sb.env.HOME!, dir, 'skills', 'kokoro-kanban', 'SKILL.md');
    expect(out).toBe(dest);
    expect(existsSync(dest)).toBe(true);
    expect(readFileSync(dest, 'utf8')).toBe(readFileSync(SKILL, 'utf8'));
  });

  it.each([
    ['claude', 'CLAUDE_CONFIG_DIR'],
    ['cursor', 'CURSOR_CONFIG_DIR'],
  ])('honours the config directory variable for %s', async (target, variable) => {
    const k = cli();
    const configDir = path.join(k.sb.root, `custom-${target}`);
    const out = await k.ok(['skill', 'install', '--target', target], { env: { [variable]: configDir } });
    expect(out).toBe(path.join(configDir, 'skills', 'kokoro-kanban', 'SKILL.md'));
    expect(existsSync(out)).toBe(true);
  });

  it('expands a leading ~ in the config directory variable', async () => {
    const k = cli();
    const out = await k.ok(['skill', 'install', '--target', 'claude'], { env: { CLAUDE_CONFIG_DIR: '~/.claude-work' } });
    expect(out).toBe(path.join(k.sb.env.HOME!, '.claude-work', 'skills', 'kokoro-kanban', 'SKILL.md'));
  });

  it('ignores CODEX_HOME because Codex reads user skills from ~/.agents/skills', async () => {
    const k = cli();
    const out = await k.ok(['skill', 'install', '--target', 'codex'], { env: { CODEX_HOME: path.join(k.sb.root, 'codex') } });
    expect(out).toBe(path.join(k.sb.env.HOME!, '.agents', 'skills', 'kokoro-kanban', 'SKILL.md'));
  });

  it('--dir installs into any skills directory, relative to cwd', async () => {
    const k = cli();
    const out = await k.ok(['skill', 'install', '--dir', '.agents/skills']);
    expect(out).toBe(path.join(k.sb.work, '.agents', 'skills', 'kokoro-kanban', 'SKILL.md'));
    expect(existsSync(out)).toBe(true);
  });

  it('needs exactly one of --target and --dir', async () => {
    expect((await cli().run(['skill', 'install'])).code).toBe(1);
    expect((await cli().run(['skill', 'install', '--target', 'codex', '--dir', 'x'])).code).toBe(1);
  });

  it('rejects an unknown target', async () => {
    expect((await cli().run(['skill', 'install', '--target', 'vim'])).code).toBe(1);
  });
});
