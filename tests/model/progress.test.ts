import { describe, expect, it } from 'vitest';
import { foldProgress } from '../../src/model/progress.js';

const line = (o: object) => JSON.stringify(o);

describe('foldProgress', () => {
  it('returns all nulls for no input', () => {
    expect(foldProgress([])).toEqual({ pct: null, done: null, total: null, unit: null, msg: null, at: null });
  });

  it('lets later lines override earlier fields and keeps the rest', () => {
    const p = foldProgress([
      line({ pct: 10, msg: 'start', unit: 'files', at: '2026-11-09T08:00:00.000Z' }),
      line({ pct: 40, at: '2026-11-09T08:01:00.000Z' }),
    ]);
    expect(p).toMatchObject({ pct: 40, msg: 'start', unit: 'files', at: '2026-11-09T08:01:00.000Z' });
  });

  it('derives pct from done and total when pct is absent', () => {
    expect(foldProgress([line({ done: 2, total: 8 })]).pct).toBe(25);
  });

  it('prefers an explicit pct over the derived one', () => {
    expect(foldProgress([line({ done: 2, total: 8, pct: 90 })]).pct).toBe(90);
  });

  it('clamps pct to 0..100', () => {
    expect(foldProgress([line({ pct: 140 })]).pct).toBe(100);
    expect(foldProgress([line({ pct: -5 })]).pct).toBe(0);
  });

  it('skips blank lines, junk and wrongly typed fields', () => {
    const p = foldProgress(['', 'not json', '{"pct": "x"}', line({ pct: 5 }), '{"half": ']);
    expect(p.pct).toBe(5);
  });

  it('falls back to the given timestamp when lines carry none', () => {
    expect(foldProgress([line({ pct: 5 })], '2026-11-09T09:00:00.000Z').at).toBe('2026-11-09T09:00:00.000Z');
  });

  it('truncates long messages to 200 characters', () => {
    expect(foldProgress([line({ msg: 'x'.repeat(300) })]).msg).toHaveLength(200);
  });
});
