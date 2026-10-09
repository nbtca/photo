import { type AppEnv, type Session, getSession } from './auth';
import { mutations } from './mutations';
import { queries } from './query';

const MB = 1024 * 1024;
const MAX_FILE_BYTES = 12 * MB;
const FILE_NAME = /^(upload|photo)-[A-Za-z0-9]{8,32}(-[a-z]{2})?\.(jpe?g|png|webp)$/;
const handlers = { ...queries, ...mutations };

const error = (status: number, message: string) => Response.json({ error: message }, { status });
const noContent = () => new Response(null, { status: 204 });

function imageType(bytes: Uint8Array) {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && ascii(1, 4) === 'PNG') return 'image/png';
}

async function usage(env: AppEnv, session: Session) {
  const row = await env.DB.prepare(
    'SELECT COALESCE(SUM(bytes), 0) AS total, COALESCE(SUM(CASE WHEN owner_sub = ? THEN bytes END), 0) AS used FROM files',
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
  if (Number(req.headers.get('Content-Length')) > MAX_FILE_BYTES) return error(413, 'Image too large');

  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.length > MAX_FILE_BYTES) return error(413, 'Image too large');
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
    'Cache-Control': 'private, max-age=31536000, immutable',
    // Without this a signed-out browser keeps serving cached photos.
    Vary: 'Cookie',
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

async function call(req: Request, name: string, env: AppEnv, session: Session) {
  if (!Object.hasOwn(handlers, name)) return error(404, 'Unknown call');
  const args: unknown = await req.json().catch(() => null);
  if (!Array.isArray(args)) return error(400, 'Invalid arguments');
  try {
    return Response.json((await handlers[name](env, session, ...args)) ?? null);
  } catch (thrown) {
    if (thrown instanceof Response) return error(thrown.status, await thrown.text());
    throw thrown;
  }
}

export default {
  async fetch(req, env: AppEnv) {
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

    const name = pathname.match(/^\/api\/rpc\/(\w+)$/)?.[1];
    if (name && method === 'POST') return call(req, name, env, session);

    if (pathname === '/api/me' && method === 'GET') {
      const { used, quota } = await usage(env, session);
      return Response.json({ name: session.name, admin: session.admin, used, quota });
    }

    return error(404, 'Not found');
  },
  async scheduled(_controller, env: AppEnv) {
    await removeAbandoned(env);
  },
} satisfies ExportedHandler<AppEnv>;
