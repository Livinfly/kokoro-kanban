import type { EntityOf, Kind } from '../model/schema.js';
import { isDir } from './fsutil.js';
import { readRegistry } from './registry.js';
import { readEntity } from './repo.js';

export function knownStores(home: string): { stores: string[]; missing: string[] } {
  const stores = [home];
  const missing: string[] = [];
  for (const dir of readRegistry(home)) {
    if (stores.includes(dir)) continue;
    if (isDir(dir)) stores.push(dir);
    else missing.push(dir);
  }
  return { stores, missing };
}

export function locateEntity<K extends Kind>(
  kind: K,
  id: string,
  preferred: string,
  home: string,
): { store: string; entity: EntityOf<K> } | null {
  const order = [preferred, ...knownStores(home).stores.filter((s) => s !== preferred)];
  for (const store of order) {
    const entity = readEntity(store, kind, id);
    if (entity) return { store, entity };
  }
  return null;
}
