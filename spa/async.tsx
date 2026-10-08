import { ReactNode, isValidElement, use } from 'react';
import { RedirectError, Redirect } from '@spa/next/navigation';
import { useDataVersion } from '@spa/data';

const MAX_ENTRIES = 300;
const results = new Map<string, Promise<ReactNode>>();

const keyForProps = (props: object) =>
  JSON.stringify(props, (_key, value) => {
    if (typeof value === 'function') { return undefined; }
    if (isValidElement(value)) { return '<element>'; }
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
