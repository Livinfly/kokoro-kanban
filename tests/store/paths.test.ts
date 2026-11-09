import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findProjectStore, homeStore, resolveWriteStore } from '../../src/store/paths.js';
import { sandbox } from '../helpers.js';

describe('homeStore', () => {
  it('honours KOKORO_HOME', () => {
    expect(homeStore({ KOKORO_HOME: '/x/y' })).toBe('/x/y');
  });

  it('defaults to ~/.kokoro-kanban', () => {
    expect(homeStore({ HOME: '/users/me' })).toBe('/users/me/.kokoro-kanban');
  });
});

describe('findProjectStore', () => {
  it('walks up to the nearest .kokoro-kanban directory', () => {
    const sb = sandbox();
    const store = path.join(sb.work, 'a', '.kokoro-kanban');
    mkdirSync(store, { recursive: true });
    mkdirSync(path.join(sb.work, 'a', 'b', 'c'), { recursive: true });
    expect(findProjectStore(path.join(sb.work, 'a', 'b', 'c'), sb.home)).toBe(store);
  });

  it('never treats the global store as a project store', () => {
    const sb = sandbox();
    mkdirSync(sb.home, { recursive: true });
    const under = path.join(path.dirname(sb.home), 'proj');
    mkdirSync(under, { recursive: true });
    expect(findProjectStore(under, sb.home)).toBeNull();
  });
});

describe('resolveWriteStore', () => {
  it('falls back to the global store', () => {
    const sb = sandbox();
    expect(resolveWriteStore({ env: sb.env, cwd: sb.work })).toEqual({
      dir: sb.home,
      kind: 'global',
      projectRoot: null,
    });
  });

  it('prefers a project store over the global one', () => {
    const sb = sandbox();
    const store = path.join(sb.work, '.kokoro-kanban');
    mkdirSync(store);
    expect(resolveWriteStore({ env: sb.env, cwd: sb.work })).toEqual({
      dir: store,
      kind: 'project',
      projectRoot: sb.work,
    });
  });

  it('lets KOKORO_STORE beat the project store and --store beat both', () => {
    const sb = sandbox();
    mkdirSync(path.join(sb.work, '.kokoro-kanban'));
    const envStore = path.join(sb.root, 'env-store', '.kokoro-kanban');
    const flagStore = path.join(sb.root, 'flag-store', '.kokoro-kanban');
    const env = { ...sb.env, KOKORO_STORE: envStore };
    expect(resolveWriteStore({ env, cwd: sb.work }).dir).toBe(envStore);
    expect(resolveWriteStore({ env, cwd: sb.work, flag: flagStore }).dir).toBe(flagStore);
  });

  it('treats an explicit store equal to the home store as global', () => {
    const sb = sandbox();
    expect(resolveWriteStore({ env: sb.env, cwd: sb.work, flag: sb.home }).kind).toBe('global');
  });
});
