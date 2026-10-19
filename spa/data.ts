import { me } from './me';
import { type Store, idbStore } from './store';

const FRESH_MS = 60 * 1000;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

let version = 0;
const listeners = new Set<() => void>();
const caches = new Set<Map<string, unknown>>();
const reads = new Map<string, Promise<string>>();
let store = idbStore();
let session: Promise<Store | undefined> | undefined;
let clearing: Promise<unknown> = Promise.resolve();
let scheduled: ReturnType<typeof setTimeout> | undefined;
const revalidating = new Set<string>();

// Must list exactly the Worker's cacheable queries; a test compares them.
export const READS = new Set([
  'getPhotos',
  'getPhotoIds',
  'getPhotoCount',
  'getPhotosNearId',
  'getPhotosMeta',
  'getPhoto',
  'getPhotosMostRecentUpdate',
  'getAllPublicPhotoIds',
  'getAllPhotoIdsWithUpdatedAt',
  'getUniqueCameras',
  'getUniqueLenses',
  'getUniqueTags',
  'getUniqueRecipes',
  'getUniqueYears',
  'getUniqueFilms',
  'getUniqueFocalLengths',
  'getLibrary',
  'getAlbumFromSlug',
  'getAlbumsWithMeta',
  'getAlbumTitlesForPhoto',
  'getTagsForAlbum',
]);

export const registerCache = <T>(cache: Map<string, T>) => {
  caches.add(cache);
  return cache;
};

export const setStore = (next: Store | undefined) => {
  store = next;
  session = undefined;
};

const notify = () => {
  caches.forEach(cache => cache.clear());
  reads.clear();
  version++;
  listeners.forEach(listener => listener());
};

export const invalidateData = () => {
  clearing = store?.clear().catch(() => {}) ?? Promise.resolve();
  notify();
};

const refreshed = () => {
  scheduled ??= setTimeout(() => {
    scheduled = undefined;
    notify();
  }, 50);
};

export const getDataVersion = () => version;

export const onDataInvalidated = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

// The store only ever holds one member's data.
const open = () => session ??= (async () => {
  const user = (await me)?.name;
  const current = store;
  if (!current || !user) { return; }
  try {
    if ((await current.get('user'))?.json !== user) {
      await current.clear();
      await current.set('user', { json: user, at: Date.now() });
    }
    return current;
  } catch {
    return;
  }
})();

export class Unauthorized extends Error {}

const fetchJson = async (name: string, args: unknown[]) => {
  const response = await fetch(`/api/rpc/${name}`, {
    method: 'POST',
    body: JSON.stringify(args),
  });
  if (response.status === 401) {
    window.dispatchEvent(new Event('unauthorized'));
    throw new Unauthorized();
  }
  if (!response.ok) {
    const body: { error?: string } | null =
      await response.json().catch(() => null);
    throw new Error(body?.error ?? `${name}: ${response.status}`);
  }
  return response.text();
};

const revalidate = async (
  current: Store,
  key: string,
  name: string,
  args: unknown[],
  previous: string,
) => {
  if (revalidating.has(key)) { return; }
  revalidating.add(key);
  try {
    const json = await fetchJson(name, args);
    await current.set(key, { json, at: Date.now() });
    if (json !== previous) { refreshed(); }
  } catch {
    // The stored copy stays until the next attempt.
  } finally {
    revalidating.delete(key);
  }
};

const readJson = async (name: string, args: unknown[], key: string) => {
  const current = await open();
  if (!current) { return fetchJson(name, args); }

  await clearing;
  const hit = await current.get(key).catch(() => undefined);
  const age = hit ? Date.now() - hit.at : Infinity;
  if (hit && age < MAX_AGE_MS) {
    if (age >= FRESH_MS) {
      void revalidate(current, key, name, args, hit.json);
    }
    return hit.json;
  }
  const json = await fetchJson(name, args);
  current.set(key, { json, at: Date.now() }).catch(() => {});
  return json;
};

export const rpc = async <T>(name: string, ...args: unknown[]): Promise<T> => {
  if (!READS.has(name)) { return JSON.parse(await fetchJson(name, args)); }
  const key = `${name}|${JSON.stringify(args)}`;
  let json = reads.get(key);
  if (!json) {
    json = readJson(name, args, key);
    reads.set(key, json);
    json.catch(() => reads.delete(key));
  }
  return JSON.parse(await json);
};
