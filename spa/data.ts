import { useSyncExternalStore } from 'react';

let version = 0;
const listeners = new Set<() => void>();
const caches = new Set<Map<string, unknown>>();

export const registerCache = <T>(cache: Map<string, T>) => {
  caches.add(cache);
  return cache;
};

export const invalidateData = () => {
  caches.forEach(cache => cache.clear());
  version++;
  listeners.forEach(listener => listener());
};

export const useDataVersion = () => useSyncExternalStore(
  listener => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  () => version,
);

export class Unauthorized extends Error {}

export const rpc = async <T>(name: string, ...args: unknown[]): Promise<T> => {
  const response = await fetch(`/api/rpc/${name}`, {
    method: 'POST',
    body: JSON.stringify(args),
  });
  if (response.status === 401) {
    window.dispatchEvent(new Event('unauthorized'));
    throw new Unauthorized();
  }
  if (!response.ok) { throw new Error(`${name}: ${response.status}`); }
  return response.json();
};
