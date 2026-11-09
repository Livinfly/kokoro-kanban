export type Progress = {
  pct: number | null;
  done: number | null;
  total: number | null;
  unit: string | null;
  msg: string | null;
  at: string | null;
};

export const MAX_MSG_LENGTH = 200;

const emptyProgress = (): Progress => ({ pct: null, done: null, total: null, unit: null, msg: null, at: null });

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export function foldProgress(lines: string[], fallbackAt: string | null = null): Progress {
  const p = emptyProgress();
  let explicitPct: number | null = null;
  for (const raw of lines) {
    const trimmed = raw.replace(/^\uFEFF/, '').trim();
    if (!trimmed) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) continue;
    const o = parsed as Record<string, unknown>;
    const pct = finite(o.pct);
    if (pct !== null) explicitPct = pct;
    p.done = finite(o.done) ?? p.done;
    p.total = finite(o.total) ?? p.total;
    p.unit = text(o.unit) ?? p.unit;
    const msg = text(o.msg);
    if (msg !== null) p.msg = msg.slice(0, MAX_MSG_LENGTH);
    p.at = text(o.at) ?? p.at;
  }
  let pct = explicitPct;
  if (pct === null && p.done !== null && p.total !== null && p.total > 0) {
    pct = (p.done / p.total) * 100;
  }
  p.pct = pct === null ? null : Math.min(100, Math.max(0, pct));
  p.at = p.at ?? fallbackAt;
  return p;
}
