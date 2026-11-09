import { InvalidArgumentError } from 'commander';

export function parseNumber(value: string): number {
  const n = Number(value);
  if (value.trim() === '' || !Number.isFinite(n)) throw new InvalidArgumentError('expected a number');
  return n;
}

export function parseInteger(value: string): number {
  const n = parseNumber(value);
  if (!Number.isInteger(n)) throw new InvalidArgumentError('expected an integer');
  return n;
}

export function collect(value: string, previous: string[] = []): string[] {
  return [...previous, value];
}
