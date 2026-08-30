import type { MoveEntry } from './types';

export interface ReplayData {
  seed: number;
  rules?: { drawCount: 1 | 3; maxRecycles: number; scoring: 'standard' | 'vegas' };
  moves: MoveEntry[];
}

export function encodeReplay(data: ReplayData): string {
  const payload = {
    s: data.seed,
    r: data.rules,
    m: data.moves,
  };
  return btoa(JSON.stringify(payload));
}

export function decodeReplay(encoded: string): ReplayData | null {
  try {
    const json = JSON.parse(atob(encoded));
    if (typeof json.s !== 'number' || !Array.isArray(json.m)) return null;
    return {
      seed: json.s,
      rules: json.r,
      moves: json.m,
    };
  } catch {
    return null;
  }
}

export function getReplayUrl(data: ReplayData): string {
  const base = window.location.origin + window.location.pathname;
  return `${base}?replay=${encodeReplay(data)}`;
}

export function copyReplayUrl(data: ReplayData): Promise<boolean> {
  const url = getReplayUrl(data);
  return navigator.clipboard.writeText(url).then(() => true).catch(() => false);
}

export function readReplayFromUrl(): ReplayData | null {
  const params = new URLSearchParams(window.location.search);
  const replay = params.get('replay');
  if (!replay) return null;
  return decodeReplay(replay);
}
