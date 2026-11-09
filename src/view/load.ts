import { hostname } from 'node:os';
import { type DeriveCtx, isAlive } from '../model/derive.js';
import { readConfig } from '../store/config.js';
import type { StoreIndex } from '../store/index.js';
import { type Board, buildBoard } from './board.js';

export function deriveCtxFor(home: string, now: Date): DeriveCtx {
  const config = readConfig(home);
  return { now, host: hostname(), isAlive, staleAfterMs: config.staleAfterMinutes * 60_000 };
}

export function boardFrom(
  index: StoreIndex,
  opts: { home: string; now: Date; projectFilter: string | null; showAll: boolean },
): Board {
  const config = readConfig(opts.home);
  return buildBoard(index.snapshot(), {
    ctx: deriveCtxFor(opts.home, opts.now),
    hideFinishedAfterMs: config.hideFinishedAfterHours * 3_600_000,
    showAll: opts.showAll,
    projectFilter: opts.projectFilter,
  });
}
