import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { type FSWatcher, watch } from 'chokidar';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StoreIndex } from '../store/index.js';
import { knownStores } from '../store/locate.js';
import { registryPath } from '../store/registry.js';
import type { Board } from '../view/board.js';
import { boardFrom } from '../view/load.js';

export const DEBOUNCE_MS = 100;
export const TICK_MS = 2000;

export type BoardSource = { board: Board; now: Date; version: number; reload: () => void };

function ignoredFor(stores: string[]) {
  return (p: string) => {
    if (stores.includes(p)) return false;
    const store = stores.find((s) => p.startsWith(s + path.sep));
    if (!store) return false;
    const rel = path.relative(store, p).split(path.sep);
    return rel[0] === 'archive' || rel.some((part) => part.startsWith('.'));
  };
}

export function useBoard(opts: { home: string; projectFilter: string | null; showAll: boolean }): BoardSource {
  const { home } = opts;
  const indexRef = useRef<StoreIndex | null>(null);
  if (!indexRef.current) {
    mkdirSync(home, { recursive: true });
    indexRef.current = new StoreIndex(knownStores(home).stores);
    indexRef.current.loadAll();
  }
  const [version, setVersion] = useState(0);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const index = indexRef.current!;
    const timers = new Map<string, NodeJS.Timeout>();
    let watcher: FSWatcher | null = null;
    let closed = false;
    let polling = false;

    const startWatching = () => {
      watcher = watch([...index.stores, registryPath(home)], {
        ignoreInitial: true,
        depth: 1,
        ignored: ignoredFor(index.stores),
      });
      watcher.on('error', () => {
        polling = true;
      });
      watcher.on('ready', () => {
        if (closed) return;
        index.loadAll();
        setVersion((v) => v + 1);
      });
      watcher.on('all', (_event, file) => {
        clearTimeout(timers.get(file));
        timers.set(
          file,
          setTimeout(() => {
            timers.delete(file);
            if (closed) return;
            if (file === registryPath(home)) {
              index.stores = knownStores(home).stores;
              index.loadAll();
              void watcher?.close().then(() => !closed && startWatching());
            } else {
              index.refreshPath(file);
            }
            setVersion((v) => v + 1);
          }, DEBOUNCE_MS),
        );
      });
    };
    startWatching();

    const tick = setInterval(() => {
      if (polling) {
        index.stores = knownStores(home).stores;
        index.loadAll();
        setVersion((v) => v + 1);
      }
      setNow(new Date());
    }, TICK_MS);
    return () => {
      closed = true;
      clearInterval(tick);
      for (const t of timers.values()) clearTimeout(t);
      void watcher?.close();
    };
  }, [home]);

  const board = useMemo(
    () => boardFrom(indexRef.current!, { home, now, projectFilter: opts.projectFilter, showAll: opts.showAll }),
    [home, now, version, opts.projectFilter, opts.showAll],
  );
  const reload = () => {
    indexRef.current!.loadAll();
    setVersion((v) => v + 1);
  };
  return { board, now, version, reload };
}
