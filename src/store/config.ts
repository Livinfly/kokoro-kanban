import path from 'node:path';
import { readJsonFile } from './fsutil.js';

export type Config = {
  staleAfterMinutes: number;
  hideFinishedAfterHours: number;
};

export const DEFAULT_CONFIG: Config = { staleAfterMinutes: 30, hideFinishedAfterHours: 24 };

function positive(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

export function readConfig(home: string): Config {
  let raw: unknown;
  try {
    raw = readJsonFile(path.join(home, 'config.json'));
  } catch {
    return { ...DEFAULT_CONFIG };
  }
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    staleAfterMinutes: positive(o.staleAfterMinutes, DEFAULT_CONFIG.staleAfterMinutes),
    hideFinishedAfterHours: positive(o.hideFinishedAfterHours, DEFAULT_CONFIG.hideFinishedAfterHours),
  };
}
