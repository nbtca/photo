import { me } from '@spa/me';

export const auth = async () => {
  const user = await me;
  return user
    ? { user: { name: user.name, email: user.name }, expires: '' }
    : null;
};

export const signIn = async (..._args: unknown[]) => {
  location.reload();
};

// Cloudflare Access serves this path on every protected domain.
export const signOut = async (_options?: object) => {
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  location.assign('/cdn-cgi/access/logout');
};

// The Worker authorizes every call, so actions run as they are.
export const runAuthenticatedAdminServerAction = async <T>(
  callback: () => T,
): Promise<T> => callback();
