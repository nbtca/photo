type Fn = (...args: any[]) => any;

export const lazily = <M extends Record<K, Fn>, K extends keyof M>(
  load: () => Promise<M>,
  name: K,
) => async (
  ...args: Parameters<M[K]>
): Promise<Awaited<ReturnType<M[K]>>> => (await load())[name](...args);
