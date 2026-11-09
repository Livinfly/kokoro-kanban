import type { Progress } from '../model/progress.js';

export function age(fromIso: string, now: Date): string {
  const seconds = Math.max(0, Math.floor((now.getTime() - Date.parse(fromIso)) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function tildify(p: string, homeDir: string): string {
  if (p === homeDir) return '~';
  if (p.startsWith(`${homeDir}/`)) return `~${p.slice(homeDir.length)}`;
  return p;
}

function num(n: number): string {
  return String(Number(n.toFixed(2)));
}

export function progressText(p: Progress): string | null {
  const parts: string[] = [];
  if (p.pct !== null) parts.push(`${Math.round(p.pct)}%`);
  const unit = p.unit ? ` ${p.unit}` : '';
  if (p.done !== null && p.total !== null) parts.push(`${num(p.done)}/${num(p.total)}${unit}`);
  else if (p.done !== null) parts.push(`${num(p.done)}${unit}`);
  return parts.length ? parts.join(' · ') : null;
}

export function bar(pct: number, width: number): string {
  const filled = Math.round((Math.min(100, Math.max(0, pct)) / 100) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}
