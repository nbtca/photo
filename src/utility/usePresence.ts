import { useEffect, useState } from 'react';

// Keeps the last value rendered for `exitMs` after it goes away, so an exit
// transition can play before the element unmounts.
export default function usePresence<T>(
  value: T | false | null | undefined,
  exitMs: number,
) {
  const [kept, setKept] = useState(value || undefined);
  if (value && value !== kept) { setKept(value); }

  const isLeaving = !value && kept !== undefined;

  useEffect(() => {
    if (!isLeaving) { return; }
    const timeout = setTimeout(() => setKept(undefined), exitMs);
    return () => clearTimeout(timeout);
  }, [isLeaving, exitMs]);

  return { value: value || kept, isLeaving };
}
