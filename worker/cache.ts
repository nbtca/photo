const EPOCH = new Request('https://cache.invalid/epoch');
const SECONDS = 300;

async function keyOf(parts: unknown[]) {
  const epoch = (await (await caches.default.match(EPOCH))?.text()) ?? '0';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(parts)));
  const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return new Request(`https://cache.invalid/${epoch}/${hash}`);
}

export async function cached<T>(parts: unknown[], load: () => Promise<T>): Promise<T> {
  const key = await keyOf(parts);
  const hit = await caches.default.match(key);
  if (hit) return hit.json();
  const value = await load();
  await caches.default.put(
    key,
    Response.json(value ?? null, { headers: { 'Cache-Control': `max-age=${SECONDS}` } }),
  );
  return value;
}

export const invalidate = () =>
  caches.default.put(
    EPOCH,
    new Response(crypto.randomUUID(), { headers: { 'Cache-Control': 'max-age=86400' } }),
  );
