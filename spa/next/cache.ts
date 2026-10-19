import { invalidateData, registerCache } from '@spa/data';

const entries = registerCache(new Map<string, Promise<unknown>>());
const ids = new WeakMap<object, number>();
let nextId = 0;

const idOf = (callback: object) => {
  if (!ids.has(callback)) { ids.set(callback, nextId++); }
  return ids.get(callback);
};

// Callers often create the cache inline on every call, so entries are keyed by
// callback and arguments rather than by the cache instance.
export const unstable_cache = <A extends unknown[], R>(
  callback: (...args: A) => Promise<R>,
  keys: string[] = [],
  _options?: object,
) =>
  (...args: A): Promise<R> => {
    const key = `${idOf(callback)}|${keys.join('/')}|${JSON.stringify(args)}`;
    let result = entries.get(key) as Promise<R> | undefined;
    if (!result) {
      result = callback(...args);
      result.catch(() => entries.delete(key));
      entries.set(key, result);
    }
    return result;
  };

export const revalidatePath = (..._args: unknown[]) => invalidateData();
export const revalidateTag = (..._args: unknown[]) => invalidateData();
export const unstable_noStore = () => {};
