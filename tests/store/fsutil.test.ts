import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { appendJsonLine, readJsonFile, readTail, writeJsonAtomic } from '../../src/store/fsutil.js';
import { tempDir } from '../helpers.js';

describe('writeJsonAtomic', () => {
  it('creates parent dirs, round-trips and leaves no temp files', () => {
    const dir = tempDir();
    const file = path.join(dir, 'a', 'b', 'x.json');
    writeJsonAtomic(file, { hello: '世界' });
    writeJsonAtomic(file, { hello: 'again' });
    expect(readJsonFile(file)).toEqual({ hello: 'again' });
    expect(readdirSync(path.dirname(file))).toEqual(['x.json']);
  });
});

describe('readJsonFile', () => {
  it('throws on malformed JSON', () => {
    const file = path.join(tempDir(), 'bad.json');
    writeFileSync(file, '{"half": ');
    expect(() => readJsonFile(file)).toThrow();
  });
});

describe('appendJsonLine', () => {
  it('appends one line per call', () => {
    const file = path.join(tempDir(), 'p', 'x.jsonl');
    appendJsonLine(file, { pct: 1 });
    appendJsonLine(file, { pct: 2 });
    expect(readFileSync(file, 'utf8')).toBe('{"pct":1}\n{"pct":2}\n');
  });
});

describe('readTail', () => {
  it('returns only the last bytes', () => {
    const file = path.join(tempDir(), 'log');
    writeFileSync(file, 'abcdefghij');
    expect(readTail(file, 4)).toBe('ghij');
    expect(readTail(file, 100)).toBe('abcdefghij');
  });

  it('returns an empty string for a missing file', () => {
    expect(readTail(path.join(tempDir(), 'missing'), 10)).toBe('');
  });
});
