import { Entry, Store } from '../spa/store';

jest.mock('../spa/me', () => ({
  me: Promise.resolve({ name: 'alice' }),
}));

import { READS, invalidateData, rpc, setStore } from '../spa/data';
import { cacheScope, queries } from '../worker/query';
import { unstable_cache } from '../spa/next/cache';

const memoryStore = (entries = new Map<string, Entry>()): Store => ({
  get: async key => entries.get(key),
  set: async (key, entry) => { entries.set(key, entry); },
  clear: async () => { entries.clear(); },
});

const respond = (body: unknown) =>
  jest.fn(async () => new Response(JSON.stringify(body)));

const flush = () => new Promise(resolve => setTimeout(resolve, 80));

describe('spa data cache', () => {
  let entries: Map<string, Entry>;

  beforeEach(() => {
    entries = new Map([['user', { json: 'alice', at: Date.now() }]]);
    setStore(memoryStore(entries));
  });

  it('shares results between caches created on every call', async () => {
    const fetchMock = respond([1]);
    global.fetch = fetchMock as unknown as typeof fetch;
    const getPhotos = (options: object) => rpc<number[]>('getPhotos', options);
    const cached = (options: object) =>
      unstable_cache(getPhotos, ['photos'])(options);

    await cached({ tag: 'a' });
    await cached({ tag: 'a' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await cached({ tag: 'b' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('serves a stale stored copy first and refreshes it', async () => {
    const fetchMock = respond(['fresh']);
    global.fetch = fetchMock as unknown as typeof fetch;
    entries.set('getUniqueTags|[]', {
      json: JSON.stringify(['stale']),
      at: Date.now() - 5 * 60 * 1000,
    });

    const result = await unstable_cache(() => rpc('getUniqueTags'))();
    expect(result).toEqual(['stale']);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(entries.get('getUniqueTags|[]')?.json)
      .toBe(JSON.stringify(['fresh']));
  });

  it('does not refetch a recently stored copy', async () => {
    const fetchMock = respond(['fresh']);
    global.fetch = fetchMock as unknown as typeof fetch;
    entries.set('getUniqueYears|[]', {
      json: '["stored"]',
      at: Date.now() - 1000,
    });

    const years = unstable_cache(() => rpc('getUniqueYears'));
    expect(await years()).toEqual(['stored']);
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never stores calls made outside a cache', async () => {
    const fetchMock = respond(null);
    global.fetch = fetchMock as unknown as typeof fetch;

    await rpc('deletePhoto', 'abc');
    await rpc('deletePhoto', 'abc');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect([...entries.keys()]).toEqual(['user']);
  });

  it('drops stored copies when data changes', async () => {
    global.fetch = respond(null) as unknown as typeof fetch;
    entries.set('getUniqueYears|[]', { json: '["stored"]', at: Date.now() });

    invalidateData();
    await rpc('deletePhoto', 'abc');
    expect(entries.size).toBe(0);
  });

  it('starts over when another member signs in', async () => {
    const fetchMock = respond(['mine']);
    global.fetch = fetchMock as unknown as typeof fetch;
    entries.set('user', { json: 'bob', at: Date.now() });
    entries.set('getUniqueYears|[]', { json: '["bobs"]', at: Date.now() });

    const years = unstable_cache(() => rpc('getUniqueYears'));
    expect(await years()).toEqual(['mine']);
    expect(entries.get('user')?.json).toBe('alice');
    expect(entries.has('getUniqueYears|[]')).toBe(true);
    expect(entries.get('getUniqueYears|[]')?.json).toBe('["mine"]');
  });

  it('shares one request between identical reads in flight', async () => {
    const fetchMock = respond([1]);
    global.fetch = fetchMock as unknown as typeof fetch;

    await Promise.all([
      rpc('getPhotos', { limit: 12 }),
      rpc('getPhotos', { limit: 12 }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('matches the Worker queries', () => {
    expect([...READS].sort()).toEqual(Object.keys(queries).sort());
  });

  it('caches hidden photos per member and everything else once', () => {
    const alice = { sub: 'alice', name: 'alice', admin: false };
    expect(cacheScope('getPhotos', [{ tag: 'a' }], alice)).toEqual([]);
    expect(cacheScope('getUniqueTags', [], alice)).toEqual([]);
    expect(cacheScope('getPhoto', ['id'], alice)).toEqual([]);
    expect(cacheScope('getPhoto', ['id', true], alice))
      .toEqual(['alice', false]);
    expect(cacheScope('getPhotos', [{ hidden: 'only' }], alice))
      .toEqual(['alice', false]);
    expect(cacheScope('getPhotosNearId', ['id', { hidden: 'include' }], alice))
      .toEqual(['alice', false]);
  });

  it('sends reads made together in one request', async () => {
    const fetchMock = jest.fn(async () => new Response(JSON.stringify([
      { status: 200, body: ['tags'] },
      { status: 403, body: { error: 'Forbidden' } },
    ])));
    global.fetch = fetchMock as unknown as typeof fetch;
    setStore(undefined);

    const [tags, years] = await Promise.allSettled([
      rpc('getUniqueTags', 'batched'),
      rpc('getUniqueYears', 'batched'),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]).toEqual([
      '/api/rpc',
      expect.objectContaining({ body: JSON.stringify([
        ['getUniqueTags', ['batched']],
        ['getUniqueYears', ['batched']],
      ]) }),
    ]);
    expect(tags).toEqual({ status: 'fulfilled', value: ['tags'] });
    expect(years)
      .toEqual({ status: 'rejected', reason: new Error('Forbidden') });
  });
});
