import { getGame } from './games/registry';

export type Route = { kind: 'menu' } | { kind: 'game'; id: string };

export function parseHash(hash: string): Route {
  const h = hash.replace(/^#\/?/, '');
  if (h === '' || h === '/' || !h) {
    return { kind: 'menu' };
  }
  const [seg] = h.split(/[/?]/);
  const id = decodeURIComponent(seg);
  if (getGame(id)) {
    return { kind: 'game', id };
  }
  return { kind: 'menu' };
}

export function navigate(id: string): void {
  window.location.hash = `/${id}`;
}

export function goHome(): void {
  window.location.hash = '/';
}
