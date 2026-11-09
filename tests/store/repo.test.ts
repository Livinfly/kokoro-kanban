import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { archiveEntity, listIds, readEntity, writeEntity } from '../../src/store/repo.js';
import { entityPath, logPath, progressPath } from '../../src/store/paths.js';
import { makeJob, makeSession } from '../fixtures.js';
import { sandbox } from '../helpers.js';

describe('repo', () => {
  it('round-trips an entity', () => {
    const { home } = sandbox();
    const s = makeSession({ id: 's-abcd' });
    writeEntity(home, 'session', s);
    expect(readEntity(home, 'session', 's-abcd')).toEqual(s);
    expect(readEntity(home, 'session', 's-none')).toBeNull();
  });

  it('throws a readable error for an invalid file', () => {
    const { home } = sandbox();
    mkdirSync(path.join(home, 'sessions'), { recursive: true });
    writeFileSync(entityPath(home, 'session', 's-bad1'), JSON.stringify({ v: 1, id: 's-bad1' }));
    expect(() => readEntity(home, 'session', 's-bad1')).toThrow(/s-bad1\.json/);
  });

  it('lists ids and ignores temp and non-entity files', () => {
    const { home } = sandbox();
    writeEntity(home, 'job', makeJob({ id: 'j-0001' }));
    writeFileSync(path.join(home, 'jobs', '.j-0002.json.123.tmp'), '{}');
    writeFileSync(progressPath(home, 'j-0001'), '');
    writeFileSync(logPath(home, 'j-0001'), '');
    expect(listIds(home, 'job')).toEqual(['j-0001']);
    expect(listIds(home, 'goal')).toEqual([]);
  });

  it('archives a job together with its progress and log files', () => {
    const { home } = sandbox();
    writeEntity(home, 'job', makeJob({ id: 'j-0001', state: 'done' }));
    writeFileSync(progressPath(home, 'j-0001'), '{"pct":100}\n');
    writeFileSync(logPath(home, 'j-0001'), 'hi\n');
    archiveEntity(home, 'job', 'j-0001');
    expect(listIds(home, 'job')).toEqual([]);
    for (const name of ['j-0001.json', 'j-0001.progress.jsonl', 'j-0001.log']) {
      expect(existsSync(path.join(home, 'archive', 'jobs', name))).toBe(true);
    }
  });
});
