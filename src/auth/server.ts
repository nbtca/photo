export const auth = async () => {
  const response = await fetch('/api/me');
  if (!response.ok) { return null; }
  const { name }: { name: string } = await response.json();
  return { user: { name, email: name }, expires: '' };
};

export const signIn = async () => {
  location.assign('/auth/login');
};

export const signOut = async (_options?: object) => {
  location.assign('/auth/logout');
};

// The Worker authorizes every call, so actions run as they are.
export const runAuthenticatedAdminServerAction = async <T>(
  callback: () => T,
): Promise<T> => callback();
