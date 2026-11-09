import { describe, expect, it } from 'vitest';
import { foldProgress } from '../../src/model/progress.js';
import { age, bar, progressText, shortId, tildify } from '../../src/view/format.js';

const now = new Date('2026-11-09T12:00:00.000Z');
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

describe('age', () => {
  it('picks the largest sensible unit', () => {
    expect(age(ago(45_000), now)).toBe('45s');
    expect(age(ago(2 * 60_000 + 5_000), now)).toBe('2m');
    expect(age(ago(3 * 3_600_000), now)).toBe('3h');
    expect(age(ago(50 * 3_600_000), now)).toBe('2d');
  });

  it('never goes negative', () => {
    expect(age(new Date(now.getTime() + 5000).toISOString(), now)).toBe('0s');
  });
});

describe('tildify', () => {
  it('replaces the home prefix only at a path boundary', () => {
    expect(tildify('/Users/me/work/app', '/Users/me')).toBe('~/work/app');
    expect(tildify('/Users/me', '/Users/me')).toBe('~');
    expect(tildify('/Users/meow/x', '/Users/me')).toBe('/Users/meow/x');
  });
});

describe('progressText', () => {
  const p = (o: object) => foldProgress([JSON.stringify(o)]);

  it('shows pct, counters, or both', () => {
    expect(progressText(p({ pct: 78.4 }))).toBe('78%');
    expect(progressText(p({ done: 1.2, total: 1.6, unit: 'GB', pct: 75 }))).toBe('75% · 1.2/1.6 GB');
    expect(progressText(p({ done: 4, unit: 'files' }))).toBe('4 files');
  });

  it('is null without any numbers', () => {
    expect(progressText(p({ msg: 'hi' }))).toBeNull();
  });
});

describe('shortId', () => {
  it('keeps short ids and trims long host session ids', () => {
    expect(shortId('s-7f3a')).toBe('s-7f3a');
    expect(shortId('my.session.12')).toBe('my.session.12');
    expect(shortId('059e64b5-2d7c-4654-9012-0fe90d22126e')).toBe('059e64b5…');
  });
});

describe('bar', () => {
  it('fills proportionally', () => {
    expect(bar(50, 10)).toBe('█████░░░░░');
    expect(bar(0, 4)).toBe('░░░░');
    expect(bar(100, 4)).toBe('████');
  });
});
