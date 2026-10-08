import { createContext, use, useEffect, useMemo } from 'react';

export interface NavigateOptions {
  replace?: boolean
  scroll?: boolean
}

export interface RouterState {
  pathname: string
  search: string
  dataVersion: number
  navigate: (path: string, options?: NavigateOptions) => void
  refresh: () => void
}

export const RouterContext = createContext<RouterState | null>(null);

const useRouterState = () => {
  const state = use(RouterContext);
  if (!state) { throw new Error('RouterProvider is missing'); }
  return state;
};

// Lets code outside React, such as server actions, navigate.
export const navigation: { navigate?: RouterState['navigate'] } = {};

export const useDataVersion = () => useRouterState().dataVersion;

export const useRouter = () => {
  const { navigate, refresh } = useRouterState();
  return useMemo(() => ({
    push: (path: string, options?: NavigateOptions) =>
      navigate(path, options),
    replace: (path: string, options?: NavigateOptions) =>
      navigate(path, { ...options, replace: true }),
    back: () => history.back(),
    forward: () => history.forward(),
    prefetch: (_path: string) => {},
    refresh,
  }), [navigate, refresh]);
};

export const usePathname = () => useRouterState().pathname;

export const useSearchParams = () => {
  const { search } = useRouterState();
  return useMemo(() => new URLSearchParams(search), [search]);
};

export class RedirectError extends Error {
  constructor(public path: string) { super(`Redirect to ${path}`); }
}

export const redirect = (path: string): never => {
  throw new RedirectError(path);
};

export function Redirect({ path }: { path: string }) {
  const router = useRouter();
  useEffect(() => router.replace(path), [router, path]);
  return null;
}
