import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { entityPath, logPath, progressPath } from '../../src/store/paths.js';
import { cli } from './harness.js';

describe('kokoro archive', () => {
  it('moves an ended session into archive/', async () => {
    const k = cli();
    const sid = await k.ok(['session', 'start', '--agent', 'codex', '--title', 't', '--id', 'custom.id']);
    await k.ok(['session', 'end', sid]);
    expect(await k.ok(['archive', sid])).toBe(sid);
    expect(existsSync(entityPath(k.sb.home, 'session', sid))).toBe(false);
    expect(existsSync(path.join(k.sb.home, 'archive', 'sessions', `${sid}.json`))).toBe(true);
  });

  it('refuses unfinished entities without archiving anything', async () => {
    const k = cli();
    const done = await k.ok(['goal', 'add', '--title', 'a']);
    await k.ok(['goal', 'done', done]);
    const live = await k.ok(['session', 'start', '--agent', 'codex', '--title', 't']);
    const r = await k.run(['archive', done, live]);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(new RegExp(`session ${live} is not finished`));
    expect(existsSync(entityPath(k.sb.home, 'goal', done))).toBe(true);
  });

  it('archives a finished job with its progress and log files', async () => {
    const k = cli();
    const jid = await k.ok(['job', 'start', '--title', 't']);
    await k.ok(['job', 'progress', jid, '--pct', '100']);
    writeFileSync(logPath(k.sb.home, jid), 'out\n');
    await k.ok(['job', 'end', jid, '--state', 'done']);
    await k.ok(['archive', jid]);
    expect(existsSync(progressPath(k.sb.home, jid))).toBe(false);
    expect(existsSync(path.join(k.sb.home, 'archive', 'jobs', `${jid}.log`))).toBe(true);
  });

  it('fails on unknown ids', async () => {
    const r = await cli().run(['archive', 'j-none']);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/j-none not found/);
  });
});
