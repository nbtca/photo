import { RedirectError, navigation } from '@spa/next/navigation';

export const serverAction = <A extends unknown[], R>(
  action: (...args: A) => Promise<R>,
) => async (...args: A): Promise<R | undefined> => {
  try {
    return await action(...args);
  } catch (error) {
    if (error instanceof RedirectError) {
      navigation.navigate?.(error.path);
      return undefined;
    }
    throw error;
  }
};
