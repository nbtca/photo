import { use } from 'react';

export interface Me {
  name: string
  admin: boolean
  used: number
  quota: number | null
}

// Identity comes from Cloudflare Access and cannot change within a page load.
export const me: Promise<Me | null> = fetch('/api/me')
  .then(response => response.ok ? response.json() as Promise<Me> : null);

export const useMe = () => use(me);
