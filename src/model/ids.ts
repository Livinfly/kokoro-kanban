import { KIND_PREFIX, KINDS, type Kind } from './schema.js';

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
const ID_LENGTH = 4;
const MAX_ATTEMPTS = 100;

export function newId(kind: Kind, exists: (id: string) => boolean, rand: () => number = Math.random): string {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let suffix = '';
    for (let i = 0; i < ID_LENGTH; i++) {
      suffix += ALPHABET[Math.floor(rand() * ALPHABET.length) % ALPHABET.length];
    }
    const id = `${KIND_PREFIX[kind]}-${suffix}`;
    if (!exists(id)) return id;
  }
  throw new Error(`could not allocate a free ${kind} id`);
}

export function isCustomId(id: string): boolean {
  return /^[A-Za-z0-9._-]{1,64}$/.test(id);
}

export function kindOfId(id: string): Kind | undefined {
  const match = /^([sjga])-[0-9a-z]{4}$/.exec(id);
  if (!match) return undefined;
  return KINDS.find((kind) => KIND_PREFIX[kind] === match[1]);
}
