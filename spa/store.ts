export interface Entry {
  json: string
  at: number
}

export interface Store {
  get: (key: string) => Promise<Entry | undefined>
  set: (key: string, entry: Entry) => Promise<void>
  clear: () => Promise<void>
}

const STORE = 'entries';

export function idbStore(): Store | undefined {
  if (typeof indexedDB === 'undefined') { return; }
  const database = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('photo-cache', 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  database.catch(() => {});

  const run = <T>(
    mode: IDBTransactionMode,
    action: (store: IDBObjectStore) => IDBRequest<T>,
  ) => database.then(db => new Promise<T>((resolve, reject) => {
    const request = action(db.transaction(STORE, mode).objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));

  return {
    get: key => run<Entry | undefined>('readonly', store => store.get(key)),
    set: async (key, entry) => {
      await run('readwrite', store => store.put(entry, key));
    },
    clear: async () => {
      await run('readwrite', store => store.clear());
    },
  };
}
