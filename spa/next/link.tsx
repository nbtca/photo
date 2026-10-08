import {
  AnchorHTMLAttributes,
  MouseEvent,
  ReactNode,
  Ref,
  createContext,
  use,
  useTransition,
} from 'react';
import { useRouter } from '@spa/next/navigation';

const LinkStatus = createContext({ pending: false });

export const useLinkStatus = () => use(LinkStatus);

export default function Link({
  href,
  replace,
  scroll,
  prefetch: _prefetch,
  onClick,
  children,
  ...props
}: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href: string
  replace?: boolean
  scroll?: boolean
  prefetch?: boolean | null
  ref?: Ref<HTMLAnchorElement>
  children?: ReactNode
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    const { currentTarget: anchor } = event;
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey || event.ctrlKey || event.shiftKey || event.altKey ||
      (anchor.target && anchor.target !== '_self') ||
      anchor.hasAttribute('download') ||
      anchor.origin !== location.origin
    ) { return; }
    event.preventDefault();
    startTransition(() => {
      router[replace ? 'replace' : 'push'](
        anchor.pathname + anchor.search + anchor.hash,
        { scroll },
      );
    });
  };

  return (
    <a {...props} href={href} onClick={handleClick}>
      <LinkStatus value={{ pending }}>{children}</LinkStatus>
    </a>
  );
}
