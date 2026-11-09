import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readConfig } from '../../src/store/config.js';
import { readRegistry, registerStore } from '../../src/store/registry.js';
import { sandbox } from '../helpers.js';

describe('readConfig', () => {
  it('returns defaults when the file is missing', () => {
    expect(readConfig(sandbox().home)).toEqual({ staleAfterMinutes: 30, hideFinishedAfterHours: 24 });
  });

  it('applies valid overrides', () => {
    const { home } = sandbox();
    mkdirSync(home, { recursive: true });
    writeFileSync(path.join(home, 'config.json'), JSON.stringify({ staleAfterMinutes: 5 }));
    expect(readConfig(home)).toEqual({ staleAfterMinutes: 5, hideFinishedAfterHours: 24 });
  });

  it('falls back to defaults on invalid JSON or values', () => {
    const { home } = sandbox();
    mkdirSync(home, { recursive: true });
    writeFileSync(path.join(home, 'config.json'), '{oops');
    expect(readConfig(home).staleAfterMinutes).toBe(30);
    writeFileSync(path.join(home, 'config.json'), JSON.stringify({ staleAfterMinutes: 'soon' }));
    expect(readConfig(home).staleAfterMinutes).toBe(30);
  });
});

describe('registry', () => {
  it('is empty when missing', () => {
    expect(readRegistry(sandbox().home)).toEqual([]);
  });

  it('registers a store once', () => {
    const { home } = sandbox();
    registerStore(home, '/p/.kokoro-kanban');
    registerStore(home, '/p/.kokoro-kanban');
    registerStore(home, '/q/.kokoro-kanban');
    expect(readRegistry(home)).toEqual(['/p/.kokoro-kanban', '/q/.kokoro-kanban']);
  });
});
