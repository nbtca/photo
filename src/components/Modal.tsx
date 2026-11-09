'use client';

import { ReactNode, RefObject, useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx/lite';
import useClickInsideOutside from '@/utility/useClickInsideOutside';
import { useRouter } from 'next/navigation';
import AnimateItems from './AnimateItems';
import { PATH_ROOT } from '@/app/path';
import usePrefersReducedMotion from '@/utility/usePrefersReducedMotion';
import useEscapeHandler from '@/utility/useEscapeHandler';

export default function Modal({
  onClosePath,
  onClose,
  className,
  anchor = 'center',
  container = true,
  children,
  noPadding,
  fast,
}: {
  onClosePath?: string
  onClose?: () => void
  className?: string
  anchor?: 'top' | 'center'
  container?: boolean
  children: ReactNode
  noPadding?: boolean
  fast?: boolean
}) {
  const router = useRouter();

  const prefersReducedMotion = usePrefersReducedMotion();

  const contentRef = useRef<HTMLDivElement>(null);

  const [htmlElements, setHtmlElements] =
    useState<RefObject<HTMLDivElement | null>[]>([]);

  useEffect(() => {
    if (contentRef.current) {
      setHtmlElements([contentRef]);
    }
  }, []);

  useClickInsideOutside({
    htmlElements,
    onClickOutside: () => {
      if (onClose) {
        onClose();
      } else {
        router.push(
          onClosePath ?? PATH_ROOT,
          { scroll: false },
        );
      }
    },
  });

  useEscapeHandler({
    onKeyDown: onClose,
    ignoreShouldRespondToKeyboardCommands: true,
  });

  return (
    <div
      className={clsx(
        'fixed inset-0 z-50 flex justify-center',
        anchor === 'top'
          ? 'items-start pt-4 sm:pt-12 lg:pt-24'
          : 'items-center',
        'bg-white/90 dark:bg-black/80',
        !prefersReducedMotion &&
          'transition-colors duration-300 ease-out ' +
          'starting:bg-white/0 dark:starting:bg-black/0',
      )}
    >
      <AnimateItems
        duration={fast ? 0.1 : 0.3}
        items={[<div
          ref={contentRef}
          key="modalContent"
          className={clsx(
            ...container ? [
              // "-2px" accounts for transparent outline
              'w-[calc(100vw-1.5rem-2px)] sm:w-[min(540px,90vw)]',
              !noPadding && 'p-2',
              'rounded-xl outline outline-medium',
              'bg-white dark:bg-black',
              'shadow-gray-900 shadow-2xl/15',
              'dark:shadow-black dark:shadow-2xl/100',
            ] : [],
            className,
          )}
        >
          {children}
        </div>]}
      />
    </div>
  );
};
