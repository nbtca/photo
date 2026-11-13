import { type AppEnv, type Session, getSession } from './auth';
import { MAX_BATCH } from './batch';
import { cached, invalidate, pruneCache } from './cache';
import { mutations } from './mutations';
import { cacheScope, queries } from './query';
import { MAX_UPLOAD_BYTES } from '../src/photo/limits';

const MB = 1024 * 1024;
const FILE_NAME = /^(upload|photo)-[A-Za-z0-9]{8,32}(-[a-z]{2})?\.(jpe?g|png|webp)$/;
const handlers = { ...queries, ...mutations };
const READS = new Set([
  'getStorageUrlsForPrefix',
  'getRecipeTitleForData',
  'getRecipeDataForTitle',
  'getPhotosNeedingRecipeTitleCount',
]);

const error = (status: number, message: string) => Response.json({ error: message }, { status });

// The free plan's daily D1 limits are shared by the whole Cloudflare account and reset at midnight UTC.
const isD1Outage = (thrown: unknown) =>
  /D1_ERROR/.test(String(thrown)) && /limit|exceeded/i.test(String(thrown));
const outage = () =>
  Response.json(
    { error: 'D1 daily limit reached', outage: true },
    { status: 503, headers: { 'Retry-After': '3600' } },
  );
const noContent = () => new Response(null, { status: 204 });

function imageType(bytes: Uint8Array) {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && ascii(1, 4) === 'PNG') return 'image/png';
}

async function usage(env: AppEnv, session: Session) {
  const row = await env.DB.prepare(
    'SELECT COALESCE(SUM(bytes), 0) AS total, COALESCE(SUM(CASE WHEN owner_sub = ? THEN bytes END), 0) AS used FROM storage',
  )
    .bind(session.sub)
    .first<{ total: number; used: number }>();
  const quota = session.admin ? null : Number(env.USER_QUOTA_MB) * MB;
  const full =
    row!.total >= Number(env.TOTAL_QUOTA_MB) * MB || (quota !== null && row!.used >= quota);
  return { used: row!.used, quota, full };
}

const findFile = (env: AppEnv, name: string) =>
  env.DB.prepare('SELECT owner_sub FROM files WHERE name = ?')
    .bind(name)
    .first<{ owner_sub: string }>();

const canAccess = (session: Session, file: { owner_sub: string }) =>
  session.admin || file.owner_sub === session.sub;

async function putFile(req: Request, name: string, env: AppEnv, session: Session) {
  const existing = await findFile(env, name);
  if (existing && existing.owner_sub !== session.sub) return error(403, 'Not your file');
  if ((await usage(env, session)).full) return error(507, 'Storage quota reached');
  if (Number(req.headers.get('Content-Length')) > MAX_UPLOAD_BYTES) return error(413, 'Image too large');

  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.length > MAX_UPLOAD_BYTES) return error(413, 'Image too large');
  const contentType = imageType(bytes);
  if (!contentType) return error(415, 'Only WebP, JPEG and PNG are accepted');

  await env.BUCKET.put(name, bytes, { httpMetadata: { contentType } });
  await env.DB.prepare(
    'INSERT INTO files (name, base, owner_sub, bytes, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (name) DO UPDATE SET bytes = excluded.bytes',
  )
    .bind(
      name,
      name.replace(/(-[a-z]{2})?\.\w+$/, ''),
      session.sub,
      bytes.length,
      new Date().toISOString(),
    )
    .run();
  return Response.json({ url: `/img/${name}` }, { status: 201 });
}

async function getFile(req: Request, name: string, env: AppEnv, session: Session) {
  if (name.startsWith('upload-')) {
    const file = await findFile(env, name);
    if (!file || !canAccess(session, file)) return error(404, 'Image not found');
  }
  const object = await env.BUCKET.get(name, { onlyIf: req.headers });
  if (!object) return error(404, 'Image not found');
  const headers = new Headers({
    ETag: object.httpEtag,
    // A browser keeps photos it has shown after its member signs out. Varying on
    // Cookie would refetch every photo each time Access renews its session.
    'Cache-Control': 'private, max-age=31536000, immutable',
  });
  object.writeHttpMetadata(headers);
  return 'body' in object
    ? new Response(object.body, { headers })
    : new Response(null, { status: 304, headers });
}

async function deleteFile(name: string, env: AppEnv, session: Session) {
  const file = await findFile(env, name);
  if (!file) return noContent();
  if (!canAccess(session, file)) return error(403, 'Not your file');
  const inUse = await env.DB.prepare('SELECT 1 FROM photos WHERE url = ?')
    .bind(`/img/${name}`)
    .first();
  if (inUse) return error(409, 'File belongs to a photo');
  await env.DB.prepare('DELETE FROM files WHERE name = ?').bind(name).run();
  await env.BUCKET.delete(name);
  return noContent();
}

// Removes uploads that never became photos and files whose photo is gone.
async function removeAbandoned(env: AppEnv) {
  const cutoff = new Date(Date.now() - Number(env.PENDING_UPLOAD_TTL) * 1000).toISOString();
  const { results } = await env.DB.prepare(
    `DELETE FROM files WHERE created_at <= ? AND base NOT IN (
      SELECT f.base FROM files f JOIN photos p ON p.url = '/img/' || f.name
    ) RETURNING name`,
  )
    .bind(cutoff)
    .all<{ name: string }>();
  const names = results.map(({ name }) => name);
  for (let start = 0; start < names.length; start += 1000) {
    await env.BUCKET.delete(names.slice(start, start + 1000));
  }
}

interface Result {
  status: number
  body: unknown
}


async function run(
  name: string,
  args: unknown[],
  env: AppEnv,
  session: Session,
  ctx: ExecutionContext,
): Promise<Result> {
  const cacheable = Object.hasOwn(queries, name);
  const writes = Object.hasOwn(mutations, name) && !READS.has(name);
  const load = async () => (await handlers[name](env, session, ...args)) ?? null;
  // Handlers reject with a Response before they write anything.
  let rejected = false;
  try {
    const body = cacheable
      ? await cached(
        env,
        [name, ...cacheScope(name, args, session), args],
        load,
        (stored) => ctx.waitUntil(stored),
      )
      : await load();
    return { status: 200, body };
  } catch (thrown) {
    if (!(thrown instanceof Response)) throw thrown;
    rejected = true;
    return { status: thrown.status, body: { error: await thrown.text() } };
  } finally {
    if (writes && !rejected) await invalidate(env);
  }
}

async function call(
  req: Request,
  name: string,
  env: AppEnv,
  session: Session,
  ctx: ExecutionContext,
) {
  if (!Object.hasOwn(handlers, name)) return error(404, 'Unknown call');
  const args: unknown = await req.json().catch(() => null);
  if (!Array.isArray(args)) return error(400, 'Invalid arguments');
  const { status, body } = await run(name, args, env, session, ctx);
  return Response.json(body, { status });
}

// Runs several reads in one request, each cached on its own.
async function batch(req: Request, env: AppEnv, session: Session, ctx: ExecutionContext) {
  const calls: unknown = await req.json().catch(() => null);
  const valid =
    Array.isArray(calls) &&
    calls.length <= MAX_BATCH &&
    calls.every(
      (entry) =>
        Array.isArray(entry) &&
        typeof entry[0] === 'string' &&
        Object.hasOwn(queries, entry[0]) &&
        Array.isArray(entry[1]),
    );
  if (!valid) return error(400, 'Invalid batch');
  return Response.json(
    await Promise.all(
      (calls as [string, unknown[]][]).map(([name, args]) => run(name, args, env, session, ctx)),
    ),
  );
}

export default {
  async fetch(req, env: AppEnv, ctx) {
    try {
      return await handle(req, env, ctx);
    } catch (thrown) {
      if (isD1Outage(thrown)) return outage();
      throw thrown;
    }
  },
  async scheduled(_controller, env: AppEnv) {
    await removeAbandoned(env);
    await pruneCache(env);
  },
} satisfies ExportedHandler<AppEnv>;

async function handle(req: Request, env: AppEnv, ctx: ExecutionContext) {
  const url = new URL(req.url);
  const { pathname } = url;
  const { method } = req;

  const session = await getSession(req, env);
  if (!session) return error(401, 'Sign in required');
  if (method !== 'GET' && req.headers.get('Origin') !== url.origin) {
    return error(403, 'Cross-origin request');
  }

  if (pathname.startsWith('/img/')) {
    const name = pathname.slice('/img/'.length);
    if (!FILE_NAME.test(name)) return error(404, 'Image not found');
    if (method === 'GET') return getFile(req, name, env, session);
    if (method === 'PUT') return putFile(req, name, env, session);
    if (method === 'DELETE') return deleteFile(name, env, session);
  }

  if (pathname === '/api/rpc' && method === 'POST') return batch(req, env, session, ctx);
  const name = pathname.match(/^\/api\/rpc\/(\w+)$/)?.[1];
  if (name && method === 'POST') return call(req, name, env, session, ctx);

  // Identity comes from Access, so the app can still open on cached photos when D1 is out.
  if (pathname === '/api/me' && method === 'GET') {
    const known = { name: session.name, admin: session.admin };
    try {
      const { used, quota } = await usage(env, session);
      return Response.json({ ...known, used, quota });
    } catch (thrown) {
      if (!isD1Outage(thrown)) throw thrown;
      return Response.json({ ...known, used: 0, quota: null, outage: true });
    }
  }

  return error(404, 'Not found');
}
