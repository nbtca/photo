import { MAX_BATCH } from '../worker/batch';
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

const failure = (name: string, status: number, body: unknown) => {
  if (status === 401) {
    window.dispatchEvent(new Event('unauthorized'));
    return new Unauthorized();
  }
  const { error, outage } =
    (body ?? {}) as { error?: string, outage?: boolean };
  if (outage) window.dispatchEvent(new Event('outage'));
  return new Error(error ?? `${name}: ${status}`);
};

const fetchJson = async (name: string, args: unknown[]) => {
  const response = await fetch(`/api/rpc/${name}`, {
    method: 'POST',
    body: JSON.stringify(args),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw failure(name, response.status, body);
  }
  return response.text();
};

interface QueuedRead {
  name: string
  args: unknown[]
  resolve: (json: string) => void
  reject: (error: unknown) => void
}

const queued: QueuedRead[] = [];

const sendQueued = async () => {
  const batch = queued.splice(0, MAX_BATCH);
  if (queued.length) { setTimeout(sendQueued); }
  if (batch.length === 1) {
    const [{ name, args, resolve, reject }] = batch;
    return fetchJson(name, args).then(resolve, reject);
  }
  try {
    const response = await fetch('/api/rpc', {
      method: 'POST',
      body: JSON.stringify(batch.map(({ name, args }) => [name, args])),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw failure('batch', response.status, body);
    }
    const results: { status: number, body: unknown }[] = await response.json();
    batch.forEach(({ name, resolve, reject }, index) => {
      const { status, body } = results[index];
      if (status === 200) { resolve(JSON.stringify(body)); }
      else { reject(failure(name, status, body)); }
    });
  } catch (error) {
    batch.forEach(({ reject }) => reject(error));
  }
};

// Reads requested while a page renders go out together in one request.
const fetchRead = (name: string, args: unknown[]) =>
  new Promise<string>((resolve, reject) => {
    if (!queued.length) { setTimeout(sendQueued); }
    queued.push({ name, args, resolve, reject });
  });

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
    const json = await fetchRead(name, args);
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
  if (!current) { return fetchRead(name, args); }

  await clearing;
  const hit = await current.get(key).catch(() => undefined);
  const age = hit ? Date.now() - hit.at : Infinity;
  if (hit && age < MAX_AGE_MS) {
    if (age >= FRESH_MS) {
      void revalidate(current, key, name, args, hit.json);
    }
    return hit.json;
  }
  const json = await fetchRead(name, args);
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
