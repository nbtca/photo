import { ReactNode, isValidElement, use } from 'react';
import {
  Redirect,
  RedirectError,
  useDataVersion,
} from '@spa/next/navigation';

const MAX_ENTRIES = 300;
const results = new Map<string, Promise<ReactNode>>();

const typeIds = new WeakMap<object, number>();
let nextTypeId = 0;

const idOfType = (type: unknown) => {
  if (typeof type === 'string') { return type; }
  if (!typeIds.has(type as object)) {
    typeIds.set(type as object, nextTypeId++);
  }
  return typeIds.get(type as object);
};

// A layout's result embeds its children, so elements count toward the key;
// otherwise every page under one layout would show the first page rendered.
const keyForProps = (props: object) =>
  JSON.stringify(props, (_key, value) => {
    if (typeof value === 'function') { return undefined; }
    if (isValidElement(value)) {
      return { type: idOfType(value.type), key: value.key, props: value.props };
    }
    if (typeof value?.then === 'function') { return value.key ?? '<promise>'; }
    return value;
  });

export const clearAsyncResults = () => results.clear();

export const wrapAsync = <P extends object>(
  component: (props: P) => Promise<ReactNode>,
  name: string,
) => {
  const Wrapped = (props: P) => {
    const version = useDataVersion();
    const key = `${name}:${version}:${keyForProps(props)}`;
    let result = results.get(key);
    if (!result) {
      result = component(props).catch(error => {
        if (error instanceof RedirectError) {
          return <Redirect path={error.path} />;
        }
        throw error;
      });
      if (results.size >= MAX_ENTRIES) {
        results.delete(results.keys().next().value!);
      }
      results.set(key, result);
    }
    return use(result);
  };
  Wrapped.displayName = name;
  return Wrapped;
};
