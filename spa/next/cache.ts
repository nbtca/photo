import { invalidateData, registerCache } from '@spa/data';

export const unstable_cache = <A extends unknown[], R>(
  callback: (...args: A) => Promise<R>,
  _keys?: string[],
  _options?: object,
) => {
  const cache = registerCache(new Map<string, Promise<R>>());
  return (...args: A) => {
    const key = JSON.stringify(args);
    let result = cache.get(key);
    if (!result) {
      result = callback(...args);
      result.catch(() => cache.delete(key));
      cache.set(key, result);
    }
    return result;
  };
};

export const revalidatePath = (..._args: unknown[]) => invalidateData();
export const revalidateTag = (..._args: unknown[]) => invalidateData();
export const unstable_noStore = () => {};
