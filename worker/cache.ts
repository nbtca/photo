import type { AppEnv } from './auth';

// Writes invalidate everything at once by moving the epoch, so entries live long; the TTL only bounds
// answers that depend on the current time, such as recent uploads.
const TTL_MS = 60 * 60 * 1000;
// D1 caps a value at 2 MB; anything near that is cheaper to recompute than to store.
const MAX_BYTES = 1_000_000;

async function keyOf(parts: unknown[]) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(parts)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

// One lookup reads two rows by primary key. The epoch is captured with it, so a result computed while
// a write lands is stored under the old epoch and never served.
// `defer` lets the response go out before the result is stored.
export async function cached<T>(
  env: AppEnv,
  parts: unknown[],
  load: () => Promise<T>,
  defer?: (stored: Promise<unknown>) => void,
): Promise<T> {
  const key = await keyOf(parts);
  const now = Date.now();
  const hit = await env.DB.prepare(
    `SELECT e.value AS epoch, c.value AS value FROM cache e
     LEFT JOIN cache c ON c.key = ?1 AND c.epoch = e.value AND c.expires > ?2
     WHERE e.key = 'epoch'`,
  ).bind(key, now).first<{ epoch: string, value: string | null }>();
  if (hit?.value != null) return JSON.parse(hit.value);

  const value = await load();
  const json = JSON.stringify(value ?? null);
  if (!hit || json.length > MAX_BYTES) return value;
  const stored = env.DB.prepare(
    'INSERT OR REPLACE INTO cache (key, value, epoch, expires) VALUES (?1, ?2, ?3, ?4)',
  ).bind(key, json, hit.epoch, now + TTL_MS).run();
  if (defer) defer(stored);
  else await stored;
  return value;
}

export const invalidate = (env: AppEnv) =>
  env.DB.prepare('UPDATE cache SET value = ?1 WHERE key = ?2').bind(crypto.randomUUID(), 'epoch').run();

export const pruneCache = (env: AppEnv) =>
  env.DB.prepare(
    `DELETE FROM cache WHERE key != 'epoch'
     AND (expires <= ?1 OR epoch != (SELECT value FROM cache WHERE key = 'epoch'))`,
  ).bind(Date.now()).run();
