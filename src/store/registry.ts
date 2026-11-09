import path from 'node:path';
import { readJsonFile, writeJsonAtomic } from './fsutil.js';

export function registryPath(home: string): string {
  return path.join(home, 'stores.json');
}

export function readRegistry(home: string): string[] {
  try {
    const raw = readJsonFile(registryPath(home)) as { stores?: unknown };
    return Array.isArray(raw.stores) ? raw.stores.filter((s): s is string => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

export function registerStore(home: string, dir: string): void {
  const stores = readRegistry(home);
  if (stores.includes(dir)) return;
  writeJsonAtomic(registryPath(home), { stores: [...stores, dir] });
}
