import assert from 'node:assert/strict'
import { type ChildProcess, execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { type Server, createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

const WRANGLER = 'node_modules/.bin/wrangler'
const PORT = 8799
const BASE = `http://localhost:${PORT}`
const QUOTA_BYTES = 500
const WEBP = Buffer.concat([Buffer.from('RIFF\0\0\0\0WEBP'), Buffer.alloc(32)])

const users: Record<string, { sub: string; name: string; roles: string[] }> = {
  alice: { sub: 'alice', name: '爱丽丝', roles: ['Member'] },
  bob: { sub: 'bob', name: 'Bob', roles: ['Member', 'Repair Member'] },
  admin: { sub: 'admin', name: 'Admin', roles: ['Photo Admin'] },
  guest: { sub: 'guest', name: 'Guest', roles: ['Repair Member'] },
  carol: { sub: 'carol', name: 'Carol', roles: ['Member'] },
}

let currentUser = 'alice'
const challenges = new Map<string, string>()
let issuer: Server
let worker: ChildProcess
let state: string

before(async () => {
  issuer = createServer(async (req, res) => {
    const url = new URL(req.url!, 'http://issuer')
    if (url.pathname === '/auth') {
      challenges.set(currentUser, url.searchParams.get('code_challenge')!)
      const target = new URL(url.searchParams.get('redirect_uri')!)
      target.searchParams.set('code', currentUser)
      target.searchParams.set('state', url.searchParams.get('state')!)
      res.writeHead(302, { Location: target.href }).end()
    } else if (url.pathname === '/token') {
      const chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(chunk)
      const form = new URLSearchParams(Buffer.concat(chunks).toString())
      const code = form.get('code')!
      const challenge = createHash('sha256').update(form.get('code_verifier')!).digest('base64url')
      const valid =
        req.headers.authorization === `Basic ${btoa('client:secret')}` &&
        challenge === challenges.get(code)
      res.writeHead(valid ? 200 : 400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ access_token: code }))
    } else if (url.pathname === '/me') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(users[req.headers.authorization!.slice('Bearer '.length)]))
    } else {
      res.writeHead(404).end()
    }
  })
  await new Promise<void>((resolve) => issuer.listen(0, '127.0.0.1', resolve))
  const issuerUrl = `http://127.0.0.1:${(issuer.address() as AddressInfo).port}`

  state = mkdtempSync(join(tmpdir(), 'photo-test-'))
  execFileSync(WRANGLER, ['d1', 'migrations', 'apply', 'photo', '--local', '--persist-to', state], {
    stdio: 'ignore',
    env: { ...process.env, CI: '1' },
  })
  const vars = {
    LOGTO_ISSUER: issuerUrl,
    LOGTO_CLIENT_ID: 'client',
    LOGTO_CLIENT_SECRET: 'secret',
    SESSION_SECRET: 'test-session-secret',
    USER_QUOTA_MB: String(QUOTA_BYTES / 1024 / 1024),
    PENDING_UPLOAD_TTL: '0',
  }
  worker = spawn(
    WRANGLER,
    [
      'dev',
      '--port',
      String(PORT),
      '--local-upstream',
      `localhost:${PORT}`,
      '--persist-to',
      state,
      ...Object.entries(vars).flatMap(([key, value]) => ['--var', `${key}:${value}`]),
    ],
    { stdio: 'ignore', detached: true },
  )
  for (let attempt = 0; ; attempt++) {
    try {
      await fetch(BASE)
      break
    } catch (error) {
      if (attempt > 100) throw error
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
  }
})

after(() => {
  if (worker?.pid) process.kill(-worker.pid)
  issuer?.close()
  if (state) rmSync(state, { recursive: true, force: true })
})

const cookieOf = (res: Response, name: string) =>
  res.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .find((value) => value.startsWith(`${name}=`) && value.length > name.length + 1)

async function signIn(user: string, to = '') {
  currentUser = user
  const login = await fetch(`${BASE}/auth/login${to}`, { redirect: 'manual' })
  const flow = cookieOf(login, '__Host-flow')!
  const authorize = await fetch(login.headers.get('Location')!, { redirect: 'manual' })
  const callback = await fetch(authorize.headers.get('Location')!, {
    redirect: 'manual',
    headers: { Cookie: flow },
  })
  return { callback, session: cookieOf(callback, '__Host-session') }
}

const call = (session: string, path: string, init: RequestInit = {}) =>
  fetch(BASE + path, {
    ...init,
    headers: { Cookie: session, Origin: BASE, ...init.headers },
  })

async function upload(session: string, meta: object = {}) {
  const created = await call(session, '/api/photos', {
    method: 'POST',
    body: JSON.stringify({ width: 4, height: 3, takenAt: '2026-05-01T08:00:00.000Z', ...meta }),
  })
  assert.equal(created.status, 201)
  const { id } = (await created.json()) as { id: string }
  assert.equal((await call(session, `/img/t/${id}`, { method: 'PUT', body: WEBP })).status, 204)
  assert.equal((await call(session, `/img/l/${id}`, { method: 'PUT', body: WEBP })).status, 204)
  return id
}

async function rpc<T = any>(session: string, name: string, ...args: unknown[]): Promise<T> {
  const res = await call(session, `/api/rpc/${name}`, { method: 'POST', body: JSON.stringify(args) })
  assert.equal(res.status, 200, name)
  return res.json() as Promise<T>
}

const remove = (session: string, ...ids: string[]) =>
  Promise.all(ids.map((id) => call(session, `/api/photos/${id}`, { method: 'DELETE' })))

test('serves the app shell but no data without a session', async () => {
  const shell = await fetch(BASE)
  assert.equal(shell.status, 200)
  assert.match(shell.headers.get('Content-Type')!, /text\/html/)
  for (const path of ['/api/me', '/img/t/x', '/img/l/x']) {
    assert.equal((await fetch(BASE + path)).status, 401, path)
  }
  const query = await fetch(`${BASE}/api/rpc/getPhotos`, {
    method: 'POST',
    body: '[]',
    headers: { Origin: BASE },
  })
  assert.equal(query.status, 401)
})

test('rejects a forged or expired session', async () => {
  const { session } = await signIn('alice')
  const [body] = session!.slice('__Host-session='.length).split('.')
  const forged = Buffer.from(
    JSON.stringify({ sub: 'alice', name: 'x', admin: true, exp: 9999999999 }),
  ).toString('base64url')
  for (const value of [`${forged}.AAAA`, `${body}.AAAA`, body, 'garbage']) {
    assert.equal((await call(`__Host-session=${value}`, '/api/me')).status, 401, value)
  }
})

test('refuses accounts without the member role', async () => {
  const { callback, session } = await signIn('guest')
  assert.equal(callback.headers.get('Location'), '/?denied')
  assert.equal(session, undefined)
})

test('rejects a callback whose state does not match', async () => {
  const login = await fetch(`${BASE}/auth/login`, { redirect: 'manual' })
  const res = await fetch(`${BASE}/auth/callback?code=alice&state=wrong`, {
    redirect: 'manual',
    headers: { Cookie: cookieOf(login, '__Host-flow')! },
  })
  assert.equal(res.status, 400)
  assert.equal((await fetch(`${BASE}/auth/callback?code=alice&state=x`)).status, 400)
})

test('returns to the requested local path only', async () => {
  const local = await signIn('alice', '?to=/p/abc')
  assert.equal(local.callback.headers.get('Location'), '/p/abc')
  const external = await signIn('alice', '?to=//evil.example')
  assert.equal(external.callback.headers.get('Location'), '/')
})

test('sets hardened session cookies', async () => {
  const { callback } = await signIn('alice')
  const header = callback.headers.getSetCookie().find((value) => value.startsWith('__Host-session='))!
  for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=86400']) {
    assert.ok(header.includes(attribute), attribute)
  }
})

test('members upload, browse and manage their own photos', async () => {
  const alice = (await signIn('alice')).session!
  const bob = (await signIn('bob')).session!
  const admin = (await signIn('admin')).session!

  assert.deepEqual(await (await call(alice, '/api/me')).json(), {
    name: '爱丽丝',
    admin: false,
    used: 0,
    quota: QUOTA_BYTES,
  })
  assert.deepEqual(await (await call(admin, '/api/me')).json(), {
    name: 'Admin',
    admin: true,
    used: 0,
    quota: null,
  })

  const id = await upload(alice, { make: 'FUJIFILM', iso: 400, fNumber: 'bad', title: ' 合影 ' })
  assert.match(id, /^[A-Za-z0-9]{8}$/)

  const [photo] = await rpc(bob, 'getPhotos', {})
  assert.equal(photo.id, id)
  assert.equal(photo.url, `/img/l/${id}`)
  assert.equal(photo.extension, 'webp')
  assert.equal(photo.title, '合影')
  assert.equal(photo.owner_name, '爱丽丝')
  assert.equal(photo.make, 'FUJIFILM')
  assert.equal(photo.iso, 400)
  assert.equal(photo.f_number, null)
  assert.equal(photo.aspect_ratio, 4 / 3)
  assert.equal(photo.taken_at, '2026-05-01T08:00:00.000Z')
  assert.equal(photo.taken_at_naive, '2026-05-01 08:00:00')
  assert.deepEqual(photo.tags, [])
  assert.equal(photo.hidden, false)
  assert.equal(photo.editable, false)
  for (const secret of ['owner_sub', 'bytes', 'ready', 'make_slug']) {
    assert.equal(secret in photo, false, secret)
  }
  assert.equal((await rpc(alice, 'getPhoto', id)).editable, true)
  assert.equal(await rpc(bob, 'getPhoto', 'missing1'), null)

  const image = await call(bob, `/img/l/${id}`)
  assert.equal(image.status, 200)
  assert.equal(image.headers.get('Content-Type'), 'image/webp')
  assert.match(image.headers.get('Cache-Control')!, /^private/)
  assert.equal(image.headers.get('Vary'), 'Cookie')
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), WEBP)
  const cached = await call(bob, `/img/l/${id}`, {
    headers: { 'If-None-Match': image.headers.get('ETag')! },
  })
  assert.equal(cached.status, 304)

  const patch = { method: 'PATCH', body: JSON.stringify({ title: '新标题', tags: ['Team Photo'] }) }
  assert.equal((await call(bob, `/api/photos/${id}`, patch)).status, 403)
  assert.equal((await call(bob, `/api/photos/${id}`, { method: 'DELETE' })).status, 403)
  assert.equal((await call(bob, `/img/l/${id}`, { method: 'PUT', body: WEBP })).status, 403)
  assert.equal((await call(alice, `/img/l/${id}`, { method: 'PUT', body: WEBP })).status, 409)
  assert.equal((await call(alice, `/api/photos/${id}`, patch)).status, 204)
  const edited = await rpc(bob, 'getPhoto', id)
  assert.equal(edited.title, '新标题')
  assert.deepEqual(edited.tags, ['team-photo'])

  assert.equal((await call(admin, `/api/photos/${id}`, { method: 'DELETE' })).status, 204)
  assert.equal(await rpc(bob, 'getPhoto', id), null)
  assert.equal((await call(bob, `/img/t/${id}`)).status, 404)
  assert.equal((await call(bob, `/img/l/${id}`)).status, 404)
})

test('filters and groups photos the way the interface asks', async () => {
  const alice = (await signIn('alice')).session!
  const admin = (await signIn('admin')).session!
  const fuji = await upload(alice, {
    takenAt: '2025-03-01T00:00:00.000Z',
    make: 'FUJIFILM',
    model: 'X-T5',
    lensMake: 'FUJIFILM',
    lensModel: 'XF35mmF1.4 R',
    focalLength: 35,
    film: 'classic-neg',
    tags: ['Favs', 'welcome'],
    albums: ['2026 秋季招新'],
    title: 'Opening Night',
    width: 3,
    height: 2,
  })
  const canon = await upload(alice, {
    takenAt: '2026-06-01T00:00:00.000Z',
    make: 'Canon',
    model: 'Canon EOS R6',
    lensModel: 'RF50mm F1.8 STM',
    focalLength: 50,
    tags: ['favs'],
    albums: ['2026 秋季招新', 'LAN Party'],
    caption: 'late night',
    width: 2,
    height: 3,
  })
  const hidden = await upload(alice, { takenAt: '2026-07-01T00:00:00.000Z', hidden: true })

  const ids = async (options: object, session = alice) =>
    (await rpc<{ id: string }[]>(session, 'getPhotos', options)).map(({ id }) => id)

  assert.deepEqual(await ids({}), [canon, fuji])
  assert.deepEqual(await ids({ sortBy: 'takenAtAsc' }), [fuji, canon])
  assert.deepEqual(await ids({ limit: 1, offset: 1 }), [fuji])
  assert.deepEqual(await ids({ hidden: 'include' }), [canon, fuji])
  assert.deepEqual(await ids({ hidden: 'include' }, admin), [hidden, canon, fuji])
  assert.deepEqual(await ids({ hidden: 'only' }, admin), [hidden])
  assert.deepEqual(await ids({ year: '2025' }), [fuji])
  assert.deepEqual(await ids({ camera: { make: 'fujifilm', model: 'x-t5' } }), [fuji])
  assert.deepEqual(await ids({ camera: { make: 'canon', model: 'canon-eos-r6' } }), [canon])
  assert.deepEqual(await ids({ lens: { make: 'fujifilm', model: 'xf35mmf1.4-r' } }), [fuji])
  assert.deepEqual(await ids({ lens: { model: 'rf50mm-f1.8-stm' } }), [canon])
  assert.deepEqual(await ids({ tag: 'favs' }), [canon, fuji])
  assert.deepEqual(await ids({ tag: 'welcome' }), [fuji])
  assert.deepEqual(await ids({ film: 'classic-neg' }), [fuji])
  assert.deepEqual(await ids({ focal: 50 }), [canon])
  assert.deepEqual(await ids({ query: 'opening' }), [fuji])
  assert.deepEqual(await ids({ query: 'LATE' }), [canon])
  assert.deepEqual(await ids({ maximumAspectRatio: 1 }), [canon])
  assert.deepEqual(await ids({ takenBefore: '2026-01-01T00:00:00.000Z' }), [fuji])
  assert.deepEqual(await ids({ photoIds: [fuji, hidden] }), [fuji])
  assert.deepEqual(await ids({ recent: true }), [canon, fuji])
  assert.deepEqual(await ids({ tag: "x' OR 1=1 --" }), [])
  assert.equal(await rpc(alice, 'getPhotoCount', { tag: 'favs' }), 2)

  const album = await rpc(alice, 'getAlbumFromSlug', '2026-秋季招新')
  assert.equal(album.title, '2026 秋季招新')
  assert.deepEqual(await ids({ album }), [canon, fuji])
  assert.deepEqual(await rpc(alice, 'getAlbumTitlesForPhoto', fuji), ['2026 秋季招新'])
  assert.deepEqual((await rpc<string[]>(alice, 'getTagsForAlbum', album.id)).sort(), ['favs', 'welcome'])
  const albums = await rpc<{ title: string; count: number }[]>(alice, 'getAlbumsWithMeta')
  assert.deepEqual(
    albums.map(({ title, count }) => [title, count]).sort(),
    [
      ['2026 秋季招新', 2],
      ['LAN Party', 1],
    ],
  )

  const meta = await rpc(alice, 'getPhotosMeta', {})
  assert.equal(meta.count, 2)
  assert.deepEqual(meta.dateRange, { start: '2025-03-01 00:00:00', end: '2026-06-01 00:00:00' })

  const near = await rpc(alice, 'getPhotosNearId', fuji, { limit: 3 })
  assert.equal(near.indexNumber, 2)
  assert.deepEqual(near.photos.map(({ id }: { id: string }) => id), [canon, fuji])
  assert.equal('row_number' in near.photos[0], false)

  const group = async (name: string, key: string) =>
    (await rpc<Record<string, unknown>[]>(alice, name)).map((row) => [row[key], row.count])
  assert.deepEqual(await group('getUniqueTags', 'tag'), [['favs', 2], ['welcome', 1]])
  assert.deepEqual(await group('getUniqueYears', 'year'), [['2026', 1], ['2025', 1]])
  assert.deepEqual(await group('getUniqueCameras', 'model'), [['Canon EOS R6', 1], ['X-T5', 1]])
  assert.deepEqual(await group('getUniqueLenses', 'lens_model'), [['RF50mm F1.8 STM', 1], ['XF35mmF1.4 R', 1]])
  assert.deepEqual(await group('getUniqueFilms', 'film'), [['classic-neg', 1]])
  assert.deepEqual(await group('getUniqueFocalLengths', 'focal_length'), [[35, 1], [50, 1]])
  assert.deepEqual(await group('getUniqueRecipes', 'recipe_title'), [])

  await call(alice, `/api/photos/${canon}`, {
    method: 'PATCH',
    body: JSON.stringify({ albums: ['2026 秋季招新'] }),
  })
  const remaining = await rpc<{ title: string }[]>(alice, 'getAlbumsWithMeta')
  assert.deepEqual(remaining.map(({ title }) => title), ['2026 秋季招新'])

  await remove(alice, fuji, canon, hidden)
  assert.deepEqual(await rpc(alice, 'getAlbumsWithMeta'), [])
  assert.equal(await rpc(alice, 'getAlbumFromSlug', '2026-秋季招新'), null)
})

test('rejects unknown queries and malformed arguments', async () => {
  const alice = (await signIn('alice')).session!
  const post = (name: string, body: string) =>
    call(alice, `/api/rpc/${name}`, { method: 'POST', body })
  assert.equal((await post('dropEverything', '[]')).status, 404)
  assert.equal((await post('constructor', '[]')).status, 404)
  assert.equal((await post('getPhotos', '{}')).status, 400)
  assert.equal((await post('getPhotos', 'nope')).status, 400)
})

test('hides photos until both images are stored', async () => {
  const alice = (await signIn('alice')).session!
  const created = await call(alice, '/api/photos', {
    method: 'POST',
    body: JSON.stringify({ width: 1, height: 1 }),
  })
  const { id } = (await created.json()) as { id: string }
  assert.equal((await call(alice, `/img/l/${id}`, { method: 'PUT', body: WEBP })).status, 409)
  assert.equal(await rpc(alice, 'getPhoto', id), null)
  assert.deepEqual(await rpc(alice, 'getPhotos', {}), [])
  await remove(alice, id)
})

test('rejects invalid uploads', async () => {
  const alice = (await signIn('alice')).session!
  const invalid = await call(alice, '/api/photos', { method: 'POST', body: '{"width":0}' })
  assert.equal(invalid.status, 400)

  const created = await call(alice, '/api/photos', {
    method: 'POST',
    body: JSON.stringify({ width: 1, height: 1 }),
  })
  const { id } = (await created.json()) as { id: string }
  const html = await call(alice, `/img/t/${id}`, { method: 'PUT', body: '<html>' })
  assert.equal(html.status, 415)
  const huge = await call(alice, `/img/t/${id}`, { method: 'PUT', body: Buffer.alloc(600 * 1024) })
  assert.equal(huge.status, 413)
  await remove(alice, id)
})

test('rejects cross-origin writes', async () => {
  const alice = (await signIn('alice')).session!
  const body = JSON.stringify({ width: 1, height: 1 })
  for (const headers of [{ Origin: 'https://evil.example' }, { Origin: '' }]) {
    const res = await fetch(`${BASE}/api/photos`, {
      method: 'POST',
      body,
      headers: { Cookie: alice, ...headers },
    })
    assert.equal(res.status, 403)
  }
})

test('stops uploads once a member reaches their quota', async () => {
  const carol = (await signIn('carol')).session!
  const admin = (await signIn('admin')).session!
  const create = (session: string) =>
    call(session, '/api/photos', { method: 'POST', body: JSON.stringify({ width: 1, height: 1 }) })

  const ids: string[] = []
  while (ids.length * WEBP.length * 2 < QUOTA_BYTES) ids.push(await upload(carol))
  const me = (await (await call(carol, '/api/me')).json()) as { used: number }
  assert.equal(me.used, ids.length * WEBP.length * 2)
  assert.equal((await create(carol)).status, 507)

  const other = await create(admin)
  assert.equal(other.status, 201)
  await remove(admin, ((await other.json()) as { id: string }).id)

  await remove(carol, ids.pop()!)
  const retry = await create(carol)
  assert.equal(retry.status, 201)
  ids.push(((await retry.json()) as { id: string }).id)
  await remove(carol, ...ids)
})

test('removes abandoned uploads on schedule', async () => {
  const alice = (await signIn('alice')).session!
  const kept = await upload(alice)
  const created = await call(alice, '/api/photos', {
    method: 'POST',
    body: JSON.stringify({ width: 1, height: 1, albums: ['Abandoned'] }),
  })
  const { id } = (await created.json()) as { id: string }
  assert.equal((await call(alice, `/img/t/${id}`, { method: 'PUT', body: WEBP })).status, 204)
  assert.equal((await call(alice, `/img/t/${id}`)).status, 200)

  assert.equal((await fetch(`${BASE}/cdn-cgi/handler/scheduled`)).status, 200)

  assert.equal((await call(alice, `/img/t/${id}`)).status, 404)
  assert.equal((await call(alice, `/img/l/${id}`, { method: 'PUT', body: WEBP })).status, 404)
  assert.equal(await rpc(alice, 'getAlbumFromSlug', 'abandoned'), null)
  assert.equal((await rpc(alice, 'getPhoto', kept)).id, kept)
  assert.equal((await call(alice, `/img/l/${kept}`)).status, 200)
  await remove(alice, kept)
})
