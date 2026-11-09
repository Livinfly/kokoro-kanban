import { describe, expect, it } from 'vitest';
import { isCustomId, kindOfId, newId } from '../../src/model/ids.js';

describe('newId', () => {
  it('uses the kind prefix and four base36 chars', () => {
    expect(newId('job', () => false)).toMatch(/^j-[0-9a-z]{4}$/);
    expect(newId('session', () => false)).toMatch(/^s-[0-9a-z]{4}$/);
    expect(newId('goal', () => false)).toMatch(/^g-[0-9a-z]{4}$/);
    expect(newId('ask', () => false)).toMatch(/^a-[0-9a-z]{4}$/);
  });

  it('retries when the id already exists', () => {
    const taken = new Set<string>();
    const first = newId('job', () => false, () => 0);
    taken.add(first);
    let calls = 0;
    const values = [0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5];
    const id = newId('job', (candidate) => taken.has(candidate), () => values[calls++] ?? 0.9);
    expect(id).not.toBe(first);
    expect(id).toMatch(/^j-[0-9a-z]{4}$/);
  });
});

describe('isCustomId', () => {
  it('accepts letters, digits, dot, underscore and dash', () => {
    expect(isCustomId('abc-1.2_x')).toBe(true);
    expect(isCustomId('a'.repeat(64))).toBe(true);
  });

  it('rejects slashes, empty strings and overlong ids', () => {
    expect(isCustomId('a/b')).toBe(false);
    expect(isCustomId('')).toBe(false);
    expect(isCustomId('a'.repeat(65))).toBe(false);
  });
});

describe('kindOfId', () => {
  it('maps known prefixes to kinds', () => {
    expect(kindOfId('g-12ab')).toBe('goal');
    expect(kindOfId('s-0000')).toBe('session');
    expect(kindOfId('j-zzzz')).toBe('job');
    expect(kindOfId('a-1234')).toBe('ask');
  });

  it('returns undefined for custom ids', () => {
    expect(kindOfId('custom')).toBeUndefined();
    expect(kindOfId('s-toolong')).toBeUndefined();
  });
});
