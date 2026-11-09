import { existsSync, mkdirSync, readdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import { KIND_DIR, SCHEMAS, type EntityOf, type Kind } from '../model/schema.js';
import { readJsonFile, writeJsonAtomic } from './fsutil.js';
import { archiveDir, entityPath, logPath, progressPath } from './paths.js';

export type ParseResult<K extends Kind> = { ok: true; value: EntityOf<K> } | { ok: false; reason: string };

export function parseEntity<K extends Kind>(kind: K, raw: unknown): ParseResult<K> {
  const result = SCHEMAS[kind].safeParse(raw);
  if (result.success) return { ok: true, value: result.data as EntityOf<K> };
  const issue = result.error.issues[0];
  const where = issue && issue.path.length ? `${issue.path.join('.')}: ` : '';
  return { ok: false, reason: `${where}${issue?.message ?? 'invalid'}` };
}

export function loadEntityFile<K extends Kind>(kind: K, file: string): ParseResult<K> {
  let raw: unknown;
  try {
    raw = readJsonFile(file);
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
  return parseEntity(kind, raw);
}

export function readEntity<K extends Kind>(store: string, kind: K, id: string): EntityOf<K> | null {
  const file = entityPath(store, kind, id);
  if (!existsSync(file)) return null;
  const result = loadEntityFile(kind, file);
  if (!result.ok) throw new Error(`invalid ${kind} file ${file}: ${result.reason}`);
  return result.value;
}

export function writeEntity<K extends Kind>(store: string, kind: K, entity: EntityOf<K>): void {
  writeJsonAtomic(entityPath(store, kind, entity.id), entity);
}

export function isEntityFileName(name: string): boolean {
  return !name.startsWith('.') && name.endsWith('.json');
}

export function listIds(store: string, kind: Kind): string[] {
  let names: string[];
  try {
    names = readdirSync(path.join(store, KIND_DIR[kind]));
  } catch {
    return [];
  }
  return names
    .filter(isEntityFileName)
    .map((name) => name.slice(0, -'.json'.length))
    .sort();
}

export function archiveEntity(store: string, kind: Kind, id: string): void {
  const target = archiveDir(store, kind);
  mkdirSync(target, { recursive: true });
  const files = [entityPath(store, kind, id)];
  if (kind === 'job') files.push(progressPath(store, id), logPath(store, id));
  for (const file of files) {
    if (existsSync(file)) renameSync(file, path.join(target, path.basename(file)));
  }
}
