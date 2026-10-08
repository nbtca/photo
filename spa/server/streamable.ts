// Stands in for the streaming values of @ai-sdk/rsc, which need a server.
export const createStreamableValue = <T>() => {
  const values: T[] = [];
  let failure: unknown;
  let finished = false;
  let wake = () => {};

  const value = (async function* () {
    for (;;) {
      if (values.length > 0) {
        yield values.shift() as T;
      } else if (failure !== undefined) {
        throw failure;
      } else if (finished) {
        return;
      } else {
        await new Promise<void>(resolve => { wake = resolve; });
      }
    }
  })();

  return {
    value,
    update: (next: T) => { values.push(next); wake(); },
    error: (error: unknown) => {
      failure = typeof error === 'string' ? new Error(error) : error;
      wake();
    },
    done: () => { finished = true; wake(); },
  };
};

export const readStreamableValue = <T>(stream: AsyncIterable<T>) => stream;
