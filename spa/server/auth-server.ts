export const auth = async () => null;

export const runAuthenticatedAdminServerAction = async <T>(
  _callback: () => T,
): Promise<T> => {
  throw new Error('Not available');
};
