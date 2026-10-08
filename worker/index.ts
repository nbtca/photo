import { type AppEnv, type Session, getSession, handleAuth } from './auth'
import { queries, slug } from './query'

type Body = Record<string, unknown>

const MB = 1024 * 1024
const MAX_BYTES = { t: 512 * 1024, l: 8 * MB }
const MAX_BLUR_LENGTH = 8192
const MAX_TAGS = 20
const MAX_ALBUMS = 5
const ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

const error = (status: number, message: string) => Response.json({ error: message }, { status })
const noContent = () => new Response(null, { status: 204 })

const newId = () =>
  Array.from(
    crypto.getRandomValues(new Uint8Array(8)),
    (byte) => ID_ALPHABET[byte % ID_ALPHABET.length],
  ).join('')

const text = (value: unknown) =>
  (typeof value === 'string' && value.trim().slice(0, 255)) || null
const longText = (value: unknown) =>
  (typeof value === 'string' && value.trim().slice(0, 4000)) || null
const number = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null
const dimension = (value: unknown) =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null
const texts = (value: unknown, limit: number) =>
  Array.isArray(value)
    ? [...new Set(value.map(text).filter((item) => item !== null))].slice(0, limit)
    : []
const tagsOf = (value: unknown) => JSON.stringify([...new Set(texts(value, MAX_TAGS).map(slug))])
const slugOf = (value: string | null) => (value ? slug(value) : null)

async function readBody(req: Request) {
  const body: unknown = await req.json().catch(() => null)
  return body && typeof body === 'object' && !Array.isArray(body) ? (body as Body) : null
}

function imageType(bytes: Uint8Array) {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end))
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp'
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
}

async function usage(env: AppEnv, session: Session) {
  const row = await env.DB.prepare(
    'SELECT COALESCE(SUM(bytes), 0) AS total, COALESCE(SUM(CASE WHEN owner_sub = ? THEN bytes END), 0) AS used FROM photos',
  )
    .bind(session.sub)
    .first<{ total: number; used: number }>()
  const quota = session.admin ? null : Number(env.USER_QUOTA_MB) * MB
  const full =
    row!.total >= Number(env.TOTAL_QUOTA_MB) * MB || (quota !== null && row!.used >= quota)
  return { used: row!.used, quota, full }
}

async function setAlbums(env: AppEnv, photoId: string, titles: string[], now: string) {
  const statements = [env.DB.prepare('DELETE FROM album_photo WHERE photo_id = ?').bind(photoId)]
  for (const title of titles) {
    statements.push(
      env.DB.prepare(
        'INSERT INTO albums (id, title, slug, updated_at, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (slug) DO NOTHING',
      ).bind(crypto.randomUUID(), title, slug(title), now, now),
      env.DB.prepare(
        'INSERT OR IGNORE INTO album_photo (album_id, photo_id) SELECT id, ? FROM albums WHERE slug = ?',
      ).bind(photoId, slug(title)),
    )
  }
  statements.push(removeEmptyAlbums(env))
  await env.DB.batch(statements)
}

const removeEmptyAlbums = (env: AppEnv) =>
  env.DB.prepare('DELETE FROM albums WHERE id NOT IN (SELECT album_id FROM album_photo)')

async function removeAbandoned(env: AppEnv) {
  const cutoff = new Date(Date.now() - Number(env.PENDING_UPLOAD_TTL) * 1000).toISOString()
  const { results } = await env.DB.prepare(
    'DELETE FROM photos WHERE ready = 0 AND created_at <= ? RETURNING id',
  )
    .bind(cutoff)
    .all<{ id: string }>()
  const keys = results.flatMap(({ id }) => [`t/${id}`, `l/${id}`])
  for (let start = 0; start < keys.length; start += 1000) {
    await env.BUCKET.delete(keys.slice(start, start + 1000))
  }
  await removeEmptyAlbums(env).run()
}

async function createPhoto(req: Request, env: AppEnv, session: Session) {
  if ((await usage(env, session)).full) return error(507, 'Storage quota reached')
  const body = await readBody(req)
  const width = dimension(body?.width)
  const height = dimension(body?.height)
  if (!body || !width || !height) return error(400, 'Invalid photo metadata')

  const now = new Date()
  const parsed = new Date(text(body.takenAt) ?? '')
  const takenAt = Number.isNaN(parsed.getTime()) ? now : parsed
  const takenAtNaive = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(String(body.takenAtNaive))
    ? String(body.takenAtNaive)
    : takenAt.toISOString().slice(0, 19).replace('T', ' ')
  const blurData =
    typeof body.blurData === 'string' &&
    body.blurData.startsWith('data:image/') &&
    body.blurData.length <= MAX_BLUR_LENGTH
      ? body.blurData
      : null
  const make = text(body.make)
  const model = text(body.model)
  const lensMake = text(body.lensMake)
  const lensModel = text(body.lensModel)
  const recipeData =
    body.recipeData && typeof body.recipeData === 'object'
      ? JSON.stringify(body.recipeData).slice(0, 4000)
      : null

  const id = newId()
  await env.DB.prepare(
    `INSERT INTO photos (
      id, owner_sub, owner_name, width, height, aspect_ratio, blur_data,
      title, caption, tags,
      make, model, make_slug, model_slug,
      focal_length, focal_length_in_35mm_format,
      lens_make, lens_model, lens_make_slug, lens_model_slug,
      f_number, iso, exposure_time, exposure_compensation,
      film, recipe_data, taken_at, taken_at_naive, hidden, updated_at, created_at
    ) VALUES (${Array(31).fill('?').join(', ')})`,
  )
    .bind(
      id,
      session.sub,
      session.name,
      width,
      height,
      width / height,
      blurData,
      text(body.title),
      longText(body.caption),
      tagsOf(body.tags),
      make,
      model,
      slugOf(make),
      slugOf(model),
      number(body.focalLength),
      number(body.focalLengthIn35MmFormat),
      lensMake,
      lensModel,
      slugOf(lensMake),
      slugOf(lensModel),
      number(body.fNumber),
      number(body.iso),
      number(body.exposureTime),
      number(body.exposureCompensation),
      text(body.film),
      recipeData,
      takenAt.toISOString(),
      takenAtNaive,
      body.hidden === true ? 1 : 0,
      now.toISOString(),
      now.toISOString(),
    )
    .run()
  await setAlbums(env, id, texts(body.albums, MAX_ALBUMS), now.toISOString())
  return Response.json({ id }, { status: 201 })
}

const findOwner = (id: string, env: AppEnv) =>
  env.DB.prepare('SELECT owner_sub, ready FROM photos WHERE id = ?')
    .bind(id)
    .first<{ owner_sub: string; ready: number }>()

async function updatePhoto(req: Request, id: string, env: AppEnv, session: Session) {
  const photo = await findOwner(id, env)
  if (!photo) return error(404, 'Photo not found')
  if (!session.admin && photo.owner_sub !== session.sub) return error(403, 'Not your photo')
  const body = await readBody(req)
  if (!body) return error(400, 'Invalid photo metadata')
  const now = new Date().toISOString()
  await env.DB.prepare(
    'UPDATE photos SET title = ?, caption = ?, tags = ?, hidden = ?, updated_at = ? WHERE id = ?',
  )
    .bind(
      text(body.title),
      longText(body.caption),
      tagsOf(body.tags),
      body.hidden === true ? 1 : 0,
      now,
      id,
    )
    .run()
  await setAlbums(env, id, texts(body.albums, MAX_ALBUMS), now)
  return noContent()
}

async function deletePhoto(id: string, env: AppEnv, session: Session) {
  const photo = await findOwner(id, env)
  if (!photo) return error(404, 'Photo not found')
  if (!session.admin && photo.owner_sub !== session.sub) return error(403, 'Not your photo')
  await env.DB.batch([
    env.DB.prepare('DELETE FROM photos WHERE id = ?').bind(id),
    removeEmptyAlbums(env),
  ])
  await env.BUCKET.delete([`t/${id}`, `l/${id}`])
  return noContent()
}

async function putImage(req: Request, size: 't' | 'l', id: string, env: AppEnv, session: Session) {
  const photo = await findOwner(id, env)
  if (!photo) return error(404, 'Photo not found')
  if (photo.owner_sub !== session.sub) return error(403, 'Not your photo')
  if (photo.ready) return error(409, 'Photo already uploaded')
  if (Number(req.headers.get('Content-Length')) > MAX_BYTES[size]) return error(413, 'Image too large')

  const bytes = new Uint8Array(await req.arrayBuffer())
  if (bytes.length > MAX_BYTES[size]) return error(413, 'Image too large')
  const contentType = imageType(bytes)
  if (!contentType) return error(415, 'Only WebP and JPEG are accepted')

  if (size === 'l' && !(await env.BUCKET.head(`t/${id}`))) return error(409, 'Upload the thumbnail first')
  await env.BUCKET.put(`${size}/${id}`, bytes, { httpMetadata: { contentType } })
  await env.DB.prepare(
    size === 'l'
      ? 'UPDATE photos SET bytes = bytes + ?, ready = 1 WHERE id = ?'
      : 'UPDATE photos SET bytes = ? WHERE id = ?',
  )
    .bind(bytes.length, id)
    .run()
  return noContent()
}

async function getImage(req: Request, key: string, env: AppEnv) {
  const object = await env.BUCKET.get(key, { onlyIf: req.headers })
  if (!object) return error(404, 'Image not found')
  const headers = new Headers({
    ETag: object.httpEtag,
    'Cache-Control': 'private, max-age=31536000, immutable',
    // Without this a signed-out browser keeps serving cached photos.
    Vary: 'Cookie',
  })
  object.writeHttpMetadata(headers)
  return 'body' in object
    ? new Response(object.body, { headers })
    : new Response(null, { status: 304, headers })
}

async function runQuery(req: Request, name: string, env: AppEnv, session: Session) {
  if (!Object.hasOwn(queries, name)) return error(404, 'Unknown query')
  const args: unknown = await req.json().catch(() => null)
  if (!Array.isArray(args)) return error(400, 'Invalid arguments')
  return Response.json((await queries[name](env, session, ...args)) ?? null)
}

export default {
  async fetch(req, env: AppEnv) {
    const url = new URL(req.url)
    const { pathname } = url
    const { method } = req
    if (pathname.startsWith('/auth/')) return handleAuth(req, url, env)

    const session = await getSession(req, env)
    if (!session) return error(401, 'Sign in required')
    if (method !== 'GET' && req.headers.get('Origin') !== url.origin) {
      return error(403, 'Cross-origin request')
    }

    const image = pathname.match(/^\/img\/([tl])\/(\w+)$/)
    if (image) {
      const [, size, id] = image
      if (method === 'GET') return getImage(req, `${size}/${id}`, env)
      if (method === 'PUT') return putImage(req, size as 't' | 'l', id, env, session)
    }

    const query = pathname.match(/^\/api\/rpc\/(\w+)$/)?.[1]
    if (query && method === 'POST') return runQuery(req, query, env, session)

    if (pathname === '/api/me' && method === 'GET') {
      const { used, quota } = await usage(env, session)
      return Response.json({ name: session.name, admin: session.admin, used, quota })
    }
    if (pathname === '/api/photos' && method === 'POST') return createPhoto(req, env, session)

    const id = pathname.match(/^\/api\/photos\/(\w+)$/)?.[1]
    if (id) {
      if (method === 'PATCH') return updatePhoto(req, id, env, session)
      if (method === 'DELETE') return deletePhoto(id, env, session)
    }

    return error(404, 'Not found')
  },
  async scheduled(_controller, env: AppEnv) {
    await removeAbandoned(env)
  },
} satisfies ExportedHandler<AppEnv>
