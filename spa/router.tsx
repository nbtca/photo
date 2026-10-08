import {
  ComponentType,
  ReactNode,
  lazy,
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  NavigateOptions,
  Redirect,
  RouterContext,
  usePathname,
  useSearchParams,
} from '@spa/next/navigation';
import { invalidateData } from '@spa/data';

interface PageProps {
  params: Promise<Record<string, string>>
  searchParams: Promise<Record<string, string>>
}

const pages = import.meta.glob<{ default: ComponentType<PageProps> }>([
  '../app/**/page.tsx',
  '!../app/admin/**',
  '!../app/og/**',
  '!../app/sign-in/**',
  '!../app/film-demo/**',
  '!../app/library/**',
]);

const routes = Object.entries(pages)
  .map(([file, load]) => {
    const segments = file
      .slice('../app/'.length, -'page.tsx'.length)
      .split('/')
      .filter(Boolean);
    const names: string[] = [];
    const pattern = segments.map(segment => {
      const name = segment.match(/^\[(.+)\]$/)?.[1];
      if (name) { names.push(name); }
      return name ? '([^/]+)' : segment;
    });
    return {
      pattern: new RegExp(`^/${pattern.join('/')}/?$`),
      names,
      Page: lazy(load),
    };
  })
  .sort((a, b) => a.names.length - b.names.length);

const matchRoute = (pathname: string) => {
  for (const { pattern, names, Page } of routes) {
    const match = pathname.match(pattern);
    if (match) {
      const params = Object.fromEntries(
        names.map((name, index) => [name, match[index + 1]]),
      );
      return { Page, params };
    }
  }
};

const keyed = <T,>(value: T, key: string) =>
  Object.assign(Promise.resolve(value), { key });

export function Page() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  const route = useMemo(() => matchRoute(pathname), [pathname]);
  const props = useMemo(() => route && {
    params: keyed(route.params, pathname),
    searchParams: keyed(Object.fromEntries(new URLSearchParams(search)), search),
  }, [route, pathname, search]);

  return route && props
    ? <route.Page {...props} />
    : <Redirect path="/" />;
}

const readLocation = () => ({
  pathname: location.pathname,
  search: location.search,
});

export function RouterProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState(readLocation);
  const positions = useRef(new Map<number, number>());
  const entry = useRef<number>(history.state?.entry ?? 0);
  const nextEntry = useRef(entry.current + 1);
  const pendingScroll = useRef<number | null>(null);

  useEffect(() => { history.scrollRestoration = 'manual'; }, []);

  const navigate = useCallback((
    path: string,
    { replace = false, scroll = true }: NavigateOptions = {},
  ) => {
    positions.current.set(entry.current, scrollY);
    if (!replace) { entry.current = nextEntry.current++; }
    history[replace ? 'replaceState' : 'pushState'](
      { entry: entry.current },
      '',
      path,
    );
    pendingScroll.current = scroll ? 0 : null;
    startTransition(() => setCurrent(readLocation()));
  }, []);

  useEffect(() => {
    const onPopState = () => {
      positions.current.set(entry.current, scrollY);
      entry.current = history.state?.entry ?? 0;
      pendingScroll.current = positions.current.get(entry.current) ?? 0;
      startTransition(() => setCurrent(readLocation()));
    };
    addEventListener('popstate', onPopState);
    return () => removeEventListener('popstate', onPopState);
  }, []);

  useLayoutEffect(() => {
    if (pendingScroll.current !== null) {
      scrollTo(0, pendingScroll.current);
      pendingScroll.current = null;
    }
  }, [current]);

  const refresh = useCallback(() => startTransition(invalidateData), []);

  const value = useMemo(
    () => ({ ...current, navigate, refresh }),
    [current, navigate, refresh],
  );

  return <RouterContext value={value}>{children}</RouterContext>;
}
