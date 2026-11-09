import { appendFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { StoreIndex } from '../../src/store/index.js';
import { knownStores, locateEntity } from '../../src/store/locate.js';
import { entityPath, progressPath } from '../../src/store/paths.js';
import { registerStore } from '../../src/store/registry.js';
import { writeEntity } from '../../src/store/repo.js';
import { makeGoal, makeJob, makeSession } from '../fixtures.js';
import { sandbox } from '../helpers.js';

function twoStores() {
  const sb = sandbox();
  const project = path.join(sb.work, '.kokoro-kanban');
  writeEntity(sb.home, 'session', makeSession({ id: 's-home' }));
  writeEntity(project, 'goal', makeGoal({ id: 'g-proj' }));
  return { ...sb, project };
}

describe('StoreIndex', () => {
  it('loads entities from several stores and tags their store', () => {
    const { home, project } = twoStores();
    const index = new StoreIndex([home, project]);
    index.loadAll();
    const snap = index.snapshot();
    expect(snap.sessions.map((s) => [s.id, s.store])).toEqual([['s-home', home]]);
    expect(snap.goals.map((g) => [g.id, g.store])).toEqual([['g-proj', project]]);
    expect(snap.errors).toEqual([]);
  });

  it('reports malformed files as errors instead of throwing', () => {
    const { home } = sandbox();
    mkdirSync(path.join(home, 'asks'), { recursive: true });
    writeFileSync(entityPath(home, 'ask', 'a-bad1'), '{"v":');
    const index = new StoreIndex([home]);
    index.loadAll();
    const snap = index.snapshot();
    expect(snap.asks).toEqual([]);
    expect(snap.errors).toHaveLength(1);
    expect(snap.errors[0]!.path).toBe(entityPath(home, 'ask', 'a-bad1'));
  });

  it('refreshes a single added, changed or deleted file', () => {
    const { home } = sandbox();
    const index = new StoreIndex([home]);
    index.loadAll();
    writeEntity(home, 'session', makeSession({ id: 's-new1', title: 'one' }));
    expect(index.refreshPath(entityPath(home, 'session', 's-new1'))).toBe(true);
    expect(index.snapshot().sessions.map((s) => s.title)).toEqual(['one']);

    writeEntity(home, 'session', makeSession({ id: 's-new1', title: 'two' }));
    index.refreshPath(entityPath(home, 'session', 's-new1'));
    expect(index.snapshot().sessions.map((s) => s.title)).toEqual(['two']);

    rmSync(entityPath(home, 'session', 's-new1'));
    index.refreshPath(entityPath(home, 'session', 's-new1'));
    expect(index.snapshot().sessions).toEqual([]);
  });

  it('re-folds job progress when the progress file changes', () => {
    const { home } = sandbox();
    writeEntity(home, 'job', makeJob({ id: 'j-0001' }));
    const index = new StoreIndex([home]);
    index.loadAll();
    expect(index.snapshot().jobs[0]!.progress.pct).toBeNull();
    appendFileSync(progressPath(home, 'j-0001'), '{"pct":42}\n');
    expect(index.refreshPath(progressPath(home, 'j-0001'))).toBe(true);
    expect(index.snapshot().jobs[0]!.progress.pct).toBe(42);
  });

  it('ignores temp files and paths outside its stores', () => {
    const { home, root } = sandbox();
    const index = new StoreIndex([home]);
    index.loadAll();
    mkdirSync(path.join(home, 'sessions'), { recursive: true });
    const tmp = path.join(home, 'sessions', '.s-0001.json.1.tmp');
    writeFileSync(tmp, '{}');
    expect(index.refreshPath(tmp)).toBe(false);
    expect(index.refreshPath(path.join(root, 'elsewhere.json'))).toBe(false);
  });
});

describe('knownStores and locateEntity', () => {
  it('lists the home store first plus existing registered stores, reporting missing ones', () => {
    const { home, project, root } = twoStores();
    const gone = path.join(root, 'gone', '.kokoro-kanban');
    registerStore(home, project);
    registerStore(home, gone);
    expect(knownStores(home)).toEqual({ stores: [home, project], missing: [gone] });
  });

  it('finds an entity outside the preferred store', () => {
    const { home, project } = twoStores();
    registerStore(home, project);
    const found = locateEntity('goal', 'g-proj', home, home);
    expect(found?.store).toBe(project);
    expect(found?.entity.id).toBe('g-proj');
    expect(locateEntity('goal', 'g-none', home, home)).toBeNull();
  });
});
